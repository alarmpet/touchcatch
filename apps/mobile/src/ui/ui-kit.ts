/**
 * Composed style objects for the Minimal Light system.
 *
 * This module deliberately imports nothing from `react-native` so it can be
 * consumed by screens whose tests mock the React Native surface down to a few
 * host components.
 */
import { colors, glass, glow, layout, onDark, radius, rarityPalette, shadow, spacing, typography, vivid, type RarityKey } from './design-tokens';

export const screen = {
  scroll: {
    flexGrow: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: layout.screenX,
    paddingTop: layout.screenTop,
    paddingBottom: layout.screenBottom,
    maxWidth: layout.maxContentWidth,
    width: '100%' as const,
    alignSelf: 'center' as const,
  },
} as const;

export const text = {
  display: { ...typography.display, color: colors.ink },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.subtitle, color: colors.ink },
  body: { ...typography.body, color: colors.inkSoft },
  bodyStrong: { ...typography.bodyStrong, color: colors.ink },
  muted: { ...typography.body, color: colors.muted },
  caption: { ...typography.caption, color: colors.muted },
  overline: { ...typography.overline, color: colors.faint },
  accent: { ...typography.bodyStrong, color: colors.accent },
  danger: { ...typography.body, color: colors.danger },
} as const;

export const surface = {
  /** Default content container: white, hairline border, no shadow. */
  card: {
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  /** Slightly raised card for the primary object on a screen. */
  cardLifted: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  /** Borderless grouping block, used for quiet secondary info. */
  quiet: {
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
  },
  /** Full-bleed row inside a card list. */
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
} as const;

export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'disabled';

export function buttonStyle(tone: ButtonTone, options?: { block?: boolean }) {
  const base = {
    minHeight: layout.minTouch,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    borderWidth: 1,
    alignSelf: (options?.block ? 'stretch' : 'flex-start') as 'stretch' | 'flex-start',
  };
  if (tone === 'primary') return { ...base, backgroundColor: colors.accent, borderColor: colors.accent };
  if (tone === 'secondary') return { ...base, backgroundColor: colors.surface, borderColor: colors.lineStrong };
  if (tone === 'ghost') return { ...base, backgroundColor: 'transparent', borderColor: 'transparent' };
  return { ...base, backgroundColor: colors.disabled, borderColor: colors.disabled };
}

export function buttonTextStyle(tone: ButtonTone) {
  const base = { fontSize: 15, lineHeight: 20, fontWeight: '700' as const, textAlign: 'center' as const };
  if (tone === 'primary') return { ...base, color: colors.onAccent };
  if (tone === 'disabled') return { ...base, color: colors.disabledInk };
  return { ...base, color: colors.ink };
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const badgePalette: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.muted },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export function badgeStyle(tone: BadgeTone = 'neutral') {
  return {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: badgePalette[tone].bg,
    alignSelf: 'flex-start' as const,
  };
}

export function badgeTextStyle(tone: BadgeTone = 'neutral') {
  return { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, color: badgePalette[tone].fg };
}

/** Marker for inline chips that must not inherit a parent card's elevation. */
export const shadowless = { shadowOpacity: 0, elevation: 0 } as const;

export function rarityBadgeStyle(rarity: RarityKey) {
  return {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: rarityPalette[rarity].bg,
    alignSelf: 'flex-start' as const,
  };
}

export function rarityBadgeTextStyle(rarity: RarityKey) {
  return { fontSize: 11, lineHeight: 15, fontWeight: '700' as const, color: rarityPalette[rarity].fg };
}

export const header = {
  wrap: { gap: 6, marginBottom: spacing.xl },
  eyebrow: { ...typography.overline, color: colors.faint },
  title: { ...typography.display, color: colors.ink },
  lede: { ...typography.body, color: colors.muted },
} as const;

export const section = {
  wrap: { marginTop: layout.sectionGap, gap: spacing.sm },
  heading: { ...typography.subtitle, color: colors.ink },
  hint: { ...typography.caption, color: colors.faint },
} as const;

export const tabs = {
  bar: {
    flexDirection: 'row' as const,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    gap: 4,
  },
  item(selected: boolean) {
    return {
      flex: 1,
      minHeight: 38,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderRadius: radius.pill,
      backgroundColor: selected ? colors.surface : 'transparent',
    };
  },
  label(selected: boolean) {
    return {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700' as const,
      color: selected ? colors.ink : colors.muted,
    };
  },
} as const;

export const tabBar = {
  wrap: {
    marginTop: layout.sectionGap,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    ...shadow.card,
  },
  item: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minWidth: 60,
    minHeight: layout.minTouch,
    paddingVertical: 6,
    gap: 3,
  },
  glyph(active: boolean) {
    return { fontSize: 17, lineHeight: 20, color: active ? colors.accent : colors.faint };
  },
  label(active: boolean) {
    return {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700' as const,
      color: active ? colors.accent : colors.muted,
    };
  },
} as const;

