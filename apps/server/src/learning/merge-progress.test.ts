import { describe, expect, it, vi } from 'vitest';
import { createLearningProgressStore, mergeLearningProgress } from './merge-progress.js';

const identity = { authSub: '00000000-0000-4000-8000-000000000001', isAnonymous: false };
const event = { deviceEventId: '00000000-0000-4000-8000-000000000010', contentKey: 'public-sample-english', contentRevision: '1', completedAt: '2026-07-19T00:00:00Z' };

describe('learning progress merge', () => {
  it('passes only a validated non-economic batch to the authoritative store', async () => {
    const merge = vi.fn(async () => ({ acceptedEventIds: [event.deviceEventId], rejected: [] }));
    const result = await mergeLearningProgress(identity, '00000000-0000-4000-8000-000000000020', { schemaVersion: '1', events: [event] }, { merge });
    expect(result).toEqual({ acceptedEventIds: [event.deviceEventId], rejected: [] });
    expect(merge).toHaveBeenCalledWith(expect.objectContaining({ authSub: identity.authSub, idempotencyKey: expect.any(String), requestHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });

  it('rejects anonymous, economic fields, and duplicate device event ids before storage', async () => {
    const store = { merge: vi.fn() };
    await expect(mergeLearningProgress({ ...identity, isAnonymous: true }, crypto.randomUUID(), { schemaVersion: '1', events: [event] }, store)).rejects.toThrow(/anonymous/i);
    await expect(mergeLearningProgress(identity, crypto.randomUUID(), { schemaVersion: '1', events: [{ ...event, points: 100 }] }, store)).rejects.toThrow(/invalid/i);
    await expect(mergeLearningProgress(identity, crypto.randomUUID(), { schemaVersion: '1', events: [event, event] }, store)).rejects.toThrow(/duplicate/i);
    expect(store.merge).not.toHaveBeenCalled();
  });
});

it('calls only the allowlisted database projection', async () => {
  const query = vi.fn(async (_text: string, _values: readonly unknown[]) => ({ rows: [{ value: { acceptedEventIds: [], rejected: [] } }] }));
  const store = createLearningProgressStore({ query });
  await expect(store.merge({ authSub: identity.authSub, idempotencyKey: crypto.randomUUID(), requestHash: 'a'.repeat(64), events: [event] })).resolves.toEqual({ acceptedEventIds: [], rejected: [] });
  expect(query.mock.calls[0]?.[0]).toMatch(/private\.merge_learning_progress_v1/);
});
