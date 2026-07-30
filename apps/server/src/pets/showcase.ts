import {
  petCollectionV1Schema,
  petShowcaseV1Schema,
  type ApprovedPetArtV1,
  type PetCollectionV1,
  type PetShowcaseV1,
} from '../../../../packages/contracts/src/daily-pet-loop.js';
import type { PetRarity } from '../../../../packages/contracts/src/pet-catalog.js';

interface CatalogPetV1 {
  petId: string;
  rarity: PetRarity;
  displayKey: string;
  art: ApprovedPetArtV1;
}

interface InventoryPetV1 {
  userPetId: string;
  petId: string;
  rarity: PetRarity;
  level: number;
  xp: number;
  copies: number;
  selected: boolean;
  locked: boolean;
  acquiredAt: string | null;
}

export function getPetCollectionV1(input: {
  catalog: readonly CatalogPetV1[];
  inventory: readonly InventoryPetV1[];
}): PetCollectionV1 {
  const catalogById = new Map(input.catalog.map((pet) => [pet.petId, pet]));
  const ownedIds = new Set(input.inventory.map((pet) => pet.petId));
  const rarityProgress = {
    COMMON: { ownedCount: 0, totalCount: 0 },
    RARE: { ownedCount: 0, totalCount: 0 },
    LEGENDARY: { ownedCount: 0, totalCount: 0 },
  };
  for (const pet of input.catalog) {
    rarityProgress[pet.rarity].totalCount += 1;
    if (ownedIds.has(pet.petId)) rarityProgress[pet.rarity].ownedCount += 1;
  }
  const pets = input.inventory.map((pet) => {
    const catalogPet = catalogById.get(pet.petId);
    if (!catalogPet || catalogPet.rarity !== pet.rarity) {
      throw new TypeError(`inventory pet ${pet.petId} is not in the approved catalog`);
    }
    return {
      ...pet,
      acquisitionDateStatus: pet.acquiredAt === null ? 'UNAVAILABLE_LEGACY' as const : 'KNOWN' as const,
      displayKey: catalogPet.displayKey,
      art: catalogPet.art,
    };
  });
  return petCollectionV1Schema.parse({
    ownedCount: ownedIds.size,
    totalCount: input.catalog.length,
    rarityProgress,
    pets,
  });
}

export function projectPetShowcaseV1(input: unknown): PetShowcaseV1 {
  const parsed = petShowcaseV1Schema.safeParse(input);
  if (!parsed.success) {
    throw new TypeError(`public pet showcase rejected: ${parsed.error.message}`);
  }
  return parsed.data;
}
