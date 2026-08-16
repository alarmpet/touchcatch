/**
 * The one puzzle everybody plays today.
 *
 * A share card is only worth sending if the person receiving it solved the same board, so
 * the daily puzzle has to be identical for every player without asking a server which one
 * it is. Both properties come from deriving the choice from the calendar date alone.
 */

/**
 * Korea has observed no daylight saving since 1988, so the Seoul calendar date is exactly
 * UTC+9 — no timezone database, no `Intl`, no Hermes locale surprises. The day must roll
 * over here at the same instant it does for the daily pet claim, which the database pins
 * to `Asia/Seoul`; a device-local midnight would put a traveller on a different puzzle
 * from their own pet streak.
 */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Puzzle #1. Fixed forever: moving it renumbers every card ever shared. */
export const DAILY_EPOCH_DATE = '2026-01-01';

export function seoulDateString(nowMs: number): string {
  return new Date(nowMs + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** 1-based, so the first day reads as "#1" rather than "#0". */
export function dailyPuzzleNumber(nowMs: number): number {
  const today = Date.parse(`${seoulDateString(nowMs)}T00:00:00Z`);
  const epoch = Date.parse(`${DAILY_EPOCH_DATE}T00:00:00Z`);
  return Math.floor((today - epoch) / DAY_MS) + 1;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/**
 * Step size between consecutive days.
 *
 * Walking the pool in order would serve every English pack, then every proverb, then every
 * idiom — a week of the same category is worse variety than no ordering at all. A stride
 * coprime with the pool size jumps around while still visiting each entry exactly once
 * before any repeat, which is the property a small pool needs most.
 */
export function dailyStride(poolSize: number): number {
  if (poolSize <= 2) return 1;
  const start = Math.max(2, Math.floor(poolSize * 0.382));
  for (let stride = start; stride < poolSize; stride += 1) {
    if (greatestCommonDivisor(stride, poolSize) === 1) return stride;
  }
  return 1;
}

export function dailyPuzzleIndex(puzzleNumber: number, poolSize: number): number {
  if (poolSize <= 0) return 0;
  const offset = (puzzleNumber - 1) * dailyStride(poolSize);
  // Negative puzzle numbers are possible on a device with a badly wrong clock.
  return ((offset % poolSize) + poolSize) % poolSize;
}
