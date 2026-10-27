import { useEffect, useMemo, useState } from 'react';
import {
  createEmailValidator,
  type EmailClassificationAction,
  type EmailValidator,
  type EmailValidatorOptions,
} from 'mailrules';
import { zodEmail } from 'mailrules/zod';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

type Action = EmailClassificationAction | 'off';
type Settings = {
  blockedDomains: string;
  blockedEmails: string;
  allowedDomains: string;
  allowedEmails: string;
  strict: boolean;
  subdomains: boolean;
  disposable: boolean;
  suggestions: boolean;
  roles: Action;
  free: Action;
  plusWarning: boolean;
};
const initial: Settings = {
  blockedDomains: '',
  blockedEmails: '',
  allowedDomains: '',
  allowedEmails: '',
  strict: false,
  subdomains: true,
  disposable: true,
  suggestions: true,
  roles: 'off',
  free: 'off',
  plusWarning: false,
};
const list = (text: string) =>
  text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
const mailboxes = (text: string) =>
  text
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
function optionsFor(s: Settings): EmailValidatorOptions {
  return {
    allowDisposable: !s.disposable,
    includeSubdomains: s.subdomains,
    suggestions: s.suggestions,
    allowlistMode: s.strict ? 'only' : 'exceptions',
    blocklist: { domains: list(s.blockedDomains), emails: mailboxes(s.blockedEmails) },
    allowlist: { domains: list(s.allowedDomains), emails: mailboxes(s.allowedEmails) },
    ...(s.roles === 'off' ? {} : { roleAccounts: s.roles }),
    ...(s.free === 'off' ? {} : { freeProviders: s.free }),
    ...(s.plusWarning
      ? {
          customRules: [
            {
              id: 'plus-tag',
              check: ({ email }: { email: string }) =>
                email.slice(0, email.lastIndexOf('@')).includes('+')
                  ? {
                      status: 'warning' as const,
                      code: 'plus_tag',
                      message: 'This address contains a plus tag.',
                    }
                  : { status: 'accepted' as const },
            },
          ],
        }
      : {}),
  };
}
function configCode(s: Settings) {
  const { customRules: _, ...options } = optionsFor(s);
  const config = JSON.stringify(options, null, 2);
  return !s.plusWarning
    ? config
    : config.slice(0, -2) +
        `,\n  customRules: [{\n    id: 'plus-tag',\n    check: ({ email }) => email.slice(0, email.lastIndexOf('@')).includes('+')\n      ? { status: 'warning', code: 'plus_tag', message: 'This address contains a plus tag.' }\n      : { status: 'accepted' }\n  }]\n}`;
}
function exampleCode(s: Settings, email: string, mode: string) {
  const setup = `import { createEmailValidator } from 'mailrules';\n\nconst validator = createEmailValidator(${configCode(s)});`;
  if (mode === 'javascript')
    return `${setup}\n\nconst result = validator.check(${JSON.stringify(email)});\nconsole.log(result);\n\n// Syntax and policy checks; not mailbox verification.`;
  return `import { z } from 'zod';\nimport { useForm } from 'react-hook-form';\nimport { zodResolver } from '@hookform/resolvers/zod';\nimport { zodEmail } from 'mailrules/zod';\n${setup}\n\nconst schema = z.object({ email: zodEmail(validator) });\n\nexport function SignupForm() {\n  const { register, handleSubmit, formState: { errors } } = useForm({\n    resolver: zodResolver(schema),\n  });\n  return (\n    <form onSubmit={handleSubmit(data => console.log(data.email))}>\n      <input {...register('email')} aria-label="Email" />\n      {errors.email && <p role="alert">{errors.email.message}</p>}\n      <button type="submit">Continue</button>\n    </form>\n  );\n}`;
}
function SignupDemo({ validator }: { validator: EmailValidator }) {
  const schema = useMemo(() => z.object({ email: zodEmail(validator) }), [validator]);
  const [success, setSuccess] = useState('');
  const {
    register,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
  });
  useEffect(() => {
    setSuccess('');
    clearErrors();
  }, [validator, clearErrors]);
  return (
    <form
      className="signup-demo"
      noValidate
      onSubmit={handleSubmit(
        (data) => setSuccess(data.email),
        () => setSuccess(''),
      )}
    >
      <label htmlFor="signup-email">Signup email</label>
      <div className="signup-row">
        <input
          id="signup-email"
          type="text"
          inputMode="email"
          autoComplete="off"
          placeholder="you@company.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'signup-error' : undefined}
          {...register('email', { onChange: () => setSuccess('') })}
        />
        <button className="primary" type="submit">
          Try signup
        </button>
      </div>
      {errors.email && (
        <p className="error-text" id="signup-error" role="alert">
          {errors.email.message}
        </p>
      )}
      {success && (
        <p className="form-success" role="status">
          Accepted as <code>{success}</code>. This demo does not create an account.
        </p>
      )}
      <p className="hint">
        This form uses React Hook Form and Zod with the rules above. Nothing is submitted to a
        server.
      </p>
    </form>
  );
}
export default function App() {
  const [s, setSettings] = useState<Settings>(initial);
  const [email, setEmail] = useState('alex@example.com');
  const [mode, setMode] = useState('javascript');
  const [copied, setCopied] = useState('');
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((old) => ({ ...old, [key]: value }));
    setCopied('');
  };
  const state = useMemo(() => {
    try {
      return { validator: createEmailValidator(optionsFor(s)), error: '' };
    } catch (e) {
      return { validator: null, error: e instanceof Error ? e.message : 'Check your settings.' };
    }
  }, [s]);
  const result = state.validator && email ? state.validator.explain(email) : null;
  const code = exampleCode(s, email, mode);
  const preset = (name: string) => {
    setCopied('');
    if (name === 'company') {
      setSettings({ ...initial, strict: true, allowedDomains: 'company.example' });
      setEmail('alex@company.example');
    } else if (name === 'classifications') {
      setSettings({ ...initial, roles: 'warn', free: 'warn' });
      setEmail('support@gmail.com');
    } else {
      setSettings(initial);
      setEmail('alex@example.com');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('Copied to clipboard');
    } catch {
      setCopied('Select the code below and copy it manually.');
    }
  };
  const status = state.error
    ? 'Fix rule settings'
    : !result
      ? 'Enter an email'
      : result.valid
        ? 'Accepted'
        : 'Rejected';
  return (
    <>
      <a className="skip-link" href="#playground">
        Skip to playground
      </a>
      <header className="site-header">
        <a className="wordmark" href="./">
          mailrules<span>/ playground</span>
        </a>
        <nav aria-label="Main">
          <a href="https://www.npmjs.com/package/mailrules">npm</a>
          <a href="https://github.com/RivierGrullon/mailrules">GitHub</a>
          <a href="https://github.com/RivierGrullon/mailrules#readme">Docs</a>
        </nav>
      </header>
      <main id="playground">
        <section className="intro">
          <div>
            <h1>
              Give your email rules
              <br className="desktop-break" /> a test run.
            </h1>
            <p>
              Decide which addresses your app accepts. Test your policy, see the reason, then take
              the code.
            </p>
          </div>
          <div className="install">
            <span>JavaScript &amp; TypeScript · MIT</span>
            <code>npm install mailrules</code>
            <span>Runs locally. No API key.</span>
          </div>
        </section>
        <section className="address-bar" aria-label="Email input">
          <label htmlFor="email">Email to check</label>
          <input
            id="email"
            type="text"
            inputMode="email"
            autoComplete="off"
            spellCheck="false"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setCopied('');
            }}
            placeholder="you@example.com"
          />
          <p className="hint">
            Your address stays in this browser. No DNS or mailbox existence checks.
          </p>
        </section>
        <div className="preset-row">
          <span>Start with</span>
          <button onClick={() => preset('signup')}>Signup defaults</button>
          <button onClick={() => preset('company')}>Company access</button>
          <button onClick={() => preset('classifications')}>Classifications</button>
        </div>
        <div className="mobile-result">
          <strong>{status}</strong>
          <a href="#result-title">View result</a>
        </div>
        <div className="workspace">
          <section className="rules-panel" aria-labelledby="rules-title">
            <div className="section-heading">
              <h2 id="rules-title">Your rules</h2>
              <button className="text-button" onClick={() => preset('signup')}>
                Reset
              </button>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={s.disposable}
                onChange={(e) => update('disposable', e.target.checked)}
              />
              <span>
                Reject disposable emails<small>Based on the bundled domain list</small>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={s.suggestions}
                onChange={(e) => update('suggestions', e.target.checked)}
              />
              <span>
                Suggest domain corrections<small>Suggestions never replace the address</small>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={s.subdomains}
                onChange={(e) => update('subdomains', e.target.checked)}
              />
              <span>
                Match subdomains
                <small>Applies to domain lists, not free-provider classification</small>
              </span>
            </label>
            <div className="rule-divider" />
            <label htmlFor="blocked-domains">Blocked domains</label>
            <textarea
              id="blocked-domains"
              rows={2}
              value={s.blockedDomains}
              onChange={(e) => update('blockedDomains', e.target.value)}
              placeholder="spam.example"
            />
            <label htmlFor="allowed-domains">Allowed domains</label>
            <textarea
              id="allowed-domains"
              rows={2}
              value={s.allowedDomains}
              onChange={(e) => update('allowedDomains', e.target.value)}
              placeholder="company.example"
            />
            <p className="hint">Separate entries with commas or new lines.</p>
            <label className="check">
              <input
                type="checkbox"
                checked={s.strict}
                onChange={(e) => update('strict', e.target.checked)}
              />
              <span>Only accept allowlisted addresses</span>
            </label>
            <details className="mailbox-rules">
              <summary>Rules for individual addresses</summary>
              <p className="hint">One address per line, including any quoted local part.</p>
              <label htmlFor="blocked-emails">Blocked email addresses</label>
              <textarea
                id="blocked-emails"
                rows={2}
                value={s.blockedEmails}
                onChange={(e) => update('blockedEmails', e.target.value)}
                placeholder="abuse@example.com"
              />
              <label htmlFor="allowed-emails">Allowlisted email addresses</label>
              <textarea
                id="allowed-emails"
                rows={2}
                value={s.allowedEmails}
                onChange={(e) => update('allowedEmails', e.target.value)}
                placeholder="trusted@mailinator.com"
              />
            </details>
            <div className="rule-divider" />
            <label htmlFor="role-action">Role addresses</label>
            <select
              id="role-action"
              value={s.roles}
              onChange={(e) => update('roles', e.target.value as Action)}
            >
              <option value="off">Off</option>
              <option value="allow">Classify only</option>
              <option value="warn">Warn</option>
              <option value="block">Block</option>
            </select>
            <p className="hint">Shared names such as support, sales and admin.</p>
            <label htmlFor="free-action">Free providers</label>
            <select
              id="free-action"
              value={s.free}
              onChange={(e) => update('free', e.target.value as Action)}
            >
              <option value="off">Off</option>
              <option value="allow">Classify only</option>
              <option value="warn">Warn</option>
              <option value="block">Block</option>
            </select>
            <p className="hint">
              A curated list of common providers. Other domains are unclassified, not necessarily
              business addresses.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={s.plusWarning}
                onChange={(e) => update('plusWarning', e.target.checked)}
              />
              <span>
                Warn about plus tags<small>An example application-specific callback</small>
              </span>
            </label>
          </section>
          <div className="output-panel">
            <section aria-labelledby="result-title">
              <h2 id="result-title">The decision</h2>
              <div
                className={`decision ${result?.valid ? 'accepted' : result ? 'rejected' : 'neutral'}`}
                role="status"
              >
                <span className="status-dot" />
                <strong>{status}</strong>
                <span>
                  {result?.reasons[0]?.replaceAll('_', ' ') ??
                    (result ? 'Passed your current policy' : 'Waiting for an address')}
                </span>
              </div>
              {state.error && (
                <p className="error-text" role="alert">
                  {state.error}. Update the rule above to continue.
                </p>
              )}
              {result && (
                <>
                  <dl className="facts">
                    <div>
                      <dt>Normalized email</dt>
                      <dd>{result.email ?? 'Invalid format'}</dd>
                    </div>
                    <div>
                      <dt>Disposable domain</dt>
                      <dd>
                        {result.disposable === null
                          ? 'Unknown'
                          : result.disposable
                            ? 'Detected'
                            : 'Not in list'}
                      </dd>
                    </div>
                    <div>
                      <dt>Role address</dt>
                      <dd>
                        {result.roleAccount == null
                          ? 'Not classified'
                          : result.roleAccount
                            ? 'Detected'
                            : 'Not in list'}
                      </dd>
                    </div>
                    <div>
                      <dt>Free provider</dt>
                      <dd>
                        {result.freeProvider == null
                          ? 'Not classified'
                          : result.freeProvider
                            ? 'Detected'
                            : 'Not in list'}
                      </dd>
                    </div>
                    {result.matchedRule && (
                      <div>
                        <dt>Matched rule</dt>
                        <dd>
                          <code>
                            {'value' in result.matchedRule
                              ? result.matchedRule.value
                              : result.matchedRule.id}
                          </code>{' '}
                          · {result.matchedRule.source}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {result.suggestion && (
                    <div className="suggestion">
                      <p>
                        Did you mean <strong>{result.suggestion}</strong>?
                      </p>
                      <button
                        onClick={() => {
                          setEmail(result.suggestion!);
                          setCopied('');
                        }}
                      >
                        Use {result.suggestion}
                      </button>
                    </div>
                  )}
                  {!!result.warnings?.length && (
                    <div className="warnings">
                      <h3>Warnings</h3>
                      <ul>
                        {result.warnings.map((warning, i) => (
                          <li key={i}>{warning.message ?? warning.code}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <details className="result-details">
                    <summary>Inspect result JSON</summary>
                    <pre className="result-json">{JSON.stringify(result, null, 2)}</pre>
                  </details>
                </>
              )}
            </section>
            <section className="code-section" aria-labelledby="code-title">
              <div className="section-heading">
                <h2 id="code-title">Take it to your app</h2>
                <button onClick={copy} disabled={!!state.error}>
                  Copy code
                </button>
              </div>
              <div className="code-switch">
                <button
                  aria-pressed={mode === 'javascript'}
                  onClick={() => {
                    setMode('javascript');
                    setCopied('');
                  }}
                >
                  JavaScript
                </button>
                <button
                  aria-pressed={mode === 'react'}
                  onClick={() => {
                    setMode('react');
                    setCopied('');
                  }}
                >
                  Zod + React
                </button>
              </div>
              <p className="copy-status" role="status">
                {copied}
              </p>
              <pre className="code-example">
                <code>{code}</code>
              </pre>
              <p className="hint">
                {mode === 'react'
                  ? 'Also install zod, react-hook-form and @hookform/resolvers.'
                  : 'Works with JavaScript and TypeScript. Create once and reuse.'}
              </p>
            </section>
            <section className="form-section" aria-labelledby="form-title">
              <h2 id="form-title">Try the form integration</h2>
              {state.validator ? (
                <SignupDemo validator={state.validator} />
              ) : (
                <p>Fix the rule settings to try the form.</p>
              )}
            </section>
          </div>
        </div>
        <section className="more">
          <div>
            <h2>One policy, wherever you need it.</h2>
            <p>
              Use the same rules in a browser, on your Node.js server, or to review a CSV. Enforce
              signup rules on the server too.
            </p>
          </div>
          <pre>
            <code>npx mailrules --input contacts.csv --output report.csv --status rejected</code>
          </pre>
          <a href="https://github.com/RivierGrullon/mailrules/blob/main/docs/integrations.md">
            Read the integration guide
          </a>
        </section>
      </main>
      <footer>
        <span>mailrules · Email syntax and application policy</span>
        <a href="https://github.com/RivierGrullon/mailrules/issues">Feedback &amp; issues</a>
        <span>No mailbox ownership verification.</span>
      </footer>
    </>
  );
}
