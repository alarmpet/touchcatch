import { describe, expect, it } from 'vitest';
import { getPetCollectionV1, projectPetShowcaseV1 } from './showcase.js';

const art = {
  thumbnailUrl: 'https://cdn.touchcatch.test/pets/common/thumb.webp',
  fullUrl: 'https://cdn.touchcatch.test/pets/common/full.webp',
  assetSha256: 'a'.repeat(64),
};

describe('pet collection projection', () => {
  it('returns owned totals, rarity progress, progression state, and approved art', () => {
    expect(getPetCollectionV1({
      catalog: [
        { petId: 'pet-a', rarity: 'COMMON', displayKey: 'pet.a', art },
        { petId: 'pet-b', rarity: 'COMMON', displayKey: 'pet.b', art },
        { petId: 'pet-c', rarity: 'RARE', displayKey: 'pet.c', art },
      ],
      inventory: [{
        userPetId: 'owned-a',
        petId: 'pet-a',
        rarity: 'COMMON',
        level: 3,
        xp: 240,
        copies: 11,
        selected: true,
        locked: false,
        acquiredAt: '2026-07-30T00:00:00.000Z',
      }],
    })).toEqual({
      ownedCount: 1,
      totalCount: 3,
      rarityProgress: {
        COMMON: { ownedCount: 1, totalCount: 2 },
        RARE: { ownedCount: 0, totalCount: 1 },
        LEGENDARY: { ownedCount: 0, totalCount: 0 },
      },
      pets: [{
        userPetId: 'owned-a',
        petId: 'pet-a',
        rarity: 'COMMON',
        displayKey: 'pet.a',
        level: 3,
        xp: 240,
        copies: 11,
        selected: true,
        locked: false,
        acquiredAt: '2026-07-30T00:00:00.000Z',
        art,
      }],
    });
  });
});

describe('public pet showcase', () => {
  const safe = {
    nickname: 'Miso',
    selectedPet: { petId: 'pet-a', displayKey: 'pet.a', rarity: 'COMMON', art },
    favoritePets: [],
    collectionPercentage: 42.5,
    championStarCount: 7,
    historicalNumberOneCount: 2,
    approvedCosmetics: [{ cosmeticId: 'frame-gold', displayKey: 'cosmetic.frame.gold' }],
  };

  it('returns only the public allowlist', () => {
    expect(projectPetShowcaseV1(safe)).toEqual(safe);
  });

  it.each(['authId', 'userId', 'email', 'subjectKey', 'acquisitionHistory', 'biography', 'location'])(
    'rejects the private identifier/history field %s instead of stripping it',
    (key) => {
      expect(() => projectPetShowcaseV1({ ...safe, [key]: 'private' })).toThrow(/showcase|unrecognized/i);
    },
  );

  it('rejects more than three favorites', () => {
    expect(() => projectPetShowcaseV1({ ...safe, favoritePets: Array(4).fill(safe.selectedPet) })).toThrow(/favorite/i);
  });
});
