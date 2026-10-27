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
