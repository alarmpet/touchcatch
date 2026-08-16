import {
  dailyFreeDrawV1Schema,
  pinnedPetPolicyV1Schema,
  type DailyFreeDrawV1,
  type PinnedPetPolicyV1,
} from '../../../../packages/contracts/src/daily-pet-loop.js';

/** Admitted five-tier daily draw distribution. Mirrors config/daily-pet-loop.v1.json. */
export const DAILY_DRAW_PROBABILITIES_V1 = {
  COMMON: 0.6,
  UNCOMMON: 0.25,
  RARE: 0.1,
  EPIC: 0.04,
  LEGENDARY: 0.01,
} as const;

export interface DailyDrawEffectInputV1 extends PinnedPetPolicyV1 {
  subjectKey: string;
  claimDate: string;
  seriesId: 'DAILY_FREE_DRAW_V1';
  probabilities: typeof DAILY_DRAW_PROBABILITIES_V1;
  /** A tier may be admitted before art exists in it; rolls resolve down to the nearest populated tier. */
  emptyTierResolution: 'STEP_DOWN_TO_NEAREST_POPULATED';
}

export interface DailyDrawRepositoryV1 {
  /**
   * Must lock the subject and commit the unique business key, inventory,
   * history, response receipt, and outbox in one database transaction.
   */
  claimEffectOnce(input: DailyDrawEffectInputV1): Promise<DailyFreeDrawV1>;
}

export interface AuthenticatedEconomySubjectResolverV1 {
  /** Resolve only a currently live auth user linked by economy_subjects.user_id. */
  resolveLinkedSubjectKey(authenticatedUserId: string): Promise<string>;
}

export function kstClaimDateV1(now = new Date()): string {
  if (Number.isNaN(now.getTime())) throw new TypeError('now must be a valid server timestamp');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new TypeError('could not derive Asia/Seoul claim date');
  return `${year}-${month}-${day}`;
}

export async function claimDailyFreeDrawV1(input: {
  authenticatedUserId: string;
  subjectResolver: AuthenticatedEconomySubjectResolverV1;
  now?: Date;
  policy: PinnedPetPolicyV1 & { status: 'DRAFT' | 'APPROVED' };
  repository: DailyDrawRepositoryV1;
}): Promise<DailyFreeDrawV1> {
  if (input.policy.status !== 'APPROVED') throw new TypeError('daily draw requires APPROVED economy and catalog pins');
  const policy = pinnedPetPolicyV1Schema.parse({
    economyVersion: input.policy.economyVersion,
    economyHash: input.policy.economyHash,
    catalogRevision: input.policy.catalogRevision,
    catalogHash: input.policy.catalogHash,
  });
  const subjectKey = await input.subjectResolver.resolveLinkedSubjectKey(input.authenticatedUserId);
  if (!subjectKey) throw new TypeError('AUTH_SUBJECT_REQUIRED');
  const response = await input.repository.claimEffectOnce({
    subjectKey,
    claimDate: kstClaimDateV1(input.now),
    seriesId: 'DAILY_FREE_DRAW_V1',
    probabilities: DAILY_DRAW_PROBABILITIES_V1,
    emptyTierResolution: 'STEP_DOWN_TO_NEAREST_POPULATED',
    ...policy,
  });
  return dailyFreeDrawV1Schema.parse(response);
}
