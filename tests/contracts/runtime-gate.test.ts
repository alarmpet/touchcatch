import { execFileSync } from 'node:child_process';
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
});
