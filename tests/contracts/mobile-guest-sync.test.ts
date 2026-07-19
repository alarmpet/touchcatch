import { describe, expect, it, vi } from 'vitest';
import { createGuestProgressSync } from '../../apps/mobile/src/guest-content/sync.js';

it('posts the durable prepared batch after authentication and applies the response', async () => {
  const batch = { idempotencyKey: '00000000-0000-4000-8000-000000000020', body: { schemaVersion: '1', events: [] } } as const;
  const applyMergeResult = vi.fn(async () => undefined);
  const post = vi.fn(async () => ({ acceptedEventIds: [], rejected: [] }));
  const sync = createGuestProgressSync({ queue: { prepareMergeBatch: async () => batch, applyMergeResult }, getAccessToken: async () => 'opaque-token', post });
  await expect(sync()).resolves.toBe(true);
  expect(post).toHaveBeenCalledWith(batch, 'opaque-token');
  expect(applyMergeResult).toHaveBeenCalledWith({ acceptedEventIds: [], rejected: [] });
});
