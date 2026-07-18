import { describe, expect, it } from 'vitest';
import { analyticLegendaryEquivalent, simulatePetEconomy } from '../../tools/simulate-pet-economy.mjs';

describe('pet economy simulation', () => {
  it('pins the no-pity any-rarity material upper-bound formula', () => {
    expect(analyticLegendaryEquivalent()).toBeCloseTo(0.088, 12);
  });

  it('is byte-deterministic and keeps four versioned scenarios isolated', () => {
    const first = simulatePetEconomy({ seed: 20260715, draws: 2_000, users: 2_000 });
    const second = simulatePetEconomy({ seed: 20260715, draws: 2_000, users: 2_000 });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.scenarios.map((scenario) => scenario.id)).toEqual([
      'analytic-no-pity-any-rarity',
      'baseline-50-150-any-rarity',
      'candidate-50-150-same-pet',
      'candidate-10-150-same-pet',
    ]);
    expect(first.disclaimer).toMatch(/upper bound/i);
  });
});
