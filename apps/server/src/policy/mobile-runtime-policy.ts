import {
  parseDailyPetLoopPolicyV1,
  type DailyPetLoopPolicyV1,
} from '../../../../packages/contracts/src/daily-pet-loop.js';
import {
  loadProductionEconomy,
  parseEconomy,
  parsePetCatalog,
} from '../../../../packages/contracts/src/economy.schema.js';
import {
  parseWeeklyCompetitionV1WithHash,
  type WeeklyCompetitionV1,
} from '../../../../packages/contracts/src/learning-policy.js';
import { parsePetRuntimeArtV1 } from '../../../../packages/contracts/src/pet-runtime-art.js';
import { approvalGroupIsVerified, runtimeArtAssetsAreVerified, runtimeArtRightsEvidenceIsApproved, runtimeArtSourcesAreApproved } from '../../../../tools/check-pet-runtime-approval.mjs';

type DisabledPolicyCode =
  | 'REWARD_POLICY_NOT_APPROVED'
  | 'RANKING_POLICY_NOT_APPROVED'
  | 'PET_ART_NOT_APPROVED';

export type MobileRuntimePolicyState =
  | Readonly<{ enabled: false; code: DisabledPolicyCode }>
  | Readonly<{
      enabled: true;
      economyVersion: string;
      economyHash: string;
      catalogRevision: string;
      catalogHash: string;
      competitionPolicyHash: string;
    }>;

export type MobileRuntimePolicy = Readonly<{
  rewards: MobileRuntimePolicyState;
  ranking: MobileRuntimePolicyState;
}>;

type ApprovalEnvelope = Readonly<{
  status: 'DRAFT' | 'APPROVED';
  approvalDecisionId?: string;
  approvedBy?: string;
}>;

function hasProductionApproval(artifact: ApprovalEnvelope): boolean {
  return artifact.status === 'APPROVED'
    && typeof artifact.approvalDecisionId === 'string'
    && artifact.approvalDecisionId.trim() !== ''
    && artifact.approvalDecisionId === artifact.approvalDecisionId.trim()
    && !/^test-/i.test(artifact.approvalDecisionId.trim())
    && typeof artifact.approvedBy === 'string'
    && artifact.approvedBy.trim() !== ''
    && artifact.approvedBy === artifact.approvedBy.trim()
    && !/^test-/i.test(artifact.approvedBy.trim());
}

function dailyPolicyIsApproved(policy: DailyPetLoopPolicyV1): boolean {
  return hasProductionApproval(policy);
}

function competitionPolicyIsApproved(policy: WeeklyCompetitionV1): boolean {
  return hasProductionApproval(policy);
}

export function loadMobileRuntimePolicy(input: Readonly<{
  economy: unknown;
  catalog: unknown;
  dailyPetLoop: unknown;
  weeklyCompetition: unknown;
  petRuntimeArt?: unknown;
  sourceManifest?: unknown;
  approvalRecords?: readonly unknown[];
  trustedApprovalSigners?: unknown;
  trustedApprovalSignerRegistrySha256?: string;
  assetFileHashes?: Readonly<Record<string, string | null>>;
  rightsEvidence?: unknown;
}>): MobileRuntimePolicy {
  const economy = parseEconomy(input.economy);
  const catalog = parsePetCatalog(input.catalog);
  const dailyPetLoop = parseDailyPetLoopPolicyV1(input.dailyPetLoop);
  const weeklyCompetition = parseWeeklyCompetitionV1WithHash(input.weeklyCompetition);

  let artApproved = false;
  try {
    const art = parsePetRuntimeArtV1(input.petRuntimeArt, catalog);
    artApproved = hasProductionApproval(art)
      && approvalGroupIsVerified(input, 'PET_RUNTIME_ART_V1')
      && runtimeArtSourcesAreApproved(input)
      && runtimeArtAssetsAreVerified(input)
      && runtimeArtRightsEvidenceIsApproved(input);
  } catch {
    artApproved = false;
  }

  let productionEconomy: ReturnType<typeof loadProductionEconomy> | null = null;
  const economyApproved = hasProductionApproval(economy) && hasProductionApproval(catalog)
    && approvalGroupIsVerified(input, 'PET_ECONOMY_V1');
  if (economyApproved) {
    try {
      productionEconomy = loadProductionEconomy(economy, catalog, {});
    } catch {
      productionEconomy = null;
    }
  }

  const sharedEnabledState = productionEconomy === null
    ? null
    : {
        enabled: true as const,
        economyVersion: productionEconomy.economyVersion,
        economyHash: productionEconomy.economyHash,
        catalogRevision: productionEconomy.catalogRevision,
        catalogHash: productionEconomy.catalogHash,
        competitionPolicyHash: weeklyCompetition.canonicalHash,
      };

  const rewards: MobileRuntimePolicyState = !artApproved
    ? { enabled: false, code: 'PET_ART_NOT_APPROVED' }
    : sharedEnabledState !== null && dailyPolicyIsApproved(dailyPetLoop)
      && approvalGroupIsVerified(input, 'DAILY_PET_LOOP_V1')
      ? sharedEnabledState
      : { enabled: false, code: 'REWARD_POLICY_NOT_APPROVED' };

  const ranking: MobileRuntimePolicyState = sharedEnabledState !== null
    && competitionPolicyIsApproved(weeklyCompetition.policy)
    && approvalGroupIsVerified(input, 'WEEKLY_COMPETITION_V1')
    ? sharedEnabledState
    : { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' };

  return { rewards, ranking };
}
