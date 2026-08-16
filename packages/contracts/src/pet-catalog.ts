export type PetRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type CoachArchetype = 'SCOUT' | 'LINGUIST' | 'SAGE' | 'CHEER';

/** Ascending rarity ladder. Index order is the single source of truth for draw fallback and promotion. */
export const PET_RARITY_LADDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const satisfies readonly PetRarity[];

/** Korean display labels for the admitted ladder. */
export const PET_RARITY_LABELS_KO: Readonly<Record<PetRarity, string>> = {
  COMMON: '일반',
  UNCOMMON: '고급',
  RARE: '희귀',
  EPIC: '영웅',
  LEGENDARY: '전설',
};

export function petRarityRank(rarity: PetRarity): number {
  const rank = PET_RARITY_LADDER.indexOf(rarity);
  if (rank < 0) throw new TypeError(`UNKNOWN_PET_RARITY:${rarity}`);
  return rank;
}

/**
 * A rarity tier may be admitted by policy before any pet art has been admitted into it.
 * Draws therefore step DOWN the ladder to the nearest tier that has catalog entries, so a
 * roll can never resolve to an empty pool. Promotions step UP for the same reason.
 */
export function resolveDrawableRarity(
  rolled: PetRarity,
  populated: ReadonlySet<PetRarity> | readonly PetRarity[],
): PetRarity | null {
  const set = populated instanceof Set ? populated : new Set(populated);
  for (let index = petRarityRank(rolled); index >= 0; index -= 1) {
    const candidate = PET_RARITY_LADDER[index]!;
    if (set.has(candidate)) return candidate;
  }
  return null;
}

export function resolvePromotionTargetRarity(
  source: PetRarity,
  populated: ReadonlySet<PetRarity> | readonly PetRarity[],
): PetRarity | null {
  const set = populated instanceof Set ? populated : new Set(populated);
  for (let index = petRarityRank(source) + 1; index < PET_RARITY_LADDER.length; index += 1) {
    const candidate = PET_RARITY_LADDER[index]!;
    if (set.has(candidate)) return candidate;
  }
  return null;
}

export interface PetCatalogEntryV1 { petId: string; rarity: PetRarity; displayKey: string; coachArchetype: CoachArchetype }
export interface PetCatalogRevisionV1 {
  schemaVersion: 1;
  catalogRevision: string;
  status: 'DRAFT' | 'APPROVED';
  catalogHash: string;
  entries: PetCatalogEntryV1[];
  approvalDecisionId?: string;
  approvedBy?: string;
  approvedAt?: string;
}
