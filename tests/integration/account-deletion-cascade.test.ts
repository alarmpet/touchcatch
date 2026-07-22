import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Pool, type PoolClient, type QueryResult } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDeletionAuthAdmin, processDeletionLease, type DeletionLease } from '../../apps/account-worker/src/runtime.js';
import { loadHealthyLocalSupabaseStatus, type LocalSupabaseStatus } from '../support/local-supabase-status.js';

const TIMEOUT_MS = 10_000;

async function asRole(client: PoolClient, role: 'app_server' | 'account_worker', text: string, values: readonly unknown[] = []): Promise<QueryResult<Record<string, unknown>>> {
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    const result = await client.query<Record<string, unknown>>(text, [...values]);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

describe.sequential('actual local Supabase hard account deletion', () => {
  let status: LocalSupabaseStatus;
  let database: Pool;
  let authSub = '';
  let email = '';
  let ownedSubjectKey = '';

  beforeAll(async () => {
    status = await loadHealthyLocalSupabaseStatus();
    database = new Pool({ connectionString: status.dbUrl, connectionTimeoutMillis: TIMEOUT_MS, query_timeout: TIMEOUT_MS, max: 4 });
    email = `deletion-${Date.now()}-${randomBytes(8).toString('hex')}@example.test`;
    const admin = createClient(status.apiUrl, status.cleanupKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password: `${randomBytes(24).toString('base64url')}aA1!`, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('LOCAL_AUTH_USER_CREATE_FAILED');
    authSub = created.data.user.id;
  });

  afterAll(async () => {
    const failures: string[] = [];
    if (status && authSub) {
      try { await database.query('grant account_security_owner to postgres'); } catch { failures.push('owner-grant'); }
      if (ownedSubjectKey) {
        try { await database.query('delete from private.account_deletion_jobs where subject_key=$1', [ownedSubjectKey]); } catch { failures.push('job'); }
      }
      let authRemains = true;
      try { authRemains = (await database.query('select exists(select 1 from auth.users where id=$1) value', [authSub])).rows[0]?.value === true; }
      catch { failures.push('auth-postcondition'); }
      if (authRemains) {
        const admin = createClient(status.apiUrl, status.cleanupKey, { auth: { autoRefreshToken: false, persistSession: false } });
        try { if ((await admin.auth.admin.deleteUser(authSub)).error) failures.push('auth-user'); } catch { failures.push('auth-user'); }
      }
      try { await database.query('revoke account_security_owner from postgres'); } catch { failures.push('owner-revoke'); }
    }
    try { await database?.end(); } catch { failures.push('database'); }
    if (failures.length > 0) throw new Error('LOCAL_AUTH_CLEANUP_FAILED');
  });

  it('cascades owned data and resumes after an Auth-delete checkpoint crash', async () => {
    const app = await database.connect();
    let subjectKey = '';
    let economySubjectKey = '';
    const idempotencyKey = randomUUID();
    try {
      const account = await asRole(app, 'app_server', 'select private.ensure_account_v1($1) value', [authSub]);
      const value = account.rows[0]?.value as { apiSubjectKey: string; economySubjectKey: string };
      subjectKey = value.apiSubjectKey;
      ownedSubjectKey = subjectKey;
      economySubjectKey = value.economySubjectKey;
      const deviceEventId = randomUUID();
      await asRole(app, 'app_server', 'select private.merge_learning_progress_v1($1,$2,$3,$4) value', [
        authSub,
        randomUUID(),
        'a'.repeat(64),
        JSON.stringify([{ deviceEventId, contentKey: 'public-sample-english', contentRevision: '1', completedAt: '2026-07-22T00:00:00Z' }]),
      ]);
      const first = await asRole(app, 'app_server', 'select private.request_account_deletion_v1($1,$2) value', [authSub, idempotencyKey]);
      const replay = await asRole(app, 'app_server', 'select private.request_account_deletion_v1($1,$2) value', [authSub, idempotencyKey]);
      expect(first.rows[0]?.value).toEqual(replay.rows[0]?.value);
      expect(first.rows[0]?.value).toEqual(expect.objectContaining({ status: 'DELETING', policyPending: false }));
    } finally { app.release(); }

    const beforeDelete = await database.query(
      `select
        exists(select 1 from auth.users where id=$1) auth_user,
        exists(select 1 from public.profiles where id=$1) profile,
        exists(select 1 from private.api_subjects where subject_key=$2) api_subject,
        exists(select 1 from private.learning_progress_events where subject_key=$2) learning_event,
        exists(select 1 from private.learning_progress_batches where subject_key=$2) learning_batch,
        (select user_id from private.economy_subjects where subject_key=$3) economy_user`,
      [authSub, subjectKey, economySubjectKey],
    );
    expect(beforeDelete.rows[0]).toEqual({
      auth_user: true,
      profile: true,
      api_subject: true,
      learning_event: true,
      learning_batch: true,
      economy_user: authSub,
    });

    const worker = await database.connect();
    let firstLease: DeletionLease;
    try {
      const claimed = await asRole(worker, 'account_worker', 'select private.claim_account_deletion_job_v1($1,$2) value', [randomUUID(), 1_000]);
      firstLease = claimed.rows[0]?.value as DeletionLease;
    } finally { worker.release(); }
    expect(firstLease).toEqual(expect.objectContaining({ authSub, deletionMode: 'HARD', leaseGeneration: 1 }));

    const admin = createClient(status.apiUrl, status.cleanupKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const deleted = await admin.auth.admin.deleteUser(authSub);
    if (deleted.error) throw new Error('LOCAL_AUTH_HARD_DELETE_FAILED');

    const afterAuthDelete = await database.query(
      `select
        exists(select 1 from auth.users where id=$1) auth_user,
        exists(select 1 from public.profiles where id=$1) profile,
        exists(select 1 from private.api_subjects where subject_key=$2) api_subject,
        exists(select 1 from private.learning_progress_events where subject_key=$2) learning_event,
        exists(select 1 from private.learning_progress_batches where subject_key=$2) learning_batch,
        (select user_id from private.economy_subjects where subject_key=$3) economy_user,
        (select status from private.account_deletion_jobs where job_id=$4) job_status,
        (select auth_sub from private.account_deletion_jobs where job_id=$4) retained_auth_sub`,
      [authSub, subjectKey, economySubjectKey, firstLease.jobId],
    );
    expect(afterAuthDelete.rows[0]).toEqual({
      auth_user: false,
      profile: false,
      api_subject: false,
      learning_event: false,
      learning_batch: false,
      economy_user: null,
      job_status: 'LEASED',
      retained_auth_sub: authSub,
    });

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_100));
    const retryWorker = await database.connect();
    let retryLease: DeletionLease;
    try {
      const claimed = await asRole(retryWorker, 'account_worker', 'select private.claim_account_deletion_job_v1($1,$2) value', [randomUUID(), 30_000]);
      retryLease = claimed.rows[0]?.value as DeletionLease;
      await processDeletionLease(
        retryLease,
        createDeletionAuthAdmin(admin.auth.admin),
        { checkpoint: async (input) => {
          const result = await asRole(retryWorker, 'account_worker', 'select private.checkpoint_account_auth_deleted_v1($1,$2,$3) value', [input.jobId, input.leaseToken, input.leaseGeneration]);
          if (result.rows[0]?.value !== true) throw new Error('DELETION_FENCE_REJECTED');
        } },
      );
      const finalized = await asRole(retryWorker, 'account_worker', 'select private.finalize_account_deletion_v1($1) value', [retryLease.jobId]);
      expect(finalized.rows[0]?.value).toBe(true);
    } finally { retryWorker.release(); }

    expect(retryLease.leaseGeneration).toBe(2);
    await expect(database.query('select status,auth_sub from private.account_deletion_jobs where job_id=$1', [retryLease.jobId]))
      .resolves.toMatchObject({ rows: [{ status: 'COMPLETE', auth_sub: null }] });
  }, 30_000);
});
