import { describe, expect, it, vi } from 'vitest';
import { AccountClosedError } from '../auth/subject-resolver.js';
import { createDeleteMeHandler, createDeletionStatusHandler, createMeHandler } from './me-handler.js';

describe('authenticated account bootstrap handler', () => {
  it('derives the user from the bearer token and returns no private identity', async () => {
    const ensureAndResolve = vi.fn().mockResolvedValue('private-subject-must-not-leak');
    const handler = createMeHandler({
      verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
      subjectResolver: { ensureAndResolve },
    });
    const response = await handler(new Request('https://api.test/v1/me', { headers: { authorization: 'Bearer public-test-token' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accountReady: true });
    expect(ensureAndResolve).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001');
  });

  it('rejects query parameters before account bootstrap', async () => {
    const ensureAndResolve = vi.fn();
    const handler = createMeHandler({
      verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
      subjectResolver: { ensureAndResolve },
    });
    const response = await handler(new Request('https://api.test/v1/me?subjectKey=forbidden'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'INVALID_REQUEST' });
    expect(ensureAndResolve).not.toHaveBeenCalled();
  });

  it('fails closed on invalid authentication and bootstrap failure', async () => {
    const unauthorized = createMeHandler({
      verifier: { verify: async () => { throw new Error('UNAUTHORIZED'); } },
      subjectResolver: { ensureAndResolve: vi.fn() },
    });
    const unavailable = createMeHandler({
      verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
      subjectResolver: { ensureAndResolve: async () => { throw new Error('private database detail'); } },
    });
    expect((await unauthorized(new Request('https://api.test/v1/me'))).status).toBe(401);
    const response = await unavailable(new Request('https://api.test/v1/me'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'ACCOUNT_SETUP_FAILED' });
  });
});

describe('account deletion handlers', () => {
  const userId = '10000000-0000-4000-8000-000000000001';
  const secret = 'a'.repeat(64);
  const idempotencyKey = 'deletion-key-0000001';
  const accepted = { requestId: '20000000-0000-4000-8000-000000000002', state: 'ACCESS_BLOCKED' as const, replayed: false };
  const verifier = { verify: async () => ({ authenticatedUserId: userId }) };

  const deleteRequest = (body: unknown, key: string | null = idempotencyKey) => new Request('https://api.test/v1/me', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', ...(key === null ? {} : { 'idempotency-key': key }) },
    body: JSON.stringify(body),
  });

  it('accepts a deletion request with 202 and never echoes the receipt secret', async () => {
    const store = { request: vi.fn().mockResolvedValue(accepted), readStatus: vi.fn() };
    const handler = createDeleteMeHandler({ verifier, deletionStore: store });

    const response = await handler(deleteRequest({ receiptSecret: secret }));

    expect(response.status).toBe(202);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ requestId: accepted.requestId, state: 'ACCESS_BLOCKED' });
    expect(text).not.toContain(secret);
    expect(store.request).toHaveBeenCalledWith({ authenticatedUserId: userId, idempotencyKey, receiptSecret: secret });
  });

  it('rejects a missing or malformed idempotency key and receipt secret before touching the store', async () => {
    const store = { request: vi.fn(), readStatus: vi.fn() };
    const handler = createDeleteMeHandler({ verifier, deletionStore: store });

    expect((await handler(deleteRequest({ receiptSecret: secret }, null))).status).toBe(400);
    expect((await handler(deleteRequest({ receiptSecret: 'short' }))).status).toBe(400);
    expect((await handler(deleteRequest({}))).status).toBe(400);
    expect((await handler(deleteRequest([]))).status).toBe(400);
    expect(store.request).not.toHaveBeenCalled();
  });

  it('maps store failures to statuses a client can act on rather than a blanket 503', async () => {
    const cases: readonly [string, number][] = [
      ['DELETION_ALREADY_IN_PROGRESS', 409],
      ['IDEMPOTENCY_CONFLICT', 409],
      ['RECEIPT_EXPIRED', 410],
      ['ACCOUNT_CLOSED', 410],
      ['AUTH_SUBJECT_REQUIRED', 401],
      ['SOMETHING_UNMAPPED', 503],
    ];
    for (const [code, status] of cases) {
      const handler = createDeleteMeHandler({
        verifier,
        deletionStore: { request: async () => { throw new Error(code); }, readStatus: vi.fn() },
      });
      const response = await handler(deleteRequest({ receiptSecret: secret }));
      expect([code, response.status]).toEqual([code, status]);
    }
  });

  it('resolves a receipt without a session, because after AUTH_DELETED there is none', async () => {
    const status = {
      requestId: accepted.requestId, state: 'AUTH_DELETED' as const, retryable: false,
      stages: [{ name: 'AUTH' as const, outcome: 'COMPLETED' as const }],
      updatedAt: '2026-08-26T00:00:00Z', receiptExpiresAt: '2026-09-25T00:00:00Z',
    };
    const handler = createDeletionStatusHandler({
      deletionStore: { request: vi.fn(), readStatus: vi.fn().mockResolvedValue(status) },
    });

    const response = await handler(new Request('https://api.test/v1/me/deletion-status', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receiptSecret: secret }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(status);
  });

  it('reports a closed account as gone rather than as an outage', async () => {
    const handler = createMeHandler({
      verifier,
      subjectResolver: { ensureAndResolve: async () => { throw new AccountClosedError(); } },
    });

    const response = await handler(new Request('https://api.test/v1/me'));
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ code: 'ACCOUNT_CLOSED' });
  });
});
