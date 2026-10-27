# mailrules

Configurable email validation for TypeScript and JavaScript.

Validate format, reject disposable providers, and apply your own domain and mailbox
blocklists and allowlists. Synchronous, local, and compatible with ESM, CommonJS,
Node.js >=22.12, and modern browser bundlers.

## Install

```sh
npm install mailrules
```

For an unpublished local checkout, run `npm run test:package` and install
`./artifacts/mailrules-0.1.0.tgz` in your application instead.

## Quick start

```ts
import { createEmailValidator } from 'mailrules';

// Create once and reuse; lists are normalized and indexed at construction.
const validator = createEmailValidator({
  blocklist: {
    domains: ['spam.example'],
    emails: ['abuse@example.com'],
  },
  allowlist: {
    emails: ['trusted@mailinator.com'],
  },
});

validator.check(' Alice+News@EXAMPLE.COM ');
// {
//   valid: true,
//   email: 'Alice+News@example.com',
//   domain: 'example.com',
//   disposable: false,
//   reasons: []
// }

validator.check('person@mailinator.com').reasons; // ['disposable']
validator.check('person@spam.example').reasons; // ['blocked']
validator.check('trusted@mailinator.com').valid; // true
validator.check(null).reasons; // ['invalid_format']
```

CommonJS uses the same API:

```js
const { createEmailValidator } = require('mailrules');
const validator = createEmailValidator();
```

## Configuration

| Option              | Default                | Meaning                                                                                                                              |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `disposableDomains` | Dataset from `fakeout` | Replaces the entire disposable dataset. Accepts an iterable of domain strings.                                                       |
| `allowDisposable`   | `false`                | Accept known disposable providers; still report `disposable: true`.                                                                  |
| `blocklist`         | `{}`                   | `{ domains?: Iterable<string>, emails?: Iterable<string> }`. An explicit block always wins.                                          |
| `allowlist`         | `{}`                   | Same shape as `blocklist`. A match can exempt an address from disposable rejection.                                                  |
| `allowlistMode`     | `'exceptions'`         | `'exceptions'` permits other unblocked addresses; `'only'` requires an allowlist match.                                              |
| `includeSubdomains` | `true`                 | Domain rules in all three lists also match descendants. Email rules always match exact addresses.                                    |
| `suggestions`       | `false`                | `true` enables built-in typo targets; `{ domains: Iterable<string> }` replaces those targets. Suggestions never change the decision. |
| `customRules`       | `[]`                   | Iterable of `{ id, check }` callbacks, evaluated in order after built-in checks pass.                                                |

Arrays, sets and generators are accepted. Lists are copied at creation; modifying
your original options or lists does not modify an existing validator. Construct a
new validator to change policy. Malformed entries, wrong option types and unknown
option names throw `TypeError` during construction.

### Accept only specified domains or mailboxes

```ts
const teamOnly = createEmailValidator({
  allowlistMode: 'only',
  allowlist: {
    domains: ['company.example'],
    emails: ['contractor@partner.example'],
  },
});

teamOnly.check('staff@company.example').valid; // true
teamOnly.check('staff@eu.company.example').valid; // true
teamOnly.check('contractor@partner.example').valid; // true
teamOnly.check('someone@gmail.com').reasons; // ['not_allowed']
```

An empty allowlist in `'only'` mode rejects every syntactically valid address.
Set `includeSubdomains: false` to require exact domain matches. For example,
`example.com` then matches `example.com` but not `sub.example.com`. With either
setting it never matches `notexample.com` or `example.com.evil.test`.

### Custom data and the lightweight core

