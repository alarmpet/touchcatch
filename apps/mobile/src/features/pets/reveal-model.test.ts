import { describe, expect, it } from 'vitest';
import {
  copiesUntilPromotion,
  promotionCeiling,
  nextRevealPhase,
  orderedRarityProgress,
  revealDurationMs,
  revealEmphasis,
  revealLadder,
  revealPresentation,
  REVEAL_OPENING_MS,
  REVEAL_STEP_MS,
  type PetRevealV1,
} from './reveal-model';

const reveal = (overrides: Partial<PetRevealV1> = {}): PetRevealV1 => ({
  source: 'DAILY_DRAW',
  petId: '00000000-0000-4000-8000-000000000001',
  rarity: 'COMMON',
  copies: 1,
  isFirstCopy: true,
  ...overrides,
});

describe('pet reveal model', () => {
  it('advances the opening sequence once and then holds', () => {
    expect(nextRevealPhase('SEALED')).toBe('OPENING');
    expect(nextRevealPhase('OPENING')).toBe('REVEALED');
    expect(nextRevealPhase('REVEALED')).toBe('REVEALED');
  });

  it('climbs the ladder up to the awarded tier and stops there', () => {
    expect(revealLadder('COMMON')).toEqual(['COMMON']);
    expect(revealLadder('RARE')).toEqual(['COMMON', 'UNCOMMON', 'RARE']);
    expect(revealLadder('LEGENDARY')).toEqual(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']);
  });

  it('never shows a tier above the one awarded', () => {
    // The climb is theatre over a settled result. Showing EPIC on the way to a RARE would
    // be the one thing this presentation must not do: claim an outcome that did not happen.
    for (const rarity of ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const) {
      const ladder = revealLadder(rarity);
      expect(ladder.at(-1)).toBe(rarity);
      expect(new Set(ladder).size).toBe(ladder.length);
    }
  });

  it('spends longer on rarer outcomes, and keeps the common case brisk', () => {
    expect(revealDurationMs('COMMON')).toBe(REVEAL_OPENING_MS);
    expect(revealDurationMs('LEGENDARY')).toBe(4 * REVEAL_STEP_MS + REVEAL_OPENING_MS);
    const durations = (['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const).map(revealDurationMs);
    expect(durations).toEqual([...durations].sort((left, right) => left - right));
  });

  it.each([
    ['COMMON', true, 'NOTABLE'],
    ['COMMON', false, 'QUIET'],
    ['UNCOMMON', false, 'QUIET'],
    ['RARE', false, 'NOTABLE'],
    ['EPIC', false, 'CELEBRATE'],
    ['LEGENDARY', false, 'CELEBRATE'],
  ] as const)('rates %s (first copy: %s) as %s', (rarity, isFirstCopy, expected) => {
    expect(revealEmphasis(rarity, isFirstCopy)).toBe(expected);
  });

  it('names a first copy as a collection entry and a duplicate as promotion fuel', () => {
    expect(revealPresentation(reveal(), '일반')).toMatchObject({
      eyebrow: '오늘의 펫',
      headline: '새로운 일반 친구',
      detail: '도감에 새로 기록됐어요.',
    });
    expect(revealPresentation(reveal({ isFirstCopy: false, copies: 4 }), '일반').detail)
      .toBe('보유 4마리째. 모으면 위 등급으로 승급할 수 있어요.');
    expect(revealPresentation(reveal({ source: 'PROMOTION', rarity: 'RARE' }), '희귀').eyebrow)
      .toBe('승급 완료');
  });

  it('counts copies against both the total and the spare requirement', () => {
    expect(copiesUntilPromotion({ rarity: 'COMMON', ownedCopies: 0, eligibleCopies: 0 })).toBe(11);
    expect(copiesUntilPromotion({ rarity: 'COMMON', ownedCopies: 11, eligibleCopies: 10 })).toBe(0);
    // Eleven copies held but one is locked or selected, so a spare is still missing.
    expect(copiesUntilPromotion({ rarity: 'COMMON', ownedCopies: 11, eligibleCopies: 9 })).toBe(1);
    expect(copiesUntilPromotion({ rarity: 'LEGENDARY', ownedCopies: 0, eligibleCopies: 0 })).toBeNull();
  });

  it('reports the promotion ceiling as a meter that cannot disagree with its own number', () => {
    expect(promotionCeiling({ rarity: 'COMMON', ownedCopies: 0, eligibleCopies: 0 })).toEqual({
      held: 0, required: 11, remaining: 11, ratio: 0, nextRarity: 'UNCOMMON', nearing: false,
    });
    expect(promotionCeiling({ rarity: 'RARE', ownedCopies: 9, eligibleCopies: 9 })).toMatchObject({
      held: 9, remaining: 2, nextRarity: 'EPIC', nearing: true,
    });
    // The bar follows the binding constraint. Eleven held but one locked still reads 10/11,
    // because a spare is what is actually missing — the number and the fill agree either way.
    expect(promotionCeiling({ rarity: 'COMMON', ownedCopies: 11, eligibleCopies: 9 })).toMatchObject({
      held: 10, remaining: 1, nearing: true,
    });
    // Ready to promote is not "nearing" — there is nothing left to wait for.
    expect(promotionCeiling({ rarity: 'COMMON', ownedCopies: 11, eligibleCopies: 10 })).toMatchObject({
      held: 11, remaining: 0, ratio: 1, nearing: false,
    });
    // The top of the ladder has no ceiling to show, so it gets no meter rather than a full one.
    expect(promotionCeiling({ rarity: 'LEGENDARY', ownedCopies: 20, eligibleCopies: 20 })).toBeNull();
  });

  it('orders tier progress by the ladder and hides tiers with no admitted pets', () => {
    expect(orderedRarityProgress({
      LEGENDARY: { ownedCount: 1, totalCount: 5 },
      COMMON: { ownedCount: 15, totalCount: 30 },
      UNCOMMON: { ownedCount: 0, totalCount: 0 },
      RARE: { ownedCount: 3, totalCount: 15 },
      EPIC: { ownedCount: 0, totalCount: 0 },
    })).toEqual([
      { rarity: 'COMMON', ownedCount: 15, totalCount: 30, ratio: 0.5 },
      { rarity: 'RARE', ownedCount: 3, totalCount: 15, ratio: 0.2 },
      { rarity: 'LEGENDARY', ownedCount: 1, totalCount: 5, ratio: 0.2 },
    ]);
    expect(orderedRarityProgress({})).toEqual([]);
  });
});
