import { normalizeFinalAnswer } from '../../../../../packages/contracts/src/answer-normalization';
import hintPolicy from '../../../../../config/hint-policy.v1.json' with { type: 'json' };

/**
 * The reveal budget is policy, not a screen constant.
 *
 * Two builds that disagree about how many units a find opens would produce ranked scores
 * that are not comparable, and the season row pins `hint_policy_hash` precisely so that
 * cannot happen quietly. Reading the numbers from the pinned file means the rule and the
 * hash can never drift apart.
 */
const FIND_REVEAL = hintPolicy.findReveal;
const SPELLING_TAIL = FIND_REVEAL.tracks.SPELLING.unresolvedTailUnits;
const INITIAL_PATTERN_TAIL = FIND_REVEAL.tracks.INITIAL_PATTERN.unresolvedTailUnits;
const UNITS_PER_FIND = FIND_REVEAL.unitsPerFind;
const UNITS_PER_FIND_RULE = FIND_REVEAL.unitsPerFindRule;

/**
 * How many answer units one find opens on this board.
 *
 * Under `FIXED` it is the policy floor. Under `SCALE_TO_COVER` it is whatever it takes for
 * a full clear to reach the answer's last openable unit — no more, because the tail must
 * stay masked, and no fewer, because otherwise a long answer on a small board can never be
 * more than part-filled however well the player plays.
 *
 * `differenceCount` of zero or less falls back to the floor: a board with nothing to find
 * cannot define a per-find rate.
 */
export function unitsPerFind(openableUnits: number, differenceCount: number): number {
  if (UNITS_PER_FIND_RULE !== 'SCALE_TO_COVER') return UNITS_PER_FIND;
  if (!Number.isFinite(differenceCount) || differenceCount <= 0) return UNITS_PER_FIND;
  if (!Number.isFinite(openableUnits) || openableUnits <= 0) return UNITS_PER_FIND;
  return Math.max(UNITS_PER_FIND, Math.ceil(openableUnits / differenceCount));
}

export type AnswerInputSurface = 'MULTIPLE_CHOICE' | 'FREE_TEXT' | 'PATTERN_ASSISTED';
export type LearningCategory = 'ENGLISH' | 'PROVERB' | 'IDIOM' | 'GENERAL_KNOWLEDGE';

export type AnswerSubmission = Readonly<{
  category: LearningCategory;
  surface: AnswerInputSurface;
  rawAnswer: string;
  expectedAnswer?: string;
}>;

export type AnswerResult = Readonly<{
  normalizedAnswer: string;
  correct: boolean | null;
  penaltyUnits: number;
}>;

const HANGUL_INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];

export function buildAnswerPattern(category: LearningCategory, answer: string): string {
  if (category === 'ENGLISH') {
    return [...answer.trim().toLowerCase()]
      .map((character, index) => character === ' ' ? ' ' : index === 0 ? character : '_')
      .join(' ')
      .replace(/\s{3,}/g, '  ');
  }

  return [...answer].map((character) => {
    if (character === ' ') return ' ';
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0xAC00 && codePoint <= 0xD7A3) {
      return HANGUL_INITIALS[Math.floor((codePoint - 0xAC00) / 588)] ?? '_';
    }
    return /[A-Za-z0-9]/.test(character) ? character[0]!.toLowerCase() : '_';
  }).join('');
}

function hangulInitial(character: string): string | null {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint >= 0xAC00 && codePoint <= 0xD7A3) {
    return HANGUL_INITIALS[Math.floor((codePoint - 0xAC00) / 588)] ?? '_';
  }
  return null;
}

/**
 * One rendered cell of the answer mask.
 *
 * The screen draws these as discrete slots rather than one run of underscores, so a slot
 * can be targeted individually — a found letter flies into its own box and that box alone
 * reacts. `space` marks a word gap, which is a gap in the layout and never a slot.
 */
export type AnswerUnit = Readonly<{ text: string; revealed: boolean; space: boolean }>;

