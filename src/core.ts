import { createValidator } from './policy.js';
import type { EmailValidator, EmailValidatorOptions } from './types.js';

/** Create a validator with caller-provided data. No disposable dataset is loaded. */
export function createEmailValidator(options?: EmailValidatorOptions): EmailValidator {
  return createValidator(options);
}

export type {
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
