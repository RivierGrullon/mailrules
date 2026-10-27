import { createValidator } from './policy.js';
import type { EmailValidator, EmailValidatorOptions } from './types.js';

/** Create a validator with caller-provided data. No disposable dataset is loaded. */
export function createEmailValidator(options?: EmailValidatorOptions): EmailValidator {
  return createValidator(options);
}

export type {
  EmailListMatch,
  EmailRuleMatch,
  EmailRules,
  EmailValidationExplanation,
  EmailValidationReason,
  EmailValidationResult,
  EmailValidator,
  EmailValidatorOptions,
} from './types.js';
