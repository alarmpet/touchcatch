/**
 * Which background track belongs to which moment, and how loud.
 *
 * Pure and RN-free like the cue model beside it, for the same reason: the screen's tests mock
 * React Native down to a few host components.
 *
 * The licensed list is empty until someone picks music, and that is a supported state — the
 * player resolves to `null` and the game is silent rather than broken. Shipping the wiring
 * before the assets means the eventual drop-in is a manifest edit, not a code change.
 */

export type MusicMood =
  /** No timer, no pressure. The default. */
  | 'RELAX'
  /** The clock is the point. Faster, more driving. */
  | 'RUSH'
  /** Home and menus. */
  | 'LOBBY';

export type MusicTrack = Readonly<{
  /** File name inside the licensed audio directory. */
  file: string;
  mood: MusicMood;
  /** Per-track trim so a loud track does not tower over a quiet one. 0..1. */
  gain: number;
}>;

export type MusicSettings = Readonly<{
  enabled: boolean;
  /** Separate from effects: the report's accessibility table calls for both, individually. */
  volume: number;
}>;

/**
 * Music sits under the effects rather than beside them.
 *
 * The find tones carry information; the music does not. When both play at the same level the
 * tones stop reading as feedback and start reading as part of the song, which is precisely
 * the moment the sound design stops working.
 */
export const DEFAULT_MUSIC_SETTINGS: MusicSettings = { enabled: true, volume: 0.35 };

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MUSIC_SETTINGS.volume;
  return Math.min(1, Math.max(0, value));
}

/**
 * Picks the track for a mood.
 *
 * Deterministic on the track list rather than random: a player who hears a different song
 * every time they open the same screen experiences it as a glitch, not as variety.
 */
export function trackForMood(tracks: readonly MusicTrack[], mood: MusicMood): MusicTrack | null {
  return tracks.find((track) => track.mood === mood)
    // A missing mood falls back to the calm track rather than to silence: a Rush round with
    // no music is worse than a Rush round with the wrong music.
    ?? tracks.find((track) => track.mood === 'RELAX')
    ?? null;
}

/** Final playback volume for a track, combining the user's setting and the track's trim. */
export function playbackVolume(track: MusicTrack, settings: MusicSettings): number {
  if (!settings.enabled) return 0;
  return clampVolume(settings.volume) * clampVolume(track.gain);
}
