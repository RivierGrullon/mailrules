import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmailValidator } from '../src/core.js';

describe('email syntax and normalization', () => {
  it('normalizes domain case and outer spaces while preserving local case and tags', () => {
    assert.deepEqual(createEmailValidator().check(' Alice+News@EXAMPLE.COM '), {
      valid: true, email: 'Alice+News@example.com', domain: 'example.com',
      disposable: false, reasons: [],
    });
  });

  it('normalizes international domains to ASCII', () => {
    assert.equal(createEmailValidator().check('User@bücher.de').email, 'User@xn--bcher-kva.de');
  });

  it('supports quoted ASCII local parts including an at-sign', () => {
    assert.equal(createEmailValidator().check('"a@b"@example.com').valid, true);
  });

  for (const input of [undefined, null, 0, true, {}, [], Symbol('email'),
    '', '  ', 'not-an-email', '@example.com', 'user@', 'user@@example.com',
    'user@example', 'user@localhost', 'user@127.0.0.1', 'user@[127.0.0.1]',
    'user@0x7f000001', 'user@example.com.', 'user@-bad.com', 'user@bad-.com',
    'user@a..com', 'user@a_b.com', '.user@example.com', 'user..name@example.com',
    'user.@example.com', 'first last@example.com', 'Name <user@example.com>',
    '用户@example.com', 'user@example.com/path', 'user@example.com?x',
    'user@example.com#x', 'user@example.com:80', 'user@example.com\\evil.com',
    'user@%65xample.com', 'user@ exam ple.com', 'user@example.com\n',
    '\ruser@example.com', 'us\0er@example.com', 'user@exa\tmple.com',
    'user@exa\u007fmple.com', 'a'.repeat(65) + '@example.com',
    'user@' + 'a'.repeat(64) + '.com', 'a'.repeat(10000) + '@example.com']) {
    it(`rejects invalid input ${String(input).slice(0, 70)}`, () => {
      assert.deepEqual(createEmailValidator().check(input), {
        valid: false, email: null, domain: null, disposable: null, reasons: ['invalid_format'],
      });
    });
  }

  it('accepts a 64-character local part', () => {
    assert.equal(createEmailValidator().check('a'.repeat(64) + '@example.com').valid, true);
  });

  it('enforces the full address length boundary', () => {
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    const validator = createEmailValidator();
    assert.equal(validator.check(`${'a'.repeat(64)}@${domain}`).valid, true); // 254
    assert.equal(validator.check(`${'a'.repeat(64)}@${domain}d`).valid, false); // 255
  });
});

describe('disposable policy', () => {
  it('blocks a configured disposable provider and reports the classification', () => {
    assert.deepEqual(createEmailValidator({ disposableDomains: ['burner.example'] })
      .check('user@burner.example'), {
      valid: false, email: 'user@burner.example', domain: 'burner.example',
      disposable: true, reasons: ['disposable'],
    });
  });

  it('allows disposable mail when requested without changing its classification', () => {
    const result = createEmailValidator({
      disposableDomains: ['burner.example'], allowDisposable: true,
    }).check('user@burner.example');
    assert.equal(result.valid, true);
    assert.equal(result.disposable, true);
  });

  it('matches parent domains but not suffix lookalikes', () => {
    const validator = createEmailValidator({ disposableDomains: ['burner.example'] });
    assert.equal(validator.check('user@deep.sub.burner.example').disposable, true);
    assert.equal(validator.check('user@notburner.example').disposable, false);
    assert.equal(validator.check('user@burner.example.evil.com').disposable, false);
  });

  it('supports exact-only domain matching', () => {
    const validator = createEmailValidator({
      disposableDomains: ['burner.example'], includeSubdomains: false,
    });
    assert.equal(validator.check('user@sub.burner.example').valid, true);
    assert.equal(validator.check('user@burner.example').valid, false);
  });
});

