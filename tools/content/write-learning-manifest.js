import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const implementation = fileURLToPath(
  new URL('./write-learning-manifest.ts', import.meta.url),
);
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', implementation, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
