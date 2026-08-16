import { beforeEach, describe, expect, it } from 'vitest';
import {
  ghostFindCountBy,
  ghostRevealedIds,
  ghostStanding,
  isBetterRun,
  sealGhostRun,
  type GhostRun,
} from './ghost-model.js';
import { readGhostRun, saveGhostRunIfBetter } from './ghost-store.js';

const run: GhostRun = {
  contentKey: 'board',
  finds: [{ id: 'a', atMs: 2000 }, { id: 'b', atMs: 5000 }, { id: 'c', atMs: 9000 }],
  solved: true,
  score: 120,
};

describe('ghost playback', () => {
  it('reveals each find only once the ghost had reached it', () => {
    expect(ghostFindCountBy(run, 0)).toBe(0);
    expect(ghostFindCountBy(run, 2000)).toBe(1);
    expect(ghostFindCountBy(run, 4999)).toBe(1);
    expect(ghostFindCountBy(run, 9000)).toBe(3);
    expect(ghostRevealedIds(run, 5000)).toEqual(['a', 'b']);
  });

  it('has nothing to show without a stored run', () => {
    expect(ghostFindCountBy(null, 99999)).toBe(0);
    expect(ghostRevealedIds(null, 99999)).toEqual([]);
  });

  it('reports the standing the player is actually in', () => {
    expect(ghostStanding(3, 2)).toBe('AHEAD');
    expect(ghostStanding(2, 2)).toBe('LEVEL');
    expect(ghostStanding(1, 2)).toBe('BEHIND');
  });

  it('orders a recorded run by time regardless of insertion order', () => {
    const messy = sealGhostRun({ ...run, finds: [{ id: 'c', atMs: 9000 }, { id: 'a', atMs: 2000 }] });
    expect(messy.finds.map((find) => find.id)).toEqual(['a', 'c']);
  });
});

describe('personal best selection', () => {
  it('keeps the higher score', () => {
    expect(isBetterRun({ ...run, score: 130 }, run)).toBe(true);
    expect(isBetterRun({ ...run, score: 110 }, run)).toBe(false);
  });

  it('breaks a tie on finish time', () => {
    const faster = { ...run, finds: [{ id: 'a', atMs: 1000 }] };
    expect(isBetterRun(faster, run)).toBe(true);
    expect(isBetterRun(run, faster)).toBe(false);
  });

  it('never lets an abandoned run erase a solved one', () => {
    // Otherwise quitting a board would quietly wipe a real personal best.
    expect(isBetterRun({ ...run, solved: false, score: 9999 }, run)).toBe(false);
    expect(isBetterRun(run, { ...run, solved: false, score: 9999 })).toBe(true);
  });

  it('accepts any first run', () => {
    expect(isBetterRun(run, null)).toBe(true);
  });
});

describe('ghost store', () => {
  beforeEach(() => {
    const memory = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
  });

  it('round-trips a run and only replaces it with a better one', () => {
    expect(saveGhostRunIfBetter(run)).toEqual(run);
    expect(readGhostRun('board')).toEqual(run);

    const worse = { ...run, score: 10 };
    expect(saveGhostRunIfBetter(worse)?.score).toBe(120);
    expect(readGhostRun('board')?.score).toBe(120);

    const better = { ...run, score: 200 };
    expect(saveGhostRunIfBetter(better)?.score).toBe(200);
  });

  it('keeps a separate best per board', () => {
    saveGhostRunIfBetter(run);
    expect(readGhostRun('other-board')).toBeNull();
  });

  it('discards a malformed run instead of racing against junk', () => {
    const store = (globalThis as { localStorage: Storage }).localStorage;
    store.setItem('touchcatch.ghost.v1:bad', JSON.stringify({ finds: [{ id: 'a' }], solved: true, score: 1 }));
    expect(readGhostRun('bad')).toBeNull();

    store.setItem('touchcatch.ghost.v1:bad2', 'not json');
    expect(readGhostRun('bad2')).toBeNull();
  });

  it('degrades to no ghost rather than throwing', () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    expect(readGhostRun('board')).toBeNull();
    expect(() => saveGhostRunIfBetter(run)).not.toThrow();
  });
});
