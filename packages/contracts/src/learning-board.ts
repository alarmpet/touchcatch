import { z } from 'zod';
import hintPolicy from '../../../config/hint-policy.v1.json' with { type: 'json' };

/**
 * The ranked board's authoritative rules: where a tap lands, and what a find opens.
 *
 * These live here rather than in the app or in SQL because both sides need the *same*
 * answer. The client draws an optimistic ring the instant a finger lands; the server then
 * decides whether that ring stays. If the two used different geometry the ring would
 * flicker on legitimate taps, which reads as a broken game rather than a strict one.
 *
 * SQL deliberately does none of this. Postgres validates that an objective exists and has
 * not already been claimed — integrity — while the geometry stays here where it can be
 * tested exhaustively.
 */

export const TAP_SIDES = ['A', 'B'] as const;
export type TapSide = (typeof TAP_SIDES)[number];

/**
 * Minimum tap radius as a fraction of the board's width.
 *
 * A difference can be drawn smaller than a fingertip. Without a floor the player would be
 * punished for aiming correctly at something the screen cannot render at finger size, so
 * the hit area is the larger of the artwork's radius and this.
 */
export const MIN_TAP_TOLERANCE = 0.06;

const circleSchema = z.object({
  cx: z.number().min(0).max(1),
  cy: z.number().min(0).max(1),
  r: z.number().gt(0).max(1),
}).strict();

export const boardObjectiveSchema = z.object({
  objectiveId: z.string().min(1).max(64),
  hitboxes: z.object({ imageA: circleSchema, imageB: circleSchema }).strict(),
}).strict();

export type BoardObjective = z.infer<typeof boardObjectiveSchema>;
export type Circle = z.infer<typeof circleSchema>;

export function tapHits(circle: Circle, x: number, y: number): boolean {
  const tolerance = Math.max(circle.r, MIN_TAP_TOLERANCE);
  return Math.hypot(x - circle.cx, y - circle.cy) <= tolerance;
}

export type TapOutcome =
  | Readonly<{ outcome: 'HIT'; objective: BoardObjective }>
  | Readonly<{ outcome: 'DUPLICATE'; objective: BoardObjective }>
  | Readonly<{ outcome: 'MISS' }>;

/**
 * Resolves one tap against the board.
 *
 * A tap on something already found is `DUPLICATE`, not `MISS`. Charging a wrong-tap penalty
 * for re-touching a difference the player already solved punishes memory rather than
 * accuracy, and it is the single most common accidental double-tap in play.
 *
 * Overlapping hitboxes resolve to the nearest centre, so a tap between two differences goes
 * to the one the player was more plausibly aiming at.
 */
export function resolveTap(
  objectives: readonly BoardObjective[],
  claimedObjectiveIds: readonly string[],
  side: TapSide,
  x: number,
  y: number,
): TapOutcome {
  const claimed = new Set(claimedObjectiveIds);
  let best: Readonly<{ objective: BoardObjective; distance: number }> | null = null;
  for (const objective of objectives) {
    const circle = side === 'A' ? objective.hitboxes.imageA : objective.hitboxes.imageB;
    if (!tapHits(circle, x, y)) continue;
    const distance = Math.hypot(x - circle.cx, y - circle.cy);
    if (best === null || distance < best.distance) best = { objective, distance };
  }
  if (best === null) return { outcome: 'MISS' };
  return claimed.has(best.objective.objectiveId)
    ? { outcome: 'DUPLICATE', objective: best.objective }
    : { outcome: 'HIT', objective: best.objective };
}

/* ------------------------------------------------------------------ reveal */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const HANGUL_INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];

const FIND_REVEAL = hintPolicy.findReveal;
export const UNITS_PER_FIND = FIND_REVEAL.unitsPerFind;
export const SPELLING_TAIL = FIND_REVEAL.tracks.SPELLING.unresolvedTailUnits;
export const INITIAL_PATTERN_TAIL = FIND_REVEAL.tracks.INITIAL_PATTERN.unresolvedTailUnits;

export type AssistPattern = 'SPELLING' | 'INITIAL_PATTERN' | 'NONE';

