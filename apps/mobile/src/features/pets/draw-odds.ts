import economy from '../../../../../config/economy.v1.json' with { type: 'json' };

/**
 * Builds the drop-rate line shown on the daily free draw from `config/economy.v1.json`.
 *
 * The rates were previously a literal string in the component. They matched the config at the
 * time and nothing kept them matching: editing `draw.probabilities` would have left the screen
 * quoting the old numbers, and a displayed rate that does not match the table actually drawn
 * from is a false disclosure under 게임산업진흥에 관한 법률, not a cosmetic drift. Everything
 * else in this repository already refuses that shape -- the theme is hash-locked, the legal
 * pages are generated from `docs/legal/`, hitboxes are computed rather than transcribed -- so
 * this reads the same source the draw does.
 *
 * Only the Korean labels stay here; the numbers never do.
 */

const RARITY_LABELS: ReadonlyMap<string, string> = new Map([
  ['COMMON', '일반'],
  ['UNCOMMON', '고급'],
  ['RARE', '희귀'],
  ['EPIC', '영웅'],
  ['LEGENDARY', '전설'],
]);

/** Rarest last, matching how the rates read on screen. */
const RARITY_ORDER: readonly string[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

export type DrawOdd = Readonly<{ rarity: string; label: string; percent: number }>;

/**
 * `0.04 * 100` is `4.000000000000001` in floating point often enough that formatting cannot be
 * left to multiplication alone. Rounding to four decimals is far finer than any rate this is
 * likely to carry and removes the artefact; trailing zeros are dropped so `0.25` reads `25`
 * rather than `25.0000`.
 */
function toPercent(probability: number): number {
  return Number((probability * 100).toFixed(4));
}

export function drawOdds(
  probabilities: Readonly<Record<string, number>> = economy.draw.probabilities,
): readonly DrawOdd[] {
  const keys = Object.keys(probabilities);
  const ordered = [
    ...RARITY_ORDER.filter((rarity) => rarity in probabilities),
    // A rarity added to the config but not to the order above still gets shown. Dropping it
    // would understate the table, which is the failure this module exists to prevent.
    ...keys.filter((rarity) => !RARITY_ORDER.includes(rarity)),
  ];
  return ordered.map((rarity) => ({
    rarity,
    label: RARITY_LABELS.get(rarity) ?? rarity,
    percent: toPercent(probabilities[rarity] as number),
  }));
}

export function drawOddsLine(
  probabilities: Readonly<Record<string, number>> = economy.draw.probabilities,
): string {
  const parts = drawOdds(probabilities).map((odd) => `${odd.label} ${odd.percent}%`);
  return `등장 확률: ${parts.join(' · ')}`;
}
