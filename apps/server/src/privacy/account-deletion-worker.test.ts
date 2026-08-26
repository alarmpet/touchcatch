import { describe, expect, it } from 'vitest';
import { PgRpcError } from '../database/pg-rpc.js';
import { AccountDeletionWorker, type WorkerLogEvent } from './account-deletion-worker.js';
import type { AuthAdminClient, AuthDeletionOutcome } from './supabase-auth-admin.js';
import type { PrivacyWorkerRpc, PrivacyWorkerRpcName } from './privacy-worker-rpc.js';

const approvedDisposition = JSON.stringify({
  approval: {
    status: 'APPROVED',
    approvedBy: 'operator',
    approvedAt: '2026-08-26T00:00:00Z',
    scope: 'closed-beta',
  },
  tables: [
    { table: 'private.economy_subjects', disposition: 'DELETE' },
    { table: 'private.account_deletion_requests', disposition: 'RETAIN' },
  ],
});

const proposedDisposition = JSON.stringify({
  approval: { status: 'PROPOSED', approvedBy: null, approvedAt: null, scope: null },
  tables: [{ table: 'private.economy_subjects', disposition: 'DELETE' }],
});

type Call = { name: PrivacyWorkerRpcName; args: readonly unknown[] };

function recordingRpc(responses: Partial<Record<PrivacyWorkerRpcName, unknown>>) {
  const calls: Call[] = [];
  const rpc: PrivacyWorkerRpc = {
    async call(name, args) {
      calls.push({ name, args });
      const response = responses[name];
      if (response instanceof Error) throw response;
      return response;
    },
  };
  return { rpc, calls };
}

function authAdmin(outcome: AuthDeletionOutcome): AuthAdminClient {
  return { deleteUser: async () => outcome };
}

function claimOf(state: string) {
  return {
    claimed: true,
    requestId: '11111111-1111-4111-8111-111111111111',
    subjectKey: '22222222-2222-4222-8222-222222222222',
    authenticatedUserId: '33333333-3333-4333-8333-333333333333',
    state,
    fence: 3,
    attempts: 1,
  };
}

function makeWorker(
  responses: Partial<Record<PrivacyWorkerRpcName, unknown>>,
  overrides: { disposition?: string; auth?: AuthDeletionOutcome } = {},
) {
  const { rpc, calls } = recordingRpc(responses);
  const logs: WorkerLogEvent[] = [];
  const worker = new AccountDeletionWorker({
    rpc,
    authAdmin: authAdmin(overrides.auth ?? { kind: 'COMPLETED' }),
    dispositionDocument: overrides.disposition ?? approvedDisposition,
    log: (event) => logs.push(event),
  });
  return { worker, calls, logs };
}

