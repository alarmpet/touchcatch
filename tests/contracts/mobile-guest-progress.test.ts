import { describe, expect, it } from 'vitest';
import { createGuestProgressQueue } from '../../apps/mobile/src/guest-content/progress.js';
import { publicGuestSamples } from '../../apps/mobile/src/guest-content/registry.js';
import { readFile } from 'node:fs/promises';

describe('production guest learning boundary', () => {
  it('contains only explicit public sample metadata and no solution-bearing fields', () => {
    expect(publicGuestSamples.length).toBeGreaterThan(0);
    expect(JSON.stringify(publicGuestSamples)).not.toMatch(/privateSolution|hitbox|canonicalAnswer|correctOptionId/i);
  });

  it('projects every authoritative guest manifest key into the DB migration', async () => {
    const migration = await readFile('supabase/migrations/202607190008_learning_progress.sql', 'utf8');
    for (const sample of publicGuestSamples) expect(migration).toContain(`'${sample.contentKey}','${sample.contentRevision}'`);
  });

  it('removes accepted receipts but preserves rejected reasons for retry decisions', async () => {
    const values = new Map<string, string>();
    const queue = createGuestProgressQueue({ getItem: async (k) => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); } });
    const first = await queue.record({ contentKey: 'public-sample-english', contentRevision: '1', completedAt: '2026-07-19T00:00:00Z' });
    const second = await queue.record({ contentKey: 'unknown', contentRevision: '1', completedAt: '2026-07-19T00:00:01Z' });
    await queue.applyMergeResult({ acceptedEventIds: [first.deviceEventId], rejected: [{ deviceEventId: second.deviceEventId, code: 'UNKNOWN_CONTENT' }] });
    await expect(queue.pending()).resolves.toEqual([{ ...second, rejectionCode: 'UNKNOWN_CONTENT' }]);
  });

  it('reuses one durable idempotency key until the prepared batch is resolved', async () => {
    const values = new Map<string, string>(); let sequence = 0;
    const queue = createGuestProgressQueue({ getItem: async (k) => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); } }, () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
    await queue.record({ contentKey: 'public-sample-english', contentRevision: '1', completedAt: '2026-07-19T00:00:00Z' });
    const first = await queue.prepareMergeBatch();
    const replay = await queue.prepareMergeBatch();
    expect(replay).toEqual(first);
    expect(first.idempotencyKey).toMatch(/-4[0-9]{3}-8[0-9]{3}-/);
  });

  it('serializes concurrent receipt writes without losing either completion', async () => {
    const values = new Map<string, string>(); let sequence = 0;
    const queue = createGuestProgressQueue({ getItem: async (k) => values.get(k) ?? null, setItem: async (k, v) => { await Promise.resolve(); values.set(k, v); } }, () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
    await Promise.all([queue.record({ contentKey: 'a', contentRevision: '1', completedAt: '2026-07-19T00:00:00Z' }), queue.record({ contentKey: 'b', contentRevision: '1', completedAt: '2026-07-19T00:00:01Z' })]);
    expect(await queue.pending()).toHaveLength(2);
  });
});
