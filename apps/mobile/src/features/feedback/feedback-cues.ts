/**
 * What the hands and ears get for each thing that happens on the board.
 *
 * Kept free of any React Native import on purpose, the same reason `feedback-model.ts` is:
 * the screen's tests mock React Native down to a few host components, so a pure decision
 * table stays deterministic and assertable while the adapter that actually vibrates the
 * phone stays trivial enough not to need testing.
 *
 * The design rule behind every value here: **sound and haptics are a second channel for
 * information the screen already shows, never the only channel.** A player with the volume
 * off and haptics disabled must lose nothing but pleasure.
 */

/** One rising step per consecutive find. Eight covers the widest board we ship. */
export const FIND_TONE_STEPS = 8;

export type FeedbackSound =
  | `find-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | 'miss'
  | 'complete';

/**
 * Haptic weight, mapped to the platform's own scale by the adapter.
 *
 * `SELECTION` is the lightest thing the OS offers and is what a miss gets. A wrong tap in a
 * relaxing picture puzzle should read as "not here", so it gets the same feedback as brushing
 * a list item — not the failure buzz a game-over would use.
 */
export type HapticWeight = 'SELECTION' | 'LIGHT' | 'MEDIUM' | 'SUCCESS';

export type FeedbackCue = Readonly<{
  sound: FeedbackSound | null;
  haptic: HapticWeight | null;
}>;

export type BoardEvent =
  | Readonly<{ kind: 'FIND'; foundCount: number; differenceCount: number }>
  | Readonly<{ kind: 'MISS' }>
  /** Re-touching a difference already found. Not a mistake, so not a miss cue. */
  | Readonly<{ kind: 'DUPLICATE' }>
  | Readonly<{ kind: 'SOLVED' }>;

/**
 * Which note a find plays.
 *
 * The step comes from the find count rather than a local counter so the pitch is a function
 * of board progress: the same find always sounds the same, and a retried tap that the server
 * replays cannot advance the scale twice. Past the top of the scale it holds rather than
 * wrapping — climbing back down would read as losing ground.
 */
export function findToneStep(foundCount: number): number {
  const ordinal = Math.max(1, Math.floor(foundCount));
  return Math.min(ordinal, FIND_TONE_STEPS);
}

export function cueForEvent(event: BoardEvent): FeedbackCue {
  if (event.kind === 'MISS') return { sound: 'miss', haptic: 'SELECTION' };
  if (event.kind === 'DUPLICATE') return { sound: null, haptic: null };
  if (event.kind === 'SOLVED') return { sound: 'complete', haptic: 'SUCCESS' };

  // The find that clears the board is the board's resolution, so it plays the chord instead
  // of a ninth tick. Otherwise the last difference would feel like any other.
  if (event.differenceCount > 0 && event.foundCount >= event.differenceCount) {
    return { sound: 'complete', haptic: 'SUCCESS' };
  }
  // Consecutive finds lean on the haptic a little harder, which is what makes a streak feel
  // like a streak without making the first find feel weak.
  return {
    sound: `find-${findToneStep(event.foundCount)}` as FeedbackSound,
    haptic: event.foundCount >= 3 ? 'MEDIUM' : 'LIGHT',
  };
}

export type FeedbackSettings = Readonly<{
  /** Off is a first-class choice, not a degraded mode. */
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  /** 0..1. Effects only — music, when it exists, will have its own control. */
  effectVolume: number;
}>;

export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettings = {
  hapticsEnabled: true,
  soundEnabled: true,
  effectVolume: 0.7,
};

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FEEDBACK_SETTINGS.effectVolume;
  return Math.min(1, Math.max(0, value));
}

/**
 * The cue after settings are applied.
 *
 * Returning a cue with both channels null rather than skipping the call keeps the caller's
 * code the same whether feedback is on or off.
 */
export function applySettings(cue: FeedbackCue, settings: FeedbackSettings): FeedbackCue {
  return {
    sound: settings.soundEnabled && clampVolume(settings.effectVolume) > 0 ? cue.sound : null,
    haptic: settings.hapticsEnabled ? cue.haptic : null,
  };
}
