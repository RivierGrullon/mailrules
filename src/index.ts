import { getDisposableDomains } from 'fakeout';
import { createValidator } from './policy.js';
import type { EmailValidator, EmailValidatorOptions } from './types.js';

/** Create a validator using fakeout's disposable domains unless overridden. */
export function createEmailValidator(options?: EmailValidatorOptions): EmailValidator {
  return createValidator(options, getDisposableDomains);
}

export type {
  EmailClassificationAction,
  EmailRoleAccountOptions,
  EmailFreeProviderOptions,
  EmailCustomRule,
  EmailCustomRuleContext,
  EmailCustomRuleEvaluation,
  EmailCustomRuleResult,
  EmailListMatch,
  EmailRuleIssue,
  EmailRuleMatch,
  EmailRules,
  EmailSuggestionOptions,
  EmailValidationExplanation,
  EmailValidationReason,
  EmailValidationResult,
  EmailValidator,
  EmailValidatorOptions,
} from './types.js';
