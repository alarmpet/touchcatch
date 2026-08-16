import { describe, expect, it } from 'vitest';
import {
  DAILY_EPOCH_DATE,
  dailyPuzzleIndex,
  dailyPuzzleNumber,
  dailyStride,
  seoulDateString,
} from './daily-puzzle.js';

const at = (iso: string) => Date.parse(iso);

describe('daily puzzle date', () => {
  it('rolls over at Seoul midnight, not the device midnight', () => {
    // 14:59 UTC is still the 1st in Seoul; 15:00 UTC is the 2nd.
    expect(seoulDateString(at('2026-01-01T14:59:00Z'))).toBe('2026-01-01');
    expect(seoulDateString(at('2026-01-01T15:00:00Z'))).toBe('2026-01-02');
  });

  it('numbers the epoch day as #1', () => {
    expect(dailyPuzzleNumber(at(`${DAILY_EPOCH_DATE}T00:00:00Z`))).toBe(1);
    expect(dailyPuzzleNumber(at('2026-01-01T14:59:00Z'))).toBe(1);
    expect(dailyPuzzleNumber(at('2026-01-01T15:00:00Z'))).toBe(2);
    // 2026 is not a leap year: 13 Aug is day 225 of the year, so it is puzzle #225.
    expect(dailyPuzzleNumber(at('2026-08-13T03:00:00Z'))).toBe(225);
  });

  it('advances exactly one puzzle per day across a month boundary', () => {
    const jan31 = dailyPuzzleNumber(at('2026-01-31T05:00:00Z'));
    const feb01 = dailyPuzzleNumber(at('2026-02-01T05:00:00Z'));
    expect(feb01 - jan31).toBe(1);
  });
});

describe('daily puzzle selection', () => {
  it('gives everyone the same board on the same day', () => {
    const poolSize = 79;
    const morning = dailyPuzzleIndex(dailyPuzzleNumber(at('2026-08-13T00:10:00Z')), poolSize);
    const evening = dailyPuzzleIndex(dailyPuzzleNumber(at('2026-08-13T14:50:00Z')), poolSize);
    expect(morning).toBe(evening);
  });

  it('visits every entry before repeating any', () => {
    for (const poolSize of [3, 8, 10, 79, 100]) {
      const seen = new Set<number>();
      for (let day = 1; day <= poolSize; day += 1) seen.add(dailyPuzzleIndex(day, poolSize));
      // A stride sharing a factor with the pool would cycle early and starve most packs.
      expect(seen.size).toBe(poolSize);
    }
  });

  it('does not serve neighbouring entries on consecutive days', () => {
    // Walking in order would mean a week of one category, since the pool is grouped by it.
    const poolSize = 79;
    const gaps = [1, 2, 3, 4, 5].map((day) =>
      Math.abs(dailyPuzzleIndex(day + 1, poolSize) - dailyPuzzleIndex(day, poolSize)));
    expect(Math.min(...gaps)).toBeGreaterThan(1);
  });

  it('always lands inside the pool, even with a wrong device clock', () => {
    for (const day of [-500, -1, 0, 1, 99999]) {
      const index = dailyPuzzleIndex(day, 79);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(79);
    }
  });

  it('survives a degenerate pool', () => {
    expect(dailyStride(1)).toBe(1);
    expect(dailyPuzzleIndex(5, 1)).toBe(0);
    expect(dailyPuzzleIndex(5, 0)).toBe(0);
  });
});
