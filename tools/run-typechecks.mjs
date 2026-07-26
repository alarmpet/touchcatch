import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const nodePath = process.env.npm_node_execpath;
const pnpmPath = process.env.npm_execpath;
const scripts = ['typecheck:node', 'typecheck:mobile'];

if (!nodePath || !pnpmPath || !fs.existsSync(nodePath) || !fs.existsSync(pnpmPath)) {
  console.error('run-typechecks requires available npm_node_execpath and npm_execpath');
  process.exitCode = 1;
} else {
  let failed = false;

  for (const script of scripts) {
    const result = spawnSync(nodePath, [pnpmPath, script], {
      env: process.env,
      stdio: 'inherit',
    });
    const status = result.status ?? 1;

    console.log(`[typecheck] ${script} exit ${status}`);
    if (result.error) {
      console.error(`[typecheck] ${script} failed to start`);
    }
    if (status !== 0) {
      failed = true;
    }
  }

  process.exitCode = failed ? 1 : 0;
}
