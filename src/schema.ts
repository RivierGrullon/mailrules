import type { EmailValidationReason, EmailValidationResult, EmailValidator } from './types.js';

export interface EmailSchemaOptions {
  readonly message?: (result: EmailValidationResult & { valid: false }) => string;
}

/** A structurally compatible Standard Schema v1; no runtime dependency. */
export interface EmailSchema {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'mailrules';
    readonly types?: { readonly input: unknown; readonly output: string };
    readonly validate: (
      input: unknown,
    ) =>
      | { readonly value: string; readonly issues?: undefined }
      | { readonly issues: readonly { readonly message: string }[] };
  };
}

const messages: Record<EmailValidationReason, string> = {
  invalid_format: 'Enter a valid email address.',
  blocked: 'This email address is not accepted.',
  not_allowed: 'Use an approved email address.',
  disposable: 'Use an email address you can keep receiving messages at.',
  role_account: 'Use a personal mailbox instead of a shared role address.',
  free_provider: 'Use an email address outside the configured free-provider list.',
  custom_rule: 'This address does not meet the email requirements.',
};

/** Adapt an existing validator for tools that consume Standard Schema v1. */
export function emailSchema(
  validator: EmailValidator,
  options: EmailSchemaOptions = {},
): EmailSchema {
  const message = options.message;
  return Object.freeze({
    '~standard': Object.freeze({
      version: 1 as const,
      vendor: 'mailrules' as const,
      validate(input: unknown) {
        const result = validator.check(input);
        if (result.valid) return { value: result.email };
        return { issues: [{ message: message ? message(result) : messages[result.reasons[0]] }] };
      },
    }),
  });
}
