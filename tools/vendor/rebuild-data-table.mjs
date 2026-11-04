import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const upstream = 'https://github.com/jeyabbalas/data-table.git';
const revision = '8e7f5ec3103b4cf1219f3089143c3203f74aa37c';
const version = '0.10.1-nih.1';
const directory = mkdtempSync(join(tmpdir(), 'nih-merge-data-table-'));

function run(command, args, cwd = directory) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

try {
  run('git', ['clone', '--no-checkout', upstream, directory]);
  run('git', ['checkout', '--detach', revision]);
  run('git', ['apply', resolve(appRoot, 'vendor/data-table-aliases.patch')]);
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  run('npx', ['vitest', 'run', 'tests/nih-merge', '--maxWorkers=2']);
  run('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts']);
  run('npm', ['run', 'build']);
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', resolve(appRoot, 'vendor')]);
  console.log(`Rebuilt vendor/jeyabbalas-data-table-${version}.tgz. Run npm install --legacy-peer-deps to refresh the lockfile integrity.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
