/** Stable rejection codes, in decision order. */
export type EmailValidationReason =
  'invalid_format' | 'blocked' | 'not_allowed' | 'disposable' | 'custom_rule';

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
  /** Synchronous application rules, evaluated in order after built-in checks pass. */
  readonly customRules?: Iterable<EmailCustomRule>;
  /** Opt-in advisory typo suggestions. True uses built-in targets; an object replaces them. */
  readonly suggestions?: boolean | EmailSuggestionOptions;
}

export interface EmailSuggestionOptions {
  readonly domains: Iterable<string>;
}

export interface EmailCustomRuleContext {
  readonly email: string;
  readonly domain: string;
  readonly disposable: boolean;
}

export type EmailCustomRuleResult =
  | { readonly status: 'accepted' }
  | { readonly status: 'rejected' | 'warning'; readonly code: string; readonly message?: string };

export interface EmailCustomRule {
  readonly id: string;
  readonly check: (context: EmailCustomRuleContext) => EmailCustomRuleResult;
}

export type EmailCustomRuleEvaluation = EmailCustomRuleResult & { readonly id: string };

export interface EmailRuleIssue {
  readonly ruleId: string;
  readonly code: string;
  readonly message?: string;
}

interface ParsedEmailResult {
  readonly email: string;
  readonly domain: string;
  readonly disposable: boolean;
}

type EmailValidationOutcome =
  | (ParsedEmailResult & {
      readonly valid: true;
      readonly reasons: readonly [];
      readonly customError?: never;
    })
  | (ParsedEmailResult & {
      readonly valid: false;
      readonly reasons: readonly [Exclude<EmailValidationReason, 'invalid_format' | 'custom_rule'>];
      readonly customError?: never;
    })
  | (ParsedEmailResult & {
      readonly valid: false;
      readonly reasons: readonly ['custom_rule'];
      readonly customError: EmailRuleIssue;
    })
  | {
      readonly valid: false;
      readonly email: null;
      readonly domain: null;
      readonly disposable: null;
      readonly reasons: readonly ['invalid_format'];
      readonly customError?: never;
    };

export type EmailValidationResult = EmailValidationOutcome & {
  /** Advisory address suggestion; never replaces email or changes the validation decision. */
  readonly suggestion?: string;
  /** Present only when custom rules produced warnings. Warnings do not reject an address. */
  readonly warnings?: readonly EmailRuleIssue[];
};

/** Normalized list entry responsible for a policy decision. */
export interface EmailListMatch {
  readonly source: 'blocklist' | 'allowlist' | 'disposableDomains';
  readonly type: 'email' | 'domain';
  readonly value: string;
  readonly matchedSubdomain: boolean;
}

export type EmailRuleMatch =
  | EmailListMatch
  | {
      readonly source: 'customRules';
      readonly type: 'custom';
      readonly id: string;
    };

export type EmailValidationExplanation = EmailValidationResult & {
  readonly reason: EmailValidationReason | null;
  readonly matchedRule: EmailRuleMatch | null;
  readonly customRules: readonly EmailCustomRuleEvaluation[];
};

export interface EmailValidator {
  /** Validate an untrusted value without network requests. */
  check(input: unknown): EmailValidationResult;
  /** Evaluate once and identify the rule that decided the result. */
  explain(input: unknown): EmailValidationExplanation;
}
