import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { Pool } from 'pg';
import { AccountDeletionWorker, type WorkerLogEvent } from './account-deletion-worker.js';
import { createPrivacyWorkerRpc } from './privacy-worker-rpc.js';
import { createSupabaseAuthAdmin } from './supabase-auth-admin.js';
import { parsePrivacyWorkerEnv } from './privacy-worker-env.js';
import type { PgPoolLike } from '../database/pg-rpc.js';

/**
 * Entry point for `pnpm server:privacy-worker`. A separate process on purpose.
 *
 * It has its own database login (a member of `privacy_worker`, which the API's login is not), its
 * own Supabase credential, and no HTTP listener. Nothing in `runtime.ts` imports this file, and
 * `secret-boundary.test.ts` fails if that ever changes: the API accepting a deletion request and
 * something carrying it out have to be two authorities, or the 202 stops meaning anything.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const dispositionPath = resolve(repositoryRoot, 'docs/legal/data-disposition.v1.json');

export type WorkerHandle = Readonly<{ stop(): Promise<void> }>;

export function createWorkerLogger(write: (line: string) => void = console.log) {
  return (event: WorkerLogEvent) => write(JSON.stringify({ at: new Date().toISOString(), ...event }));
}

export function startWorkerLoop(
  worker: AccountDeletionWorker,
  pollMs: number,
  log: (event: WorkerLogEvent) => void,
): WorkerHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const run = async () => {
    if (stopped) return;
    try {
      const result = await worker.tick();
      // Only pause when there is nothing to do. A tick that advanced a request goes straight back
      // for the next stage, so a queue drains at the speed of the work rather than the poll.
      const delay = result.kind === 'ADVANCED' ? 0 : pollMs;
      timer = setTimeout(() => void run(), delay);
    } catch (error) {
      log({ event: 'worker.error', detail: error instanceof Error ? error.message : 'UNKNOWN' });
      timer = setTimeout(() => void run(), pollMs);
    }
  };

  void run();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

export function createWorker(
  pool: PgPoolLike,
  options: Readonly<{
    supabaseUrl: string;
    serviceRoleKey: string;
    leaseSeconds: number;
    dispositionDocument: string;
    log: (event: WorkerLogEvent) => void;
  }>,
): AccountDeletionWorker {
  return new AccountDeletionWorker({
    rpc: createPrivacyWorkerRpc(pool),
    authAdmin: createSupabaseAuthAdmin({
      supabaseUrl: options.supabaseUrl,
      serviceRoleKey: options.serviceRoleKey,
      fetchImpl: (url, init) => fetch(url, init),
    }),
    dispositionDocument: options.dispositionDocument,
    log: options.log,
    leaseSeconds: options.leaseSeconds,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const log = createWorkerLogger();
  const env = parsePrivacyWorkerEnv(process.env);
  const pool = new Pool({ connectionString: env.databaseUrl });
  const worker = createWorker(pool as unknown as PgPoolLike, {
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.serviceRoleKey,
    leaseSeconds: env.leaseSeconds,
    dispositionDocument: readFileSync(dispositionPath, 'utf8'),
    log,
  });

  const refusal = worker.refusal;
  // Started, and saying plainly that it will do nothing. Exiting instead would look like a crash
  // loop to whatever supervises it, and silence would be worse than either.
  log({ event: 'worker.started', ...(refusal === null ? {} : { detail: refusal }) });

  const handle = startWorkerLoop(worker, env.pollMs, log);
  const shutdown = () => {
    void handle.stop().then(() => pool.end());
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
