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

export function pulseStyle(kind: FeedbackKind, palette: Readonly<{ success: string; danger: string; accent: string }>): PulseStyle {
  if (kind === 'MISS') return { size: 0.11, color: palette.danger, label: null };
  if (kind === 'MISSION_HIT') return { size: 0.26, color: palette.accent, label: '단어 발견!' };
  return { size: 0.2, color: palette.success, label: '+1' };
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
