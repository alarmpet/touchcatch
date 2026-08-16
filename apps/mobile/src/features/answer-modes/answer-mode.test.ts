import { describe, expect, it } from 'vitest';
import { unitsPerFind, answerUnits, buildAnswerPattern, evaluatePreviewAnswer, newlyOpenedUnitIndex, revealAnswerPattern } from './answer-mode';
import { parseHintPolicyV1 } from '../../../../../packages/contracts/src/learning-policy';
import hintPolicy from '../../../../../config/hint-policy.v1.json' with { type: 'json' };

describe('find-reveal budget is pinned policy, not a screen constant', () => {
  it('parses under the hint policy contract so the season hash covers the reveal rule', () => {
    const parsed = parseHintPolicyV1(hintPolicy);
    expect(parsed.findReveal.unitsPerFind).toBe(1);
    expect(parsed.findReveal.rankedPenaltyPerUnit).toBe(0);
    expect(parsed.findReveal.tracks.SPELLING.stages).toEqual(['GRAPHEME']);
    expect(parsed.findReveal.tracks.INITIAL_PATTERN.stages).toEqual(['INITIAL', 'SYLLABLE']);
  });

  it('lets a full clear reach the tail however few differences the board has', () => {
    // The shape that motivated SCALE_TO_COVER: en-cyberpunk-city is five differences against
    // a thirteen-letter answer. At a flat one unit per find a perfect board opened 42% of it.
    const tail = hintPolicy.findReveal.tracks.SPELLING.unresolvedTailUnits;
    const answer = 'cyberpunk city';
    const letters = [...answer].filter((character) => character !== ' ').length;

    const scaled = answerUnits('ENGLISH', answer, 5, 5);
    expect(scaled.filter((unit) => !unit.revealed && !unit.space)).toHaveLength(tail);

    // Without a difference count the rate falls back to the policy floor, which is what
    // every caller got before the rate could vary.
    const flat = answerUnits('ENGLISH', answer, 5);
    expect(flat.filter((unit) => unit.revealed)).toHaveLength(5);
    expect(letters - 5).toBeGreaterThan(tail);
  });

  it('never opens the tail early, at any board size', () => {
    const tail = hintPolicy.findReveal.tracks.SPELLING.unresolvedTailUnits;
    // Scaling up the rate must not let a single find spill past the tail on a tiny board.
    for (const differences of [1, 2, 3, 5, 8, 13, 40]) {
      for (const finds of [1, 2, differences, differences * 2]) {
        const units = answerUnits('ENGLISH', 'architecture', finds, differences);
        expect(units.filter((unit) => !unit.revealed && !unit.space).length).toBeGreaterThanOrEqual(tail);
      }
    }
  });

  it('derives the per-find rate from what the board has to cover', () => {
    // 11 openable units over 8 differences rounds up to 2; over 20 it floors at 1.
    expect(unitsPerFind(11, 8)).toBe(2);
    expect(unitsPerFind(11, 20)).toBe(1);
    expect(unitsPerFind(12, 5)).toBe(3);
    // A board with nothing to find cannot define a rate, so the floor stands.
    expect(unitsPerFind(11, 0)).toBe(1);
    expect(unitsPerFind(0, 8)).toBe(1);
  });

  it('leaves exactly the policy tail unresolved on a fully cleared board', () => {
    const tail = hintPolicy.findReveal.tracks.SPELLING.unresolvedTailUnits;
    // Far more finds than the word has letters: the tail must still hold.
    const units = answerUnits('ENGLISH', 'resilience', 999);
    expect(units.filter((unit) => !unit.revealed && !unit.space)).toHaveLength(tail);

    const korean = answerUnits('PROVERB', '백문이 불여일견', 999);
    // The tail syllable stays an initial rather than resolving to the answer.
    expect(korean.filter((unit) => !unit.space && unit.text.length === 1 && /[ㄱ-ㅎ]/u.test(unit.text)))
      .toHaveLength(hintPolicy.findReveal.tracks.INITIAL_PATTERN.unresolvedTailUnits);
  });

  it('never spells out a two-unit answer, which is the shortest case that could', () => {
    expect(revealAnswerPattern('ENGLISH', 'go', 999)).toBe('g _');
  });
});

describe('evaluatePreviewAnswer', () => {
  it('uses the shared normalizer for English spelling', () => {
    expect(evaluatePreviewAnswer({ category: 'ENGLISH', surface: 'FREE_TEXT', rawAnswer: '  RESILIENCE  ', expectedAnswer: 'resilience' })).toEqual({ normalizedAnswer: 'resilience', correct: true, penaltyUnits: 0 });
  });

  it('normalizes Korean proverb spacing', () => {
    expect(evaluatePreviewAnswer({ category: 'PROVERB', surface: 'FREE_TEXT', rawAnswer: '백문이   불여일견', expectedAnswer: '백문이 불여일견' }).correct).toBe(true);
  });

  it('does not perform client judging without an expected answer', () => {
    expect(evaluatePreviewAnswer({ category: 'IDIOM', surface: 'PATTERN_ASSISTED', rawAnswer: '전화위복' })).toEqual({ normalizedAnswer: '전화위복', correct: null, penaltyUnits: 1 });
  });

  it('builds spelling and Korean initial-pattern hints without exposing the answer', () => {
    expect(buildAnswerPattern('ENGLISH', 'resilience')).toBe('r _ _ _ _ _ _ _ _ _');
    expect(buildAnswerPattern('PROVERB', '백문이 불여일견')).toBe('ㅂㅁㅇ ㅂㅇㅇㄱ');
    expect(buildAnswerPattern('IDIOM', '전화위복')).toBe('ㅈㅎㅇㅂ');
  });
});

