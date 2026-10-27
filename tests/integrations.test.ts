import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { createEmailValidator } from '../src/core.js';
import { emailSchema } from '../src/schema.js';
import { zodEmail } from '../src/zod.js';

describe('schema integrations', () => {
  const validator = createEmailValidator({ blocklist: { domains: ['blocked.example'] } });
  it('implements Standard Schema with normalized string output', () => {
    const schema: StandardSchemaV1<unknown, string> = emailSchema(validator);
    assert.equal(schema['~standard'].version, 1);
    assert.equal(schema['~standard'].vendor, 'mailrules');
    assert.deepEqual(schema['~standard'].validate(' User+Tag@EXAMPLE.COM '), {
      value: 'User+Tag@example.com',
    });
  });
  it('reports nonstrings and policy failures as issues', () => {
    const schema = emailSchema(validator);
    assert.match(schema['~standard'].validate(null).issues?.[0]?.message ?? '', /email/i);
    assert.match(
      schema['~standard'].validate('x@blocked.example').issues?.[0]?.message ?? '',
      /not accepted/i,
    );
  });
  it('allows application-owned error messages', () => {
    const schema = emailSchema(validator, {
      message: (result) => `Rejected: ${result.reasons[0]}`,
    });
    assert.equal(
      schema['~standard'].validate('bad').issues?.[0]?.message,
      'Rejected: invalid_format',
    );
  });
  it('evaluates once and does not turn warnings into schema failures', () => {
    let calls = 0;
    const v = createEmailValidator({
      customRules: [
        {
          id: 'notice',
          check: () => {
            calls++;
            return { status: 'warning', code: 'review' };
          },
        },
      ],
    });
    assert.deepEqual(emailSchema(v)['~standard'].validate('x@example.com'), {
      value: 'x@example.com',
    });
    assert.equal(calls, 1);
    assert.equal(zodEmail(v).parse('x@example.com'), 'x@example.com');
    assert.equal(calls, 2);
  });
  it('supports actual Zod object schemas and nested field error paths', () => {
    const signup = z.object({ account: z.object({ email: zodEmail(validator) }) });
    assert.deepEqual(signup.parse({ account: { email: ' User@EXAMPLE.COM ' } }), {
      account: { email: 'User@example.com' },
    });
    const failed = signup.safeParse({ account: { email: 'x@blocked.example' } });
    assert.equal(failed.success, false);
    if (!failed.success) assert.deepEqual(failed.error.issues[0]?.path, ['account', 'email']);
    const output: z.output<typeof signup> = { account: { email: 'x@example.com' } };
    assert.equal(typeof output.account.email, 'string');
  });
  it('propagates application callback errors', () => {
    const error = new Error('application failure');
    const v = createEmailValidator({
      customRules: [
        {
          id: 'broken',
          check: () => {
            throw error;
          },
        },
      ],
    });
    assert.throws(() => emailSchema(v)['~standard'].validate('x@example.com'), error);
    assert.throws(() => zodEmail(v).parse('x@example.com'), error);
  });
});
