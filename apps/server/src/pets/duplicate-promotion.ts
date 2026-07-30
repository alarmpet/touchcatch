import type {
  DuplicatePromotionV1,
  PinnedPetPolicyV1,
} from '../../../../packages/contracts/src/daily-pet-loop.js';
import type { PetRarity } from '../../../../packages/contracts/src/pet-catalog.js';
import {
  duplicatePromotionV1Schema,
  pinnedPetPolicyV1Schema,
} from '../../../../packages/contracts/src/daily-pet-loop.js';

export type PetLoopErrorCode =
  | 'INVALID_MATERIALS'
  | 'INSUFFICIENT_DUPLICATES'
  | 'COSMETIC_REWARD_POLICY_REQUIRED';

export class PetLoopError extends Error {
  constructor(readonly code: PetLoopErrorCode) {
    super(code);
    this.name = 'PetLoopError';
  }
}

export interface DuplicateMaterialV1 {
  petId: string;
  count: number;
}

export interface DuplicateInventoryRowV1 {
  userPetId: string;
  petId: string;
  copies: number;
  selected: boolean;
  locked: boolean;
}

export function normalizeDuplicateMaterialsV1(
  sourcePetId: string,
  materials: readonly DuplicateMaterialV1[],
): { petId: string; count: 10 } {
  if (
    materials.length !== 1
    || materials[0]?.petId !== sourcePetId
    || materials[0].count !== 10
  ) {
    throw new PetLoopError('INVALID_MATERIALS');
  }
  return { petId: sourcePetId, count: 10 };
}

export function evaluateDuplicatePromotionV1(input: {
  rarity: PetRarity;
  ownedCopies: number;
  sourcePetId: string;
  materials: readonly DuplicateMaterialV1[];
}): {
  targetRarity: 'RARE' | 'LEGENDARY';
  consumedCopies: 10;
  remainingCopies: number;
} {
  normalizeDuplicateMaterialsV1(input.sourcePetId, input.materials);
  if (!Number.isSafeInteger(input.ownedCopies) || input.ownedCopies < 11) {
    throw new PetLoopError('INSUFFICIENT_DUPLICATES');
  }
  if (input.rarity === 'LEGENDARY') {
    throw new PetLoopError('COSMETIC_REWARD_POLICY_REQUIRED');
  }
  return {
    targetRarity: input.rarity === 'COMMON' ? 'RARE' : 'LEGENDARY',
    consumedCopies: 10,
    remainingCopies: input.ownedCopies - 10,
  };
}

export function planDuplicateConsumptionV1(
  sourcePetId: string,
  inventoryRows: readonly DuplicateInventoryRowV1[],
): {
  consumed: Array<{ userPetId: string; copies: number }>;
  remainingCopies: number;
} {
  const samePet = inventoryRows
    .filter((row) => row.petId === sourcePetId && Number.isSafeInteger(row.copies) && row.copies > 0)
    .sort((left, right) => left.userPetId.localeCompare(right.userPetId));
  const totalCopies = samePet.reduce((total, row) => total + row.copies, 0);
  if (totalCopies < 11) throw new PetLoopError('INSUFFICIENT_DUPLICATES');
  let remainingToConsume = 10;
  const consumed: Array<{ userPetId: string; copies: number }> = [];
  for (const row of samePet) {
    if (remainingToConsume === 0) break;
    if (row.selected || row.locked) continue;
    const copies = Math.min(row.copies, remainingToConsume);
    if (copies > 0) consumed.push({ userPetId: row.userPetId, copies });
    remainingToConsume -= copies;
  }
  if (remainingToConsume !== 0) throw new PetLoopError('INSUFFICIENT_DUPLICATES');
  return { consumed, remainingCopies: totalCopies - 10 };
}

export interface DuplicatePromotionEffectInputV1 extends PinnedPetPolicyV1 {
  subjectKey: string;
  idempotencyKey: string;
  requestHash: string;
  sourcePetId: string;
  consumedCopies: 10;
}

export interface DuplicatePromotionRepositoryV1 {
  /**
   * Must lock the subject, then every same-pet inventory row in stable order, and atomically
   * consume ten copies, issue/consume the target entitlement, persist history,
   * receipt, and outbox.
   */
  promoteEffectOnce(input: DuplicatePromotionEffectInputV1): Promise<DuplicatePromotionV1>;
}

export async function promoteDuplicateCardsV1(input: {
  subjectKey: string;
  idempotencyKey: string;
  requestHash: string;
  sourcePetId: string;
  materials: readonly DuplicateMaterialV1[];
  policy: PinnedPetPolicyV1 & { status: 'DRAFT' | 'APPROVED' };
  repository: DuplicatePromotionRepositoryV1;
}): Promise<DuplicatePromotionV1> {
  if (input.policy.status !== 'APPROVED') throw new TypeError('duplicate promotion requires APPROVED economy and catalog pins');
  normalizeDuplicateMaterialsV1(input.sourcePetId, input.materials);
  const policy = pinnedPetPolicyV1Schema.parse(input.policy);
  const response = await input.repository.promoteEffectOnce({
    subjectKey: input.subjectKey,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    sourcePetId: input.sourcePetId,
    consumedCopies: 10,
    ...policy,
  });
  return duplicatePromotionV1Schema.parse(response);
}
