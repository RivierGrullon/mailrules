import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
function run(args: string[], input = 'email\nuser@example.com\nbad\n') {
  return spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 25 * 1024 * 1024,
  });
}

describe('CSV CLI', () => {
  it('prints help and rejects unknown flags', () => {
    assert.match(run(['--help']).stdout, /--status/);
    assert.equal(run(['--mystery']).status, 2);
  });
  it('reads stdin and reports accepted and rejected rows', () => {
    const r = run([]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /user@example.com/);
    assert.match(r.stdout, /invalid_format/);
    assert.equal(r.stderr, '');
  });
  it('filters reports while keeping rejected exit semantics', () => {
    const r = run(['--status', 'accepted', '--fail-on-rejected']);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /user@example.com/);
    assert.doesNotMatch(r.stdout, /invalid_format/);
    assert.doesNotMatch(run(['--status', 'rejected']).stdout, /user@example.com/);
  });
  it('loads policy JSON, writes a report and refuses to overwrite it or the input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mailrules-cli-'));
    try {
      const input = join(dir, 'input.csv');
      const output = join(dir, 'report.csv');
      const config = join(dir, 'rules.json');
      writeFileSync(input, 'address;note\nsupport@example.com;"a;b"\njane@gmail.com;hello\n');
      writeFileSync(config, JSON.stringify({ roleAccounts: 'block', freeProviders: 'warn' }));
      const args = [
        '--input',
        input,
        '--output',
        output,
        '--column',
        'address',
        '--delimiter',
        ';',
        '--config',
        config,
      ];
      const r = run(args);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, '');
      const report = readFileSync(output, 'utf8');
      assert.match(report, /role_account/);
      assert.match(report, /free_provider/);
      assert.equal(run(args).status, 2);
      assert.equal(readFileSync(output, 'utf8'), report);
      assert.equal(
        run(['--input', input, '--output', input, '--column', 'address', '--delimiter', ';'])
          .status,
        2,
      );
      assert.match(readFileSync(input, 'utf8'), /^address;note/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  for (const input of [
    'other\nx@example.com\n',
    'email,email\nx,y\n',
    'email,note\nx@example.com\n',
    'email\n"bad',
  ])
    it(`rejects invalid input without a partial report ${input}`, () => {
      const r = run([], input);
      assert.equal(r.status, 2);
      assert.equal(r.stdout, '');
      assert.ok(r.stderr);
    });
  it('rejects excessive input', () => {
    const r = run([], 'email\n' + 'x'.repeat(20 * 1024 * 1024));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /20 MiB/);
  });
});
