import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsv, writeCsv } from '../src/csv.js';

describe('CSV interchange', () => {
  it('reads BOM, CRLF, escaped quotes and multiline fields', () => {
    assert.deepEqual(
      parseCsv('\uFEFFemail,note\r\nx@example.com,"line 1\r\nline 2, ""yes"""\r\n'),
      [
        ['email', 'note'],
        ['x@example.com', 'line 1\r\nline 2, "yes"'],
      ],
    );
  });
  it('supports delimiters and trailing empty fields without phantom rows', () => {
    assert.deepEqual(parseCsv('email;note\na@example.com;\n\n', ';'), [
      ['email', 'note'],
      ['a@example.com', ''],
    ]);
    assert.deepEqual(parseCsv('email\n""\n'), [['email'], ['']]);
  });
  for (const input of ['a,b\n"unclosed', 'a,b\nx"y,z', 'a,b\n"x"oops,z'])
    it(`rejects malformed CSV ${input}`, () => assert.throws(() => parseCsv(input), /CSV/));
  it('escapes fields and neutralizes spreadsheet formulas', () => {
    const encoded = writeCsv([
      ['email', 'note'],
      ['=1+2', 'a,"b"\nc'],
      ['+tag@example.com', '@SUM(A1)'],
    ]);
    assert.deepEqual(parseCsv(encoded), [
      ['email', 'note'],
      ["'=1+2", 'a,"b"\nc'],
      ["'+tag@example.com", "'@SUM(A1)"],
    ]);
  });
});

describe('CSV structural resource limits', () => {
  it('rejects many tiny records before allocating a report', () => {
    assert.throws(() => parseCsv('email\n' + 'x\n'.repeat(100001)), /record limit/i);
  });
  it('rejects excessive columns and total cells during parsing', () => {
    assert.throws(() => parseCsv('x,'.repeat(256) + 'x'), /column limit/i);
    assert.throws(() => parseCsv(('x,'.repeat(255) + 'x\n').repeat(3907)), /cell limit/i);
  });
  it('accepts values at the documented structural boundaries', () => {
    assert.equal(parseCsv('email\n' + 'x\n'.repeat(100000)).length, 100001);
    assert.equal(parseCsv('x,'.repeat(255) + 'x')[0]?.length, 256);
    assert.equal(parseCsv(('x,'.repeat(249) + 'x\n').repeat(4000)).length, 4000);
    assert.equal(parseCsv('"' + 'x'.repeat(262144) + '"')[0]?.[0]?.length, 262144);
  });
  it('bounds raw field content and still accepts substantial quoted notes', () => {
    assert.throws(
      () => parseCsv('email,note\nx@example.com,"' + 'x'.repeat(262145) + '"'),
      /field limit/i,
    );
    assert.deepEqual(parseCsv('email,note\nx@example.com,"' + 'a'.repeat(10000) + '"')[1], [
      'x@example.com',
      'a'.repeat(10000),
    ]);
  });
});
