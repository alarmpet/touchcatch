import { expect, it, vi } from 'vitest';
import { createAppServerDatabase, createServerRuntime } from './runtime.js';

it('runs every application query in a transaction scoped to app_server', async () => {
  const query = vi.fn(async (text: string) => text === 'select $1::text as value' ? { rows: [{ value: 'ok' }] } : { rows: [] });
  const release = vi.fn();
  const database = createAppServerDatabase({ connect: async () => ({ query, release }) });

  await expect(database.query('select $1::text as value', ['ok'])).resolves.toEqual({ rows: [{ value: 'ok' }] });
  expect(query.mock.calls.map(([text]) => text)).toEqual([
    'begin',
    'set local role app_server',
    'select $1::text as value',
    'commit',
  ]);
  expect(release).toHaveBeenCalledOnce();
});

it('rolls back and releases the app_server transaction when a query fails', async () => {
  const failure = new Error('database unavailable');
  const query = vi.fn(async (text: string) => { if (text === 'select broken') throw failure; return { rows: [] }; });
  const release = vi.fn();
  const database = createAppServerDatabase({ connect: async () => ({ query, release }) });

  await expect(database.query('select broken', [])).rejects.toBe(failure);
  expect(query.mock.calls.map(([text]) => text)).toEqual(['begin', 'set local role app_server', 'select broken', 'rollback']);
  expect(release).toHaveBeenCalledOnce();
});

it('composes the live router with account and learning DB adapters', async () => {
  const query = vi.fn(async (text: string) => text.includes('ensure_account') ? { rows: [{ value: {} }] } : text.includes('merge_learning_progress') ? { rows: [{ value: { acceptedEventIds: [], rejected: [] } }] } : { rows: [{ value: { profile: { displayName: 'Player' }, points: 0 } }] });
  const router = createServerRuntime({ database: { query }, verifyAccessToken: async () => ({ authSub: '00000000-0000-4000-8000-000000000001', isAnonymous: false }) });
  const response = await router(new Request('https://api.test/v1/learning/progress/merge', { method: 'POST', headers: { authorization: 'Bearer valid-token', 'idempotency-key': '00000000-0000-4000-8000-000000000020', 'content-type': 'application/json' }, body: JSON.stringify({ schemaVersion: '1', events: [{ deviceEventId: '00000000-0000-4000-8000-000000000030', contentKey: 'public-sample-english', contentRevision: '1', completedAt: '2026-07-19T00:00:00Z' }] }) }));
  expect(response.status).toBe(200);
  expect(query.mock.calls.some(([text]) => text.includes('merge_learning_progress_v1'))).toBe(true);
});

it('composes profile mutation and deletion through DB projections', async () => {
  const query = vi.fn(async (text: string) => text.includes('request_account_deletion') ? { rows: [{ value: { jobId: '00000000-0000-4000-8000-000000000020', status: 'DELETING', policyPending: false } }] } : text.includes('update_profile') ? { rows: [{ value: { profile: { displayName: 'Touch Catch' }, points: 0 } }] } : { rows: [{ value: {} }] });
  const router = createServerRuntime({ database: { query }, verifyAccessToken: async () => ({ authSub: '00000000-0000-4000-8000-000000000001', isAnonymous: false }) });
  const headers = { authorization: 'Bearer valid-token', 'idempotency-key': '00000000-0000-4000-8000-000000000010' };
  expect((await router(new Request('https://api.test/v1/me', { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Touch Catch' }) }))).status).toBe(200);
  expect((await router(new Request('https://api.test/v1/me', { method: 'DELETE', headers }))).status).toBe(202);
  expect(query.mock.calls.some(([text]) => text.includes('update_profile_v1'))).toBe(true);
  expect(query.mock.calls.some(([text]) => text.includes('request_account_deletion_v1'))).toBe(true);
});