export const progress = {
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden' as const,
  },
  fill(ratio: number) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    return {
      width: `${Math.round(clamped * 100)}%` as `${number}%`,
      height: '100%' as const,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
    };
  },
} as const;

/* ------------------------------------------------------------------ *
 *  Vivid layer. Styles for surfaces that sit on a gradient or a dark
 *  ground. Everything above stays the Minimal Light system.
 * ------------------------------------------------------------------ */

/** Type on a vivid or dark ground. `text.*` above assumes a white one and goes invisible here. */
export const textOnDark = {
  display: { ...typography.display, color: onDark.primary },
  title: { ...typography.title, color: onDark.primary },
  subtitle: { ...typography.subtitle, color: onDark.primary },
  body: { ...typography.body, color: onDark.secondary },
  bodyStrong: { ...typography.bodyStrong, color: onDark.primary },
  caption: { ...typography.caption, color: onDark.secondary },
  overline: { ...typography.overline, color: onDark.muted },
} as const;

export const vividSurface = {
  /**
   * A panel on top of a gradient. Translucent rather than white: a solid fill would punch a
   * hole in the gradient behind it, and the hairline is a lightened edge rather than a border
   * colour so it catches the fill instead of cutting it.
   */
  glass: {
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: glass.base,
    borderWidth: 1,
    borderColor: glass.edge,
  },
  glassQuiet: {
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: glass.thin,
    borderWidth: 1,
    borderColor: glass.edge,
  },
  /** Inline chip on a gradient — counts, streaks, ranks. */
  glassChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: glass.thick,
    alignSelf: 'flex-start' as const,
  },
  /** Full-bleed dark panel for screens that lead with one. */
  dark: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: vivid.ink,
  },
  /** The clipping shell a gradient fill is poured into. */
  heroShell: {
    borderRadius: radius.xl,
    overflow: 'hidden' as const,
  },
} as const;

/**
 * A white card that is lit by its own colour rather than shadowed by a neutral grey.
 *
 * Passing the card's dominant hue is the whole point: a grey shadow under a coloured card
 * reads as dirt under it.
 */
export function glowCard(color: string, strength: 'soft' | 'strong' = 'soft') {
  return {
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...glow(color, strength),
  };
}

export type VividTone = 'bright' | 'glass' | 'disabled';

/** The CTA on a vivid ground. White wins there; a coloured button on a coloured field does not. */
export function vividButtonStyle(tone: VividTone, options?: { block?: boolean }) {
  const base = {
    minHeight: 56,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    borderWidth: 1,
    alignSelf: (options?.block ? 'stretch' : 'flex-start') as 'stretch' | 'flex-start',
  };
  if (tone === 'bright') {
    return { ...base, backgroundColor: onDark.primary, borderColor: 'transparent', ...glow('#000000', 'soft') };
  }
  if (tone === 'glass') {
    return { ...base, backgroundColor: glass.thick, borderColor: glass.edgeStrong };
  }
  return { ...base, backgroundColor: glass.thin, borderColor: 'transparent' };
}

export function vividButtonTextStyle(tone: VividTone) {
  const base = { fontSize: 16, lineHeight: 21, fontWeight: '800' as const, textAlign: 'center' as const };
  if (tone === 'bright') return { ...base, color: vivid.indigo };
  if (tone === 'glass') return { ...base, color: onDark.primary };
  return { ...base, color: onDark.faint };
}

/** Progress rail drawn on a gradient, where the light base track disappears. */
export const progressOnDark = {
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden' as const,
  },
  fill(ratio: number) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    return {
      width: `${Math.round(clamped * 100)}%` as `${number}%`,
      height: '100%' as const,
      borderRadius: radius.pill,
      backgroundColor: onDark.primary,
    };
  },
} as const;

export const field = {
  input: {
    minHeight: layout.minTouch + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    fontSize: 15,
    color: colors.ink,
  },
  label: { ...typography.caption, color: colors.muted, marginBottom: 6 },
} as const;
