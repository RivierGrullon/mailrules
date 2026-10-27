import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const artifacts = join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });

function npm(args, cwd) {
  // A parent `npm publish --dry-run` exports npm_config_dry_run. The local
  // pack/install checks must still create their artifacts and temporary consumer.
  // This helper is only used for those two commands; it never publishes anything.
  args = [...args, '--dry-run=false'];
  // npm supplies its actual JS CLI path to scripts, including on Windows.
  const cli = process.env.npm_execpath;
  return cli
    ? execFileSync(process.execPath, [cli, ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const [packed] = JSON.parse(
  npm(['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], root),
);
const paths = new Set(packed.files.map((file) => file.path));
for (const path of [
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'docs/email-validation-javascript.md',
  'docs/releasing.md',
  'dist/esm/index.js',
  'dist/cjs/index.js',
  'dist/esm/core.js',
  'dist/cjs/core.js',
  'dist/esm/index.d.ts',
  'dist/cjs/index.d.ts',
  'dist/esm/core.d.ts',
  'dist/cjs/core.d.ts',
  'dist/cjs/package.json',
]) {
  assert(paths.has(path), `Missing package file: ${path}`);
}
for (const path of paths) {
  assert(
    /^(dist\/|src\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$|CONTRIBUTING\.md$|docs\/(?:releasing|email-validation-javascript)\.md$)/u.test(
      path,
    ),
    `Unexpected package file: ${path}`,
  );
}

const consumer = await mkdtemp(join(tmpdir(), 'mailrules-consumer-'));
try {
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  npm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(artifacts, packed.filename)],
    consumer,
  );

  const behavior = `
    assert.equal(createEmailValidator().check('user@mailinator.com').valid, false);
    assert.equal(createCore().check('user@mailinator.com').valid, true);
    assert.equal(createEmailValidator().check('User+Tag@EXAMPLE.COM').email, 'User+Tag@example.com');
    assert.equal(createEmailValidator({ blocklist: { domains: ['bücher.de'] } })
      .check('user@xn--bcher-kva.de').reasons[0], 'blocked');
    assert.equal(createCore({ allowlistMode: 'only' }).check('user@example.com').reasons[0], 'not_allowed');
    for (const factory of [createEmailValidator, createCore]) {
      const validator = factory({
        suggestions: true,
        disposableDomains: [],
        blocklist: { domains: ['blocked.example'] },
        customRules: [
          { id: 'notice', check: () => ({ status: 'warning', code: 'review' }) },
          { id: 'personal', check: ({ email }) => email.startsWith('support@')
            ? { status: 'rejected', code: 'role_mailbox' } : { status: 'accepted' } },
        ],
      });
      const suggested = validator.check('User@gmial.com');
      assert.equal(suggested.suggestion, 'User@gmail.com');
      assert.equal(suggested.email, 'User@gmial.com');
      assert.equal(suggested.valid, true);
      assert.equal(suggested.warnings[0].code, 'review');
      assert.equal(validator.explain('user@sub.blocked.example').matchedRule.value, 'blocked.example');
      const rejected = validator.explain('support@example.com');
      assert.equal(rejected.reason, 'custom_rule');
      assert.equal(rejected.customError.ruleId, 'personal');
      assert.equal(rejected.customRules[0].status, 'warning');
      assert.equal(rejected.customRules[1].status, 'rejected');
      const disposableTypo = factory({ suggestions: true, disposableDomains: ['gmial.com'] }).check('User@gmial.com');
      assert.equal(disposableTypo.valid, false);
      assert.equal(disposableTypo.reasons[0], 'disposable');
      assert.equal(disposableTypo.suggestion, 'User@gmail.com');
    }
  `;
  const esm = `import assert from 'node:assert/strict';
    import { createEmailValidator } from 'mailrules';
    import { createEmailValidator as createCore } from 'mailrules/core'; ${behavior}`;
  const cjs = `const assert = require('node:assert/strict');
    const { createEmailValidator } = require('mailrules');
    const { createEmailValidator: createCore } = require('mailrules/core'); ${behavior}`;
  for (const [extension, source] of [
    ['mjs', esm],
    ['cjs', cjs],
  ]) {
    const path = join(consumer, `consumer.${extension}`);
    await writeFile(path, source);
    execFileSync(process.execPath, [path], { cwd: consumer, stdio: 'inherit' });
  }

  const typed = `import { createEmailValidator, type EmailValidatorOptions,
    type EmailValidationReason, type EmailValidationResult, type EmailValidator, type EmailRules } from 'mailrules';
    import { createEmailValidator as createCore, type EmailValidatorOptions as CoreOptions } from 'mailrules/core';
    const rules: EmailRules = { domains: new Set(['example.com']) };
    const options = { allowlist: rules, allowlistMode: 'only' } satisfies EmailValidatorOptions;
    const coreOptions: CoreOptions = options;
    const validator: EmailValidator = createEmailValidator(options);
    const result: EmailValidationResult = validator.check('user@example.com');
    if (result.valid) { const normalized: string = result.email; normalized.toUpperCase(); }
    const reasons: readonly EmailValidationReason[] = result.reasons;
    createCore(coreOptions).check(undefined);
    // @ts-expect-error unsupported mode
    createEmailValidator({ allowlistMode: 'anything' });
    // @ts-expect-error domain entries must be strings
    createCore({ blocklist: { domains: [42] } });
    const rule: import('mailrules').EmailCustomRule = {
      id: 'policy', check: (context: import('mailrules').EmailCustomRuleContext): import('mailrules').EmailCustomRuleResult => {
        const domain: string = context.domain;
        // @ts-expect-error rule input is readonly
        context.email = 'overwrite@example.com';
        return domain === 'example.com' ? { status: 'warning', code: 'review' } : { status: 'accepted' };
      },
    };
    const coreRule: import('mailrules/core').EmailCustomRule = rule;
    const suggestionOptions: import('mailrules').EmailSuggestionOptions = { domains: ['company.example'] };
    const coreSuggestions: import('mailrules/core').EmailSuggestionOptions = suggestionOptions;
    const enhanced = createCore({ suggestions: coreSuggestions, customRules: [coreRule] });
    const explained: import('mailrules').EmailValidationExplanation = enhanced.explain('user@example.com');
    const coreExplanation: import('mailrules/core').EmailValidationExplanation = explained;
    const match: import('mailrules').EmailRuleMatch | null = coreExplanation.matchedRule;
    if (match?.type === 'custom') { const id: string = match.id; }
    else if (match) { const listMatch: import('mailrules/core').EmailListMatch = match; const value: string = listMatch.value; }
    const issue: import('mailrules').EmailRuleIssue | undefined = explained.customError;
    const evaluations: readonly import('mailrules/core').EmailCustomRuleEvaluation[] = explained.customRules;
    const suggestion: string | undefined = explained.suggestion;
    const warnings: readonly import('mailrules/core').EmailRuleIssue[] | undefined = explained.warnings;
    if (explained.valid) { const email: string = explained.email; const noError: undefined = explained.customError; }
    // @ts-expect-error custom rules must be synchronous
    createEmailValidator({ customRules: [{ id: 'async', check: async () => ({ status: 'accepted' }) }] });
    // @ts-expect-error rejected custom rules require a code
    createCore({ customRules: [{ id: 'invalid', check: () => ({ status: 'rejected' }) }] });
    // @ts-expect-error unknown rule status
    createCore({ customRules: [{ id: 'invalid', check: () => ({ status: 'approve' }) }] });
    // @ts-expect-error custom suggestion targets must be an iterable of strings
    createEmailValidator({ suggestions: { domains: [42] } });
    // @ts-expect-error a custom suggestion object requires targets
    createEmailValidator({ suggestions: {} });
  `;
  for (const extension of ['mts', 'cts'])
    await writeFile(join(consumer, `types.${extension}`), typed);
  const tsc = require.resolve('typescript/bin/tsc');
  const baseFlags = [
    '--strict',
    '--noEmit',
    '--target',
    'ES2022',
    '--types',
    // Prevent ambient workspace types from masking missing published declarations.
    './empty-types',
  ];
  await writeFile(join(consumer, 'empty-types.d.ts'), 'export {};\n');
  execFileSync(
    process.execPath,
    [
      tsc,
      ...baseFlags,
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'types.mts',
      'types.cts',
    ],
    { cwd: consumer, stdio: 'inherit' },
  );
  execFileSync(
    process.execPath,
    [tsc, ...baseFlags, '--module', 'ESNext', '--moduleResolution', 'Bundler', 'types.mts'],
    { cwd: consumer, stdio: 'inherit' },
  );

  for (const entry of ['mailrules', 'mailrules/core']) {
    const built = await build({
      stdin: {
        contents: `export { createEmailValidator } from '${entry}';`,
        resolveDir: consumer,
        sourcefile: 'browser-consumer.js',
      },
      bundle: true,
      platform: 'browser',
      format: 'iife',
      globalName: 'Mailrules',
      write: false,
      metafile: true,
    });
    const context = vm.createContext({ URL });
    vm.runInContext(built.outputFiles[0].text, context);
    const validator = context.Mailrules.createEmailValidator();
    assert.equal(validator.check('user@mailinator.com').valid, entry === 'mailrules/core');
    assert.equal(validator.check('user@bücher.de').domain, 'xn--bcher-kva.de');
    const enhanced = context.Mailrules.createEmailValidator({
      suggestions: true,
      blocklist: { domains: ['blocked.example'] },
      customRules: [{ id: 'browser-policy', check: () => ({ status: 'warning', code: 'notice' }) }],
    });
    assert.equal(enhanced.check('User@gmial.com').suggestion, 'User@gmail.com');
    assert.equal(enhanced.check('User@gmial.com').email, 'User@gmial.com');
    assert.equal(enhanced.check('user@example.com').warnings[0].ruleId, 'browser-policy');
    assert.equal(enhanced.explain('user@sub.blocked.example').matchedRule.matchedSubdomain, true);
    assert.equal(enhanced.explain('user@example.com').customRules[0].status, 'warning');
    if (entry === 'mailrules/core') {
      assert(
        !Object.keys(built.metafile.inputs).some((path) => path.includes('/fakeout/')),
        'Core browser bundle must not load fakeout',
      );
    }
    console.log(
      `Browser bundle ${entry}: ${built.outputFiles[0].contents.length} bytes (unminified).`,
    );
  }

  console.log(
    `Verified ${manifest.name}@${manifest.version}: installed tarball, ESM/CJS, NodeNext/Bundler types, browser execution.`,
  );
  console.log(`Artifact: ${join(artifacts, packed.filename)} (${packed.size} bytes packed)`);
} finally {
  await rm(consumer, { recursive: true, force: true });
}
