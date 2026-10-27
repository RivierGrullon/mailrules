/** Parse delimited text with RFC 4180 quoting and bounded structure. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  if (![',', ';', '\t'].includes(delimiter)) throw new TypeError('Unsupported CSV delimiter');
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let start = 0;
  let quoted = false;
  let closed = false;
  let decoded = '';
  let used = false;
  let cells = 0;
  const finishField = (end: number) => {
    if (row.length >= 256) throw new Error('CSV column limit exceeded (256)');
    if (cells >= 1000000) throw new Error('CSV cell limit exceeded (1000000)');
    const value = closed ? decoded : text.slice(start, end);
    if (value.length > 262144)
      throw new Error('CSV field limit exceeded (262144 UTF-16 code units)');
    row.push(value);
    cells++;
    decoded = '';
    closed = false;
  };
  const finishRow = (end: number) => {
    if (used || row.length || end > start) {
      if (rows.length >= 100001)
        throw new Error('CSV record limit exceeded (100000 data rows plus header)');
      finishField(end);
      rows.push(row);
    }
    row = [];
    used = false;
    closed = false;
    decoded = '';
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (!closed && i - start > 262144)
      throw new Error('CSV field limit exceeded (262144 UTF-16 code units)');
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') i++;
        else {
          decoded = text.slice(start, i).replaceAll('""', '"');
          quoted = false;
          closed = true;
        }
      }
      continue;
    }
    if (closed && char !== delimiter && char !== '\r' && char !== '\n')
      throw new Error('Invalid CSV: text after closing quote');
    if (char === delimiter) {
      finishField(i);
      start = i + 1;
      used = true;
    } else if (char === '\r' || char === '\n') {
      finishRow(i);
      if (char === '\r' && text[i + 1] === '\n') i++;
      start = i + 1;
    } else if (char === '"') {
      if (i !== start || closed) throw new Error('Invalid CSV: quote inside unquoted field');
      quoted = true;
      used = true;
      start = i + 1;
    } else used = true;
  }
  if (quoted) throw new Error('Invalid CSV: unclosed quoted field');
  finishRow(text.length);
  return rows;
}

/** CSV reports are spreadsheet-safe; formula-leading cells get a literal apostrophe. */
export function writeCsv(rows: readonly (readonly string[])[]): string {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            const safe =
              /^[\s\u0000-\u001f]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value)
                ? `'${value}`
                : value;
            return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}
