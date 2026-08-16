/**
 * Composed style objects for the Minimal Light system.
 *
 * This module deliberately imports nothing from `react-native` so it can be
 * consumed by screens whose tests mock the React Native surface down to a few
 * host components.
 */
import { colors, layout, radius, rarityPalette, shadow, spacing, typography, type RarityKey } from './design-tokens';

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