describe('blocklists and allowlists', () => {
  it('blocks domains including descendants, without matching unrelated suffixes', () => {
    const validator = createEmailValidator({ blocklist: { domains: [' EXAMPLE.COM '] } });
    assert.deepEqual(validator.check('user@sub.example.com').reasons, ['blocked']);
    assert.equal(validator.check('user@notexample.com').valid, true);
  });

  it('blocks an exact email without blocking other users or rewriting case/tags', () => {
    const validator = createEmailValidator({ blocklist: { emails: [' Abuser@EXAMPLE.COM '] } });
    assert.deepEqual(validator.check('Abuser@example.com').reasons, ['blocked']);
    for (const email of ['other@example.com', 'abuser@example.com',
      'Abuser+tag@example.com', 'Abuser@sub.example.com']) {
      assert.equal(validator.check(email).valid, true);
    }
  });

  it('matches Unicode policy domains against equivalent punycode input', () => {
    const validator = createEmailValidator({ blocklist: { domains: ['BÜCHER.de'] } });
    assert.deepEqual(validator.check('user@xn--bcher-kva.de').reasons, ['blocked']);
  });

  it('uses allowlisted domains as disposable exceptions', () => {
    const validator = createEmailValidator({
      disposableDomains: ['burner.example'], allowlist: { domains: ['burner.example'] },
    });
    const result = validator.check('user@sub.burner.example');
    assert.equal(result.valid, true);
    assert.equal(result.disposable, true);
    assert.equal(validator.check('user@other.example').valid, true);
  });

  it('limits an email exception to the exact mailbox', () => {
    const validator = createEmailValidator({
      disposableDomains: ['burner.example'],
      allowlist: { emails: ['trusted@burner.example'] },
    });
    assert.equal(validator.check('trusted@burner.example').valid, true);
    assert.deepEqual(validator.check('other@burner.example').reasons, ['disposable']);
  });

  it('always gives an explicit block priority over allow and allowDisposable', () => {
    const validator = createEmailValidator({
      disposableDomains: ['burner.example'], allowDisposable: true,
      allowlist: { emails: ['user@burner.example'] },
      blocklist: { domains: ['burner.example'] },
    });
    assert.deepEqual(validator.check('user@burner.example').reasons, ['blocked']);
  });

  it('gives an exact email block priority over an allowed domain', () => {
    const validator = createEmailValidator({
      allowlist: { domains: ['example.com'] }, blocklist: { emails: ['abuse@example.com'] },
    });
    assert.deepEqual(validator.check('abuse@example.com').reasons, ['blocked']);
  });

  it('requires an allowlist match in only mode even when disposable mail is enabled', () => {
    const validator = createEmailValidator({ allowlistMode: 'only', allowDisposable: true,
      allowlist: { domains: ['company.example'], emails: ['guest@other.example'] } });
    assert.equal(validator.check('user@sub.company.example').valid, true);
    assert.equal(validator.check('guest@other.example').valid, true);
    assert.deepEqual(validator.check('user@other.example').reasons, ['not_allowed']);
  });

  it('rejects everyone with an empty strict allowlist', () => {
    assert.deepEqual(createEmailValidator({ allowlistMode: 'only' })
      .check('user@example.com').reasons, ['not_allowed']);
  });

  it('checks syntax before applying an allowed domain', () => {
    assert.deepEqual(createEmailValidator({ allowlist: { domains: ['example.com'] } })
      .check('bad..local@example.com').reasons, ['invalid_format']);
  });

  it('applies exact-only matching consistently to block and allow domain rules', () => {
    const blocked = createEmailValidator({ includeSubdomains: false,
      blocklist: { domains: ['example.com'] } });
    assert.equal(blocked.check('user@sub.example.com').valid, true);
    const allowed = createEmailValidator({ includeSubdomains: false, allowlistMode: 'only',
      allowlist: { domains: ['example.com'] } });
    assert.deepEqual(allowed.check('user@sub.example.com').reasons, ['not_allowed']);
  });
});

describe('configuration and isolation', () => {
  it('snapshots arrays and Sets without mutating caller data', () => {
    const domains = [' BURNER.EXAMPLE '];
    const blocked = new Set(['blocked.example']);
    const options = { disposableDomains: domains, blocklist: { domains: blocked } };
    const validator = createEmailValidator(options);
    assert.deepEqual(domains, [' BURNER.EXAMPLE ']);
    domains.length = 0;
    blocked.clear();
    assert.equal(validator.check('user@burner.example').valid, false);
    assert.deepEqual(validator.check('user@blocked.example').reasons, ['blocked']);
    assert.equal(createEmailValidator().check('user@blocked.example').valid, true);
  });

  it('accepts a one-shot iterable without consuming it during each check', () => {
    function* domains() { yield 'burner.example'; }
    const validator = createEmailValidator({ disposableDomains: domains() });
    assert.equal(validator.check('user@burner.example').disposable, true);
    assert.equal(validator.check('user@burner.example').disposable, true);
  });

  for (const options of [null, [], false, { unknown: true }, { allowDisposable: 'false' },
    { includeSubdomains: 0 }, { allowlistMode: 'sometimes' }, { blocklist: null },
    { allowlist: [] }, { blocklist: { domain: ['example.com'] } },
    { disposableDomains: 'example.com' }, { disposableDomains: null },
    { disposableDomains: [42] }, { disposableDomains: ['user@example.com'] },
    { blocklist: { domains: ['*.example.com'] } }, { blocklist: { domains: ['com'] } },
    { blocklist: { domains: ['https://example.com'] } },
    { allowlist: { emails: ['not-an-email'] } }, { allowlist: { emails: 'a@example.com' } },
    { allowlist: { domains: ['example.com\n'] } }, { disposableDomains: [''] }]) {
    it(`rejects malformed configuration ${JSON.stringify(options)}`, () => {
      assert.throws(() => createEmailValidator(options as never), TypeError);
    });
  }
});
