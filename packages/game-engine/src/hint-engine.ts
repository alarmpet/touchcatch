import type {
  HintKind,
  HintStepV1,
  PublicHintRegionV1,
} from '../../contracts/src/content.js';
import type {
  CoachArchetype,
  PetRarity,
} from '../../contracts/src/pet-catalog.js';

export type LearningHintMode = 'CASUAL' | 'RANKED';
export type HintOrdinal = 1 | 2 | 3 | 4 | 5;

export type HintPetContext = Readonly<{
  rarity: PetRarity;
  level?: number;
  coachArchetype: CoachArchetype;
}>;

export type HintRevealInput = Readonly<{
  mode: LearningHintMode;
  steps: readonly HintStepV1[] | undefined;
  revealedOrdinals: readonly HintOrdinal[];
  expectedOrdinal?: number;
  coachCharges: number;
  locale?: 'ko' | 'en';
  pet?: HintPetContext;
}>;

type HintRevealCurrentStep = Readonly<{
  status: 'REVEALED';
  ordinal: HintOrdinal;
  kind: HintKind;
  localizedText: string;
  revealIndexes: readonly number[];
  publicRegion: PublicHintRegionV1 | null;
  rankedPenaltyUnits: 0 | 1;
  cumulativeRankedPenaltyUnits: number;
}>;

export type HintRevealResult =
  | (HintRevealCurrentStep & Readonly<{
      mode: 'CASUAL';
      coachChargesRemaining: number;
      coachChargeUsed: boolean;
    }>)
  | (HintRevealCurrentStep & Readonly<{ mode: 'RANKED' }>)
  | Readonly<{
      status: 'REJECTED';
      reason: 'INVALID_HINT_LADDER' | 'INVALID_REVEAL_STATE';
    }>
  | Readonly<{
      status: 'REJECTED';
      reason: 'HINT_ORDINAL_CONFLICT';
      nextOrdinal: HintOrdinal;
    }>
  | Readonly<{
      status: 'REJECTED';
      reason: 'NO_HINT_REMAINING';
    }>;

function isHintOrdinal(value: number): value is HintOrdinal {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function hasValidOrderedLadder(
  steps: readonly HintStepV1[] | undefined,
): steps is readonly [HintStepV1, HintStepV1, HintStepV1, HintStepV1, HintStepV1] {
  return steps?.length === 5
    && steps.every((step, index) => step.ordinal === index + 1);
}

export function revealNextHint(input: HintRevealInput): HintRevealResult {
  if (!hasValidOrderedLadder(input.steps)) {
    return { status: 'REJECTED', reason: 'INVALID_HINT_LADDER' };
  }
  if (
    !Number.isSafeInteger(input.coachCharges)
    || input.coachCharges < 0
    || new Set(input.revealedOrdinals).size !== input.revealedOrdinals.length
    || input.revealedOrdinals.some((ordinal) => !isHintOrdinal(ordinal))
  ) {
    return { status: 'REJECTED', reason: 'INVALID_REVEAL_STATE' };
  }

  const revealed = new Set(input.revealedOrdinals);
  const step = input.steps.find(({ ordinal }) => !revealed.has(ordinal));
  if (step === undefined) {
    return { status: 'REJECTED', reason: 'NO_HINT_REMAINING' };
  }
  if (input.expectedOrdinal !== undefined && input.expectedOrdinal !== step.ordinal) {
    return {
      status: 'REJECTED',
      reason: 'HINT_ORDINAL_CONFLICT',
      nextOrdinal: step.ordinal,
    };
  }

  const rankedPenaltyUnits: 0 | 1 = input.mode === 'RANKED'
    ? step.rankedPenaltyUnits
    : 0;
  const selectedStep = {
    status: 'REVEALED' as const,
    ordinal: step.ordinal,
    kind: step.kind,
    localizedText: step.localizedText[input.locale ?? 'en'],
    revealIndexes: [...step.revealIndexes],
    publicRegion: step.publicRegion ?? null,
    rankedPenaltyUnits,
    cumulativeRankedPenaltyUnits: input.mode === 'RANKED'
      ? input.steps
          .filter(({ ordinal }) => revealed.has(ordinal) || ordinal === step.ordinal)
          .reduce((sum, revealedStep) => sum + revealedStep.rankedPenaltyUnits, 0)
      : 0,
  };

  if (input.mode === 'RANKED') {
    return { ...selectedStep, mode: 'RANKED' };
  }

  const coachChargeUsed = input.coachCharges > 0;
  return {
    ...selectedStep,
    mode: 'CASUAL',
    coachChargesRemaining: coachChargeUsed
      ? input.coachCharges - 1
      : 0,
    coachChargeUsed,
  };
}
