import { beforeEach, describe, expect, it } from 'vitest';
import { nextCoachStep, type CoachInput, type CoachStep } from './coach-model.js';
import { readSeenCoachSteps, writeSeenCoachSteps } from './coach-store.js';

const base: CoachInput = {
  phase: 'FIND',
  claimedCount: 0,
  finalUnlocked: false,
  missionActive: false,
  seen: [],
};

describe('coach model', () => {
  it('opens by naming the one action the player has to take', () => {
    expect(nextCoachStep(base)).toBe('FIND');
  });

  it('explains the letter only once a letter has actually been earned', () => {
    expect(nextCoachStep({ ...base, seen: ['FIND'] })).toBeNull();
    expect(nextCoachStep({ ...base, claimedCount: 1, seen: ['FIND'] })).toBe('LETTER');
  });

  it('mentions early answering after the letter, never before', () => {
    // Being told you may answer early is meaningless before you have seen a letter arrive.
    expect(nextCoachStep({ ...base, claimedCount: 1, finalUnlocked: true, seen: ['FIND'] })).toBe('LETTER');
    expect(nextCoachStep({ ...base, claimedCount: 1, finalUnlocked: true, seen: ['FIND', 'LETTER'] })).toBe('EARLY_ANSWER');
  });

  it('stays quiet once every note has been seen', () => {
    const seen: CoachStep[] = ['FIND', 'LETTER', 'EARLY_ANSWER'];
    expect(nextCoachStep({ ...base, claimedCount: 3, finalUnlocked: true, seen })).toBeNull();
  });

  it('yields the screen to a running word hunt', () => {
    // The hunt is on a timer; a second prompt would compete for the same glance.
    expect(nextCoachStep({ ...base, missionActive: true })).toBeNull();
  });

  it('says nothing outside the find phase', () => {
    expect(nextCoachStep({ ...base, phase: 'QUIZ' })).toBeNull();
    expect(nextCoachStep({ ...base, phase: 'COMPLETE' })).toBeNull();
  });
});

describe('coach store', () => {
  beforeEach(() => {
    const memory = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
  });

  it('round-trips the seen list and de-duplicates it', () => {
    writeSeenCoachSteps(['FIND', 'LETTER', 'FIND']);
    expect(readSeenCoachSteps()).toEqual(['FIND', 'LETTER']);
  });

  it('drops entries it does not recognise', () => {
    (globalThis as { localStorage: Storage }).localStorage
      .setItem('touchcatch.coach.seen.v1', JSON.stringify(['FIND', 'NONSENSE', 42]));
    // A hand-edited or stale entry must not suppress a note that was never shown.
    expect(readSeenCoachSteps()).toEqual(['FIND']);
  });

  it('degrades to no memory rather than throwing', () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    expect(readSeenCoachSteps()).toEqual([]);
    expect(() => writeSeenCoachSteps(['FIND'])).not.toThrow();

    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => 'not json at all',
      setItem: () => { throw new Error('storage full'); },
    };
    expect(readSeenCoachSteps()).toEqual([]);
    expect(() => writeSeenCoachSteps(['FIND'])).not.toThrow();
  });
});
