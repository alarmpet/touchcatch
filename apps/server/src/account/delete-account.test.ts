import { expect, it, vi } from 'vitest';
import { createAccountDeletionStore, requestAccountDeletion } from './delete-account.js';

const identity = { authSub: '00000000-0000-4000-8000-000000000001', isAnonymous: false } as const;

it('requests a durable deletion job under the configured HARD policy', async () => {
  const request = vi.fn(async (_input: { authSub: string; idempotencyKey: string }) => ({ jobId: '00000000-0000-4000-8000-000000000020', status: 'DELETING' as const, policyPending: false as const }));
  await expect(requestAccountDeletion(identity, '00000000-0000-4000-8000-000000000010', { request })).resolves.toEqual({ jobId: '00000000-0000-4000-8000-000000000020', status: 'DELETING', policyPending: false });
  expect(request).toHaveBeenCalledWith({ authSub: identity.authSub, idempotencyKey: '00000000-0000-4000-8000-000000000010' });
  expect(request.mock.calls[0]?.[0]).not.toHaveProperty('shouldSoftDelete');
});

it('forbids anonymous deletion requests', async () => {
  await expect(requestAccountDeletion({ ...identity, isAnonymous: true }, crypto.randomUUID(), { request: vi.fn() })).rejects.toThrow(/ANONYMOUS_FORBIDDEN/);
});

it('uses a DB-authoritative idempotent transition and opaque job projection', async () => {
  const query = vi.fn(async (_text: string, _values: readonly unknown[]) => ({ rows: [{ value: { jobId: '00000000-0000-4000-8000-000000000020', status: 'DELETING', policyPending: false } }] }));
  const store = createAccountDeletionStore({ query });
  await expect(store.request({ authSub: identity.authSub, idempotencyKey: crypto.randomUUID() })).resolves.toEqual({ jobId: '00000000-0000-4000-8000-000000000020', status: 'DELETING', policyPending: false });
  expect(query.mock.calls[0]?.[0]).toContain('private.request_account_deletion_v1');
});
