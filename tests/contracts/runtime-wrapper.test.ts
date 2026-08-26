import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateGateScripts } from '../../tools/check-docs-lib.js';
import { assertDisposableDbResetAllowed } from '../../tools/check-db.mjs';
import { resolvePnpmInvocation } from '../../tools/run-pnpm.mjs';

describe('pinned pnpm wrapper', () => {
  it('accepts the wrapper form of the frozen check chain', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(validateGateScripts(pkg.scripts)).toEqual([]);
  });

  it('still rejects a substring fake and an order swap', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(validateGateScripts({
      ...pkg.scripts,
      check: (pkg.scripts.check ?? '').replace('node tools/run-pnpm.mjs docs:check', 'echo node tools/run-pnpm.mjs docs:check'),
    })).toContain('check:exact-order');
  });

  it('resolves the parent node and pnpm entry after the runtime pin passes', () => {
    const invocation = resolvePnpmInvocation({
      argv: ['lint'],
      execPath: '/pinned/node',
      npmExecPath: '/pinned/pnpm.cjs',
      nodeVersion: 'v24.18.0',
      userAgent: 'pnpm/11.13.0 npm/? node/v24.18.0 win32 x64',
    });
    expect(invocation).toEqual({
      execPath: '/pinned/node',
      pnpmEntry: '/pinned/pnpm.cjs',
      args: ['lint'],
    });
  });

  it('refuses to start a child when the parent runtime is wrong', () => {
    expect(() => resolvePnpmInvocation({
      argv: ['lint'],
      execPath: '/pinned/node',
      npmExecPath: '/pinned/pnpm.cjs',
      nodeVersion: 'v24.19.0',
      userAgent: 'pnpm/11.13.0 npm/? node/v24.19.0 win32 x64',
    })).toThrow(/Node v24\.19\.0; expected v24\.18\.0/);
  });

  it('refuses check:db without the disposable-db flag', () => {
    expect(() => assertDisposableDbResetAllowed({ ...process.env, TOUCHCATCH_ALLOW_LOCAL_DB_RESET: undefined })).toThrow(/TOUCHCATCH_ALLOW_LOCAL_DB_RESET=1/);
    expect(() => assertDisposableDbResetAllowed({ ...process.env, TOUCHCATCH_ALLOW_LOCAL_DB_RESET: '1' })).not.toThrow();
  });

  it('exits non-zero when check-db is invoked without the flag', () => {
    const result = spawnSync(process.execPath, [resolve('tools/check-db.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, TOUCHCATCH_ALLOW_LOCAL_DB_RESET: '' },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('TOUCHCATCH_ALLOW_LOCAL_DB_RESET=1');
  });

  it('lets docs:check fail a stale blocker file outside the working tree', { timeout: 30000 }, () => {
    const tmp = mkdtempSync(join(tmpdir(), 'blockers-'));
    const file = join(tmp, 'release-blockers.v1.json');
    writeFileSync(file, '{"schemaVersion":99}\n');
    const result = spawnSync(process.execPath, [resolve('tools/check-docs.mjs'), `--release-blockers=${file}`], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/release-blockers\.v1\.json|stale release blocker report/);
  });
});
