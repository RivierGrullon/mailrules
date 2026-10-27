/** Parse delimited text with RFC 4180 quoting. Blank physical lines are skipped. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  if (![',', ';', '\t'].includes(delimiter)) throw new TypeError('Unsupported CSV delimiter');
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  let used = false;
  const finishField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const finishRow = () => {
    if (used || row.length || field) {
      finishField();
      rows.push(row);
    }
    row = [];
    field = '';
    used = false;
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
      continue;
    }
    if (closed && char !== delimiter && char !== '\r' && char !== '\n')
      throw new Error('Invalid CSV: text after closing quote');
    if (char === delimiter) {
      finishField();
      used = true;
    } else if (char === '\r' || char === '\n') {
      finishRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"') {
      if (field.length || closed) throw new Error('Invalid CSV: quote inside unquoted field');
      quoted = true;
      used = true;
    } else {
      field += char;
      used = true;
    }
  }
  if (quoted) throw new Error('Invalid CSV: unclosed quoted field');
  finishRow();
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
