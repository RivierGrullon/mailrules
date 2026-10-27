import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmailValidator } from '../src/core.js';

describe('matched-rule explanations', () => {
  it('identifies the nearest blocked parent with label boundaries', () => {
    const validator = createEmailValidator({
      blocklist: { domains: ['example.com', 'SUB.example.com'] },
    });
    const result = validator.explain('User@deep.sub.example.com');
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'blocked');
    assert.deepEqual(result.matchedRule, {
      source: 'blocklist',
      type: 'domain',
      value: 'sub.example.com',
      matchedSubdomain: true,
    });
    assert.equal(validator.explain('User@notsub.example.net').matchedRule, null);
    assert.equal(validator.explain('User@example.com.evil.net').matchedRule, null);
  });

  it('prefers an exact mailbox over domain matches and preserves mailbox case', () => {
    const validator = createEmailValidator({
      blocklist: { domains: ['example.com'], emails: [' User@EXAMPLE.COM '] },
      allowlist: { emails: ['User@example.com'] },
    });
    assert.deepEqual(validator.explain('User@example.com').matchedRule, {
      source: 'blocklist',
      type: 'email',
      value: 'User@example.com',
      matchedSubdomain: false,
    });
    assert.deepEqual(validator.explain('user@example.com').matchedRule, {
      source: 'blocklist',
      type: 'domain',
      value: 'example.com',
      matchedSubdomain: false,
    });
  });

  it('reports normalized IDN rules', () => {
    const result = createEmailValidator({ blocklist: { domains: ['BÜCHER.de'] } }).explain(
      'User@sub.bücher.de',
    );
    assert.deepEqual(result.matchedRule, {
      source: 'blocklist',
      type: 'domain',
      value: 'xn--bcher-kva.de',
      matchedSubdomain: true,
    });
  });

  it('explains disposable rejection and allowlist exceptions', () => {
    const validator = createEmailValidator({
      disposableDomains: ['burner.example'],
      allowlist: { emails: ['trusted@burner.example'] },
    });
    assert.deepEqual(validator.explain('user@sub.burner.example').matchedRule, {
      source: 'disposableDomains',
      type: 'domain',
      value: 'burner.example',
      matchedSubdomain: true,
    });
    const allowed = validator.explain('trusted@burner.example');
    assert.equal(allowed.valid, true);
    assert.equal(allowed.reason, null);
    assert.equal(allowed.disposable, true);
    assert.deepEqual(allowed.matchedRule, {
      source: 'allowlist',
      type: 'email',
      value: 'trusted@burner.example',
      matchedSubdomain: false,
    });
  });

  it('reports strict allowlist domain matches and no match for absent rules', () => {
    const validator = createEmailValidator({
      allowlistMode: 'only',
      allowlist: { domains: ['company.example'] },
    });
    assert.deepEqual(validator.explain('user@eu.company.example').matchedRule, {
      source: 'allowlist',
      type: 'domain',
      value: 'company.example',
      matchedSubdomain: true,
    });
    assert.equal(validator.explain('user@example.com').reason, 'not_allowed');
    assert.equal(validator.explain('user@example.com').matchedRule, null);
    assert.equal(validator.explain(null).reason, 'invalid_format');
    assert.equal(validator.explain(null).matchedRule, null);
    assert.equal(createEmailValidator().explain('user@example.com').matchedRule, null);
  });

  it('uses exact-only matching and does not invent a decisive rule for blanket permission', () => {
    const validator = createEmailValidator({
      disposableDomains: ['burner.example'],
      blocklist: { domains: ['example.com'] },
      includeSubdomains: false,
      allowDisposable: true,
    });
    assert.equal(validator.explain('user@sub.example.com').matchedRule, null);
    const result = validator.explain('user@burner.example');
    assert.equal(result.valid, true);
    assert.equal(result.disposable, true);
    assert.equal(result.matchedRule, null);
  });

  it('keeps check results and precedence consistent without adding diagnostic fields to check', () => {
    const validator = createEmailValidator({
      disposableDomains: ['burner.example'],
      blocklist: { domains: ['blocked.example'] },
      allowlist: { domains: ['trusted.example'] },
      allowlistMode: 'only',
    });
    for (const input of [
      null,
      'user@blocked.example',
      'user@burner.example',
      'user@trusted.example',
    ]) {
      const { reason, matchedRule, customRules, ...result } = validator.explain(input);
      assert.deepEqual(result, validator.check(input));
      assert.equal(reason, result.reasons[0] ?? null);
      assert.deepEqual(customRules, []);
      assert.equal('matchedRule' in validator.check(input), false);
    }
  });
});
