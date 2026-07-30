import { describe, expect, it } from 'vitest';
import {
  evaluateDuplicatePromotionV1,
  normalizeDuplicateMaterialsV1,
  planDuplicateConsumptionV1,
  PetLoopError,
  promoteDuplicateCardsV1,
  type DuplicatePromotionRepositoryV1,
} from './duplicate-promotion.js';
import type { AuthenticatedEconomySubjectResolverV1 } from './daily-draw.js';

const authenticatedUserId = '10000000-0000-4000-8000-000000000001';
const subjectKey = '70000000-0000-4000-8000-000000000001';
const sourcePetId = '00000000-0000-4000-8000-000000000001';
const pinnedPolicy = {
  economyVersion: '1.0.0',
  economyHash: 'a'.repeat(64),
  catalogRevision: 'catalog-v1',
  catalogHash: 'b'.repeat(64),
} as const;

class PromotionRepository implements DuplicatePromotionRepositoryV1 {
  readonly subjects: string[] = [];

  async promoteEffectOnce(input: Parameters<DuplicatePromotionRepositoryV1['promoteEffectOnce']>[0]) {
    this.subjects.push(input.subjectKey);
    return {
      consumed: {
        petId: sourcePetId,
        copies: 10 as const,
        rows: [{ userPetId: '40000000-0000-4000-8000-000000000001', copies: 10 }],
      },
      remainingCopies: 1,
      output: {
        userPetId: '40000000-0000-4000-8000-000000000002',
        petId: '00000000-0000-4000-8000-000000000002',
        rarity: 'RARE' as const,
        copies: 1,
      },
      ...pinnedPolicy,
    };
  }
}

class PromotionSubjectResolver implements AuthenticatedEconomySubjectResolverV1 {
  constructor(private readonly linked = true) {}

  async resolveLinkedSubjectKey(userId: string): Promise<string> {
    if (!this.linked || userId !== authenticatedUserId) throw new TypeError('AUTH_SUBJECT_REQUIRED');
    return subjectKey;
  }
}

describe('same-pet duplicate promotion', () => {
  it.each([
    ['COMMON', 'RARE'],
    ['RARE', 'LEGENDARY'],
  ] as const)('consumes ten %s spares, retains the base, and issues one %s target', (rarity, targetRarity) => {
    expect(evaluateDuplicatePromotionV1({
      rarity,
      ownedCopies: 11,
      sourcePetId: 'pet-a',
      materials: [{ petId: 'pet-a', count: 10 }],
    })).toEqual({ targetRarity, consumedCopies: 10, remainingCopies: 1 });
  });

  it('rejects nine spare copies', () => {
    expect(() => evaluateDuplicatePromotionV1({
      rarity: 'COMMON',
      ownedCopies: 10,
      sourcePetId: 'pet-a',
      materials: [{ petId: 'pet-a', count: 10 }],
    })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_DUPLICATES' }));
  });

  it('rejects mixed-pet materials even when the total is ten', () => {
    expect(() => normalizeDuplicateMaterialsV1('pet-a', [
      { petId: 'pet-a', count: 5 },
      { petId: 'pet-b', count: 5 },
    ])).toThrowError(expect.objectContaining({ code: 'INVALID_MATERIALS' }));
  });

  it('requires an approved cosmetic revision for legendary spares', () => {
    try {
      evaluateDuplicatePromotionV1({
        rarity: 'LEGENDARY',
        ownedCopies: 11,
        sourcePetId: 'pet-a',
        materials: [{ petId: 'pet-a', count: 10 }],
      });
      throw new Error('expected promotion to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PetLoopError);
      expect((error as PetLoopError).code).toBe('COSMETIC_REWARD_POLICY_REQUIRED');
    }
  });

  it('aggregates eleven one-copy rows and consumes ten in stable ID order', () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      userPetId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      petId: 'pet-a',
      copies: 1,
      selected: false,
      locked: false,
    }));
    expect(planDuplicateConsumptionV1('pet-a', rows)).toEqual({
      consumed: rows.slice(0, 10).map(({ userPetId }) => ({ userPetId, copies: 1 })),
      remainingCopies: 1,
    });
  });

  it('never consumes selected or locked rows and still retains a base copy', () => {
    const rows = [
      { userPetId: 'c', petId: 'pet-a', copies: 5, selected: false, locked: false },
      { userPetId: 'a', petId: 'pet-a', copies: 1, selected: true, locked: false },
      { userPetId: 'b', petId: 'pet-a', copies: 5, selected: false, locked: false },
      { userPetId: 'd', petId: 'pet-a', copies: 1, selected: false, locked: true },
    ];
    expect(planDuplicateConsumptionV1('pet-a', rows)).toEqual({
      consumed: [
        { userPetId: 'b', copies: 5 },
        { userPetId: 'c', copies: 5 },
      ],
      remainingCopies: 2,
    });
  });

  it('resolves authenticated user authority before promoting', async () => {
    const repository = new PromotionRepository();
    await promoteDuplicateCardsV1({
      authenticatedUserId,
      subjectResolver: new PromotionSubjectResolver(),
      idempotencyKey: '50000000-0000-4000-8000-000000000001',
      requestHash: 'c'.repeat(64),
      sourcePetId,
      materials: [{ petId: sourcePetId, count: 10 }],
      policy: { status: 'APPROVED', ...pinnedPolicy },
      repository,
    });
    expect(repository.subjects).toEqual([subjectKey]);
  });

  it('rejects an unlinked authenticated account before repository access', async () => {
    const repository = new PromotionRepository();
    await expect(promoteDuplicateCardsV1({
      authenticatedUserId,
      subjectResolver: new PromotionSubjectResolver(false),
      idempotencyKey: '50000000-0000-4000-8000-000000000001',
      requestHash: 'c'.repeat(64),
      sourcePetId,
      materials: [{ petId: sourcePetId, count: 10 }],
      policy: { status: 'APPROVED', ...pinnedPolicy },
      repository,
    })).rejects.toThrow(/AUTH_SUBJECT_REQUIRED/);
    expect(repository.subjects).toEqual([]);
  });
});