/** One rendered cell of the answer mask. A space is layout, never a slot. */
export type AnswerUnit = Readonly<{ text: string; revealed: boolean; space: boolean }>;

export function hangulInitial(character: string): string | null {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint < HANGUL_BASE || codePoint > HANGUL_LAST) return null;
  return HANGUL_INITIALS[Math.floor((codePoint - HANGUL_BASE) / 588)] ?? '_';
}

/**
 * The answer mask after `revealedCount` finds, earned one unit at a time.
 *
 * At zero finds nothing is legible: handing over the pattern up front would make the
 * picture optional. The mask never resolves fully — `unresolvedTailUnits` from the pinned
 * hint policy keeps the last unit masked (English) or stuck as an initial (Korean), so
 * clearing a whole board cannot spell the answer out and delete the final challenge.
 */
export function buildAnswerUnits(
  assist: AssistPattern,
  answer: string,
  revealedCount: number,
): readonly AnswerUnit[] {
  const opened = Math.max(0, Math.floor(revealedCount)) * UNITS_PER_FIND;

  if (assist === 'SPELLING' || assist === 'NONE') {
    const characters = [...answer.trim().toLowerCase()];
    const letters = characters.filter((character) => character !== ' ').length;
    let budget = assist === 'NONE' ? 0 : Math.min(opened, Math.max(0, letters - SPELLING_TAIL));
    return characters.map((character) => {
      if (character === ' ') return { text: ' ', revealed: false, space: true };
      if (budget > 0) { budget -= 1; return { text: character, revealed: true, space: false }; }
      return { text: '_', revealed: false, space: false };
    });
  }

  const characters = [...answer];
  const total = characters.filter((character) => character !== ' ').length;
  // Stage 1 spends finds on initials; stage 2 spends the surplus on whole syllables.
  let initialBudget = Math.min(opened, total);
  let syllableBudget = Math.min(Math.max(opened - total, 0), Math.max(0, total - INITIAL_PATTERN_TAIL));
  return characters.map((character) => {
    if (character === ' ') return { text: ' ', revealed: false, space: true };
    if (syllableBudget > 0) { syllableBudget -= 1; return { text: character, revealed: true, space: false }; }
    if (initialBudget > 0) {
      initialBudget -= 1;
      return { text: hangulInitial(character) ?? character.toLowerCase(), revealed: true, space: false };
    }
    return { text: '_', revealed: false, space: false };
  });
}

/**
 * Index of the single slot that changes when the find count goes `from` → `to`, or null.
 *
 * Comparing rendered text rather than recomputing budgets keeps this correct across both
 * reveal stages: in stage two the slot that changes is already showing an initial, so
 * "first slot that differs" is honest where "first masked slot" would be wrong.
 */
export function newlyOpenedUnit(
  assist: AssistPattern,
  answer: string,
  from: number,
  to: number,
): Readonly<{ index: number; text: string }> | null {
  if (to <= from) return null;
  const before = buildAnswerUnits(assist, answer, from);
  const after = buildAnswerUnits(assist, answer, to);
  for (let index = 0; index < after.length; index += 1) {
    const text = after[index]?.text;
    if (before[index]?.text !== text && text !== undefined) return { index, text };
  }
  return null;
}

/**
 * The empty slot skeleton the client may draw before earning anything.
 *
 * Unit count and word gaps are not answer material — they are hint ladder step three
 * (`ANSWER_LENGTH`), and the casual board already shows the boxes from the first second.
 * Shipping them lets the ranked board render its slots without ever holding the answer.
 */
export function answerSkeleton(assist: AssistPattern, answer: string): Readonly<{
  unitCount: number;
  spaceIndexes: readonly number[];
}> {
  const units = buildAnswerUnits(assist, answer, 0);
  return {
    unitCount: units.length,
    spaceIndexes: units.flatMap((unit, index) => unit.space ? [index] : []),
  };
}

export function assistPatternForCategory(category: string): AssistPattern {
  if (category === 'ENGLISH') return 'SPELLING';
  if (category === 'PROVERB' || category === 'IDIOM') return 'INITIAL_PATTERN';
  return 'NONE';
}
