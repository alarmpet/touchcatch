import { describe, it, expect } from 'vitest';
import { calculateLearningProgression, displayPetLevel } from './progression.js';

describe('learning progression module', () => {
  it('returns zero rewards when policy is DRAFT (fail-closed)', () => {
    const rewards = calculateLearningProgression({
      firstCompletion: true,
      allObjectivesCorrect: true,
      noHint: true,
      repeatPersonalBest: false,
      policyStatus: 'DRAFT',
    });

    expect(rewards).toEqual({ accountXp: 0, selectedPetXp: 0, drawPoints: 0 });
  });

  it('calculates rewards correctly when policy is APPROVED', () => {
    const rewards = calculateLearningProgression({
      firstCompletion: true,
      allObjectivesCorrect: true,
      noHint: true,
      repeatPersonalBest: false,
      policyStatus: 'APPROVED',
    });

    expect(rewards).toEqual({ accountXp: 50, selectedPetXp: 25, drawPoints: 10 });
  });

  it('displays pet level as Lv.N', () => {
    expect(displayPetLevel(27)).toBe('Lv.27');
  });
});
