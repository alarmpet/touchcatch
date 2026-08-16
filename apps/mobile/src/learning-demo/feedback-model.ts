/**
 * Touch feedback model.
 *
 * Kept free of `Animated` on purpose: the screen's tests mock React Native down to a few
 * host components, and a pure timed-state model stays deterministic and assertable.
 * Every value here is presentation only — it can never change what the reducer decided.
 */

export type FeedbackKind = 'HIT' | 'MISS' | 'MISSION_HIT';

export type FeedbackPulse = Readonly<{
  /** Monotonic id so repeated feedback of the same kind still restarts the pulse. */
  id: number;
  kind: FeedbackKind;
  side: 'A' | 'B';
  x: number;
  y: number;
}>;

/** How long each pulse stays on screen. Short enough to keep pace with rapid tapping. */
export const FEEDBACK_MS: Readonly<Record<FeedbackKind, number>> = {
  HIT: 520,
  MISS: 260,
  MISSION_HIT: 700,
};

export type PulseStyle = Readonly<{
  /** Ring diameter as a fraction of the board width. */
  size: number;
  color: string;
  label: string | null;
}>;

/**
 * Heat ladder for consecutive finds.
 *
 * The audio already climbs eight steps (`findToneStep`), and until now nothing on screen
 * followed it — the first find and the seventh were drawn identically. These are the eight
 * matching visual rungs, so a player with the sound off gets the same rising signal.
 */
export const STREAK_HEAT = [
  '#5FD86F', '#8ED75A', '#BFD24A', '#FFC93C', '#FFA22E', '#FF7A45', '#FF4D6D',
] as const;

/** Steps in the ladder. Mirrors FIND_TONE_STEPS so sound and picture cannot drift apart. */
export const STREAK_STEPS = STREAK_HEAT.length + 1;

export function streakStep(streak: number): number {
  if (!Number.isFinite(streak) || streak <= 0) return 0;
  return Math.min(STREAK_STEPS - 1, Math.floor(streak) - 1);
}

/**
 * Colour for a streak.
 *
 * The first rung is the palette's own success colour, not a new one: a single find has to
 * look exactly as it always did, so the ladder is something the round heats *into* rather
 * than a restyling of the base case.
 */
export function streakColor(streak: number, base: string): string {
  const step = streakStep(streak);
  return step === 0 ? base : STREAK_HEAT[step - 1] ?? base;
}

export function pulseStyle(
  kind: FeedbackKind,
  palette: Readonly<{ success: string; danger: string; accent: string }>,
  streak = 1,
): PulseStyle {
  if (kind === 'MISS') return { size: 0.11, color: palette.danger, label: null };
  if (kind === 'MISSION_HIT') return { size: 0.26, color: palette.accent, label: '단어 발견!' };
  const step = streakStep(streak);
  // The ring grows and heats with the streak, so the seventh find lands harder than the
  // first without any new component.
  return {
    size: 0.2 + step * 0.018,
    color: streakColor(streak, palette.success),
    label: step === 0 ? '+1' : `+1 ×${Math.min(Math.floor(streak), STREAK_STEPS)}`,
  };
}

/**
 * Consecutive-find combo.
 *
 * The window is what breaks a combo, never a missed tap. Breaking on a miss would punish
 * the player for looking, which is the one behaviour this game exists to encourage — and
 * for a child guessing at the picture it would read as the game turning on them.
 */
export const COMBO_WINDOW_MS = 4000;

/** Streak at which the combo becomes worth announcing. Below this it is just "a find". */
export const COMBO_ANNOUNCE_AT = 3;

export type ComboState = Readonly<{ count: number; lastFindAtMs: number }>;

export const EMPTY_COMBO: ComboState = { count: 0, lastFindAtMs: 0 };

export function advanceCombo(previous: ComboState, atMs: number): ComboState {
  const continued = previous.count > 0 && atMs - previous.lastFindAtMs <= COMBO_WINDOW_MS;
  return { count: continued ? previous.count + 1 : 1, lastFindAtMs: atMs };
}

/** Whether the combo has lapsed at `atMs` without a further find. */
export function comboExpired(combo: ComboState, atMs: number): boolean {
  return combo.count > 0 && atMs - combo.lastFindAtMs > COMBO_WINDOW_MS;
}

export function comboLabel(combo: ComboState): string | null {
  return combo.count >= COMBO_ANNOUNCE_AT ? `${combo.count}연속` : null;
}

/**
 * Horizontal nudge for a miss. Uses the pulse id so consecutive misses alternate
 * direction, which reads as a shake without any animation driver.
 */
export function missNudge(pulse: FeedbackPulse | null): number {
  if (pulse === null || pulse.kind !== 'MISS') return 0;
  return pulse.id % 2 === 0 ? -4 : 4;
}

export function nextPulse(previous: FeedbackPulse | null, next: Omit<FeedbackPulse, 'id'>): FeedbackPulse {
  return { ...next, id: (previous?.id ?? 0) + 1 };
}

/**
 * A letter travelling from the difference the player just found into the answer slot it
 * paid for.
 *
 * This is the one piece of feedback that carries meaning rather than polish: the whole
 * game rests on "finding buys a letter", and a new player currently has to infer that from
 * a strip that quietly changes somewhere above the board. Watching the letter leave the
 * spot they tapped and land in a box teaches the rule in one second.
 */
export type LetterFlight = Readonly<{
  id: number;
  char: string;
  slotIndex: number;
  /** Root-relative coordinates; the overlay is positioned inside the screen root. */
  from: Readonly<{ x: number; y: number }>;
  to: Readonly<{ x: number; y: number }>;
}>;

/** Long enough to be followed by eye, short enough not to delay the next tap. */
export const FLIGHT_MS = 560;
/** The landing bounce on the target slot, started when the flight ends. */
export const SLOT_POP_MS = 220;
