import {
  dailyFreeDrawV1Schema,
  pinnedPetPolicyV1Schema,
  type DailyFreeDrawV1,
  type PinnedPetPolicyV1,
} from '../../../../packages/contracts/src/daily-pet-loop.js';

export interface DailyDrawEffectInputV1 extends PinnedPetPolicyV1 {
  subjectKey: string;
  claimDate: string;
  seriesId: 'DAILY_FREE_DRAW_V1';
  probabilities: { COMMON: 0.8; RARE: 0.18; LEGENDARY: 0.02 };
}

export interface DailyDrawRepositoryV1 {
  /**
   * Must lock the subject and commit the unique business key, inventory,
   * history, response receipt, and outbox in one database transaction.
   */
  claimEffectOnce(input: DailyDrawEffectInputV1): Promise<DailyFreeDrawV1>;
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
  subjectKey: string;
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
  const response = await input.repository.claimEffectOnce({
    subjectKey: input.subjectKey,
    claimDate: kstClaimDateV1(input.now),
    seriesId: 'DAILY_FREE_DRAW_V1',
    probabilities: { COMMON: 0.8, RARE: 0.18, LEGENDARY: 0.02 },
    ...policy,
  });
  return dailyFreeDrawV1Schema.parse(response);
}
