import { expect, it, vi } from 'vitest';
import { createProfileStore, updateProfile } from './update-profile.js';

const identity = { authSub: '00000000-0000-4000-8000-000000000001', isAnonymous: false } as const;

it.each(['', '   '])('rejects an empty nickname %j before DB access', async (nickname) => {
  const update = vi.fn();
  await expect(updateProfile(identity, '00000000-0000-4000-8000-000000000010', { nickname }, { update })).rejects.toThrow(/VALIDATION_FAILED/);
  expect(update).not.toHaveBeenCalled();
});

it('leaves canonicalization to the DB-authoritative store', async () => {
  const update = vi.fn(async (_input: { authSub: string; idempotencyKey: string; nickname: string }) => ({ profile: { displayName: 'Touch Catch' }, points: 0 }));
  await expect(updateProfile(identity, '00000000-0000-4000-8000-000000000010', { nickname: '  Touch   Catch  ' }, { update })).resolves.toEqual({ profile: { displayName: 'Touch Catch' }, points: 0 });
  expect(update).toHaveBeenCalledWith({ authSub: identity.authSub, idempotencyKey: '00000000-0000-4000-8000-000000000010', nickname: '  Touch   Catch  ' });
});

it('forbids anonymous profile mutation', async () => {
  await expect(updateProfile({ ...identity, isAnonymous: true }, crypto.randomUUID(), { nickname: 'Player' }, { update: vi.fn() })).rejects.toThrow(/ANONYMOUS_FORBIDDEN/);
});

it('uses the DB-authoritative nickname projection instead of updating profiles directly', async () => {
  const query = vi.fn(async (_text: string, _values: readonly unknown[]) => ({ rows: [{ value: { profile: { displayName: 'Touch Catch' }, points: 3 } }] }));
  const store = createProfileStore({ query });
  await expect(store.update({ authSub: identity.authSub, idempotencyKey: crypto.randomUUID(), nickname: 'Touch Catch' })).resolves.toEqual({ profile: { displayName: 'Touch Catch' }, points: 3 });
  expect(query.mock.calls[0]?.[0]).toContain('private.update_profile_v1');
  expect(query.mock.calls[0]?.[0]).not.toMatch(/update\s+public\.profiles/iu);
});
