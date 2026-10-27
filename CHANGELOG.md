# Changelog

## Unreleased

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
