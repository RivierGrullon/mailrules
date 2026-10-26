# Contributing

Use Node.js 22.12 or newer and npm. Clone the repository and run:

```sh
npm ci
npm run check
```

## Commands

- `npm test`: behavior tests using Node's test runner and tsx.
- `npm run typecheck`: strict source and test type checks.
- `npm run build`: ESM/CommonJS JavaScript, declarations and source maps in `dist/`.
- `npm run format`: format source, tests, scripts, package documentation and workflows.
- `npm run format:check`: check formatting without changing files.
- `npm run test:package`: build, pack, install in a temporary consumer, and exercise
  runtime, type resolution and browser bundles. Requires registry access to install
  the tarball's dependencies. Writes the verified tarball to `artifacts/`.
- `npm run check`: all of the above checks, without modifying formatting.

Test observable behavior with literal fixtures. Include a regression test for bug
fixes, especially normalization, precedence and export compatibility. Changes to
defaults, matching semantics or rejection codes must be documented in the changelog.

Keep runtime code free of Node-specific APIs so the same implementation can be
bundled for browsers. The root entry alone supplies the default dataset; changes
must not import fakeout through the core entry. Construct policy indexes once and
reuse them when validating addresses.

Disposable-provider additions and removals belong in the upstream
[disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)
project. Application-specific rules belong in the consumer's allowlist/blocklist.

See [releasing](docs/releasing.md) for publishing instructions.