/**
 * The answer mask after `revealedCount` finds, earned one unit at a time.
 *
 * At zero finds **nothing** is legible — handing over the whole initial pattern up front
 * would make the picture optional. Each difference the player spots opens exactly one more
 * unit, left to right, so the answer is paid for with observation:
 *
 *   * English — one letter per find.
 *   * Korean  — one initial per find; once every initial is showing, further finds upgrade
 *     initials into whole syllables, again left to right.
 *
 * The pattern never resolves to the complete answer: the final unit always stays masked
 * (English) or stays an initial (Korean). Something has to be inferred, otherwise a long
 * board would spell the answer out and the final challenge would be a formality. Spaces
 * are free and never consume a reveal.
 *
 * Both budgets come from `config/hint-policy.v1.json`, which the season row pins by hash.
 */
export function answerUnits(
  category: LearningCategory,
  answer: string,
  revealedCount: number,
  /**
   * Differences on the board this answer belongs to. Omitted, the rate falls back to the
   * policy floor, which is what every caller did before the rate could vary.
   */
  differenceCount = 0,
): readonly AnswerUnit[] {
  const finds = Math.max(0, Math.floor(revealedCount));

  if (category === 'ENGLISH') {
    const characters = [...answer.trim().toLowerCase()];
    const letters = characters.filter((character) => character !== ' ').length;
    const openable = Math.max(0, letters - SPELLING_TAIL);
    const opened = finds * unitsPerFind(openable, differenceCount);
    let budget = Math.min(opened, openable);
    return characters.map((character) => {
      if (character === ' ') return { text: ' ', revealed: false, space: true };
      if (budget > 0) { budget -= 1; return { text: character, revealed: true, space: false }; }
      return { text: '_', revealed: false, space: false };
    });
  }

  const characters = [...answer];
  const total = characters.filter((character) => character !== ' ').length;
  // Two stages, so a full clear has to buy every initial and then all but the tail again.
  const openable = total + Math.max(0, total - INITIAL_PATTERN_TAIL);
  const opened = finds * unitsPerFind(openable, differenceCount);
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
 * Index of the first slot that changes when the find count goes `from` → `to`, or null.
 *
 * This is what the flying letter aims at. Comparing rendered text rather than recomputing
 * budgets keeps it correct for both reveal stages: in stage 2 the slot that changes is
 * already showing an initial, so "first slot that differs" is the honest answer and
 * "first masked slot" would be wrong.
 *
 * Under `SCALE_TO_COVER` one find can open more than one slot. The letter flies to the
 * first of them and the rest simply appear — one travelling letter still teaches the rule
 * that finding buys letters, and two or three in flight at once would only obscure it.
 */
export function newlyOpenedUnitIndex(
  category: LearningCategory,
  answer: string,
  from: number,
  to: number,
  differenceCount = 0,
): number | null {
  if (to <= from) return null;
  const before = answerUnits(category, answer, from, differenceCount);
  const after = answerUnits(category, answer, to, differenceCount);
  for (let index = 0; index < after.length; index += 1) {
    if (before[index]?.text !== after[index]?.text) return index;
  }
  return null;
}

export function revealAnswerPattern(category: LearningCategory, answer: string, revealedCount: number): string {
  const units = answerUnits(category, answer, revealedCount);
  if (category !== 'ENGLISH') return units.map((unit) => unit.text).join('');
  return units.map((unit) => unit.text).join(' ').replace(/\s{3,}/g, '  ');
}

export function evaluatePreviewAnswer(submission: AnswerSubmission): AnswerResult {
  const normalizedAnswer = normalizeFinalAnswer(submission.rawAnswer);
  if (submission.surface === 'MULTIPLE_CHOICE' && !submission.expectedAnswer) {
    return { normalizedAnswer, correct: null, penaltyUnits: 0 };
  }
  const expected = submission.expectedAnswer === undefined ? undefined : normalizeFinalAnswer(submission.expectedAnswer);
  return {
    normalizedAnswer,
    correct: expected === undefined ? null : normalizedAnswer === expected,
    penaltyUnits: submission.surface === 'PATTERN_ASSISTED' ? 1 : 0,
  };
}
