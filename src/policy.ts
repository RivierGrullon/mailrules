import { normalizeDomain, parseEmail } from './normalize.js';
import type {
  EmailListMatch,
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
]);
const ruleNames = new Set(['domains', 'emails']);

function record(
  value: unknown,
  names: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  for (const name of Object.keys(value)) {
    if (!names.has(name)) throw new TypeError(`Unknown ${label} option: ${name}`);
  }
  return value as Record<string, unknown>;
}

function booleanOption(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function snapshot(
  value: unknown,
  normalize: (input: unknown) => string | null,
  label: string,
): ReadonlySet<string> {
  if (value === undefined) return new Set();
  if (
    value === null ||
    typeof value === 'string' ||
    typeof (value as Iterable<unknown>)[Symbol.iterator] !== 'function'
  ) {
    throw new TypeError(`${label} must be an iterable of strings`);
  }
  const result = new Set<string>();
  for (const entry of value as Iterable<unknown>) {
    const normalized = normalize(entry);
    if (normalized === null) throw new TypeError(`${label} contains an invalid entry`);
    result.add(normalized);
  }
  return result;
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
  const disposableDomains = snapshot(
    config.disposableDomains === undefined ? defaultDomains() : config.disposableDomains,
    normalizeDomain,
    'disposableDomains',
  );

  function evaluate(input: unknown): {
    result: EmailValidationResult;
    matchedRule: EmailListMatch | null;
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
    const details = { email, domain, disposable };
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
    return { result: { ...details, valid: true, reasons: [] }, matchedRule: allowMatch };
  }

  return Object.freeze({
    check(input: unknown): EmailValidationResult {
      return evaluate(input).result;
    },
    explain(input: unknown) {
      const { result, matchedRule } = evaluate(input);
      return { ...result, reason: result.reasons[0] ?? null, matchedRule, customRules: [] };
    },
  });
}
