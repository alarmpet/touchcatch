import { describe, expect, it } from 'vitest';
import {
  MIN_TAP_TOLERANCE,
  answerSkeleton,
  assistPatternForCategory,
  buildAnswerUnits,
  hangulInitial,
  newlyOpenedUnit,
  resolveTap,
  tapHits,
  type BoardObjective,
} from './learning-board.js';

const at = (cx: number, cy: number, r = 0.05): BoardObjective['hitboxes']['imageA'] => ({ cx, cy, r });
const objective = (id: string, cx: number, cy: number, r = 0.05): BoardObjective => ({
  objectiveId: id,
  hitboxes: { imageA: at(cx, cy, r), imageB: at(cx, cy, r) },
});

describe('tap geometry', () => {
  it('gives a small difference a finger-sized hit area', () => {
    // A 0.01-radius dot is far smaller than a fingertip; the floor is what makes it fair.
    expect(tapHits(at(0.5, 0.5, 0.01), 0.54, 0.5)).toBe(true);
    expect(tapHits(at(0.5, 0.5, 0.01), 0.5 + MIN_TAP_TOLERANCE + 0.001, 0.5)).toBe(false);
  });

  it('honours a large artwork radius rather than shrinking it to the floor', () => {
    expect(tapHits(at(0.5, 0.5, 0.2), 0.68, 0.5)).toBe(true);
  });

  it('resolves overlapping hitboxes to the nearest centre', () => {
    const board = [objective('near', 0.5, 0.5, 0.2), objective('far', 0.62, 0.5, 0.2)];
    const result = resolveTap(board, [], 'A', 0.52, 0.5);
    expect(result.outcome).toBe('HIT');
    expect(result.outcome !== 'MISS' && result.objective.objectiveId).toBe('near');
  });

  it('separates a miss from re-touching something already found', () => {
    const board = [objective('one', 0.2, 0.2)];
    expect(resolveTap(board, [], 'A', 0.9, 0.9).outcome).toBe('MISS');
    expect(resolveTap(board, [], 'A', 0.2, 0.2).outcome).toBe('HIT');
    expect(resolveTap(board, ['one'], 'A', 0.2, 0.2).outcome).toBe('DUPLICATE');
  });

  it('reads each side independently, so a difference can sit elsewhere on image B', () => {
    const shifted: BoardObjective = {
      objectiveId: 'shifted',
      hitboxes: { imageA: at(0.2, 0.2), imageB: at(0.8, 0.8) },
    };
    expect(resolveTap([shifted], [], 'A', 0.2, 0.2).outcome).toBe('HIT');
    expect(resolveTap([shifted], [], 'B', 0.2, 0.2).outcome).toBe('MISS');
    expect(resolveTap([shifted], [], 'B', 0.8, 0.8).outcome).toBe('HIT');
  });
});

describe('answer reveal', () => {
  it('shows nothing before the first find', () => {
    expect(buildAnswerUnits('SPELLING', 'cat', 0).every((unit) => !unit.revealed)).toBe(true);
  });

  it('never resolves the answer no matter how many finds arrive', () => {
    const units = buildAnswerUnits('SPELLING', 'cat', 999);
    expect(units.map((unit) => unit.text).join('')).toBe('ca_');

    const korean = buildAnswerUnits('INITIAL_PATTERN', '등잔 밑이 어둡다', 999);
    // Every syllable but the last resolves; the last stays an initial.
    expect(korean.at(-1)?.text).toBe(hangulInitial('다'));
  });

  it('opens Korean initials first and only then upgrades to syllables', () => {
    const answer = '등잔 밑이 어둡다';
    const syllables = [...answer].filter((character) => character !== ' ').length;
    expect(buildAnswerUnits('INITIAL_PATTERN', answer, 1).map((u) => u.text).join('')).toBe('ㄷ_ __ ___');
    const allInitials = buildAnswerUnits('INITIAL_PATTERN', answer, syllables);
    expect(allInitials.filter((unit) => unit.revealed && !unit.space)).toHaveLength(syllables);
    expect(buildAnswerUnits('INITIAL_PATTERN', answer, syllables + 1)[0]?.text).toBe('등');
  });

  it('reports the single slot a find opened, which is what the letter flight carries', () => {
    expect(newlyOpenedUnit('SPELLING', 'cat', 0, 1)).toEqual({ index: 0, text: 'c' });
    expect(newlyOpenedUnit('SPELLING', 'cat', 1, 2)).toEqual({ index: 1, text: 'a' });
    // The tail never opens, so a further find carries nothing.
    expect(newlyOpenedUnit('SPELLING', 'cat', 2, 3)).toBeNull();
    // Stage two upgrades a slot that is already showing an initial.
    expect(newlyOpenedUnit('INITIAL_PATTERN', '등잔', 2, 3)).toEqual({ index: 0, text: '등' });
  });

  it('gives a skeleton that carries length and gaps but no characters', () => {
    const skeleton = answerSkeleton('INITIAL_PATTERN', '등잔 밑이');
    expect(skeleton).toEqual({ unitCount: 5, spaceIndexes: [2] });
    expect(answerSkeleton('SPELLING', 'cat')).toEqual({ unitCount: 3, spaceIndexes: [] });
  });

  it('maps each ranked category to its assist track', () => {
    expect(assistPatternForCategory('ENGLISH')).toBe('SPELLING');
    expect(assistPatternForCategory('PROVERB')).toBe('INITIAL_PATTERN');
    expect(assistPatternForCategory('GENERAL_KNOWLEDGE')).toBe('NONE');
    expect(buildAnswerUnits('NONE', 'cat', 999).every((unit) => !unit.revealed)).toBe(true);
  });
});
