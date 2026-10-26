import { getDisposableDomains } from 'fakeout';
import { createValidator } from './policy.js';
import type { EmailValidator, EmailValidatorOptions } from './types.js';

/** Create a validator using fakeout's disposable domains unless overridden. */
export function createEmailValidator(options?: EmailValidatorOptions): EmailValidator {
  return createValidator(options, getDisposableDomains);
}

export type {
  EmailRules,
  EmailValidationReason,
  EmailValidationResult,
  EmailValidator,
  EmailValidatorOptions,
} from './types.js';
