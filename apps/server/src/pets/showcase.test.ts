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
      claimedToday: false,
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
        acquisitionDateStatus: 'KNOWN',
        art,
      }],
    });
  });

  it('represents an unavailable legacy acquisition date explicitly', () => {
    const collection = getPetCollectionV1({
      catalog: [{ petId: 'pet-a', rarity: 'COMMON', displayKey: 'pet.a', art }],
      inventory: [{
        userPetId: 'owned-a',
        petId: 'pet-a',
        rarity: 'COMMON',
        level: 1,
        xp: 0,
        copies: 1,
        selected: false,
        locked: false,
        acquiredAt: null,
      }],
    });
    expect(collection.pets[0]).toEqual(expect.objectContaining({
      acquiredAt: null,
      acquisitionDateStatus: 'UNAVAILABLE_LEGACY',
    }));
  });

  it('excludes zero-copy tombstones from rows, owned totals, rarity progress, and showcase percentage', () => {
    const catalog = [
      { petId: 'pet-a', rarity: 'COMMON' as const, displayKey: 'pet.a', art },
      { petId: 'pet-b', rarity: 'COMMON' as const, displayKey: 'pet.b', art },
      { petId: 'pet-c', rarity: 'RARE' as const, displayKey: 'pet.c', art },
    ];
    const collection = getPetCollectionV1({
      catalog,
      inventory: [
        {
          userPetId: 'consumed-a',
          petId: 'pet-a',
          rarity: 'COMMON',
          level: 1,
          xp: 0,
          copies: 0,
          selected: false,
          locked: false,
          acquiredAt: null,
        },
        {
          userPetId: 'owned-b',
          petId: 'pet-b',
          rarity: 'COMMON',
          level: 1,
          xp: 0,
          copies: 1,
          selected: false,
          locked: false,
          acquiredAt: null,
        },
      ],
    });
    expect(collection).toEqual(expect.objectContaining({
      ownedCount: 1,
      totalCount: 3,
      rarityProgress: {
        COMMON: { ownedCount: 1, totalCount: 2 },
        RARE: { ownedCount: 0, totalCount: 1 },
        LEGENDARY: { ownedCount: 0, totalCount: 0 },
      },
    }));
    expect(collection.pets.map((pet) => pet.userPetId)).toEqual(['owned-b']);

    const showcase = projectPetShowcaseV1({
      nickname: 'Miso',
      selectedPet: { petId: 'pet-a', displayKey: 'pet.a', rarity: 'COMMON', art },
      favoritePets: [
        { petId: 'pet-a', displayKey: 'pet.a', rarity: 'COMMON', art },
        { petId: 'pet-b', displayKey: 'pet.b', rarity: 'COMMON', art },
      ],
      collectionPercentage: 99,
      championStarCount: 0,
      historicalNumberOneCount: 0,
      approvedCosmetics: [],
    }, collection);
    expect(showcase).toEqual(expect.objectContaining({
      selectedPet: null,
      favoritePets: [{ petId: 'pet-b', displayKey: 'pet.b', rarity: 'COMMON', art }],
    }));
    expect(showcase.collectionPercentage).toBeCloseTo(100 / 3);
  });

  it('keeps a pet owned when a positive row remains beside its tombstone', () => {
    const collection = getPetCollectionV1({
      catalog: [{ petId: 'pet-a', rarity: 'COMMON', displayKey: 'pet.a', art }],
      inventory: [
        {
          userPetId: 'consumed-a',
          petId: 'pet-a',
          rarity: 'COMMON',
          level: 1,
          xp: 0,
          copies: 0,
          selected: false,
          locked: false,
          acquiredAt: null,
        },
        {
          userPetId: 'owned-a',
          petId: 'pet-a',
          rarity: 'COMMON',
          level: 1,
          xp: 0,
          copies: 1,
          selected: false,
          locked: false,
          acquiredAt: null,
        },
      ],
    });
    expect(collection.ownedCount).toBe(1);
    expect(collection.pets.map((pet) => pet.userPetId)).toEqual(['owned-a']);
  });
});

describe('public pet showcase', () => {
  const collection = getPetCollectionV1({
    catalog: [
      { petId: 'pet-a', rarity: 'COMMON', displayKey: 'pet.a', art },
      { petId: 'pet-b', rarity: 'COMMON', displayKey: 'pet.b', art },
    ],
    inventory: [{
      userPetId: 'owned-a',
      petId: 'pet-a',
      rarity: 'COMMON',
      level: 1,
      xp: 0,
      copies: 1,
      selected: true,
      locked: false,
      acquiredAt: null,
    }],
  });
  const safe = {
    nickname: 'Miso',
    selectedPet: { petId: 'pet-a', displayKey: 'pet.a', rarity: 'COMMON', art },
    favoritePets: [],
    collectionPercentage: 50,
    championStarCount: 7,
    historicalNumberOneCount: 2,
    approvedCosmetics: [{ cosmeticId: 'frame-gold', displayKey: 'cosmetic.frame.gold' }],
  };

  it('returns only the public allowlist', () => {
    expect(projectPetShowcaseV1(safe, collection)).toEqual(safe);
  });

  it.each(['authId', 'userId', 'email', 'subjectKey', 'acquisitionHistory', 'biography', 'location'])(
    'rejects the private identifier/history field %s instead of stripping it',
    (key) => {
      expect(() => projectPetShowcaseV1({ ...safe, [key]: 'private' }, collection)).toThrow(/showcase|unrecognized/i);
    },
  );

  it('rejects more than three favorites', () => {
    expect(() => projectPetShowcaseV1({ ...safe, favoritePets: Array(4).fill(safe.selectedPet) }, collection)).toThrow(/favorite/i);
  });
});
