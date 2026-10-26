import { normalizeDomain, parseEmail } from './normalize.js';
import type { EmailValidationResult, EmailValidator, EmailValidatorOptions } from './types.js';

const optionNames = new Set([
  'disposableDomains', 'allowDisposable', 'blocklist', 'allowlist',
  'allowlistMode', 'includeSubdomains',
]);
const ruleNames = new Set(['domains', 'emails']);

function record(value: unknown, names: ReadonlySet<string>, label: string): Record<string, unknown> {
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
  value: unknown, normalize: (input: unknown) => string | null, label: string,
): ReadonlySet<string> {
  if (value === undefined) return new Set();
  if (value === null || typeof value === 'string' ||
      typeof (value as Iterable<unknown>)[Symbol.iterator] !== 'function') {
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

function matchesDomain(domain: string, list: ReadonlySet<string>, descendants: boolean): boolean {
  if (list.has(domain)) return true;
  if (!descendants) return false;
  // Start at complete labels; example.com must never match notexample.com.
  let dot = domain.indexOf('.');
  while (dot !== -1) {
    if (list.has(domain.slice(dot + 1))) return true;
    dot = domain.indexOf('.', dot + 1);
  }
  return false;
}

/** Internal factory; the root entry supplies its default dataset lazily. */
export function createValidator(
  options: EmailValidatorOptions = {}, defaultDomains: () => Iterable<string> = () => [],
): EmailValidator {
  const config = record(options, optionNames, 'validator');
  const allowDisposable = booleanOption(config.allowDisposable, false, 'allowDisposable');
  const includeSubdomains = booleanOption(config.includeSubdomains, true, 'includeSubdomains');
  const mode = config.allowlistMode ?? 'exceptions';
  if (mode !== 'exceptions' && mode !== 'only') {
    throw new TypeError('allowlistMode must be exceptions or only');
  }
  const blocked = rules(config.blocklist, 'blocklist');
  const allowed = rules(config.allowlist, 'allowlist');
  const disposableDomains = snapshot(
    config.disposableDomains === undefined ? defaultDomains() : config.disposableDomains,
    normalizeDomain, 'disposableDomains',
  );

  return Object.freeze({
    check(input: unknown): EmailValidationResult {
      const parsed = parseEmail(input);
      if (!parsed) return {
        valid: false, email: null, domain: null, disposable: null, reasons: ['invalid_format'],
      };
      const { email, domain } = parsed;
      const disposable = matchesDomain(domain, disposableDomains, includeSubdomains);
      const details = { email, domain, disposable };
      if (blocked.emails.has(email) || matchesDomain(domain, blocked.domains, includeSubdomains)) {
        return { ...details, valid: false, reasons: ['blocked'] };
      }
      const isAllowed = allowed.emails.has(email) || matchesDomain(domain, allowed.domains, includeSubdomains);
      if (mode === 'only' && !isAllowed) {
        return { ...details, valid: false, reasons: ['not_allowed'] };
      }
      if (disposable && !allowDisposable && !isAllowed) {
        return { ...details, valid: false, reasons: ['disposable'] };
      }
      return { ...details, valid: true, reasons: [] };
    },
  });
}
