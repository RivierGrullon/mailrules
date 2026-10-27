# Changelog

## 0.3.0

- Optional Zod 4 and Standard Schema v1 adapters with normalized string outputs and field errors. React Hook Form integration guide and live example.
- Opt-in role address and free-provider classification: allow, warn or block, with replaceable vocabularies, explanation matches and optional result fields. New `role_account` and `free_provider` reason codes; exhaustive consumers should add them. Default decisions and result shapes are unchanged.
- CSV command with stdin/file input, JSON configuration, accepted/rejected filtering, spreadsheet-safe exports and explicit exit codes.
- Public playground with editable policies, live explanations, suggestions and copyable JavaScript/React snippets. Frontend dependencies and assets are excluded from the npm package.

## 0.2.1

- Clearer JavaScript and TypeScript email validation description and npm search keywords.
- Practical signup validation tutorial and README answers about disposable emails, allowlists, browser usage and mailbox verification.
- Documentation and package metadata only; runtime behavior is unchanged.

## 0.2.0

- Opt-in domain typo suggestions using a small built-in vocabulary or caller-owned targets. Suggestions preserve the original email and validation decision, and omit ambiguous matches.
- `explain()` reports the decisive normalized rule, subdomain matching, rejection reason and outcomes of custom callbacks.
- Ordered synchronous custom rules with accepted, rejected and warning outcomes; warnings do not invalidate an address. Built-in rejections retain priority.
- New `custom_rule` rejection code, `customError` and optional `warnings`/`suggestion` result fields. Consumers exhaustively handling rejection codes should add the new case when adopting custom rules.
- New public types for explanations, rule matches, suggestions and custom callbacks, exported from both entries. Existing default `check()` result shapes are unchanged.

## 0.1.0

- Synchronous email format validation with typed rejection reasons.
- Domain and mailbox blocklists, allowlist exceptions and allowlist-only mode.
- Disposable detection using fakeout, plus replaceable caller-owned datasets.
- Lightweight `mailrules/core` entry without a disposable dataset import.
- IDN normalization, domain-boundary matching, configurable subdomains and immutable policy snapshots.
- ESM/CommonJS builds, TypeScript declarations, browser-bundler compatibility.
