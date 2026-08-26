import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AccountDeletionError,
  type AccountDeletionRpc,
  createAccountDeletionStore,
  hashReceiptSecret,
  isValidIdempotencyKey,
  isValidReceiptSecret,
  receiptHashEquals,
  RECEIPT_TTL_DAYS,
} from './account-deletion-store.js';

const secret = 'a'.repeat(64);
const idempotencyKey = 'deletion-key-0000001';
const userId = '10000000-0000-4000-8000-000000000001';

const acceptedRow = { requestId: '20000000-0000-4000-8000-000000000002', state: 'ACCESS_BLOCKED', replayed: false };
const statusRow = {
  requestId: '20000000-0000-4000-8000-000000000002',
  state: 'ACCESS_BLOCKED',
  retryable: false,
  stages: [
    { name: 'APP_DATA', outcome: 'PENDING' },
    { name: 'PROVIDERS', outcome: 'PENDING' },
    { name: 'AUTH', outcome: 'PENDING' },
    { name: 'NOTIFICATION', outcome: 'PENDING' },
  ],
  updatedAt: '2026-08-26T00:00:00Z',
  receiptExpiresAt: '2026-09-25T00:00:00Z',
};

// vi.fn cannot carry callParsed's generic through, so the mock is asserted into the port once
// here rather than at every call site.
function rpcReturning(value: unknown) {
  const callParsed = vi.fn((_name: string, _args: readonly unknown[], parse: (v: unknown) => unknown) => Promise.resolve(parse(value)));
  return { rpc: { callParsed } as unknown as AccountDeletionRpc, callParsed };
}

const rpcOf = (value: unknown): AccountDeletionRpc => rpcReturning(value).rpc;

describe('account deletion store', () => {
  // The whole point of hashing is that a database dump does not hand over the ability to read
  // other people's deletion status. If the secret reached the RPC arguments it would also reach
  // the query log, which is the same leak by another route.
  it('sends only the hash of the receipt secret', async () => {
    const rpc = rpcReturning(acceptedRow);
    const store = createAccountDeletionStore(rpc.rpc);

    await store.request({ authenticatedUserId: userId, idempotencyKey, receiptSecret: secret });

    const args = rpc.callParsed.mock.calls[0]![1] as readonly unknown[];
    expect(args).toEqual([userId, idempotencyKey, createHash('sha256').update(secret, 'utf8').digest('hex'), `${RECEIPT_TTL_DAYS} days`]);
    expect(JSON.stringify(args)).not.toContain(secret);
  });

  it('accepts a request and reports the durable request id', async () => {
    const store = createAccountDeletionStore(rpcOf(acceptedRow));

    await expect(store.request({ authenticatedUserId: userId, idempotencyKey, receiptSecret: secret }))
      .resolves.toEqual({ requestId: acceptedRow.requestId, state: 'ACCESS_BLOCKED', replayed: false });
  });

  // A retry over a flaky network must land on the request already open rather than be refused.
  it('reports a replayed request as a replay rather than a new one', async () => {
    const store = createAccountDeletionStore(rpcOf({ ...acceptedRow, replayed: true }));

    await expect(store.request({ authenticatedUserId: userId, idempotencyKey, receiptSecret: secret }))
      .resolves.toMatchObject({ replayed: true });
  });

  it('refuses a receipt secret or idempotency key that is not the agreed shape', async () => {
    const rpc = rpcReturning(acceptedRow);
    const store = createAccountDeletionStore(rpc.rpc);

    await expect(store.request({ authenticatedUserId: userId, idempotencyKey, receiptSecret: 'short' }))
      .rejects.toThrow(AccountDeletionError);
    await expect(store.request({ authenticatedUserId: userId, idempotencyKey: 'tiny', receiptSecret: secret }))
      .rejects.toThrow(AccountDeletionError);
    await expect(store.readStatus('not-hex')).rejects.toThrow(AccountDeletionError);
    expect(rpc.callParsed).not.toHaveBeenCalled();
  });

  it('reads a status with every stage named', async () => {
    const store = createAccountDeletionStore(rpcOf(statusRow));

    const status = await store.readStatus(secret);
    expect(status.stages.map((stage) => stage.name)).toEqual(['APP_DATA', 'PROVIDERS', 'AUTH', 'NOTIFICATION']);
    expect(status.state).toBe('ACCESS_BLOCKED');
  });

  // A row the server cannot vouch for must not be forwarded as if it were a real status. The
  // client uses `state` to tell someone their data is gone.
  it('refuses a status row with an unknown state or stage', async () => {
    await expect(createAccountDeletionStore(rpcOf({ ...statusRow, state: 'DEFINITELY_DONE' })).readStatus(secret))
      .rejects.toThrow(AccountDeletionError);
    await expect(createAccountDeletionStore(rpcOf({ ...statusRow, stages: [{ name: 'APP_DATA', outcome: 'MOSTLY' }] })).readStatus(secret))
      .rejects.toThrow(AccountDeletionError);
    await expect(createAccountDeletionStore(rpcOf({ ...acceptedRow, state: 'COMPLETED' })).request({ authenticatedUserId: userId, idempotencyKey, receiptSecret: secret }))
      .rejects.toThrow(AccountDeletionError);
  });

  it('validates shapes and compares hashes without leaking length', () => {
    expect(isValidReceiptSecret(secret)).toBe(true);
    expect(isValidReceiptSecret('A'.repeat(64))).toBe(false);
    expect(isValidIdempotencyKey(idempotencyKey)).toBe(true);
    expect(isValidIdempotencyKey('has spaces in it here')).toBe(false);
    expect(receiptHashEquals(hashReceiptSecret(secret), hashReceiptSecret(secret))).toBe(true);
    expect(receiptHashEquals(hashReceiptSecret(secret), hashReceiptSecret('b'.repeat(64)))).toBe(false);
    expect(receiptHashEquals('ab', 'abcd')).toBe(false);
  });
});