describe('account deletion worker', () => {
  it('refuses to run while no human has approved the disposition', async () => {
    const { worker, calls } = makeWorker({}, { disposition: proposedDisposition });
    expect(worker.refusal).toBe('DISPOSITION_NOT_APPROVED:PROPOSED');
    const result = await worker.tick();
    expect(result).toEqual({ kind: 'REFUSED', reason: 'DISPOSITION_NOT_APPROVED:PROPOSED' });
    // The important half: it did not claim, so it cannot have disposed of anything.
    expect(calls).toEqual([]);
  });

  it('says so on every tick rather than failing silently', async () => {
    const { worker, logs } = makeWorker({}, { disposition: proposedDisposition });
    await worker.tick();
    await worker.tick();
    expect(logs.filter((event) => event.event === 'worker.refused')).toHaveLength(2);
  });

  it('is idle when nothing is claimable', async () => {
    const { worker, calls } = makeWorker({ claim_account_deletion_v1: { claimed: false } });
    expect(await worker.tick()).toEqual({ kind: 'IDLE' });
    expect(calls.map((c) => c.name)).toEqual(['claim_account_deletion_v1']);
  });

  it('disposes app data first, under the claimed owner token and fence', async () => {
    const { worker, calls } = makeWorker({
      claim_account_deletion_v1: claimOf('ACCESS_BLOCKED'),
      dispose_account_app_data_v1: { alreadyDone: false, deletedRows: 12 },
    });
    const result = await worker.tick();
    expect(result).toEqual({
      kind: 'ADVANCED',
      requestId: '11111111-1111-4111-8111-111111111111',
      state: 'APP_DATA_DISPOSED',
    });

    const dispose = calls.find((c) => c.name === 'dispose_account_app_data_v1')!;
    const claimed = calls.find((c) => c.name === 'claim_account_deletion_v1')!;
    // Same token it was handed, and the fence from the claim -- not a fresh one.
    expect(dispose.args[1]).toBe(claimed.args[0]);
    expect(dispose.args[2]).toBe(3);
  });

  it('advances one stage per tick', async () => {
    const { worker, calls } = makeWorker({
      claim_account_deletion_v1: claimOf('ACCESS_BLOCKED'),
      dispose_account_app_data_v1: { alreadyDone: false, deletedRows: 1 },
    });
    await worker.tick();
    // Only the claim and the one stage. Nothing ran ahead to the auth delete.
    expect(calls.map((c) => c.name)).toEqual([
      'claim_account_deletion_v1',
      'dispose_account_app_data_v1',
    ]);
  });

  it('deletes the auth user and records the outcome', async () => {
    const { worker, calls } = makeWorker(
      { claim_account_deletion_v1: claimOf('PROVIDERS_REVOKED'), complete_deletion_stage_v1: {} },
      { auth: { kind: 'COMPLETED' } },
    );
    const result = await worker.tick();
    expect(result).toMatchObject({ kind: 'ADVANCED', state: 'AUTH_DELETED' });
    const stage = calls.find((c) => c.name === 'complete_deletion_stage_v1')!;
    expect(stage.args[3]).toBe('AUTH');
    expect(stage.args[4]).toBe('auth-user');
    expect(stage.args[5]).toBe('COMPLETED');
  });

  it('treats an already-absent auth user as done, not as an error', async () => {
    const { worker, calls } = makeWorker(
      { claim_account_deletion_v1: claimOf('PROVIDERS_REVOKED'), complete_deletion_stage_v1: {} },
      { auth: { kind: 'NOT_APPLICABLE', detail: 'USER_ALREADY_ABSENT' } },
    );
    expect(await worker.tick()).toMatchObject({ kind: 'ADVANCED', state: 'AUTH_DELETED' });
    expect(calls.find((c) => c.name === 'complete_deletion_stage_v1')!.args[5]).toBe('NOT_APPLICABLE');
  });

  it('hands an indeterminate auth delete to a person instead of retrying it', async () => {
    const { worker, calls } = makeWorker(
      { claim_account_deletion_v1: claimOf('PROVIDERS_REVOKED'), complete_deletion_stage_v1: {} },
      { auth: { kind: 'UNKNOWN_OUTCOME', detail: 'AUTH_ADMIN_503' } },
    );
    const result = await worker.tick();
    expect(result).toMatchObject({ kind: 'HANDED_OFF', reason: 'MANUAL_REVIEW' });
    const stage = calls.find((c) => c.name === 'complete_deletion_stage_v1')!;
    expect(stage.args[5]).toBe('UNKNOWN_OUTCOME');
    expect(stage.args[6]).toBe('AUTH_ADMIN_503');
  });

  it('stops touching a request whose lease it lost', async () => {
    const { worker, logs } = makeWorker({
      claim_account_deletion_v1: claimOf('ACCESS_BLOCKED'),
      dispose_account_app_data_v1: new PgRpcError('LEASE_LOST'),
    });
    const result = await worker.tick();
    expect(result).toMatchObject({ kind: 'HANDED_OFF', reason: 'LEASE_LOST' });
    expect(logs.some((event) => event.event === 'worker.lease-lost')).toBe(true);
  });

  it('lets a database outage propagate rather than recording a false outcome', async () => {
    const { worker } = makeWorker({
      claim_account_deletion_v1: claimOf('ACCESS_BLOCKED'),
      dispose_account_app_data_v1: new PgRpcError('DATABASE_UNAVAILABLE'),
    });
    await expect(worker.tick()).rejects.toThrow('DATABASE_UNAVAILABLE');
  });

  it('never logs anything that identifies the person', async () => {
    const { worker, logs } = makeWorker({
      claim_account_deletion_v1: claimOf('PROVIDERS_REVOKED'),
      complete_deletion_stage_v1: {},
    });
    await worker.tick();
    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain('33333333-3333-4333-8333-333333333333'); // auth user
    expect(serialised).not.toContain('22222222-2222-4222-8222-222222222222'); // subject key
    expect(serialised).toContain('11111111-1111-4111-8111-111111111111'); // request id is fine
  });

  it('completes through the notification stage', async () => {
    const { worker, calls } = makeWorker({
      claim_account_deletion_v1: claimOf('AUTH_DELETED'),
      complete_deletion_stage_v1: {},
    });
    expect(await worker.tick()).toMatchObject({ kind: 'ADVANCED', state: 'COMPLETED' });
    expect(calls.find((c) => c.name === 'complete_deletion_stage_v1')!.args[3]).toBe('NOTIFICATION');
  });
});
