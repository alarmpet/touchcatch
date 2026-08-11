import { z } from 'zod';
import type { PetRarity } from './pet-catalog.js';

export const petRarityV1Schema = z.enum(['COMMON', 'RARE', 'LEGENDARY']);

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const nonBlankApprovalStringSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  'approval value must not be blank',
);

export const approvedPetArtV1Schema = z.object({
  thumbnailUrl: z.string().url().refine((value) => value.startsWith('https://'), 'art URL must use HTTPS'),
  thumbnailSha256: sha256Schema,
  fullUrl: z.string().url().refine((value) => value.startsWith('https://'), 'art URL must use HTTPS'),
  fullSha256: sha256Schema,
}).strict();
export type ApprovedPetArtV1 = z.infer<typeof approvedPetArtV1Schema>;

const dailyPetLoopPolicyV1Shape = {
  schemaVersion: z.literal(1),
  policyRevision: z.literal('daily-pet-loop-v1'),
  timezone: z.literal('Asia/Seoul'),
  dailyDraw: z.object({
    seriesId: z.literal('DAILY_FREE_DRAW_V1'),
    businessKey: z.tuple([
      z.literal('subjectKey'),
      z.literal('kstClaimDate'),
      z.literal('seriesId'),
    ]),
    maxClaimsPerKstDate: z.literal(1),
    accumulates: z.literal(false),
    usesDirectDrawPity: z.literal(false),
    probabilities: z.object({
      COMMON: z.literal(0.8),
      RARE: z.literal(0.18),
      LEGENDARY: z.literal(0.02),
    }).strict(),
  }).strict(),
  duplicatePromotion: z.object({
    seriesId: z.literal('DAILY_PET_PROMOTION_V1'),
    ownedCopiesRequired: z.literal(11),
    spareCopiesConsumed: z.literal(10),
    retainBaseCopies: z.literal(1),
    transitions: z.object({
      COMMON: z.literal('RARE'),
      RARE: z.literal('LEGENDARY'),
    }).strict(),
    legendaryOutcome: z.literal('COSMETIC_REWARD_POLICY_REQUIRED'),
  }).strict(),
  showcase: z.object({
    maxFavoritePets: z.literal(3),
    rejectUnknownFields: z.literal(true),
  }).strict(),
} as const;

export const dailyPetLoopPolicyV1Schema = z.discriminatedUnion('status', [
  z.object({
    ...dailyPetLoopPolicyV1Shape,
    status: z.literal('DRAFT'),
  }).strict(),
  z.object({
    ...dailyPetLoopPolicyV1Shape,
    status: z.literal('APPROVED'),
    approvalDecisionId: nonBlankApprovalStringSchema,
    approvedBy: nonBlankApprovalStringSchema,
    approvedAt: z.iso.datetime({ precision: 3, offset: false }),
  }).strict(),
]);
export type DailyPetLoopPolicyV1 = z.infer<typeof dailyPetLoopPolicyV1Schema>;
export type ApprovedDailyPetLoopPolicyV1 = Extract<DailyPetLoopPolicyV1, { status: 'APPROVED' }>;

export function parseDailyPetLoopPolicyV1(input: unknown): DailyPetLoopPolicyV1 {
  return dailyPetLoopPolicyV1Schema.parse(input);
}

export const pinnedPetPolicyV1Schema = z.object({
  economyVersion: z.string().min(1),
  economyHash: sha256Schema,
  catalogRevision: z.string().min(1),
  catalogHash: sha256Schema,
}).strict();
export type PinnedPetPolicyV1 = z.infer<typeof pinnedPetPolicyV1Schema>;

export const dailyFreeDrawV1Schema = pinnedPetPolicyV1Schema.extend({
  claimDate: z.iso.date(),
  seriesId: z.literal('DAILY_FREE_DRAW_V1'),
  pet: z.object({
    userPetId: uuidSchema,
    petId: uuidSchema,
    rarity: petRarityV1Schema,
    copies: z.number().int().positive(),
  }).strict(),
}).strict();
export type DailyFreeDrawV1 = z.infer<typeof dailyFreeDrawV1Schema>;

const petCollectionItemBaseV1Schema = z.object({
  userPetId: z.string().min(1),
  petId: z.string().min(1),
  rarity: petRarityV1Schema,
  displayKey: z.string().min(1),
  level: z.number().int().positive(),
  xp: z.number().int().nonnegative(),
  copies: z.number().int().positive(),
  selected: z.boolean(),
  locked: z.boolean(),
  art: approvedPetArtV1Schema,
}).strict();
export const petCollectionItemV1Schema = z.discriminatedUnion('acquisitionDateStatus', [
  petCollectionItemBaseV1Schema.extend({
    acquiredAt: z.iso.datetime({ offset: true }),
    acquisitionDateStatus: z.literal('KNOWN'),
  }),
  petCollectionItemBaseV1Schema.extend({
    acquiredAt: z.null(),
    acquisitionDateStatus: z.literal('UNAVAILABLE_LEGACY'),
  }),
]);
export type PetCollectionItemV1 = z.infer<typeof petCollectionItemV1Schema>;

const rarityProgressV1Schema = z.object({
  ownedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
}).strict();

export const petCollectionV1Schema = z.object({
  claimedToday: z.boolean(),
  ownedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  rarityProgress: z.object({
    COMMON: rarityProgressV1Schema,
    RARE: rarityProgressV1Schema,
    LEGENDARY: rarityProgressV1Schema,
  }).strict(),
  pets: z.array(petCollectionItemV1Schema),
}).strict();
export type PetCollectionV1 = z.infer<typeof petCollectionV1Schema>;

export const showcasePetV1Schema = z.object({
  petId: z.string().min(1),
  displayKey: z.string().min(1),
  rarity: petRarityV1Schema,
  art: approvedPetArtV1Schema,
}).strict();

export const petShowcaseV1Schema = z.object({
  nickname: z.string().trim().min(1).max(32),
  selectedPet: showcasePetV1Schema.nullable(),
  favoritePets: z.array(showcasePetV1Schema).max(3, 'favorite pets may contain at most three entries'),
  collectionPercentage: z.number().min(0).max(100),
  championStarCount: z.number().int().nonnegative(),
  historicalNumberOneCount: z.number().int().nonnegative(),
  approvedCosmetics: z.array(z.object({
    cosmeticId: z.string().min(1),
    displayKey: z.string().min(1),
  }).strict()),
}).strict();
export type PetShowcaseV1 = z.infer<typeof petShowcaseV1Schema>;

export const duplicatePromotionV1Schema = pinnedPetPolicyV1Schema.extend({
  consumed: z.object({
    petId: uuidSchema,
    copies: z.literal(10),
    rows: z.array(z.object({
      userPetId: uuidSchema,
      copies: z.number().int().positive(),
    }).strict()).min(1),
  }).strict(),
  remainingCopies: z.number().int().positive(),
  output: z.object({
    userPetId: uuidSchema,
    petId: uuidSchema,
    rarity: z.enum(['RARE', 'LEGENDARY']),
    copies: z.number().int().positive(),
  }).strict(),
}).strict();
export type DuplicatePromotionV1 = z.infer<typeof duplicatePromotionV1Schema>;
