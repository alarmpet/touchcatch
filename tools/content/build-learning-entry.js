import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const keys = process.argv.slice(2);
if (keys.length === 0) {
  throw new Error('USAGE: node build-learning-entry.js <key1> [key2 ...]');
}

const implementation = fileURLToPath(
  new URL('./build-learning-entry.ts', import.meta.url),
);
for (const key of keys) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', implementation, key],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
