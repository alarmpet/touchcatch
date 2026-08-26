import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the API process and the deletion worker from becoming one process.
 *
 * 202608260003 grants the disposal functions to `privacy_worker` and revokes them from
 * `economy_server`, which is what makes a 202 honest: the service facing the internet can close an
 * account but cannot empty one. That guarantee survives exactly as long as the two halves stay in
 * separate processes with separate credentials.
 *
 * An import is how they merge. Someone reaches for `AccountDeletionWorker` from a handler to "run
 * it inline", the worker's pool gets constructed inside the API, and the split is gone without a
 * single line of SQL changing. These tests are the thing that notices.
 */

const serverSrc = 'apps/server/src';

const workerOnlyModules = [
  'privacy/account-deletion-worker.js',
  'privacy/privacy-worker-rpc.js',
  'privacy/privacy-worker-env.js',
  'privacy/supabase-auth-admin.js',
  'privacy/worker-runtime.js',
];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
    }),
  );
  return files.flat();
}

/** Walks imports from an entry file and returns every first-party module it can reach. */
async function reachableFrom(entry: string): Promise<Set<string>> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    let source: string;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of source.matchAll(/from\s+'(\.[^']+)'/gu)) {
      const resolved = path.join(path.dirname(file), match[1]!).replace(/\.js$/u, '.ts');
      queue.push(resolved);
    }
  }
  return seen;
}

describe('privacy worker secret boundary', () => {
  it('the API runtime cannot reach any worker module', async () => {
    const reachable = await reachableFrom(path.join(serverSrc, 'runtime.ts'));
    const normalised = [...reachable].map((file) => file.replaceAll('\\', '/'));
    for (const module of workerOnlyModules) {
      const target = `${serverSrc}/${module}`.replace(/\.js$/u, '.ts');
      expect(
        normalised.includes(target),
        `${module} is reachable from the API runtime; the worker's credentials and the API's must not live in one process`,
      ).toBe(false);
    }
  });

  it('no HTTP handler imports the worker', async () => {
    const handlers = await sourceFiles(path.join(serverSrc, 'http'));
    expect(handlers.length).toBeGreaterThan(0);
    for (const file of handlers) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toMatch(/account-deletion-worker|privacy-worker-rpc|worker-runtime/u);
    }
  });

  it('the worker never sets the API database role', async () => {
    const rpc = await readFile(path.join(serverSrc, 'privacy/privacy-worker-rpc.ts'), 'utf8');
    expect(rpc).toContain('set local role privacy_worker');
    // Naming economy_server in a comment is how the boundary gets explained; setting it is how
    // the boundary gets lost. Only the second is a failure.
    expect(rpc).not.toMatch(/set\s+(local\s+)?role\s+economy_server/u);
  });

  it('the API rpc allowlist carries no disposal function', async () => {
    const apiRpc = await readFile(path.join(serverSrc, 'database/pg-rpc.ts'), 'utf8');
    for (const forbidden of [
      'dispose_account_app_data_v1',
      'claim_account_deletion_v1',
      'complete_deletion_stage_v1',
      'extend_account_deletion_lease_v1',
    ]) {
      expect(apiRpc, `${forbidden} must not be callable by the API`).not.toContain(forbidden);
    }
  });

  it('the worker does not read the API environment', async () => {
    const worker = await readFile(path.join(serverSrc, 'privacy/worker-runtime.ts'), 'utf8');
    expect(worker).not.toContain('parseMobileApiEnv');
    expect(worker).toContain('parsePrivacyWorkerEnv');
  });
});
