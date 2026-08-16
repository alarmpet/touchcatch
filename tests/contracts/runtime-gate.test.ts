import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const checker = pathToFileURL(resolve('tools/check-runtime.mjs')).href;

function runCheck(nodeVersion: string, userAgent: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { checkRuntime } from ${JSON.stringify(checker)}; checkRuntime(${JSON.stringify({ nodeVersion, userAgent })})`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/**
 * Builds a child environment where `npm_config_user_agent` actually takes effect.
 *
 * Windows environment variables are case-insensitive, but spreading `process.env` into an object
 * literal is not: the inherited `NPM_CONFIG_USER_AGENT` and a lowercase override become two
 * separate keys, and the child reads the inherited one. The override silently does nothing and
 * the assertion degrades into a statement about whoever launched the test runner — green under
 * `pnpm test`, red under `npx vitest`, for reasons that have nothing to do with the gate.
 */
function childEnv(overrides: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (/^npm_config_user_agent$/iu.test(key)) delete env[key];
  return Object.assign(env, overrides);
}

describe('runtime gate', () => {
  it('accepts exactly Node 24.18.0 and pnpm 11.13.0', () => {
    expect(runCheck('v24.18.0', 'pnpm/11.13.0 npm/? node/v24.18.0 win32 x64')).toBe('');
  });

  it('rejects a different Node patch release', () => {
    expect(() => runCheck('v24.17.0', 'pnpm/11.13.0 npm/? node/v24.17.0 win32 x64')).toThrow(
      /Node v24\.17\.0; expected v24\.18\.0/,
    );
  });

  it('rejects a different pnpm release', () => {
    expect(() => runCheck('v24.18.0', 'pnpm/11.9.0 npm/? node/v24.18.0 win32 x64')).toThrow(
      /pnpm 11\.9\.0; expected 11\.13\.0/,
    );
  });

  it('uses the real process runtime at the CLI entrypoint and ignores override-like environment values', () => {
    const result = spawnSync(process.execPath, [resolve('tools/check-runtime.mjs')], {
      encoding: 'utf8',
      env: childEnv({
        NODE_ENV: 'test',
        TOUCHCATCH_RUNTIME_TEST_INPUT: JSON.stringify({
          nodeVersion: 'v24.18.0',
          userAgent: 'pnpm/11.13.0 npm/? node/v24.18.0 win32 x64',
        }),
        npm_config_user_agent: 'pnpm/11.13.0 npm/? node/v24.18.0 win32 x64',
      }),
    });

    if (process.version === 'v24.18.0') {
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    } else {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Node ${process.version}; expected v24.18.0`);
    }
  });
});
