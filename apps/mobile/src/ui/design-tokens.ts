/**
 * TouchCatch — Minimal Light design tokens.
 *
 * Palette is intentionally aligned with the frozen UI contract
 * (`config/ui-theme.v1.json`) so runtime screens and the contract-bound
 * BattleScreen read as one product. The frozen JSON is hash-locked and is
 * never edited from here.
 *
 * Design intent: white surfaces, one calm accent, hairline borders, generous
 * whitespace, type-led hierarchy. No decorative gradients or heavy fills.
 */

/** Legacy keys are kept so older call sites keep compiling. */
export const colors = {
  // canvas / surfaces
  canvas: '#F5FAFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5FA',
  white: '#FFFFFF',

  // text
  ink: '#0B2347',
  inkSoft: '#3B4C66',
  muted: '#5E6C80',
  faint: '#93A1B4',
  onAccent: '#FFFFFF',

  // lines
  line: '#E6EEF7',
  lineStrong: '#D4E5F2',

  // accent + semantics
  accent: '#0068D9',
  /** Lifts off the dark hero surface where the standard accent goes muddy. */
  accentBright: '#35A8FF',
  accentSoft: '#EAF3FF',
  accentPressed: '#0B2F76',
  success: '#00875A',
  successSoft: '#E6F4EF',
  warning: '#B76E00',
  warningSoft: '#FFF6E0',
  danger: '#D63B4A',
  dangerSoft: '#FDECEE',
  reward: '#FFD447',

  // disabled
  disabled: '#E7EDF4',
  disabledInk: '#93A1B4',

  // legacy aliases
  sky: '#0068D9',
  mint: '#00875A',
  sun: '#FFD447',
  coral: '#D63B4A',
} as const;

/** Ascending five-tier pet rarity ladder. Mirrors packages/contracts PET_RARITY_LADDER. */
export const rarityLadder = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;
export type RarityKey = (typeof rarityLadder)[number];

export const rarityLabels: Readonly<Record<RarityKey, string>> = {
  COMMON: '일반',
  UNCOMMON: '고급',
  RARE: '희귀',
  EPIC: '영웅',
  LEGENDARY: '전설',
};

/** One quiet tint per tier — restrained enough to stay inside the Minimal Light palette. */
export const rarityPalette: Readonly<Record<RarityKey, { bg: string; fg: string }>> = {
  COMMON: { bg: '#F1F5FA', fg: '#5E6C80' },
  UNCOMMON: { bg: '#E7F4EE', fg: '#00875A' },
  RARE: { bg: '#EAF3FF', fg: '#0068D9' },
  EPIC: { bg: '#F1EDFB', fg: '#6B4BC4' },
  LEGENDARY: { bg: '#FFF6E0', fg: '#B76E00' },
};

/**
 * One tint per learning category.
 *
 * The three mode cards were identical white boxes, which made the row read as three
 * placeholder buttons rather than three different things to do. Colour is what lets a player
 * find the mode they want without reading. Values are additive — the frozen theme in
 * `config/ui-theme.v1.json` is hash-locked and nothing here edits it.
 */
export const categoryPalette = {
  ENGLISH: { bg: '#EAF3FF', fg: '#0068D9', edge: '#CFE4FF' },
  PROVERB: { bg: '#E9F5EF', fg: '#00875A', edge: '#CDEADC' },
  IDIOM: { bg: '#F2EDFC', fg: '#6B4BC4', edge: '#E0D6F7' },
  GENERAL_KNOWLEDGE: { bg: '#FFF4E2', fg: '#B76E00', edge: '#FCE6C2' },
} as const;

export type CategoryKey = keyof typeof categoryPalette;

/**
 * Gradient pairs, both ends drawn from the palette above.
 *
 * The frozen contract already calls for a header gradient; the hero deepens the top end so
 * white type keeps its contrast all the way down the card.
 */
/**
 * Podium tints for the top three.
 *
 * A leaderboard's whole appeal is the top of it, and colouring ranks 1–3 identically with
 * every other row throws that away. Everyone below the podium stays neutral so the three
 * still read as exceptional.
 */
export const podiumPalette = {
  1: { bg: '#FFF3D1', fg: '#A9760A' },
  2: { bg: '#EEF1F5', fg: '#5E6C80' },
  3: { bg: '#FBEDE2', fg: '#9A5B2B' },
} as const;

export const gradients = {
  hero: { from: '#0B2F76', to: '#0068D9' },
  header: { from: '#0068D9', to: '#35A8FF' },
} as const;

export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  xs: 8,
  sm: 10,
  button: 14,
  md: 14,
  card: 18,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const border = {
  hairline: 1,
} as const;

/** Soft, single-direction elevation. Kept subtle on purpose. */
export const shadow = {
  none: {},
  card: {
    shadowColor: '#0B2347',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 1,
  },
  lifted: {
    shadowColor: '#0B2347',
    shadowOpacity: 0.09,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 3,
  },
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8 },
} as const;

export const layout = {
  screenX: spacing.lg,
  screenTop: spacing.xl,
  screenBottom: spacing.xxxl,
  sectionGap: spacing.xxl,
  minTouch: 44,
  maxContentWidth: 520,
} as const;
