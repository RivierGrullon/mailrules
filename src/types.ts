/** Stable rejection codes, in decision order. */
export type EmailValidationReason = 'invalid_format' | 'blocked' | 'not_allowed' | 'disposable';

/** Domain rules inherit to subdomains by default; email rules are exact. */
export interface EmailRules {
  readonly domains?: Iterable<string>;
  readonly emails?: Iterable<string>;
}

export interface EmailValidatorOptions {
  /** Replace the default dataset. An empty iterable disables disposable detection. */
  readonly disposableDomains?: Iterable<string>;
  /** Permit known disposable domains while still reporting their classification. Default: false. */
  readonly allowDisposable?: boolean;
  readonly blocklist?: EmailRules;
  readonly allowlist?: EmailRules;
  /** Exceptions bypass disposable rejection; only additionally requires an allowlist match. */
  readonly allowlistMode?: 'exceptions' | 'only';
  /** Apply domain rules to their descendants as well as exact matches. Default: true. */
  readonly includeSubdomains?: boolean;
}

interface ParsedEmailResult {
  readonly email: string;
  readonly domain: string;
  readonly disposable: boolean;
}

export type EmailValidationResult =
  | (ParsedEmailResult & { readonly valid: true; readonly reasons: readonly [] })
  | (ParsedEmailResult & {
      readonly valid: false;
      readonly reasons: readonly [Exclude<EmailValidationReason, 'invalid_format'>];
    })
  | {
      readonly valid: false;
      readonly email: null;
      readonly domain: null;
      readonly disposable: null;
      readonly reasons: readonly ['invalid_format'];
    };

export interface EmailValidator {
  /** Validate an untrusted value without network requests. */
  check(input: unknown): EmailValidationResult;
}
