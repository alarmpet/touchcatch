import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRuntime } from './check-runtime.mjs';

/**
 * Runs a pnpm script with the parent Node executable and pnpm entrypoint.
 *
 * `package.json` used to chain `corepack pnpm <script>`, which can pick a
 * different Node/pnpm than the parent (the 24.19 / 11.19 fallback). This
 * wrapper refuses to start unless the parent already matches the pin, then
 * reuses `process.execPath` and `npm_execpath`.
 */
export function resolvePnpmInvocation({
  argv = process.argv.slice(2),
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
  nodeVersion = process.version,
  userAgent = process.env.npm_config_user_agent,
} = {}) {
  checkRuntime({ nodeVersion, userAgent });
  if (argv.length === 0) {
    throw new Error('usage: node tools/run-pnpm.mjs <pnpm-args...>');
  }
  if (typeof npmExecPath !== 'string' || npmExecPath.trim() === '') {
    throw new Error('npm_execpath missing; run via the pinned pnpm');
  }
  return { execPath, pnpmEntry: npmExecPath, args: argv };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const invocation = resolvePnpmInvocation();
    console.log(
      `[run-pnpm] node=${invocation.execPath} version=${process.version} pnpm=${invocation.pnpmEntry} userAgent=${process.env.npm_config_user_agent ?? 'missing'} args=${invocation.args.join(' ')}`,
    );
    const result = spawnSync(invocation.execPath, [invocation.pnpmEntry, ...invocation.args], {
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
