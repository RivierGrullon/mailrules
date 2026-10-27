import { normalizeDomain, parseEmail } from './normalize.js';
import { record, snapshot } from './config.js';
import { customRules, evaluateCustomRules } from './custom-rules.js';
import { createSuggester } from './suggestions.js';
import type {
  EmailCustomRuleEvaluation,
  EmailListMatch,
  EmailRuleMatch,
  EmailValidationResult,
  EmailValidator,
  EmailValidatorOptions,
} from './types.js';

const optionNames = new Set([
  'disposableDomains',
  'allowDisposable',
  'blocklist',
  'allowlist',
  'allowlistMode',
  'includeSubdomains',
  'customRules',
  'suggestions',
]);
const ruleNames = new Set(['domains', 'emails']);

function booleanOption(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function rules(value: unknown, label: string) {
  const config = value === undefined ? {} : record(value, ruleNames, label);
  return {
    domains: snapshot(config.domains, normalizeDomain, `${label}.domains`),
    emails: snapshot(config.emails, (input) => parseEmail(input)?.email ?? null, `${label}.emails`),
  };
}

function matchingDomain(
  domain: string,
  list: ReadonlySet<string>,
  descendants: boolean,
): string | null {
  if (list.has(domain)) return domain;
  if (!descendants) return null;
  // Start at complete labels; example.com must never match notexample.com.
  let dot = domain.indexOf('.');
  while (dot !== -1) {
    if (list.has(domain.slice(dot + 1))) return domain.slice(dot + 1);
    dot = domain.indexOf('.', dot + 1);
  }
  return null;
}

function listMatch(
  email: string,
  domain: string,
  list: ReturnType<typeof rules>,
  source: 'blocklist' | 'allowlist',
  descendants: boolean,
): EmailListMatch | null {
  if (list.emails.has(email))
    return { source, type: 'email', value: email, matchedSubdomain: false };
  const value = matchingDomain(domain, list.domains, descendants);
  return value === null
    ? null
    : { source, type: 'domain', value, matchedSubdomain: value !== domain };
}

/** Internal factory; the root entry supplies its default dataset lazily. */
export function createValidator(
  options: EmailValidatorOptions = {},
  defaultDomains: () => Iterable<string> = () => [],
): EmailValidator {
  const config = record(options, optionNames, 'validator');
  const allowDisposable = booleanOption(config.allowDisposable, false, 'allowDisposable');
  const includeSubdomains = booleanOption(config.includeSubdomains, true, 'includeSubdomains');
  const mode = config.allowlistMode === undefined ? 'exceptions' : config.allowlistMode;
  if (mode !== 'exceptions' && mode !== 'only') {
    throw new TypeError('allowlistMode must be exceptions or only');
  }
  const blocked = rules(config.blocklist, 'blocklist');
  const allowed = rules(config.allowlist, 'allowlist');
  const callbacks = customRules(config.customRules);
  const suggest = createSuggester(config.suggestions);
  const disposableDomains = snapshot(
    config.disposableDomains === undefined ? defaultDomains() : config.disposableDomains,
    normalizeDomain,
    'disposableDomains',
  );

  function evaluate(input: unknown): {
    result: EmailValidationResult;
    matchedRule: EmailRuleMatch | null;
    evaluations?: readonly EmailCustomRuleEvaluation[];
  } {
    const parsed = parseEmail(input);
    if (!parsed)
      return {
        result: {
          valid: false,
          email: null,
          domain: null,
          disposable: null,
          reasons: ['invalid_format'],
        },
        matchedRule: null,
      };
    const { email, domain } = parsed;
    const disposableMatch = matchingDomain(domain, disposableDomains, includeSubdomains);
    const disposable = disposableMatch !== null;
    const suggestion = suggest(email, domain);
    const details = {
      email,
      domain,
      disposable,
      ...(suggestion === undefined ? {} : { suggestion }),
    };
    const blockMatch = listMatch(email, domain, blocked, 'blocklist', includeSubdomains);
    if (blockMatch) {
      return {
        result: { ...details, valid: false, reasons: ['blocked'] },
        matchedRule: blockMatch,
      };
    }
    const allowMatch = listMatch(email, domain, allowed, 'allowlist', includeSubdomains);
    if (mode === 'only' && !allowMatch) {
      return { result: { ...details, valid: false, reasons: ['not_allowed'] }, matchedRule: null };
    }
    if (disposableMatch !== null && !allowDisposable && !allowMatch) {
      return {
        result: { ...details, valid: false, reasons: ['disposable'] },
        matchedRule: {
          source: 'disposableDomains',
          type: 'domain',
          value: disposableMatch,
          matchedSubdomain: disposableMatch !== domain,
        },
      };
    }
    const custom = evaluateCustomRules(callbacks, { email, domain, disposable });
    const warnings = custom.warnings.length ? { warnings: custom.warnings } : {};
    if (custom.rejection) {
      return {
        result: {
          ...details,
          ...warnings,
          valid: false,
          reasons: ['custom_rule'],
          customError: custom.rejection,
        },
        matchedRule: { source: 'customRules', type: 'custom', id: custom.rejection.ruleId },
        evaluations: custom.evaluations,
      };
    }
    return {
      result: { ...details, ...warnings, valid: true, reasons: [] },
      matchedRule: allowMatch,
      evaluations: custom.evaluations,
    };
  }

  return Object.freeze({
    check(input: unknown): EmailValidationResult {
      return evaluate(input).result;
    },
    explain(input: unknown) {
      const { result, matchedRule, evaluations } = evaluate(input);
      return {
        ...result,
        reason: result.reasons[0] ?? null,
        matchedRule,
        customRules: evaluations ?? [],
      };
    },
  });
}
