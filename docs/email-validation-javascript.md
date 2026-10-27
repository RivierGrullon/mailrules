# Email validation in JavaScript: block disposable emails and apply signup rules

An email address can have valid syntax and still be unsuitable for a signup form.
You may need to reject a disposable email provider, block an abusive mailbox, or
restrict access to a company's domain. This guide implements those checks with
[mailrules](https://www.npmjs.com/package/mailrules), a JavaScript and TypeScript
email validation library.

The examples use JavaScript syntax and also work in TypeScript. They require
Node.js 22.12+ or a modern browser bundler. The API is synchronous and performs no
network requests.

## 1. Install the email validator

```sh
npm install mailrules
```

```js
import { createEmailValidator } from 'mailrules';

const validator = createEmailValidator();

validator.check('person@example.com').valid; // true
validator.check('not-an-email').reasons; // ['invalid_format']
validator.check('person@mailinator.com').reasons; // ['disposable']
```

For CommonJS, use `const { createEmailValidator } = require('mailrules')`.
Create a validator once and reuse it. Its configured lists are copied and indexed
during construction.

The default import combines syntax checking through `validator.js` with the
disposable-domain dataset supplied by `fakeout`. Passing the checks does not prove
that the address exists or can receive email.

## 2. Add an email blocklist and allowlist

Blocklists reject domains or specific mailboxes. Allowlists can make exceptions
for legitimate users of a provider that is otherwise classified as disposable.

```js
const signupValidator = createEmailValidator({
  blocklist: {
    domains: ['spam.example'],
    emails: ['abuse@example.com'],
  },
  allowlist: {
    emails: ['trusted@mailinator.com'],
  },
});

signupValidator.check('person@spam.example').reasons; // ['blocked']
signupValidator.check('abuse@example.com').reasons; // ['blocked']
signupValidator.check('trusted@mailinator.com').valid; // true
```

These are also commonly called email blacklists and whitelists. In mailrules,
an explicit block always takes priority over an allowlist entry. Domain rules
include subdomains by default; set `includeSubdomains: false` for exact matches.

Exact mailbox rules preserve local-part case and plus tags. Blocking
`abuse@example.com` does not also block `abuse+tag@example.com`. Consider this
when choosing between a mailbox rule and a domain rule.

## 3. Restrict signups to a company domain

For an internal tool or invitation policy, use strict allowlist mode:

```js
const companyValidator = createEmailValidator({
  allowlistMode: 'only',
  includeSubdomains: false,
  allowlist: { domains: ['company.example'] },
});

companyValidator.check('staff@company.example').valid; // true
companyValidator.check('staff@eu.company.example').reasons; // ['not_allowed']
companyValidator.check('someone@gmail.com').reasons; // ['not_allowed']
```

An empty allowlist in this mode rejects every syntactically valid address.
Use a confirmation flow before granting access: an allowed domain string alone
does not establish that the person controls the mailbox.

## 4. Show useful validation feedback

Use stable reason codes to choose your application's messages. This helper can
run in a Node.js request handler or in a browser form handler:

```js
const messages = {
  invalid_format: 'Enter a valid email address.',
  blocked: 'This email address is not accepted.',
  not_allowed: 'Use an approved email address.',
  disposable: 'Use an email address you can keep receiving messages at.',
  custom_rule: 'This address does not meet our signup requirements.',
};

function validateSignupEmail(input) {
  const result = signupValidator.check(input);

  if (!result.valid) {
    return { ok: false, message: messages[result.reasons[0]] };
  }

  return { ok: true, email: result.email };
}
```

Run the policy on the server accepting the submission, even if your React or other
browser form already validates it. Browser checks provide feedback but can be bypassed.

## 5. Suggest email domain typo corrections

```js
const withSuggestions = createEmailValidator({ suggestions: true });
const result = withSuggestions.check('User+Tag@gmial.com');

result.email; // 'User+Tag@gmial.com'
result.suggestion; // 'User+Tag@gmail.com'
```

Present the suggestion as a choice. The original address and validation decision
are unchanged: a suggestion does not imply that either mailbox exists or passes
your rules. If the user accepts it, validate the chosen address again.

## 6. Explain rejected addresses

```js
const explanation = signupValidator.explain('person@spam.example');

explanation.reason; // 'blocked'
explanation.matchedRule;
// {
//   source: 'blocklist',
//   type: 'domain',
//   value: 'spam.example',
//   matchedSubdomain: false
// }
```

Use the explanation when diagnosing policy decisions or building internal tools.
Choose which details to show in a public form instead of exposing every internal rule.

## Keeping disposable email detection current

The default data comes from
[disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)
through [fakeout](https://github.com/Manas1820/fakeout). Installed data does not
refresh automatically. Update dependencies, review classification changes and
redeploy, or supply updated `disposableDomains` and create a new validator.

If you manage your own list, import from `mailrules/core`. It has the same API and
defaults to an empty disposable dataset; its import graph does not load `fakeout`.
Supplying a list replaces the default dataset rather than extending it.

## Validation versus email verification

mailrules checks syntax and application policy. It does not query DNS or MX records,
contact SMTP servers, or send confirmation emails. Use a verification link to
establish mailbox ownership. Disposable-domain checks are one part of a signup
policy and do not replace rate limiting or other abuse controls.

See the [API documentation](https://github.com/RivierGrullon/mailrules#readme) for
custom rules, warnings, configuration options and TypeScript result types.
