/**
 * TouchCatch — Minimal Light design tokens.
 *
 * Palette is intentionally aligned with the frozen UI contract
 * (`config/ui-theme.v1.json`) so runtime screens and the contract-bound
 * BattleScreen read as one product. The frozen JSON is hash-locked and is
 * never edited from here.
 *
 * The file carries two layers.
 *
 * The base layer — `colors`, `spacing`, `radius`, `typography` — is matched value
 * for value against the frozen theme. BattleScreen is bound to that contract, so
 * changing an existing value here silently pulls the two apart. Base tokens are
 * added to, never edited.
 *
 * The vivid layer below it — gradients, glows, glass, dark surfaces — is additive
 * and exists for the player-facing screens (home, ranking, collection, profile).
 * Those screens are not in the contract's enforced set, and a learning game aimed
 * at children cannot carry its whole personality in hairline borders. The vivid
 * layer is built out of the base palette rather than beside it, so the two still
 * read as one product where they meet.
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

/* ------------------------------------------------------------------ *
 *  Vivid layer. Additive — nothing above this line is edited.
 * ------------------------------------------------------------------ */

/**
 * Saturated hues for the vivid layer.
 *
 * These are deliberately hotter than `colors`. They never sit on white on their own:
 * every one of them appears either inside a gradient or behind white type, where the
 * saturation reads as energy rather than noise.
 */
export const vivid = {
  violet: '#6A3DF0',
  indigo: '#3B2BC4',
  magenta: '#E0479E',
  cyan: '#22D3EE',
  azure: '#2A7BFF',
  lime: '#3DD68C',
  amber: '#FFB020',
  rose: '#FF5A7A',
  ink: '#0A1633',
  inkDeep: '#060D22',
} as const;

/**
 * Three-stop gradients.
 *
 * Two stops between related hues make a flat wash; the middle stop is what gives the
 * fill somewhere to travel. `via` is the stop that carries the character — drop it and
 * every one of these collapses into the same blue-to-blue as the base header.
 */
export const vividGradients = {
  /** Home hero. Night indigo through violet into magenta. */
  hero: { from: '#1B1160', via: '#5B2BD9', to: '#C13BB0' },
  /** Ranking header. Reads as podium light rather than sky. */
  podium: { from: '#3B1E6E', via: '#8B2FC9', to: '#FF7A59' },
  /** Pet collection header. Cooler, so the rarity colours below it stay legible. */
  collection: { from: '#0C2A6B', via: '#2A6BE0', to: '#22D3EE' },
  /** Profile header. */
  profile: { from: '#12144A', via: '#3B2BC4', to: '#6A3DF0' },
  /** Progress and CTA fills that sit on a dark ground. */
  action: { from: '#22D3EE', via: '#3DD68C', to: '#A7F36B' },
} as const;

export type VividGradientKey = keyof typeof vividGradients;

/** One gradient per rarity, so a legendary pet is visibly a different object. */
export const rarityGradients: Readonly<Record<RarityKey, { from: string; via: string; to: string }>> = {
  COMMON: { from: '#8FA3BC', via: '#A8BACE', to: '#C7D5E3' },
  UNCOMMON: { from: '#0F9D6B', via: '#3DD68C', to: '#9BEFC4' },
  RARE: { from: '#1D5FD6', via: '#2A7BFF', to: '#7EC2FF' },
  EPIC: { from: '#6A3DF0', via: '#9B5CF6', to: '#D8B4FE' },
  LEGENDARY: { from: '#E08A00', via: '#FFB020', to: '#FFE08A' },
};

/** One gradient per learning mode, matched to the existing categoryPalette hues. */
export const categoryGradients: Readonly<Record<CategoryKey, { from: string; via: string; to: string }>> = {
  ENGLISH: { from: '#1D5FD6', via: '#2A7BFF', to: '#5AA9FF' },
  PROVERB: { from: '#0F9D6B', via: '#2FC489', to: '#6FE0AF' },
  IDIOM: { from: '#5B2BD9', via: '#7C4DFF', to: '#A98BFF' },
  GENERAL_KNOWLEDGE: { from: '#D98200', via: '#FFB020', to: '#FFD173' },
};

