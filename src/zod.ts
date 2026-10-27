import { z } from 'zod';
import { emailSchema, type EmailSchemaOptions } from './schema.js';
import type { EmailValidator } from './types.js';

/** Zod 4 adapter. Importing the root package does not load Zod. */
export function zodEmail(validator: EmailValidator, options?: EmailSchemaOptions) {
  const schema = emailSchema(validator, options);
  return z.unknown().transform((input, context): string => {
    const result = schema['~standard'].validate(input);
    if (result.issues) {
      for (const issue of result.issues)
        context.addIssue({ code: 'custom', message: issue.message });
      return z.NEVER;
    }
    return result.value;
  });
}
