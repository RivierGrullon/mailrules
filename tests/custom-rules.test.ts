import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmailValidator } from '../src/core.js';
import type { EmailCustomRule, EmailCustomRuleResult, EmailValidatorOptions } from '../src/core.js';

describe('custom policy rules', () => {
  it('keeps captured callback receivers from rewriting the rule snapshot', () => {
    let receiver: unknown;
    const definition: EmailCustomRule = {
      id: 'original',
      check() {
        receiver = this;
        return { status: 'rejected', code: 'policy_rejection' };
      },
    };
    const validator = createEmailValidator({ customRules: [definition] });
    assert.equal(validator.check('user@example.com').valid, false);
    assert.notEqual(receiver, definition);
    // Reflect.set avoids relying on strict/sloppy-mode assignment exceptions.
    Reflect.set(receiver as object, 'id', 'changed');
    Reflect.set(receiver as object, 'check', () => ({ status: 'accepted' }));
    const result = validator.explain('user@example.com');
    assert.equal(result.valid, false);
    assert.deepEqual(result.customError, { ruleId: 'original', code: 'policy_rejection' });
    assert.deepEqual(result.matchedRule, { source: 'customRules', type: 'custom', id: 'original' });
  });

  it('rejects using caller-defined logic with a stable code and explanation', () => {
    const validator = createEmailValidator({
      customRules: [
        {
          id: 'role-mailbox',
          check: ({ email }) =>
            email.startsWith('support@')
              ? { status: 'rejected', code: 'role_address', message: 'Use a personal mailbox' }
              : { status: 'accepted' },
        },
      ],
    });
    const result = validator.explain('support@example.com');
    assert.equal(result.valid, false);
    assert.deepEqual(result.reasons, ['custom_rule']);
    assert.deepEqual(result.customError, {
      ruleId: 'role-mailbox',
      code: 'role_address',
      message: 'Use a personal mailbox',
    });
    assert.deepEqual(result.matchedRule, {
      source: 'customRules',
      type: 'custom',
      id: 'role-mailbox',
    });
    assert.deepEqual(result.customRules, [
      {
        id: 'role-mailbox',
        status: 'rejected',
        code: 'role_address',
        message: 'Use a personal mailbox',
      },
    ]);
    assert.equal(validator.check('person@example.com').valid, true);
    assert.equal(validator.check('person@example.com').customError, undefined);
  });

  it('acceptance continues to later rules, warnings remain valid, rejection stops evaluation', () => {
    const calls: string[] = [];
    const validator = createEmailValidator({
      customRules: [
        {
          id: 'pass',
          check: () => {
            calls.push('pass');
            return { status: 'accepted' };
          },
        },
        {
          id: 'notice',
          check: () => {
            calls.push('notice');
            return { status: 'warning', code: 'review' };
          },
        },
        {
          id: 'reject',
          check: () => {
            calls.push('reject');
            return { status: 'rejected', code: 'no_access' };
          },
        },
        {
          id: 'unreachable',
          check: () => {
            throw new Error('must not execute');
          },
        },
      ],
    });
    const result = validator.explain('user@example.com');
    assert.deepEqual(calls, ['pass', 'notice', 'reject']);
    assert.equal(result.valid, false);
    assert.deepEqual(result.warnings, [{ ruleId: 'notice', code: 'review' }]);
    assert.deepEqual(result.customRules, [
      { id: 'pass', status: 'accepted' },
      { id: 'notice', status: 'warning', code: 'review' },
      { id: 'reject', status: 'rejected', code: 'no_access' },
    ]);
  });

  it('collects multiple warnings in order without rejecting or leaking them into later calls', () => {
    const validator = createEmailValidator({
      customRules: [
        {
          id: 'first',
          check: ({ email }) =>
            email.startsWith('review@')
              ? { status: 'warning', code: 'review', message: 'Review this address' }
              : { status: 'accepted' },
        },
        { id: 'second', check: () => ({ status: 'warning', code: 'notice' }) },
      ],
    });
    const result = validator.check('review@example.com');
    assert.equal(result.valid, true);
    assert.deepEqual(result.reasons, []);
    assert.deepEqual(result.warnings, [
      { ruleId: 'first', code: 'review', message: 'Review this address' },
      { ruleId: 'second', code: 'notice' },
    ]);
    assert.deepEqual(validator.check('other@example.com').warnings, [
      { ruleId: 'second', code: 'notice' },
    ]);
  });

  it('does not execute custom callbacks after any built-in rejection', () => {
    const validator = createEmailValidator({
      disposableDomains: ['burner.example'],
      blocklist: { domains: ['blocked.example'] },
      customRules: [
        {
          id: 'cannot-override',
          check: () => {
            throw new Error('must not run');
          },
        },
      ],
    });
    assert.equal(validator.check(null).reasons[0], 'invalid_format');
    assert.equal(validator.check('user@blocked.example').reasons[0], 'blocked');
    assert.equal(validator.check('user@burner.example').reasons[0], 'disposable');
    const only = createEmailValidator({
      allowlistMode: 'only',
      customRules: [
        {
          id: 'cannot-override',
          check: () => {
            throw new Error('must not run');
          },
        },
      ],
    });
    assert.equal(only.explain('user@example.com').reason, 'not_allowed');
    assert.deepEqual(validator.explain('user@blocked.example').customRules, []);
  });

  it('runs custom rules on allowlisted disposable mail and passes a frozen normalized context', () => {
    const validator = createEmailValidator({
      disposableDomains: ['bücher.de'],
      allowlist: { domains: ['bücher.de'] },
      customRules: [
        {
          id: 'inspect',
          check: (context) => {
            assert.deepEqual(context, {
              email: 'User+Tag@xn--bcher-kva.de',
              domain: 'xn--bcher-kva.de',
              disposable: true,
            });
            assert.throws(() => {
              (context as { domain: string }).domain = 'other.example';
            }, TypeError);
            return { status: 'rejected', code: 'review_required' };
          },
        },
      ],
    });
    const result = validator.check(' User+Tag@BÜCHER.de ');
    assert.equal(result.domain, 'xn--bcher-kva.de');
    assert.equal(result.valid, false);
    assert.equal(result.customError?.code, 'review_required');
  });

  it('snapshots one-shot rule iterables and rule definitions at construction', () => {
    const rule: { id: string; check: EmailCustomRule['check'] } = {
      id: 'original',
      check: () => ({ status: 'rejected', code: 'original_code' }),
    };
    function* rules() {
      yield rule;
    }
    const validator = createEmailValidator({ customRules: rules() });
    rule.id = 'changed';
    rule.check = () => ({ status: 'accepted' });
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(validator.check('user@example.com').customError, {
        ruleId: 'original',
        code: 'original_code',
      });
    }
  });

  it('copies callback outcomes instead of retaining mutable caller objects', () => {
    const returned: { status: 'warning'; code: string; message: string } = {
      status: 'warning',
      code: 'original',
      message: 'Original message',
    };
    const validator = createEmailValidator({
      customRules: [{ id: 'mutable', check: () => returned }],
    });
    const result = validator.explain('user@example.com');
    returned.code = 'changed';
    returned.message = 'Changed';
    assert.deepEqual(result.warnings, [
      { ruleId: 'mutable', code: 'original', message: 'Original message' },
    ]);
    assert.deepEqual(result.customRules, [
      { id: 'mutable', status: 'warning', code: 'original', message: 'Original message' },
    ]);
  });

  it('propagates callback exceptions rather than accepting on failure', () => {
    const error = new Error('policy unavailable');
    const validator = createEmailValidator({
      customRules: [
        {
          id: 'throws',
          check: () => {
            throw error;
          },
        },
      ],
    });
    assert.throws(() => validator.check('user@example.com'), error);
  });

  for (const value of [
    null,
    false,
    'rules',
    {},
    [null],
    [{}],
    [{ id: '', check() {} }],
    [{ id: '  ', check() {} }],
    [{ id: 'missing' }],
    [{ id: 'bad', check: true }],
    [{ id: 'extra', check() {}, typo: true }],
    [
      { id: 'same', check() {} },
      { id: 'same', check() {} },
    ],
  ]) {
    it(`rejects invalid custom rule configuration ${JSON.stringify(value)}`, () => {
      assert.throws(
        () => createEmailValidator({ customRules: value } as unknown as EmailValidatorOptions),
        TypeError,
      );
    });
  }

  for (const returned of [
    undefined,
    null,
    true,
    'accepted',
    {},
    [],
    { status: 'invalid' },
    { status: 'warning' },
    { status: 'rejected', code: '' },
    { status: 'warning', code: ' ' },
    { status: 'rejected', code: 42 },
    { status: 'warning', code: 'notice', message: 42 },
    { status: 'accepted', typo: true },
    { status: 'accepted', code: 'ignored' },
  ]) {
    it(`rejects malformed custom results ${JSON.stringify(returned)}`, () => {
      const validator = createEmailValidator({
        customRules: [
          {
            id: 'bad-result',
            check: () => returned as EmailCustomRuleResult,
          },
        ],
      });
      assert.throws(() => validator.check('user@example.com'), TypeError);
    });
  }

  it('rejects promise results and consumes rejections to avoid unhandled failures', async () => {
    const validator = createEmailValidator({
      customRules: [
        {
          id: 'async-result',
          check: (() =>
            Promise.reject(
              new Error('async policy failed'),
            )) as unknown as EmailCustomRule['check'],
        },
      ],
    });
    assert.throws(() => validator.check('user@example.com'), /synchronous/);
    await new Promise((resolve) => setImmediate(resolve));
  });
});
