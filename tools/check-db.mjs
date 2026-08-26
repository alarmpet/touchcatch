import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRuntime } from './check-runtime.mjs';

/**
 * Local/CI database gate. `supabase db reset --local` destroys the attached
 * database, so this refuses to run unless the caller opts in on a disposable
 * instance.
 */
export function assertDisposableDbResetAllowed(env = process.env) {
  if (env.TOUCHCATCH_ALLOW_LOCAL_DB_RESET !== '1') {
    throw new Error(
      'Refusing check:db. This command runs supabase db reset --local and destroys the attached database. Set TOUCHCATCH_ALLOW_LOCAL_DB_RESET=1 only on a disposable local or CI database.',
    );
  }
}

function run(command, args, { shell = false } = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env, shell });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    assertDisposableDbResetAllowed();
    checkRuntime({ nodeVersion: process.version, userAgent: process.env.npm_config_user_agent });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const pnpmEntry = process.env.npm_execpath;
  if (typeof pnpmEntry !== 'string' || pnpmEntry.trim() === '') {
    console.error('npm_execpath missing; run via the pinned pnpm');
    process.exit(1);
  }

  const useShell = process.platform === 'win32';
  run(process.execPath, [pnpmEntry, 'ruleset:projections:check']);
  run('supabase', ['db', 'reset', '--local'], { shell: useShell });
  run('supabase', ['db', 'lint', '--local', '--fail-on', 'error'], { shell: useShell });
  run('supabase', ['test', 'db', '--local'], { shell: useShell });
  run(process.execPath, [pnpmEntry, 'test:db:concurrency']);
}
