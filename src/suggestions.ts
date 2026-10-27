import { record, snapshot } from './config.js';
import { normalizeDomain, parseEmail } from './normalize.js';

// Deliberately small suggestion vocabulary, not a registry of valid providers.
const defaultDomains = [
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'fastmail.com',
  'mail.com',
];
const optionNames = new Set(['domains']);

/** Exactly one insertion, deletion, substitution, or adjacent transposition. */
function oneEdit(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let offset = 0;
  while (offset < left.length && left[offset] === right[offset]) offset++;
  if (left.length === right.length) {
    if (offset === left.length) return false;
    if (left.slice(offset + 1) === right.slice(offset + 1)) return true;
    return (
      left[offset] === right[offset + 1] &&
      left[offset + 1] === right[offset] &&
      left.slice(offset + 2) === right.slice(offset + 2)
    );
  }
  return left.length < right.length
    ? left.slice(offset) === right.slice(offset + 1)
    : left.slice(offset + 1) === right.slice(offset);
}

function domainTypo(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  let edits = 0;
  for (let i = 0; i < left.length; i++) {
    if (left[i] === right[i]) continue;
    if (++edits > 1 || !oneEdit(left[i]!, right[i]!)) return false;
  }
  return edits === 1;
}

/** Build an isolated target vocabulary once; suggestions never change policy. */
export function createSuggester(
  value: unknown,
): (email: string, domain: string) => string | undefined {
  if (value === undefined || value === false) return () => undefined;
  let domains: ReadonlySet<string>;
  if (value === true) {
    domains = new Set(defaultDomains);
  } else {
    const config = record(value, optionNames, 'suggestions');
    if (config.domains === undefined) throw new TypeError('suggestions.domains is required');
    domains = snapshot(config.domains, normalizeDomain, 'suggestions.domains');
  }
  const byLength = new Map<number, { domain: string; labels: string[] }[]>();
  for (const domain of domains) {
    const labels = domain.split('.');
    if (labels.some((label) => label.startsWith('xn--'))) continue;
    const bucket = byLength.get(domain.length) ?? [];
    bucket.push({ domain, labels });
    byLength.set(domain.length, bucket);
  }

  return (email, domain) => {
    if (domains.has(domain)) return undefined;
    const labels = domain.split('.');
    if (labels.some((label) => label.startsWith('xn--'))) return undefined;
    let suggestion: string | undefined;
    const local = email.slice(0, email.lastIndexOf('@'));
    for (let length = domain.length - 1; length <= domain.length + 1; length++) {
      for (const candidate of byLength.get(length) ?? []) {
        if (!domainTypo(labels, candidate.labels)) continue;
        const address = `${local}@${candidate.domain}`;
        if (!parseEmail(address)) continue;
        // An equal-distance tie has no defensible automatic recommendation.
        if (suggestion !== undefined) return undefined;
        suggestion = address;
      }
    }
    return suggestion;
  };
}
