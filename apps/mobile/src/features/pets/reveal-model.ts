import { PET_RARITY_LADDER, petRarityRank, type PetRarity } from '../../../../../packages/contracts/src/pet-catalog';

/**
 * Pet reveal model.
 *
 * The server decides the outcome before the client ever animates (pre-determination),
 * so this module never randomises anything. It only sequences how an already-decided
 * result is presented, and derives honest progress copy from data the client already has.
 *
 * This module used to exclude escalating presentation outright. That has been narrowed
 * rather than dropped, because the two things it lumped together are not the same:
 *
 *   - Climbing the tier ladder up to an outcome the server already decided is theatre over
 *     a settled fact. It cannot mislead, because nothing about the result depends on it.
 *   - Implying a future pull is owed — "you're due", a meter that fills faster near the
 *     end, a tease that suggests the next one will be better — is still excluded. That is
 *     the part that manipulates, and it stays out.
 *
 * The pity counter is disclosure, not a promise: it reports a threshold the economy already
 * guarantees. Nothing here randomises, and nothing here can change what was awarded.
 */

export type RevealSource = 'DAILY_DRAW' | 'PROMOTION';
export type RevealPhase = 'SEALED' | 'OPENING' | 'REVEALED';

export type PetRevealV1 = Readonly<{
  source: RevealSource;
  petId: string;
  rarity: PetRarity;
  copies: number;
  /** True when this acquisition added a pet the collection did not already contain. */
  isFirstCopy: boolean;
}>;

/** How long the final beat holds before the result is shown. */
export const REVEAL_OPENING_MS = 620;

/** How long the presentation rests on each tier it climbs through on the way up. */
export const REVEAL_STEP_MS = 360;

export function nextRevealPhase(phase: RevealPhase): RevealPhase {
  if (phase === 'SEALED') return 'OPENING';
  if (phase === 'OPENING') return 'REVEALED';
  return 'REVEALED';
}

/**
 * The tiers the reveal climbs through, ending on the one actually awarded.
 *
 * A COMMON draw is a single step and stays brisk — 60% of draws are COMMON, and a long
 * ceremony on the ordinary outcome is a toll rather than a reward. A LEGENDARY climbs the
 * whole ladder, so the rarity is legible from how far the presentation travelled before it
 * stopped. Every step shows a tier that was genuinely passed on the ladder; none of them
 * claims the result is still open.
 */
export function revealLadder(rarity: PetRarity): readonly PetRarity[] {
  return PET_RARITY_LADDER.slice(0, petRarityRank(rarity) + 1);
}

/**
 * Total run time for a reveal, derived from how many tiers it has to climb.
 *
 * COMMON 620ms through LEGENDARY 2060ms. The player can always cut it short, so this is a
 * ceiling on the ceremony rather than a duration anyone is held to.
 */
export function revealDurationMs(rarity: PetRarity): number {
  return petRarityRank(rarity) * REVEAL_STEP_MS + REVEAL_OPENING_MS;
}

export type RevealEmphasis = 'QUIET' | 'NOTABLE' | 'CELEBRATE';

/**
 * Emphasis rises with the rarity ladder, but a first copy always reads as an
 * achievement — collecting a new COMMON pet still completes the 도감.
 */
export function revealEmphasis(rarity: PetRarity, isFirstCopy: boolean): RevealEmphasis {
  const rank = petRarityRank(rarity);
  if (rank >= petRarityRank('EPIC')) return 'CELEBRATE';
  if (rank >= petRarityRank('RARE') || isFirstCopy) return 'NOTABLE';
  return 'QUIET';
}

export type RevealPresentation = Readonly<{
  eyebrow: string;
  headline: string;
  detail: string;
  emphasis: RevealEmphasis;
}>;

const sourceEyebrow: Readonly<Record<RevealSource, string>> = {
  DAILY_DRAW: '오늘의 펫',
  PROMOTION: '승급 완료',
};

export function revealPresentation(reveal: PetRevealV1, rarityLabel: string): RevealPresentation {
  const emphasis = revealEmphasis(reveal.rarity, reveal.isFirstCopy);
  const headline = reveal.isFirstCopy ? `새로운 ${rarityLabel} 친구` : `${rarityLabel} 친구를 또 만났어요`;
  const detail = reveal.isFirstCopy
    ? '도감에 새로 기록됐어요.'
    : `보유 ${reveal.copies}마리째. 모으면 위 등급으로 승급할 수 있어요.`;
  return { eyebrow: sourceEyebrow[reveal.source], headline, detail, emphasis };
}

/** Copies still needed before this pet can be promoted, or null when promotion does not apply. */
export function copiesUntilPromotion(input: Readonly<{
  rarity: PetRarity;
  ownedCopies: number;
  eligibleCopies: number;
  ownedCopiesRequired?: number;
  spareCopiesConsumed?: number;
}>): number | null {
  if (input.rarity === 'LEGENDARY') return null;
  const required = input.ownedCopiesRequired ?? 11;
  const spare = input.spareCopiesConsumed ?? 10;
  const missingTotal = Math.max(0, required - input.ownedCopies);
  const missingSpare = Math.max(0, spare - input.eligibleCopies);
  return Math.max(missingTotal, missingSpare);
}

export type RarityProgressV1 = Readonly<{ ownedCount: number; totalCount: number }>;

/**
 * Orders the tier progress rows by the admitted ladder and drops tiers that hold no
 * pets at all, so empty admitted tiers do not read as "0% collected" failures.
 */
export function orderedRarityProgress(
  progress: Readonly<Partial<Record<PetRarity, RarityProgressV1>>>,
): ReadonlyArray<Readonly<{ rarity: PetRarity; ownedCount: number; totalCount: number; ratio: number }>> {
  return PET_RARITY_LADDER.flatMap((rarity) => {
    const row = progress[rarity];
    if (!row || row.totalCount <= 0) return [];
    return [{
      rarity,
      ownedCount: row.ownedCount,
      totalCount: row.totalCount,
      ratio: row.ownedCount / row.totalCount,
    }];
  });
}
