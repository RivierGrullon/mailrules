import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmailValidator } from '../src/core.js';
import type { EmailValidatorOptions } from '../src/core.js';

describe('optional domain typo suggestions', () => {
  it('suggests adjacent transpositions without replacing the original email or changing validity', () => {
    const validator = createEmailValidator({ suggestions: true });
    const result = validator.check(' User+Tag@GMIAL.COM ');
    assert.equal(result.suggestion, 'User+Tag@gmail.com');
    assert.equal(result.email, 'User+Tag@gmial.com');
    assert.equal(result.domain, 'gmial.com');
    assert.equal(result.valid, true);
    assert.deepEqual(result.reasons, []);
    assert.equal(validator.explain('User+Tag@gmial.com').suggestion, 'User+Tag@gmail.com');
  });

  for (const domain of ['gmai.com', 'gmaill.com', 'gnail.com', 'gmail.cmo', 'gmail.con']) {
    it(`suggests a unique single-edit correction for ${domain}`, () => {
      assert.equal(
        createEmailValidator({ suggestions: true }).check(`user@${domain}`).suggestion,
        'user@gmail.com',
      );
    });
  }

  it('does not change the default result shape unless a suggestion exists', () => {
    for (const validator of [
      createEmailValidator(),
      createEmailValidator({ suggestions: false }),
    ]) {
      assert.equal('suggestion' in validator.check('user@gmial.com'), false);
    }
    assert.equal(
      'suggestion' in createEmailValidator({ suggestions: true }).check('user@gmail.com'),
      false,
    );
  });

  it('does not alter policy decisions or pass a corrected email into custom rules', () => {
    const validator = createEmailValidator({
      suggestions: true,
      customRules: [
        {
          id: 'original',
          check: ({ domain }) => {
            assert.equal(domain, 'gmial.com');
            return { status: 'rejected', code: 'original_domain' };
          },
        },
      ],
    });
    const result = validator.check('user@gmial.com');
    assert.equal(result.suggestion, 'user@gmail.com');
    assert.deepEqual(result.reasons, ['custom_rule']);
    const blocked = createEmailValidator({
      suggestions: true,
      blocklist: { domains: ['gmial.com'] },
    }).check('user@gmial.com');
    assert.deepEqual(blocked.reasons, ['blocked']);
    assert.equal(blocked.suggestion, 'user@gmail.com');
    const strict = createEmailValidator({
      suggestions: true,
      allowlistMode: 'only',
      allowlist: { domains: ['gmail.com'] },
    });
    assert.deepEqual(strict.check('user@gmial.com').reasons, ['not_allowed']);
  });

  it('preserves quoted local parts, including embedded at signs', () => {
    assert.equal(
      createEmailValidator({ suggestions: true }).check('"a@b"@gmial.com').suggestion,
      '"a@b"@gmail.com',
    );
  });

  it('avoids exact known domains, unknown distant domains and invalid input', () => {
    const validator = createEmailValidator({ suggestions: true });
    for (const input of [
      'user@gmail.com',
      'user@mail.com',
      'user@outlook.com',
      'user@company.example',
      'user@gmxxl.com',
      null,
      'not-email',
      'bad..local@gmial.com',
    ]) {
      assert.equal(validator.check(input).suggestion, undefined, String(input));
    }
  });

  it('does not move characters across domain label boundaries or drop subdomains', () => {
    const validator = createEmailValidator({
      suggestions: { domains: ['ab.cd.com', 'gmail.com'] },
    });
    for (const email of [
      'user@abc.d.com',
      'user@a.bcd.com',
      'user@sub.gmial.com',
      'user@gmial.co.uk',
      'user@gmial.com.evil.net',
    ]) {
      assert.equal(validator.check(email).suggestion, undefined, email);
    }
  });

  it('requires one unique candidate independent of input order', () => {
    for (const domains of [
      ['catmail.com', 'batmail.com'],
      ['batmail.com', 'catmail.com'],
    ]) {
      assert.equal(
        createEmailValidator({ suggestions: { domains } }).check('user@hatmail.com').suggestion,
        undefined,
      );
    }
  });

  it('normalizes and deduplicates custom targets and replaces the default target set', () => {
    const validator = createEmailValidator({
      suggestions: { domains: [' COMPANY.EXAMPLE ', 'company.example'] },
    });
    assert.equal(validator.check('user@compnay.example').suggestion, 'user@company.example');
    assert.equal(validator.check('user@gmial.com').suggestion, undefined);
    assert.equal(
      createEmailValidator({ suggestions: { domains: [] } }).check('user@gmial.com').suggestion,
      undefined,
    );
  });

  it('snapshots custom target iterables without changing caller data', () => {
    const domains = new Set(['company.example']);
    const validator = createEmailValidator({ suggestions: { domains } });
    domains.clear();
    assert.equal(validator.check('user@compnay.example').suggestion, 'user@company.example');
    function* targets() {
      yield 'company.example';
    }
    const fromGenerator = createEmailValidator({ suggestions: { domains: targets() } });
    assert.equal(fromGenerator.check('user@compnay.example').suggestion, 'user@company.example');
    assert.equal(fromGenerator.check('user@compnay.example').suggestion, 'user@company.example');
  });

  it('does not fuzzy-match international domain names or their punycode forms', () => {
    const validator = createEmailValidator({ suggestions: { domains: ['bücher.de'] } });
    assert.equal(validator.check('user@bücher.de').suggestion, undefined);
    assert.equal(validator.check('user@bucher.de').suggestion, undefined);
    assert.equal(validator.check('user@xn--bcher-kvb.de').suggestion, undefined);
    assert.equal(
      createEmailValidator({ suggestions: true }).check('user@gmaıl.com').suggestion,
      undefined,
    );
  });

  it('never suggests an address exceeding the email length limit', () => {
    const label = 'd'.repeat(61);
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${label}`;
    const validator = createEmailValidator({ suggestions: { domains: [domain + 'd'] } });
    const result = validator.check(`${'a'.repeat(64)}@${domain}`);
    assert.equal(result.valid, true);
    assert.equal(result.suggestion, undefined);
  });

  for (const suggestions of [
    null,
    42,
    'true',
    [],
    {},
    { domains: null },
    { domains: 'gmail.com' },
    { domains: [42] },
    { domains: ['bad_domain'] },
    { domains: ['gmail.com'], typo: true },
  ]) {
    it(`rejects invalid suggestion configuration ${JSON.stringify(suggestions)}`, () => {
      assert.throws(
        () => createEmailValidator({ suggestions } as unknown as EmailValidatorOptions),
        TypeError,
      );
    });
  }
});
