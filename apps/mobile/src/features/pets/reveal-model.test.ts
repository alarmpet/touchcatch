import { describe, expect, it } from 'vitest';
import {
  copiesUntilPromotion,
  nextRevealPhase,
  orderedRarityProgress,
  revealEmphasis,
  revealPresentation,
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
