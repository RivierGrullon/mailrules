import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmailValidator } from '../src/core.js';
import { createEmailValidator as createDefault } from '../src/index.js';
import type { EmailValidatorOptions } from '../src/types.js';

describe('optional role and free-provider classifications', () => {
  it('leaves default results unchanged', () => {
    assert.deepEqual(createEmailValidator().check('support@gmail.com'), {
      valid: true,
      email: 'support@gmail.com',
      domain: 'gmail.com',
      disposable: false,
      reasons: [],
    });
  });
  it('detects roles case-insensitively, including tags and quoted local parts', () => {
    const v = createEmailValidator({ roleAccounts: 'allow' });
    for (const email of ['support@example.com', 'SALES+news@example.com', '"admin"@example.com'])
      assert.equal(v.check(email).roleAccount, true, email);
    for (const email of ['supporting@example.com', 'jane.support@example.com', 'jane@example.com'])
      assert.equal(v.check(email).roleAccount, false, email);
    assert.equal(v.check('bad').roleAccount, null);
  });
  it('warns without rejection and blocks with an explained name', () => {
    const warn = createEmailValidator({ roleAccounts: 'warn' }).check('Support+tag@example.com');
    assert.equal(warn.valid, true);
    assert.equal(warn.warnings?.[0]?.code, 'role_account');
    const blocked = createEmailValidator({ roleAccounts: 'block' }).explain(
      'Support+tag@example.com',
    );
    assert.deepEqual(blocked.reasons, ['role_account']);
    assert.deepEqual(blocked.matchedRule, {
      source: 'roleAccounts',
      type: 'localPart',
      value: 'support',
      matchedSubdomain: false,
    });
  });
  it('classifies only exact known free domains and does not label other domains corporate', () => {
    const v = createEmailValidator({ freeProviders: 'allow' });
    for (const email of ['x@gmail.com', 'x@OUTLOOK.COM', 'x@yahoo.com'])
      assert.equal(v.check(email).freeProvider, true);
    for (const email of [
      'x@company.example',
      'x@sub.gmail.com',
      'x@notgmail.com',
      'x@gmail.com.evil.test',
    ])
      assert.equal(v.check(email).freeProvider, false);
    assert.equal(v.check(null).freeProvider, null);
    assert.equal('corporate' in v.check('x@company.example'), false);
  });
  it('supports free-provider warnings and rejections', () => {
    assert.equal(
      createDefault({ freeProviders: 'warn' }).check('x@gmail.com').warnings?.[0]?.code,
      'free_provider',
    );
    const r = createDefault({ freeProviders: 'block' }).explain('x@gmail.com');
    assert.deepEqual(r.reasons, ['free_provider']);
    assert.deepEqual(r.matchedRule, {
      source: 'freeProviders',
      type: 'domain',
      value: 'gmail.com',
      matchedSubdomain: false,
    });
  });
  it('replaces, normalizes and snapshots caller-owned data', () => {
    const names = [' BILLING '];
    const domains = [' BÜCHER.de '];
    const v = createEmailValidator({
      roleAccounts: { action: 'block', names },
      freeProviders: { action: 'warn', domains },
    });
    names.push('support');
    domains.push('gmail.com');
    assert.equal(v.check('support@gmail.com').valid, true);
    assert.equal(v.check('support@gmail.com').roleAccount, false);
    assert.equal(v.check('support@gmail.com').freeProvider, false);
    assert.deepEqual(v.check('billing@example.com').reasons, ['role_account']);
    assert.equal(v.check('x@xn--bcher-kva.de').freeProvider, true);
    assert.equal(
      createEmailValidator({ roleAccounts: { action: 'block', names: [] } }).check(
        'support@example.com',
      ).valid,
      true,
    );
  });
  it('preserves built-in priority and enforces classifications even for allowlisted addresses', () => {
    const v = createEmailValidator({
      roleAccounts: 'block',
      freeProviders: 'block',
      disposableDomains: ['gmail.com'],
      blocklist: { emails: ['support@gmail.com'] },
    });
    assert.deepEqual(v.check('support@gmail.com').reasons, ['blocked']);
    assert.deepEqual(v.check('sales@gmail.com').reasons, ['disposable']);
    const allowed = createEmailValidator({
      roleAccounts: 'block',
      freeProviders: 'block',
      allowlist: { domains: ['gmail.com'] },
    });
    assert.deepEqual(allowed.check('sales@gmail.com').reasons, ['role_account']);
    assert.deepEqual(allowed.check('jane@gmail.com').reasons, ['free_provider']);
  });
  it('combines classification warnings with custom warnings and stops on rejection', () => {
    let calls = 0;
    const customRules = [
      {
        id: 'note',
        check: () => {
          calls++;
          return { status: 'warning' as const, code: 'custom_note' };
        },
      },
    ];
    const v = createEmailValidator({ roleAccounts: 'warn', freeProviders: 'warn', customRules });
    assert.deepEqual(
      v.check('support@gmail.com').warnings?.map((x) => x.code),
      ['role_account', 'free_provider', 'custom_note'],
    );
    assert.equal(calls, 1);
    const blocked = createEmailValidator({
      roleAccounts: 'warn',
      freeProviders: 'block',
      customRules,
    }).check('support@gmail.com');
    assert.equal(blocked.warnings?.[0]?.code, 'role_account');
    assert.equal(calls, 1);
  });
  for (const options of [
    { roleAccounts: true },
    { roleAccounts: 'reject' },
    { roleAccounts: {} },
    { roleAccounts: { action: 'warn', names: 'support' } },
    { roleAccounts: { action: 'warn', names: ['support+tag'] } },
    { roleAccounts: { action: 'warn', names: [''] } },
    { freeProviders: { action: 'warn', domains: ['not a domain'] } },
    { freeProviders: { action: 'block', typo: [] } },
    { freeProviders: null },
  ])
    it(`rejects invalid classification options ${JSON.stringify(options)}`, () => {
      assert.throws(
        () => createEmailValidator(options as unknown as EmailValidatorOptions),
        TypeError,
      );
    });
});
