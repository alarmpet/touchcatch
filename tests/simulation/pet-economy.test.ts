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
    for (const scenario of first.scenarios) {
      expect(scenario.stream.draws).toBe(2_000);
      expect(scenario.stream.inventory).toEqual(expect.objectContaining({ COMMON: expect.any(Number), RARE: expect.any(Number), LEGENDARY: expect.any(Number) }));
      expect(scenario.stream.pityTriggers).toEqual(expect.objectContaining({ rare: expect.any(Number), legendary: expect.any(Number) }));
      expect(scenario.cohort).toEqual(expect.objectContaining({ users: 2_000, firstLegendaryMedian: expect.any(Number), firstLegendaryP95: expect.any(Number) }));
      expect(scenario.checks).toEqual({ representativeExcluded: true, protectedPetsExcluded: true, samePetRuleApplied: expect.any(Boolean) });
    }
    expect(first.scenarios[2]!.checks.samePetRuleApplied).toBe(true);
    expect(first.scenarios[3]!.stream.pityTriggers.rare).toBeGreaterThan(first.scenarios[2]!.stream.pityTriggers.rare);
  });
});