/** Podium gradients for ranks 1–3. Gold, silver, bronze read instantly and need no label. */
export const podiumGradients = {
  1: { from: '#B8860B', via: '#FFC93C', to: '#FFF0A8' },
  2: { from: '#7C8794', via: '#B9C4D0', to: '#E8EEF4' },
  3: { from: '#8B4A20', via: '#C97A45', to: '#F0BA92' },
} as const;

/**
 * Coloured elevation.
 *
 * A neutral grey shadow under a saturated card reads as dirt. Tinting the shadow to the
 * card's own hue is what makes the card look lit rather than smudged. Android only honours
 * `elevation`, so these degrade to plain depth there rather than breaking.
 */
export function glow(color: string, strength: 'soft' | 'strong' = 'soft') {
  return strength === 'strong'
    ? {
        shadowColor: color,
        shadowOpacity: 0.45,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 22,
        elevation: 8,
      }
    : {
        shadowColor: color,
        shadowOpacity: 0.28,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 4,
      };
}

/**
 * Translucent whites for surfaces that sit on a gradient.
 *
 * A solid white panel on a gradient punches a hole in it. These let the fill show through
 * so the panel reads as part of the same surface.
 */
export const glass = {
  thin: 'rgba(255,255,255,0.10)',
  base: 'rgba(255,255,255,0.16)',
  thick: 'rgba(255,255,255,0.26)',
  edge: 'rgba(255,255,255,0.28)',
  edgeStrong: 'rgba(255,255,255,0.45)',
} as const;

/** Type colours for anything drawn on a vivid or dark ground. */
export const onDark = {
  primary: '#FFFFFF',
  secondary: 'rgba(255,255,255,0.82)',
  muted: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.38)',
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

/** 3D Glassmorphism, Bento Grid & Neon FX tokens (additive layer) */
export const bento = {
  gap: spacing.sm,
  radius: radius.xl,
} as const;

export const neon = {
  cyan: '#00F0FF',
  purple: '#A855F7',
  gold: '#FBBF24',
  emerald: '#10B981',
  rose: '#F43F5E',
} as const;

export function neonPulseGlow(color: string, intensity: 'soft' | 'frenzy' = 'soft') {
  return intensity === 'frenzy'
    ? {
        shadowColor: color,
        shadowOpacity: 0.85,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 28,
        elevation: 12,
      }
    : {
        shadowColor: color,
        shadowOpacity: 0.45,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 14,
        elevation: 6,
      };
}

export const rarityAuraTokens: Readonly<
  Record<
    RarityKey,
    {
      primaryColor: string;
      haloColor: string;
      glowIntensity: 'soft' | 'frenzy';
      hasRays: boolean;
      hasParticles: boolean;
      badgeEmoji: string;
    }
  >
> = {
  COMMON: {
    primaryColor: '#94A3B8',
    haloColor: 'rgba(148, 163, 184, 0.25)',
    glowIntensity: 'soft',
    hasRays: false,
    hasParticles: false,
    badgeEmoji: '⚪',
  },
  UNCOMMON: {
    primaryColor: '#10B981',
    haloColor: 'rgba(16, 185, 129, 0.4)',
    glowIntensity: 'soft',
    hasRays: false,
    hasParticles: true,
    badgeEmoji: '🟢',
  },
  RARE: {
    primaryColor: '#00F0FF',
    haloColor: 'rgba(0, 240, 255, 0.55)',
    glowIntensity: 'soft',
    hasRays: false,
    hasParticles: true,
    badgeEmoji: '💎',
  },
  EPIC: {
    primaryColor: '#A855F7',
    haloColor: 'rgba(168, 85, 247, 0.7)',
    glowIntensity: 'frenzy',
    hasRays: true,
    hasParticles: true,
    badgeEmoji: '🔮',
  },
  LEGENDARY: {
    primaryColor: '#FBBF24',
    haloColor: 'rgba(251, 191, 36, 0.85)',
    glowIntensity: 'frenzy',
    hasRays: true,
    hasParticles: true,
    badgeEmoji: '👑',
  },
};


