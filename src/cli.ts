#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { createEmailValidator } from './index.js';
import { parseCsv, writeCsv } from './csv.js';
import type { EmailValidatorOptions } from './types.js';

const help = `Usage: mailrules [--input input.csv] [--output report.csv] [options]

Validate CSV email addresses locally. Omit --input or use - to read stdin.
  --column NAME          Email column header (default: email)
  --status VALUE         all, accepted or rejected (default: all)
  --config FILE          JSON validator options (no executable callbacks)
  --delimiter VALUE      Input delimiter: comma, semicolon or tab (default: ,)
  --fail-on-rejected     Exit 1 if any input address is rejected
  --help                Show this help

Reports are comma-delimited UTF-8 CSV, with formula-leading cells escaped.
Existing output files are never overwritten. Maximum input size: 20 MiB.
Exit codes: 0 success; 1 rejected rows with --fail-on-rejected; 2 input/error.
No DNS, SMTP or mailbox ownership checks are performed.
`;

async function readBounded(stream: Readable, limit: number, label: string): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error(`${label} exceeds ${limit / 1024 / 1024} MiB`);
    chunks.push(bytes);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

async function main(args: string[]): Promise<number> {
  if (args.includes('--help')) {
    process.stdout.write(help);
    return 0;
  }
  const flags = new Map<string, string>();
  let failOnRejected = false;
  const valued = new Set([
    '--input',
    '--output',
    '--column',
    '--status',
    '--config',
    '--delimiter',
  ]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (key === '--fail-on-rejected') {
      failOnRejected = true;
      continue;
    }
    if (!valued.has(key)) throw new Error(`Unknown argument: ${key}. Use --help.`);
    if (flags.has(key)) throw new Error(`Duplicate option: ${key}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    flags.set(key, value);
  }
  const status = flags.get('--status') ?? 'all';
  if (!['all', 'accepted', 'rejected'].includes(status))
    throw new Error('--status must be all, accepted or rejected');
  const rawDelimiter = flags.get('--delimiter') ?? ',';
  const delimiter = rawDelimiter === 'tab' ? '\t' : rawDelimiter;
  if (![',', ';', '\t'].includes(delimiter))
    throw new Error('--delimiter must be comma (,), semicolon (;) or tab');
  const configPath = flags.get('--config');
  const options: EmailValidatorOptions = configPath
    ? (JSON.parse(
        await readBounded(createReadStream(configPath), 1024 * 1024, 'Configuration'),
      ) as EmailValidatorOptions)
    : {};
  const validator = createEmailValidator(options);
  const inputPath = flags.get('--input');
  const input = await readBounded(
    inputPath && inputPath !== '-' ? createReadStream(inputPath) : process.stdin,
    20 * 1024 * 1024,
    'CSV input',
  );
  const [header, ...rows] = parseCsv(input, delimiter);
  if (!header) throw new Error('CSV requires a header row');
  const names = header.map((value) => value.trim());
  if (new Set(names).size !== names.length || names.some((name) => !name))
    throw new Error('CSV headers must be nonempty and unique');
  const column = names.indexOf(flags.get('--column') ?? 'email');
  if (column < 0) throw new Error(`CSV has no column named ${flags.get('--column') ?? 'email'}`);
  const report = [
    [
      'row',
      'input',
      'email',
      'valid',
      'reason',
      'disposable',
      'role_account',
      'free_provider',
      'suggestion',
      'warnings',
    ],
  ];
  let rejected = false;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length !== header.length)
      throw new Error(`CSV record ${i + 2} has ${row.length} fields; expected ${header.length}`);
    const original = row[column]!;
    const result = validator.check(original);
    rejected ||= !result.valid;
    if ((status === 'accepted' && !result.valid) || (status === 'rejected' && result.valid))
      continue;
    report.push([
      String(i + 2),
      original,
      result.email ?? '',
      String(result.valid),
      result.reasons[0] ?? '',
      result.disposable === null ? '' : String(result.disposable),
      result.roleAccount == null ? '' : String(result.roleAccount),
      result.freeProvider == null ? '' : String(result.freeProvider),
      result.suggestion ?? '',
      JSON.stringify(result.warnings ?? []),
    ]);
  }
  const output = writeCsv(report);
  const outputPath = flags.get('--output');
  if (outputPath && outputPath !== '-') await writeFile(outputPath, output, { flag: 'wx' });
  else process.stdout.write(output);
  return failOnRejected && rejected ? 1 : 0;
}

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  else {
    process.stderr.write(`mailrules: ${error.message}\n`);
    process.exit(2);
  }
});
main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`mailrules: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
