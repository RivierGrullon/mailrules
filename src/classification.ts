import { record, snapshot } from './config.js';
import { normalizeDomain } from './normalize.js';
import type { EmailClassificationAction, EmailListMatch, EmailRuleIssue } from './types.js';

// Conservative, curated vocabulary. Caller lists replace these snapshots.
const roleNames = [
  'admin',
  'administrator',
  'billing',
  'contact',
  'help',
  'hello',
  'info',
  'marketing',
  'noreply',
  'no-reply',
  'office',
  'postmaster',
  'sales',
  'security',
  'support',
  'team',
  'webmaster',
];
const freeDomains = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
];

function roleName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]*$/u.test(normalized) ? normalized : null;
}

export function classifier(value: unknown, source: 'roleAccounts' | 'freeProviders') {
  if (value === undefined) return undefined;
  const field = source === 'roleAccounts' ? 'names' : 'domains';
  const config =
    typeof value === 'string'
      ? { action: value }
      : record(value, new Set(['action', field]), source);
  if (config.action !== 'allow' && config.action !== 'warn' && config.action !== 'block') {
    throw new TypeError(`${source}.action must be allow, warn or block`);
  }
  const action: EmailClassificationAction = config.action;
  const values = snapshot(
    config[field] === undefined
      ? source === 'roleAccounts'
        ? roleNames
        : freeDomains
      : config[field],
    source === 'roleAccounts' ? roleName : normalizeDomain,
    source,
  );
  return {
    action,
    match(email: string, domain: string): EmailListMatch | null {
      let local = email.slice(0, email.lastIndexOf('@'));
      if (local.startsWith('"') && local.endsWith('"'))
        local = local.slice(1, -1).replace(/\\(.)/gu, '$1');
      const candidate = source === 'roleAccounts' ? local.split('+')[0]!.toLowerCase() : domain;
      if (!values.has(candidate)) return null;
      return {
        source,
        type: source === 'roleAccounts' ? 'localPart' : 'domain',
        value: candidate,
        matchedSubdomain: false,
      };
    },
  };
}

export function classificationWarning(source: 'roleAccounts' | 'freeProviders'): EmailRuleIssue {
  return source === 'roleAccounts'
    ? {
        ruleId: 'roleAccounts',
        code: 'role_account',
        message: 'This address appears to be a shared role mailbox.',
      }
    : {
        ruleId: 'freeProviders',
        code: 'free_provider',
        message: 'This domain is in the configured free-provider list.',
      };
}
