import { rm, mkdir, writeFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
for (const format of ['esm', 'cjs']) {
  execFileSync(process.execPath, [tsc, '-p', `tsconfig.${format}.json`], {
    cwd: root,
    stdio: 'inherit',
  });
  const directory = new URL(`../dist/${format}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('package.json', directory),
    JSON.stringify({
      type: format === 'esm' ? 'module' : 'commonjs',
    }) + '\n',
  );
}
await chmod(new URL('../dist/esm/cli.js', import.meta.url), 0o755);
console.log('Built ESM and CommonJS with declarations and source maps.');