The root entry includes [fakeout](https://github.com/Manas1820/fakeout) as its default
provider. To manage data yourself and omit that dataset from your bundle:

```ts
import { createEmailValidator } from 'mailrules/core';

const validator = createEmailValidator({
  disposableDomains: new Set(['burner.example', 'temporary.example']),
  blocklist: { domains: ['unwanted.example'] },
});
```

`mailrules/core` has the same API and defaults to an **empty** disposable dataset.
Its import graph does not load `fakeout`; the npm package still declares it as a
dependency. Both entries use `validator` for syntax validation.

For either entry, a supplied dataset **replaces** the default. An explicit empty
list disables disposable classification. To extend the default list:

```ts
import { getDisposableDomains } from 'fakeout';
import { createEmailValidator } from 'mailrules';

const validator = createEmailValidator({
  disposableDomains: [...getDisposableDomains(), 'new-burner.example'],
});
```

### Suggest domain typo corrections

```ts
const validator = createEmailValidator({ suggestions: true });
const result = validator.check(' User+Tag@GMIAL.COM ');

result.valid; // Determined by the original address, your policy and the disposable dataset
result.email; // 'User+Tag@gmial.com': never replaced with the suggestion
result.suggestion; // 'User+Tag@gmail.com'
```

Ask the user whether they meant the suggested address. Suggestions are advisory:
they do not prove the original domain is wrong, that the target mailbox exists,
or that the suggested address will pass your policy. Revalidate if the user
chooses a different address. Callbacks always receive the original normalized email.

Suggestions are off by default. When enabled, a unique target one insertion,
deletion, substitution or adjacent transposition away is suggested. An exact
target or an equal-distance tie produces no suggestion. Only one domain label
may differ; labels are never joined, split or removed. IDN/punycode domains are
not fuzzy-matched, and suggestions must satisfy the same email length/syntax limits.
The optional `suggestion` field is absent when there is no candidate, including
invalid input. A rejected but syntactically valid email may still carry a suggestion.

The built-in targets are `gmail.com`, `outlook.com`, `hotmail.com`, `live.com`,
`yahoo.com`, `icloud.com`, `aol.com`, `proton.me`, `protonmail.com`, `fastmail.com`
and `mail.com`. This is a small suggestion vocabulary, not a list of all valid providers.
Use your own vocabulary for company or regional domains:

```ts
const validator = createEmailValidator({
  suggestions: { domains: ['company.example', 'partner.example'] },
});
validator.check('user@compnay.example').suggestion; // 'user@company.example'
```

Custom targets replace the built-in vocabulary and are normalized, deduplicated
and copied at construction. An empty target list produces no suggestions.

### Explain which rule matched

```ts
const validator = createEmailValidator({
  blocklist: { domains: ['example.com'] },
});
const result = validator.explain('user@sub.example.com');

result.reason; // 'blocked'
result.matchedRule;
// {
//   source: 'blocklist',
//   type: 'domain',
//   value: 'example.com',
//   matchedSubdomain: true
// }
```

`explain()` evaluates once and returns the validation fields plus:

- `reason`: the first rejection code, or `null` when accepted.
- `matchedRule`: the normalized list entry responsible for the decision, or the
  rejecting custom rule's ID. A list source is `blocklist`, `allowlist` or
  `disposableDomains`. Exact mailbox matches take priority over domain matches
  within a list; the most specific matching domain wins. Email matches always
  have `matchedSubdomain: false`.
- `customRules`: ordered outcomes of callbacks that actually ran, each containing
  its `id`, `status` and, for warnings/rejections, `code` and optional `message`.

Accepted allowlist matches are reported too. Invalid input, an unmatched strict
allowlist, and ordinary acceptance without a list match have `matchedRule: null`.
Allowing disposable providers globally does not invent a matching allowlist rule.
These diagnostics can expose your private rules; decide which details to show in
public form responses. `check()` omits these explanation-only fields.

### Add application-specific rules

```ts
const validator = createEmailValidator({
  customRules: [
    {
      id: 'personal-mailbox',
      check: ({ email }) =>
        email.startsWith('support@')
          ? { status: 'rejected', code: 'role_mailbox', message: 'Use a personal address' }
          : { status: 'accepted' },
    },
    {
      id: 'review-partners',
      check: ({ domain }) =>
        domain === 'partner.example'
          ? { status: 'warning', code: 'review_partner' }
          : { status: 'accepted' },
    },
  ],
});

validator.check('support@example.com').reasons; // ['custom_rule']
validator.check('support@example.com').customError;
// { ruleId: 'personal-mailbox', code: 'role_mailbox', message: 'Use a personal address' }

const result = validator.check('person@partner.example');
result.valid; // true
result.warnings; // [{ ruleId: 'review-partners', code: 'review_partner' }]
```

Each callback receives a frozen `{ email, domain, disposable }` context. Rule IDs
must be unique, nonempty strings. A rule returns exactly one of:

- `{ status: 'accepted' }`: this rule passes; continue to the next rule.
- `{ status: 'warning', code, message? }`: add a warning and continue.
- `{ status: 'rejected', code, message? }`: reject and stop; later rules do not run.

Codes must be nonempty strings, and messages must be strings when supplied. All
built-in checks run first: custom acceptance cannot override invalid syntax,
blocklists, strict allowlist misses or disposable rejection. Allowlist exceptions
and `allowDisposable` still proceed through custom rules. Warnings encountered
before a custom rejection remain in the result.

Callbacks must return synchronously. Promises and malformed outcomes throw
`TypeError`; exceptions thrown by callbacks propagate to the caller. They are
configuration/programming errors, not accepted emails. Rule definitions are copied
at construction; mutable values captured by callback closures remain controlled
by your application. Each `check()` or `explain()` call runs eligible callbacks
once, so calling both methods evaluates twice. Use pure callbacks for repeatable results.

## Results and precedence

`check(input: unknown)` returns `EmailValidationResult` with these fields:

| Field         | Meaning                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| `valid`       | Whether the address passes syntax and your configured policy.                           |
| `email`       | Normalized email; `null` for invalid format.                                            |
| `domain`      | Lowercase ASCII domain; `null` for invalid format.                                      |
| `disposable`  | Whether this dataset classifies the domain as disposable; `null` for invalid format.    |
| `reasons`     | Empty when accepted, otherwise a single stable rejection code.                          |
| `suggestion`  | Optional advisory alternative address. The original `email` and decision are unchanged. |
| `warnings`    | Optional ordered `{ ruleId, code, message? }[]` from custom rules. Absent when empty.   |
| `customError` | `{ ruleId, code, message? }` on custom rejection; otherwise absent.                     |

Decisions run in this order and stop at the first rejection:

1. **`invalid_format`** — invalid input type or email syntax. An allowlist never overrides syntax.
2. **`blocked`** — explicit domain or mailbox block. This overrides every allow option.
3. **`not_allowed`** — `'only'` mode with no allowlist match.
4. **`disposable`** — known disposable domain, with neither an allowlist exception nor `allowDisposable: true`.
5. **`custom_rule`** — the first custom rule returning `rejected`. Earlier custom warnings are retained.
6. Otherwise accepted, potentially with custom warnings.

A permitted disposable email retains `disposable: true`. A value of `false` means
the domain was not found in the configured dataset, not proof it is permanent.

Types are exported from both entries: `EmailRules`, `EmailValidatorOptions`,
`EmailValidator`, `EmailValidationReason`, `EmailValidationResult`,
`EmailValidationExplanation`, `EmailListMatch`, `EmailRuleMatch`,
`EmailSuggestionOptions`, `EmailCustomRule`, `EmailCustomRuleContext`,
`EmailCustomRuleResult`, `EmailCustomRuleEvaluation`, and `EmailRuleIssue`. The result
is a discriminated union: when `result.valid` is true, `email` and `domain` are strings.

## Normalization and scope

- Outer spaces are trimmed. Control characters, including tabs, CR and LF, are rejected.
- Domain case and international domains are canonicalized using WHATWG URL/IDNA:
  `User@BÜCHER.de` becomes `User@xn--bcher-kva.de`. Rules use the same normalization.
- Local-part case, dots, quoting and plus tags are preserved. Exact mailbox rules
  are **case-sensitive in the local part**: `User@example.com` and `user@example.com`
  are distinct. An exact rule for one mailbox does not block all its aliases.
- ASCII local parts are supported, including quoted syntax accepted by
  [validator.js](https://github.com/validatorjs/validator.js). Unicode local parts
  (SMTPUTF8), display names, IP literals, single-label domains and trailing dots are rejected.
- Normalized addresses are limited to 254 characters and local parts to 64 bytes.
  Raw input is limited to 1,024 UTF-16 code units before parsing.
- Free providers such as Gmail are allowed. Free-provider classification is outside
  this release; opt-in suggestions are independent of provider classification.

This is syntax and policy validation. It performs no DNS, MX, SMTP or mailbox
ownership checks. A confirmation email is needed to establish mailbox ownership.
In a browser app, also apply validation on the server that accepts submissions.

## Keeping the data current

`fakeout` republishes changes from
[disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains).
Installed dependencies and running validators do not update themselves. Update
the dependency lockfile, test, and redeploy. Create new validators after replacing
caller-managed data. No network requests occur during construction or validation.

Consumers can use Dependabot/Renovate or update their installed dependency tree
with `npm update`. This repository includes daily dependency checks. Review data
changes because new classifications can change which signups are accepted.

## Development

```sh
npm ci
npm run check
```

`check` verifies formatting, types, all behavior tests, and an installed npm
tarball in ESM/CJS, TypeScript NodeNext/Bundler consumers and a browser-like runtime.
The checked tarball is written to `artifacts/`. See [CONTRIBUTING.md](CONTRIBUTING.md)
and the [release guide](docs/releasing.md).

## License

MIT. The disposable dataset originates from the CC0-licensed
`disposable-email-domains` project. `fakeout` and `validator.js` retain their own licenses.
