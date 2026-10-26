import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmailValidator } from '../src/index.js';
import { createEmailValidator as createCore } from '../src/core.js';

describe('default dataset integration', () => {
  it('rejects a known disposable mailbox and its subdomains out of the box', () => {
    const validator = createEmailValidator();
    assert.deepEqual(validator.check('user@mailinator.com').reasons, ['disposable']);
    assert.deepEqual(validator.check('user@sub.mailinator.com').reasons, ['disposable']);
    assert.equal(validator.check('user@gmail.com').valid, true);
  });

  it('permits per-instance exceptions without altering the default dataset', () => {
    const exception = createEmailValidator({ allowlist: { domains: ['mailinator.com'] } });
    const normal = createEmailValidator();
    assert.equal(exception.check('user@mailinator.com').valid, true);
    assert.equal(normal.check('user@mailinator.com').valid, false);
  });

  it('uses a custom dataset in place of fakeout', () => {
    const validator = createEmailValidator({ disposableDomains: ['custom.example'] });
    assert.equal(validator.check('user@mailinator.com').valid, true);
    assert.deepEqual(validator.check('user@custom.example').reasons, ['disposable']);
  });

  it('honors an explicitly empty custom list', () => {
    assert.equal(
      createEmailValidator({ disposableDomains: [] }).check('user@mailinator.com').valid,
      true,
    );
  });

  it('leaves the core data-free unless the caller provides a dataset', () => {
    assert.equal(createCore().check('user@mailinator.com').disposable, false);
  });

  it('rejects invalid root options instead of hiding them with a spread or default', () => {
    assert.throws(() => createEmailValidator(null as never), TypeError);
    assert.throws(() => createEmailValidator({ disposableDomains: null } as never), TypeError);
  });
});
