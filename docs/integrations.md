# Zod, React forms and CSV email validation

The [live playground](https://riviergrullon.github.io/mailrules/) lets you try these
rules and copy JavaScript or React examples. It runs entirely in your browser.

## Zod 4

Install Zod only when using this adapter. The root `mailrules` and `mailrules/core`
imports do not load it. Zod is an optional peer dependency, not a required download.

```sh
npm install mailrules zod
```

```ts
import { z } from 'zod';
import { createEmailValidator } from 'mailrules';
import { zodEmail } from 'mailrules/zod';

const validator = createEmailValidator({ roleAccounts: 'warn' });
const signup = z.object({ email: zodEmail(validator) });

signup.parse({ email: ' User@EXAMPLE.COM ' });
// { email: 'User@example.com' }
signup.safeParse({ email: 'person@mailinator.com' }).success; // false
```

The adapter accepts unknown input and returns a normalized string. Failures become
Zod issues at the email field's path. Warnings remain successful. To inspect
warnings or explanations, use `validator.check()` or `validator.explain()` directly.
Each adapter evaluation calls the validator once; callback exceptions propagate.

Customize feedback with `zodEmail(validator, { message: result => ... })`:

```ts
const email = zodEmail(validator, {
  message: (result) => `Please choose another address (${result.reasons[0]}).`,
});
```

## React Hook Form

```sh
npm install mailrules zod react-hook-form @hookform/resolvers
```

```tsx
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createEmailValidator } from 'mailrules';
import { zodEmail } from 'mailrules/zod';

const validator = createEmailValidator({
  blocklist: { domains: ['spam.example'] },
  roleAccounts: 'warn',
});
const schema = z.object({ email: zodEmail(validator) });

export function SignupForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit((data) => console.log(data.email))}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        {...register('email')}
        aria-invalid={!!errors.email}
        aria-describedby={errors.email ? 'email-error' : undefined}
      />
      {errors.email && (
        <p id="email-error" role="alert">
          {errors.email.message}
        </p>
      )}
      <button type="submit">Continue</button>
    </form>
  );
}
```

Create and reuse the validator outside the component when the policy is static.
For dynamic policies, memoize it. Apply the same policy on the server accepting
submissions; a browser validation result does not grant access or prove ownership.

## Standard Schema v1

Tools that accept Standard Schema can use `mailrules/schema` without Zod:

```ts
import { createEmailValidator } from 'mailrules';
import { emailSchema } from 'mailrules/schema';

const schema = emailSchema(createEmailValidator());
const result = schema['~standard'].validate(' User@EXAMPLE.COM ');
// { value: 'User@example.com' }
```

`emailSchema` supports the same optional `message` callback as `zodEmail`.
The structural interface is compatible with `StandardSchemaV1<unknown, string>`;
no Standard Schema runtime package is needed. Use it for a single email value,
or compose it with your form library's object schema support.

## Review email addresses in a CSV

```sh
npx mailrules --input contacts.csv --output report.csv
npx mailrules --input contacts.csv --status rejected --output rejected.csv
npx mailrules --input contacts.csv --status accepted --output accepted.csv
```

Input requires an `email` header by default:

```csv
email,name
person@example.com,Alice
person@mailinator.com,Bob
not-an-email,Carol
```

A report contains `row`, `input`, `email`, `valid`, `reason`, `disposable`,
`role_account`, `free_provider`, `suggestion`, and `warnings`. It preserves input
order and includes the original email alongside its normalized value. Other
source columns are not copied. `row` is the logical CSV record number including
the header, not a physical line number when quoted fields contain line breaks.

Use `--config rules.json` for serializable validator options:

```json
{
  "roleAccounts": "warn",
  "freeProviders": "block",
  "suggestions": true,
  "blocklist": { "domains": ["spam.example"] }
}
```

```sh
npx mailrules --input contacts.csv --column contact_email --config rules.json
npx mailrules --input contacts.csv --delimiter ';'
cat contacts.csv | npx mailrules --status rejected
```

- Omit `--input` or use `--input -` for stdin; omit `--output` or use `--output -`
  for stdout. Existing output files are never overwritten, including the input.
- Input is UTF-8, optionally with a BOM. Comma, semicolon and `tab` delimiters are
  supported, including quoted multiline fields and doubled quote escapes.
- Blank physical rows are skipped. Duplicate/empty headers, missing columns,
  malformed quotes and inconsistent record lengths are errors.
- Input is limited to 20 MiB and config to 1 MiB. Parsing also limits each file
  to 100,000 data records plus its header, 256 columns and 1,000,000 total cells
  (including headers). Each raw field content is limited to 262,144 UTF-16 code
  units, excluding outer quotes but including doubled quote escapes. Limits are
  enforced while parsing, before building a report. Processing is in memory;
  split larger files before use. The command does not stream arbitrarily large lists.
- Reports use comma-separated CSV with CRLF endings. To prevent spreadsheet
  formula evaluation, risky cell values are prefixed with an apostrophe. This
  includes email local parts starting with `+`, `-`, `=` or `@`; the validation
  decision is based on the original value before this export escaping.
- Exit 0 means the command completed, even if some rows were rejected. With
  `--fail-on-rejected`, exit 1 means at least one input row failed, regardless of
  output filtering. Exit 2 means a configuration, input or I/O error.
- Config is JSON data, not executable code; custom callback functions are available
  through the JavaScript API. No emails are sent or uploaded.
