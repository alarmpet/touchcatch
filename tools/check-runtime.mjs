import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_NODE = 'v24.18.0';
const EXPECTED_PNPM = '11.13.0';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pnpmVersionFromUserAgent = (userAgent) => /^pnpm\/([^\s]+)/u.exec(userAgent ?? '')?.[1];

const expectedPnpmVersion = () => {
  const packageManager = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).packageManager;
  const version = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(packageManager ?? '')?.[1];
  if (version === undefined) throw new Error('pnpm packageManager pin missing');
  return version;
};

const corepackPnpmVersion = () => {
  const entry = resolve(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  const result = spawnSync(process.execPath, [entry, 'pnpm', '--version'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
    windowsHide: true,
  });
  return result.status === 0 && /^\d+\.\d+\.\d+$/u.test(result.stdout.trim())
    ? result.stdout.trim()
    : 'missing';
};

export function checkRuntime({ nodeVersion, userAgent, expectedPnpm = EXPECTED_PNPM }) {
  if (nodeVersion !== EXPECTED_NODE) {
    throw new Error(`Node ${nodeVersion}; expected ${EXPECTED_NODE}`);
  }

  const pnpmVersion = pnpmVersionFromUserAgent(userAgent) ?? 'missing';
  if (pnpmVersion !== expectedPnpm) {
    throw new Error(`pnpm ${pnpmVersion}; expected ${expectedPnpm}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const expectedPnpm = expectedPnpmVersion();
    const userAgent = process.env.npm_config_user_agent;
    if (userAgent !== undefined) {
      checkRuntime({ nodeVersion: process.version, userAgent, expectedPnpm });
    }
    checkRuntime({
      nodeVersion: process.version,
      userAgent: `pnpm/${corepackPnpmVersion()}`,
      expectedPnpm,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
