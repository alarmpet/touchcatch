import { z } from 'zod';
import { canonicalJsonSha256 } from './canonical-json.js';

type DeepReadonly<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

const nonBlankStringSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  'approval value must not be blank',
);

const approvalShape = {
  approvalDecisionId: nonBlankStringSchema,
  approvedBy: nonBlankStringSchema,
  approvedAt: z.iso.datetime({ offset: true }),
} as const;

const hintShape = {
  schemaVersion: z.literal('1.0.0'),
  policyVersion: z.literal('hint-policy-v1-candidate'),
  stepsPerChallenge: z.literal(5),
  runtimeLlmGeneration: z.literal(false),
  ranked: z.object({
    petEffects: z.literal('COSMETIC_ONLY'),
    penaltyPerStep: z.literal(15_000),
  }).strict(),
} as const;

const progressionShape = {
  schemaVersion: z.literal('1.0.0'),
  policyVersion: z.literal('learning-progression-v1-candidate'),
  accountXp: z.object({
    firstCompletion: z.literal(30),
    allObjectivesCorrect: z.literal(10),
    noHint: z.literal(10),
    repeatPersonalBest: z.literal(5),
    dailyChallengeCap: z.literal(200),
  }).strict(),
  selectedPetXp: z.object({
    firstCompletion: z.literal(15),
    allObjectivesCorrect: z.literal(5),
    noHint: z.literal(5),
    repeatPersonalBest: z.literal(2),
    dailyChallengeCap: z.literal(100),
  }).strict(),
  drawPoints: z.object({
    firstCompletion: z.literal(10),
    weeklyCategoryParticipation: z.literal(20),
    dailyCap: z.literal(100),
  }).strict(),
} as const;

const competitionShape = {
  schemaVersion: z.literal('1.0.0'),
  policyVersion: z.literal('weekly-competition-v1-candidate'),
  timezone: z.literal('Asia/Seoul'),
  categories: z.tuple([
    z.literal('ENGLISH'),
    z.literal('PROVERB'),
  ]),
  disabledCategories: z.tuple([
    z.literal('IDIOM'),
    z.literal('GENERAL_KNOWLEDGE'),
  ]),
  challengesPerCategory: z.literal(5),
  challengePinning: z.literal('PINNED_PUBLISHED_REVISIONS'),
  rankedRecord: z.literal('BEST_COMPLETED_VERIFIED'),
  ranked: z.object({
    petEffects: z.literal('COSMETIC_ONLY'),
  }).strict(),
  rankOneReward: z.object({
    rank: z.literal(1),
    rewardType: z.literal('RARE_ONLY_TICKET_V1'),
    quantity: z.literal(1),
    eligibleRarities: z.tuple([z.literal('RARE')]),
    selection: z.literal('UNIFORM_WITHIN_PINNED_RARE'),
    affectsDirectDrawPity: z.literal(false),
  }).strict(),
} as const;

const hintPolicySchema = z.discriminatedUnion('status', [
  z.object({ ...hintShape, status: z.literal('DRAFT') }).strict(),
  z.object({ ...hintShape, status: z.literal('APPROVED'), ...approvalShape }).strict(),
]);
const progressionPolicySchema = z.discriminatedUnion('status', [
  z.object({ ...progressionShape, status: z.literal('DRAFT') }).strict(),
  z.object({ ...progressionShape, status: z.literal('APPROVED'), ...approvalShape }).strict(),
]);
const competitionPolicySchema = z.discriminatedUnion('status', [
  z.object({ ...competitionShape, status: z.literal('DRAFT') }).strict(),
  z.object({ ...competitionShape, status: z.literal('APPROVED'), ...approvalShape }).strict(),
]);

export type HintPolicyV1 = DeepReadonly<z.infer<typeof hintPolicySchema>>;
export type LearningProgressionV1 = DeepReadonly<z.infer<typeof progressionPolicySchema>>;
export type WeeklyCompetitionV1 = DeepReadonly<z.infer<typeof competitionPolicySchema>>;
export type ApprovedHintPolicyV1 = Extract<HintPolicyV1, { status: 'APPROVED' }>;
export type ApprovedLearningProgressionV1 = Extract<LearningProgressionV1, { status: 'APPROVED' }>;
export type ApprovedWeeklyCompetitionV1 = Extract<WeeklyCompetitionV1, { status: 'APPROVED' }>;

export type PolicyWithCanonicalHash<Policy> = Readonly<{
  policy: Policy;
  canonicalHash: string;
}>;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function withCanonicalHash<Policy>(
  policy: Policy,
): PolicyWithCanonicalHash<Policy> {
  const result: PolicyWithCanonicalHash<Policy> = {
    policy,
    canonicalHash: canonicalJsonSha256(policy),
  };
  deepFreeze(result);
  return result;
}

function requireApproved<Policy extends { readonly status: 'DRAFT' | 'APPROVED' }>(
  result: PolicyWithCanonicalHash<Policy>,
  policyName: string,
): PolicyWithCanonicalHash<Extract<Policy, { status: 'APPROVED' }>> {
  if (result.policy.status !== 'APPROVED') {
    throw new TypeError(`${policyName} production loading requires APPROVED status`);
  }
  return result as PolicyWithCanonicalHash<Extract<Policy, { status: 'APPROVED' }>>;
}

export function parseHintPolicyV1(input: unknown): HintPolicyV1 {
  return deepFreeze(hintPolicySchema.parse(input));
}

export function parseLearningProgressionV1(input: unknown): LearningProgressionV1 {
  return deepFreeze(progressionPolicySchema.parse(input));
}

export function parseWeeklyCompetitionV1(input: unknown): WeeklyCompetitionV1 {
  return deepFreeze(competitionPolicySchema.parse(input));
}

export function parseHintPolicyV1WithHash(
  input: unknown,
): PolicyWithCanonicalHash<HintPolicyV1> {
  return withCanonicalHash(parseHintPolicyV1(input));
}

export function parseLearningProgressionV1WithHash(
  input: unknown,
): PolicyWithCanonicalHash<LearningProgressionV1> {
  return withCanonicalHash(parseLearningProgressionV1(input));
}

export function parseWeeklyCompetitionV1WithHash(
  input: unknown,
): PolicyWithCanonicalHash<WeeklyCompetitionV1> {
  return withCanonicalHash(parseWeeklyCompetitionV1(input));
}

export function loadApprovedHintPolicyV1(
  input: unknown,
): PolicyWithCanonicalHash<ApprovedHintPolicyV1> {
  return requireApproved(parseHintPolicyV1WithHash(input), 'hint policy');
}

export function loadApprovedLearningProgressionV1(
  input: unknown,
): PolicyWithCanonicalHash<ApprovedLearningProgressionV1> {
  return requireApproved(parseLearningProgressionV1WithHash(input), 'learning progression');
}

export function loadApprovedWeeklyCompetitionV1(
  input: unknown,
): PolicyWithCanonicalHash<ApprovedWeeklyCompetitionV1> {
  return requireApproved(parseWeeklyCompetitionV1WithHash(input), 'weekly competition');
}
