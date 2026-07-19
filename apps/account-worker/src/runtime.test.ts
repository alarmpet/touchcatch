import { expect, it, vi } from 'vitest';
import { createAccountWorkerDatabase, createDeletionAuthAdmin, createDeletionJobStore, createDeletionWorkerPoller, parseAccountWorkerEnv, processDeletionLease, runDeletionWorkerOnce } from './runtime.js';

const lease = { jobId: '00000000-0000-4000-8000-000000000001', authSub: '00000000-0000-4000-8000-000000000002', deletionMode: 'HARD' as const, leaseToken: '00000000-0000-4000-8000-000000000003', leaseGeneration: 1 };

it('deletes Auth, then checkpoints without retaining an access JWT', async () => {
  const deleteUser = vi.fn(async () => ({ error: null })); const checkpoint = vi.fn(async () => undefined);
  await processDeletionLease(lease, { deleteUser }, { checkpoint });
  expect(deleteUser).toHaveBeenCalledWith(lease.authSub, false);
  expect(checkpoint).toHaveBeenCalledWith({ jobId: lease.jobId, leaseToken: lease.leaseToken, leaseGeneration: 1 });
  expect(deleteUser.mock.invocationCallOrder[0]).toBeLessThan(checkpoint.mock.invocationCallOrder[0]!);
});

it('reports transient failures and schedules a bounded retry without rejecting', async () => {
  const schedule = vi.fn(); const report = vi.fn();
  const poll = createDeletionWorkerPoller({ runOnce: async () => { throw new Error('temporary DB failure'); }, schedule, report, idleMs: 5_000, failureMs: 15_000 });
  await expect(poll()).resolves.toBeUndefined();
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'temporary DB failure' }));
  expect(schedule).toHaveBeenCalledWith(expect.any(Function), 15_000);
});

it('requires server-only worker credentials and an opaque worker identity', () => {
  expect(parseAccountWorkerEnv({ DATABASE_URL: 'postgres://db.test/app', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_example', ACCOUNT_WORKER_ID: '00000000-0000-4000-8000-000000000099' })).toMatchObject({ SUPABASE_SECRET_KEY: 'sb_secret_example' });
  expect(() => parseAccountWorkerEnv({ DATABASE_URL: 'postgres://db.test/app', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public', ACCOUNT_WORKER_ID: crypto.randomUUID() })).toThrow(/SUPABASE_SECRET_KEY/);
});

it('exposes only deleteUser from the Supabase Admin client', async () => {
  const deleteUser = vi.fn(async () => ({ data: null, error: null }));
  const rawAdmin = { deleteUser, listUsers: vi.fn(), updateUserById: vi.fn() };
  const adapter = createDeletionAuthAdmin(rawAdmin);
  expect(Object.keys(adapter)).toEqual(['deleteUser']);
  await adapter.deleteUser(lease.authSub, false);
  expect(deleteUser).toHaveBeenCalledWith(lease.authSub, false);
});

it('scopes every worker DB query to the NOINHERIT account_worker role', async () => {
  const query = vi.fn(async (_text: string, _values?: readonly unknown[]) => ({ rows: [] })); const release = vi.fn();
  const database = createAccountWorkerDatabase({ connect: async () => ({ query, release }) });
  await database.query('select private.claim_account_deletion_job_v1($1,$2)', ['worker', 30000]);
  expect(query.mock.calls.map(([text]) => text)).toEqual(['begin', 'set local role account_worker', 'select private.claim_account_deletion_job_v1($1,$2)', 'commit']);
  expect(release).toHaveBeenCalledOnce();
});

it('claims at most one job and finalizes only after its Auth checkpoint', async () => {
  const store = { claim: vi.fn(async () => lease), checkpoint: vi.fn(async () => undefined), finalize: vi.fn(async () => undefined) };
  const auth = { deleteUser: vi.fn(async () => ({ error: null })) };
  await expect(runDeletionWorkerOnce('00000000-0000-4000-8000-000000000099', auth, store)).resolves.toBe(true);
  expect(store.finalize).toHaveBeenCalledWith(lease.jobId);
  expect(store.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(store.finalize.mock.invocationCallOrder[0]!);
  store.claim.mockResolvedValueOnce(null as never);
  await expect(runDeletionWorkerOnce('00000000-0000-4000-8000-000000000099', auth, store)).resolves.toBe(false);
});

it('uses only fenced DB projections to claim, checkpoint and finalize jobs', async () => {
  const query = vi.fn(async (text: string) => text.includes('claim_account') ? { rows: [{ value: lease }] } : { rows: [{ value: true }] });
  const store = createDeletionJobStore({ query });
  await expect(store.claim('00000000-0000-4000-8000-000000000099', 30_000)).resolves.toEqual(lease);
  await store.checkpoint({ jobId: lease.jobId, leaseToken: lease.leaseToken, leaseGeneration: 1 });
  await store.finalize(lease.jobId);
  expect(query.mock.calls.map(([text]) => text)).toEqual([
    expect.stringContaining('private.claim_account_deletion_job_v1'),
    expect.stringContaining('private.checkpoint_account_auth_deleted_v1'),
    expect.stringContaining('private.finalize_account_deletion_v1'),
  ]);
});

it('uses Supabase soft deletion only for an explicitly SOFT lease', async () => {
  const deleteUser = vi.fn(async () => ({ error: null }));
  await processDeletionLease({ ...lease, deletionMode: 'SOFT' }, { deleteUser }, { checkpoint: async () => undefined });
  expect(deleteUser).toHaveBeenCalledWith(lease.authSub, true);
});

it('treats an already missing Auth user as retry success but preserves other failures', async () => {
  const checkpoint = vi.fn(async () => undefined);
  await processDeletionLease(lease, { deleteUser: async () => ({ error: { code: 'user_not_found' } }) }, { checkpoint });
  expect(checkpoint).toHaveBeenCalledOnce();
  await expect(processDeletionLease(lease, { deleteUser: async () => ({ error: { code: 'provider_failure' } }) }, { checkpoint })).rejects.toThrow(/provider_failure/);
});
