import { z } from 'zod';
import {
  approvedPetArtV1Schema,
  dailyFreeDrawV1Schema,
  duplicatePromotionV1Schema,
  petCollectionV1Schema,
  petRarityV1Schema,
  type ApprovedPetArtV1,
  type DailyFreeDrawV1,
  type DuplicatePromotionV1,
  type PetCollectionV1,
} from '../../../../packages/contracts/src/daily-pet-loop.js';
import type { MobileRpcClient } from '../database/pg-rpc.js';
import type { DailyDrawEffectInputV1, DailyDrawRepositoryV1 } from './daily-draw.js';
import type { DuplicatePromotionEffectInputV1, DuplicatePromotionRepositoryV1 } from './duplicate-promotion.js';

const rawPetSchema = z.object({
  userPetId: z.uuid(), petId: z.uuid(), rarity: petRarityV1Schema,
  displayKey: z.string().min(1), level: z.number().int().positive(), xp: z.number().int().nonnegative(),
  copies: z.number().int().positive(), selected: z.boolean(), locked: z.boolean(),
  acquiredAt: z.iso.datetime({ offset: true }).nullable(),
  acquisitionDateStatus: z.enum(['KNOWN', 'UNAVAILABLE_LEGACY']),
  acquiredCatalogRevision: z.string().optional(), acquiredCatalogHash: z.string().optional(),
}).strict();
const progress = z.object({ ownedCount: z.number().int().nonnegative(), totalCount: z.number().int().nonnegative() }).strict();
const rawCollectionSchema = z.object({
  catalogRevision: z.string().optional(), catalogHash: z.string().optional(),
  ownedCount: z.number().int().nonnegative(), totalCount: z.number().int().nonnegative(),
  rarityProgress: z.object({ COMMON: progress, RARE: progress, LEGENDARY: progress }).strict(),
  pets: z.array(rawPetSchema),
}).strict();

export interface PetCollectionReadInput { subjectKey: string; catalogRevision: string; catalogHash: string }
export interface PetRuntimeRepository extends DailyDrawRepositoryV1, DuplicatePromotionRepositoryV1 {
  readCollection(input: PetCollectionReadInput): Promise<PetCollectionV1>;
}

export class PostgresPetRepository implements PetRuntimeRepository {
  constructor(
    private readonly rpc: MobileRpcClient,
    private readonly artForPet: (petId: string) => ApprovedPetArtV1 | undefined,
  ) {}

  async readCollection(input: PetCollectionReadInput): Promise<PetCollectionV1> {
    const raw = await this.rpc.callParsed('read_pet_inventory_v1', [input.subjectKey, input.catalogRevision, input.catalogHash], (value) => rawCollectionSchema.parse(value));
    if (raw.catalogRevision !== input.catalogRevision || raw.catalogHash !== input.catalogHash) throw new TypeError('POLICY_MISMATCH');
    const pets = raw.pets.map(({ acquiredCatalogRevision: _revision, acquiredCatalogHash: _hash, ...pet }) => {
      const art = this.artForPet(pet.petId);
      if (!art) throw new TypeError('PET_ART_NOT_APPROVED');
      return { ...pet, art: approvedPetArtV1Schema.parse(art) };
    });
    return petCollectionV1Schema.parse({ ownedCount: raw.ownedCount, totalCount: raw.totalCount, rarityProgress: raw.rarityProgress, pets });
  }

  async claimEffectOnce(input: DailyDrawEffectInputV1): Promise<DailyFreeDrawV1> {
    return this.rpc.callParsed('claim_daily_free_draw_v1', [input.subjectKey, input.economyHash, input.catalogRevision, input.catalogHash], (value) => dailyFreeDrawV1Schema.parse(value));
  }

  async promoteEffectOnce(input: DuplicatePromotionEffectInputV1): Promise<DuplicatePromotionV1> {
    return this.rpc.callParsed('promote_duplicate_cards_v1', [input.subjectKey, input.idempotencyKey, input.requestHash, [{ petId: input.sourcePetId, count: 10 }], input.economyHash, input.catalogRevision, input.catalogHash], (value) => duplicatePromotionV1Schema.parse(value));
  }
}
