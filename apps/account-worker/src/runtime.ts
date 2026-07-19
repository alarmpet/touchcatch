export type DeletionLease = Readonly<{ jobId: string; authSub: string; deletionMode: 'HARD' | 'SOFT'; leaseToken: string; leaseGeneration: number }>;
export type AccountWorkerEnv = Readonly<{ DATABASE_URL: string; SUPABASE_URL: string; SUPABASE_SECRET_KEY: string; ACCOUNT_WORKER_ID: string }>;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function parseAccountWorkerEnv(raw: Readonly<Record<string, string | undefined>>): AccountWorkerEnv {
  const { DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY, ACCOUNT_WORKER_ID } = raw;
  if (!DATABASE_URL) throw new Error('DATABASE_URL required'); if (!SUPABASE_URL) throw new Error('SUPABASE_URL required'); if (!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY required'); if (!ACCOUNT_WORKER_ID || !uuidV4.test(ACCOUNT_WORKER_ID)) throw new Error('ACCOUNT_WORKER_ID must be UUIDv4');
  try { new URL(DATABASE_URL); new URL(SUPABASE_URL); } catch { throw new Error('worker URLs must be valid'); }
  return { DATABASE_URL, SUPABASE_URL: SUPABASE_URL.replace(/\/$/u, ''), SUPABASE_SECRET_KEY, ACCOUNT_WORKER_ID };
}
type AuthAdmin = Readonly<{
  deleteUser(userId: string, shouldSoftDelete: boolean): Promise<{ error: null | { code?: string | undefined; message?: string | undefined } }>;
}>;
type Store = Readonly<{ checkpoint(input: Readonly<{ jobId: string; leaseToken: string; leaseGeneration: number }>): Promise<void> }>;
type Database = Readonly<{ query(text: string, values: readonly unknown[]): Promise<{ rows: Array<{ value: unknown }> }> }>;
type Client = Readonly<{ query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<{ value: unknown }> }>; release(): void }>;

export function createAccountWorkerDatabase(pool: Readonly<{ connect(): Promise<Client> }>): Database {
  return { async query(text, values) { const client = await pool.connect(); try { await client.query('begin'); await client.query('set local role account_worker'); const result = await client.query(text, values); await client.query('commit'); return result; } catch (error) { try { await client.query('rollback'); } catch { /* preserve original error */ } throw error; } finally { client.release(); } } };
}
function failure(error: { code?: string | undefined; message?: string | undefined }): Error { return new Error(error.code ?? error.message ?? 'AUTH_ADMIN_FAILED'); }

export function createDeletionAuthAdmin(admin: Readonly<{ deleteUser(userId: string, shouldSoftDelete: boolean): Promise<{ error: null | { code?: string | undefined; message?: string | undefined } }> }>): AuthAdmin {
  return { deleteUser: (userId, shouldSoftDelete) => admin.deleteUser(userId, shouldSoftDelete) };
}

export async function processDeletionLease(lease: DeletionLease, auth: AuthAdmin, store: Store): Promise<void> {
  const deleted = await auth.deleteUser(lease.authSub, lease.deletionMode === 'SOFT');
  if (deleted.error && deleted.error.code !== 'user_not_found') throw failure(deleted.error);
  await store.checkpoint({ jobId: lease.jobId, leaseToken: lease.leaseToken, leaseGeneration: lease.leaseGeneration });
}

export function createDeletionJobStore(database: Database) {
  return {
    async claim(workerId: string, leaseMs: number): Promise<DeletionLease | null> {
      const value = (await database.query('select private.claim_account_deletion_job_v1($1::uuid,$2::integer) as value', [workerId, leaseMs])).rows[0]?.value;
      if (value === null || value === undefined) return null;
      const lease = value as Partial<DeletionLease>;
      if (typeof lease.jobId !== 'string' || typeof lease.authSub !== 'string' || !['HARD', 'SOFT'].includes(String(lease.deletionMode)) || typeof lease.leaseToken !== 'string' || !Number.isInteger(lease.leaseGeneration)) throw new Error('INVALID_DELETION_LEASE');
      return lease as DeletionLease;
    },
    async checkpoint(input: Readonly<{ jobId: string; leaseToken: string; leaseGeneration: number }>): Promise<void> {
      const value = (await database.query('select private.checkpoint_account_auth_deleted_v1($1::uuid,$2::uuid,$3::integer) as value', [input.jobId, input.leaseToken, input.leaseGeneration])).rows[0]?.value;
      if (value !== true) throw new Error('DELETION_FENCE_REJECTED');
    },
    async finalize(jobId: string): Promise<void> {
      const value = (await database.query('select private.finalize_account_deletion_v1($1::uuid) as value', [jobId])).rows[0]?.value;
      if (value !== true) throw new Error('DELETION_FINALIZE_REJECTED');
    },
  };
}

export async function runDeletionWorkerOnce(
  workerId: string,
  auth: AuthAdmin,
  store: ReturnType<typeof createDeletionJobStore>,
): Promise<boolean> {
  const lease = await store.claim(workerId, 30_000);
  if (!lease) return false;
  await processDeletionLease(lease, auth, store);
  await store.finalize(lease.jobId);
  return true;
}

export function createDeletionWorkerPoller(dependencies: Readonly<{
  runOnce(): Promise<boolean>;
  schedule(callback: () => void, delayMs: number): unknown;
  report(error: Error): void;
  idleMs: number;
  failureMs: number;
}>) {
  const poll = async (): Promise<void> => {
    let delay = dependencies.idleMs;
    try { await dependencies.runOnce(); } catch (error) { dependencies.report(error instanceof Error ? error : new Error('ACCOUNT_WORKER_FAILED')); delay = dependencies.failureMs; }
    dependencies.schedule(() => { void poll(); }, delay);
  };
  return poll;
}
