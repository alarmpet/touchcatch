import { describe, expect, it } from 'vitest';
import { validateChallengeGeometry } from './learning-geometry.js';

describe('learning challenge geometry', () => {
  const difference = { id: 'difference_1', cx: 0.25, cy: 0.25, r: 0.05 };

  it('rejects a word-hunt or sudden-death circle that overlaps a difference', () => {
    expect(() => validateChallengeGeometry({
      differences: [difference],
      wordHunts: [{ id: 'word_1', cx: 0.25, cy: 0.25, r: 0.05 }],
      suddenDeath: { id: 'sudden_1', cx: 0.8, cy: 0.8, r: 0.05 },
    })).toThrow('CHALLENGE_OVERLAPS_DIFFERENCE:word_1:difference_1');
  });

  it('accepts semantically reviewed circles with positive separation', () => {
    expect(validateChallengeGeometry({
      differences: [difference],
      wordHunts: [{ id: 'word_1', cx: 0.6, cy: 0.25, r: 0.05 }],
      suddenDeath: { id: 'sudden_1', cx: 0.8, cy: 0.8, r: 0.05 },
    })).toBe(true);
  });
});
