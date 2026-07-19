import { fileURLToPath } from 'node:url';

const EXPECTED_NODE = 'v24.18.0';
const EXPECTED_PNPM = '11.13.0';

export function checkRuntime({ nodeVersion, userAgent }) {
  if (nodeVersion !== EXPECTED_NODE) {
    throw new Error(`Node ${nodeVersion}; expected ${EXPECTED_NODE}`);
  }

  const pnpmVersion = /^pnpm\/([^\s]+)/u.exec(userAgent ?? '')?.[1] ?? 'missing';
  if (pnpmVersion !== EXPECTED_PNPM) {
    throw new Error(`pnpm ${pnpmVersion}; expected ${EXPECTED_PNPM}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    checkRuntime({ nodeVersion: process.version, userAgent: process.env.npm_config_user_agent });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