describe('progressive answer pattern', () => {
  it('shows nothing before the first find, then one letter per find', () => {
    // Handing over the pattern up front would make looking at the picture optional.
    expect(revealAnswerPattern('ENGLISH', 'resilience', 0)).toBe('_ _ _ _ _ _ _ _ _ _');
    expect(revealAnswerPattern('ENGLISH', 'resilience', 1)).toBe('r _ _ _ _ _ _ _ _ _');
    expect(revealAnswerPattern('ENGLISH', 'resilience', 2)).toBe('r e _ _ _ _ _ _ _ _');
  });

  it('opens one Korean initial per find and hides them all at zero', () => {
    expect(revealAnswerPattern('PROVERB', '백문이 불여일견', 0)).toBe('___ ____');
    expect(revealAnswerPattern('PROVERB', '백문이 불여일견', 2)).toBe('ㅂㅁ_ ____');
    // The full initial pattern is earned, not given: seven finds for seven syllables.
    expect(revealAnswerPattern('PROVERB', '백문이 불여일견', 7)).toBe(buildAnswerPattern('PROVERB', '백문이 불여일견'));
  });

  it('upgrades initials into whole syllables once every initial is showing', () => {
    expect(revealAnswerPattern('PROVERB', '백문이 불여일견', 8)).toBe('백ㅁㅇ ㅂㅇㅇㄱ');
    expect(revealAnswerPattern('PROVERB', '백문이 불여일견', 9)).toBe('백문ㅇ ㅂㅇㅇㄱ');
  });

  it('never resolves to the complete answer', () => {
    // The last unit always needs inferring, or the final challenge is a formality.
    expect(revealAnswerPattern('ENGLISH', 'resilience', 99)).toBe('r e s i l i e n c _');
    expect(revealAnswerPattern('PROVERB', '백문이 불여일견', 99)).toBe('백문이 불여일ㄱ');
  });

  it('never spends a reveal on a space', () => {
    expect(revealAnswerPattern('PROVERB', '백문이 불여일견', 3)).toBe('ㅂㅁㅇ ____');
    expect(revealAnswerPattern('PROVERB', '백문이 불여일견', 4)).toBe('ㅂㅁㅇ ㅂ___');
  });

  it('treats a negative or fractional count as no reveal', () => {
    expect(revealAnswerPattern('ENGLISH', 'resilience', -3)).toBe('_ _ _ _ _ _ _ _ _ _');
    expect(revealAnswerPattern('ENGLISH', 'resilience', 0.9)).toBe('_ _ _ _ _ _ _ _ _ _');
  });
});

describe('answer slots', () => {
  it('marks word gaps as spaces rather than slots', () => {
    const units = answerUnits('PROVERB', '백문이 불여일견', 1);
    expect(units).toHaveLength(8);
    expect(units[0]).toEqual({ text: 'ㅂ', revealed: true, space: false });
    expect(units[1]).toEqual({ text: '_', revealed: false, space: false });
    expect(units[3]).toEqual({ text: ' ', revealed: false, space: true });
    // The rendered string stays exactly what the pattern strip showed before slots existed.
    expect(units.map((unit) => unit.text).join('')).toBe(revealAnswerPattern('PROVERB', '백문이 불여일견', 1));
  });

  it('reports which single slot the next find opens', () => {
    expect(newlyOpenedUnitIndex('PROVERB', '백문이 불여일견', 0, 1)).toBe(0);
    expect(newlyOpenedUnitIndex('PROVERB', '백문이 불여일견', 2, 3)).toBe(2);
    // Index 3 is the space, so the fourth find must skip it and land on index 4.
    expect(newlyOpenedUnitIndex('PROVERB', '백문이 불여일견', 3, 4)).toBe(4);
  });

  it('aims at the upgrading slot once every initial is already showing', () => {
    // Stage 2 rewrites a slot that is not masked, so "first masked slot" would be wrong.
    expect(newlyOpenedUnitIndex('PROVERB', '백문이 불여일견', 7, 8)).toBe(0);
    expect(newlyOpenedUnitIndex('PROVERB', '백문이 불여일견', 8, 9)).toBe(1);
  });

  it('reports nothing when a find opens no slot', () => {
    expect(newlyOpenedUnitIndex('ENGLISH', 'resilience', 3, 3)).toBeNull();
    // The last unit never opens, so finds past the cap change nothing.
    expect(newlyOpenedUnitIndex('ENGLISH', 'resilience', 20, 21)).toBeNull();
  });
});
