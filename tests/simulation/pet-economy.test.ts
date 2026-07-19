import { describe, expect, it } from 'vitest';
import { analyticLegendaryEquivalent, chooseSamePetFusionOutput, simulatePetEconomy } from '../../tools/simulate-pet-economy.mjs';

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
      expect(scenario.stream.fusion).toEqual(expect.objectContaining({ commonOutputs: expect.any(Number), legendaryOutputs: expect.any(Number), consumedCommon: expect.any(Number), consumedRare: expect.any(Number) }));
      expect(scenario.checks).toEqual({ representativeExcluded: scenario.id.includes('same-pet'), protectedPetsExcluded: scenario.id.includes('same-pet'), samePetRuleApplied: scenario.id.includes('same-pet') });
    }
    expect(first.scenarios[2]!.checks.samePetRuleApplied).toBe(true);
    expect(first.scenarios[3]!.stream.pityTriggers.rare).toBeGreaterThan(first.scenarios[2]!.stream.pityTriggers.rare);
    expect(first.scenarios[0]!.stream.legendaryEquivalentRate).toBeGreaterThan(first.scenarios[2]!.stream.legendaryEquivalentRate);
    expect(first.scenarios[1]!.stream.fusion.legendaryOutputs).toBeGreaterThan(first.scenarios[2]!.stream.fusion.legendaryOutputs);
    const samePet = first.scenarios[2]!.stream.fusion;
    expect(samePet.propagatedRareCopies).toBe(samePet.commonOutputs);
    expect(samePet.propagatedRareCopiesConsumed).toBeGreaterThan(0);
    expect(samePet.legendaryOutputs).toBeGreaterThan(samePet.drawnRareOnlyLegendaryOutputs);
  });

  it('draws same-pet fusion output from every rare ID, including the representative', () => {
    const rareIds = Array.from({ length: 15 }, (_, index) => `rare-${index}`);
    expect(chooseSamePetFusionOutput(() => 0, rareIds)).toBe('rare-0');
    expect(chooseSamePetFusionOutput(() => 0.999999, rareIds)).toBe('rare-14');
    const sequence = Array.from({ length: 15 }, (_, index) => chooseSamePetFusionOutput(() => (index + 0.5) / 15, rareIds));
    expect(sequence).toEqual(rareIds);
  });
});
