import { describe, expect, it } from 'vitest';
import type { HintStepV1 } from '../../contracts/src/content.js';
import {
  revealNextHint,
  type HintRevealInput,
} from './hint-engine.js';

const steps = [1, 2, 3, 4, 5].map((ordinal) => ({
  ordinal: ordinal as 1 | 2 | 3 | 4 | 5,
  kind: ordinal === 1 ? 'SEMANTIC_CATEGORY' as const : 'REVEAL_GRAPHEME' as const,
  localizedText: { ko: `현재 힌트 ${ordinal}`, en: `Current hint ${ordinal}` },
  revealIndexes: ordinal < 4 ? [] : [ordinal - 4],
  rankedPenaltyUnits: 1 as const,
})) satisfies HintStepV1[];

const reveal = (overrides: Partial<HintRevealInput> = {}) =>
  revealNextHint({
    mode: 'CASUAL',
    steps,
    revealedOrdinals: [],
    expectedOrdinal: 1,
    coachCharges: 3,
    locale: 'en',
    ...overrides,
  });

describe('revealNextHint', () => {
  it('reveals only the next unrevealed ordinal and spends one available casual coach charge', () => {
    expect(reveal()).toMatchObject({
      status: 'REVEALED',
      ordinal: 1,
      localizedText: 'Current hint 1',
      rankedPenaltyUnits: 0,
      cumulativeRankedPenaltyUnits: 0,
      coachChargesRemaining: 2,
      coachChargeUsed: true,
    });

    expect(reveal({
      revealedOrdinals: [1, 3],
      expectedOrdinal: 2,
    })).toEqual({
      status: 'REJECTED',
      reason: 'INVALID_REVEAL_STATE',
    });
  });

  it.each([[2,1],[1,2,4]])('rejects a non-prefix revealed ordinal history', (...revealedOrdinals) => {
    expect(reveal({ revealedOrdinals: revealedOrdinals as (1|2|3|4|5)[] }))
      .toEqual({ status: 'REJECTED', reason: 'INVALID_REVEAL_STATE' });
  });

  it('keeps the ordinary casual hint available after coach charges are exhausted', () => {
    expect(reveal({ coachCharges: 0 })).toMatchObject({
      status: 'REVEALED',
      ordinal: 1,
      rankedPenaltyUnits: 0,
      coachChargesRemaining: 0,
      coachChargeUsed: false,
    });
  });

  it('makes COMMON and LEGENDARY ranked hints identical and ignores coach state', () => {
    const common = reveal({
      mode: 'RANKED',
      coachCharges: 0,
      pet: { rarity: 'COMMON', level: 1, coachArchetype: 'SCOUT' },
    });
    const legendary = reveal({
      mode: 'RANKED',
      coachCharges: 99,
      pet: { rarity: 'LEGENDARY', level: 99, coachArchetype: 'LINGUIST' },
    });

    expect(common).toEqual(legendary);
    expect(legendary).toMatchObject({
      status: 'REVEALED',
      ordinal: 1,
      rankedPenaltyUnits: 1,
      cumulativeRankedPenaltyUnits: 1,
    });
    expect(legendary).not.toHaveProperty('coachChargesRemaining');
    expect(legendary).not.toHaveProperty('coachChargeUsed');
  });

  it('derives the cumulative ranked penalty from authoritative revealed steps', () => {
    expect(reveal({
      mode: 'RANKED',
      revealedOrdinals: [1, 2, 3],
      expectedOrdinal: 4,
      coachCharges: 7,
      clientCumulativeRankedPenaltyUnits: 999,
    } as Partial<HintRevealInput>)).toMatchObject({
      status: 'REVEALED',
      ordinal: 4,
      rankedPenaltyUnits: 1,
      cumulativeRankedPenaltyUnits: 4,
    });
  });

  it('deterministically rejects a stale compare-and-swap ordinal', () => {
    expect(reveal({
      revealedOrdinals: [1],
      expectedOrdinal: 1,
    })).toEqual({
      status: 'REJECTED',
      reason: 'HINT_ORDINAL_CONFLICT',
      nextOrdinal: 2,
    });
  });

  it('returns NO_HINT_REMAINING after all five steps are revealed', () => {
    expect(reveal({
      revealedOrdinals: [1, 2, 3, 4, 5],
      expectedOrdinal: 6,
    })).toEqual({
      status: 'REJECTED',
      reason: 'NO_HINT_REMAINING',
    });
  });

  it.each([
    ['missing', undefined],
    ['short', steps.slice(0, 4)],
    ['long', [...steps, { ...steps[4]!, ordinal: 5 as const }]],
    ['out of order', [steps[1]!, steps[0]!, ...steps.slice(2)]],
    ['duplicate ordinal', [steps[0]!, steps[0]!, ...steps.slice(2)]],
  ])('rejects a %s ladder before revealing anything', (_case, invalidSteps) => {
    expect(reveal({ steps: invalidSteps })).toEqual({
      status: 'REJECTED',
      reason: 'INVALID_HINT_LADDER',
    });
  });

  it('returns only the selected current step and never a future ladder or private answer', () => {
    const result = reveal({
      revealedOrdinals: [1],
      expectedOrdinal: 2,
      locale: 'ko',
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      status: 'REVEALED',
      ordinal: 2,
      localizedText: '현재 힌트 2',
    });
    expect(serialized).not.toContain('Current hint 3');
    expect(serialized).not.toMatch(/steps|canonicalAnswer|privateSolution/i);
  });
});
