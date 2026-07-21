import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const [script, ...args] = process.argv.slice(2);
const nodePath = process.env.npm_node_execpath;
const pnpmPath = process.env.npm_execpath;

if (!script || !nodePath || !pnpmPath) {
  console.error('run-pnpm requires pnpm command arguments plus npm_node_execpath and npm_execpath');
  process.exitCode = 1;
} else if (!fs.existsSync(nodePath) || !fs.existsSync(pnpmPath)) {
  console.error('run-pnpm received an unavailable npm_node_execpath or npm_execpath');
  process.exitCode = 1;
} else {
  const result = spawnSync(nodePath, [pnpmPath, script, ...args], {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
  }
  process.exitCode = result.status ?? 1;
}
