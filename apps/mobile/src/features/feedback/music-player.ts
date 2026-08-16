/* eslint-disable @typescript-eslint/no-require-imports -- see feedback-player.ts for why */

/**
 * Plays the licensed background track for a mood, looping.
 *
 * Mirrors `feedback-player.ts`: the native module loads lazily inside try/catch so a web
 * build or a test renderer with no `expo-audio` gets a silent no-op instead of a crash, and
 * the asset itself is a literal `require` per file because Metro only bundles what it can see
 * during static analysis.
 *
 * One player handle for the screen's lifetime. Switching mood calls `replace()` on the
 * existing handle rather than creating a new one, so a Relax-to-Rush transition does not leak
 * a player per switch.
 */
import { DEFAULT_MUSIC_SETTINGS, playbackVolume, trackForMood, type MusicMood, type MusicSettings, type MusicTrack } from './music-model';
import { LICENSED_TRACKS } from './licensed-music.generated';

type MusicHandle = { play: () => void; pause: () => void; replace: (source: unknown) => void; remove: () => void; volume: number; loop: boolean };

/** Same reasoning as `defaultSource` in feedback-player.ts: a switch, not a computed path. */
function defaultSource(file: string): unknown {
  switch (file) {
    case 'relax-pleasant-porridge.mp3': return require('../../../assets/audio/licensed/relax-pleasant-porridge.mp3');
    case 'rush-brain-dance.mp3': return require('../../../assets/audio/licensed/rush-brain-dance.mp3');
    case 'lobby-sergios-magic-dustbin.mp3': return require('../../../assets/audio/licensed/lobby-sergios-magic-dustbin.mp3');
    default: return undefined;
  }
}

export function createMusicPlayer(input: Readonly<{
  tracks?: readonly MusicTrack[];
  settings?: MusicSettings;
  /** Injected in tests; production resolves the real Expo module. */
  loadAudio?: () => unknown;
  loadSource?: (file: string) => unknown;
}> = {}) {
  const tracks = input.tracks ?? LICENSED_TRACKS;
  let settings = input.settings ?? DEFAULT_MUSIC_SETTINGS;
  let mood: MusicMood | null = null;
  let handle: MusicHandle | undefined;
  let audio: Record<string, unknown> | null | undefined;

  const loadAudio = input.loadAudio ?? (() => require('expo-audio'));
  const loadSource = input.loadSource ?? defaultSource;

  function nativeAudio(): Record<string, unknown> | null {
    if (audio === undefined) {
      try { audio = loadAudio() as Record<string, unknown>; }
      catch { audio = null; }
    }
    return audio;
  }

  function currentTrack(): MusicTrack | null {
    return mood === null ? null : trackForMood(tracks, mood);
  }

  return {
    getSettings: (): MusicSettings => settings,

    setSettings(next: MusicSettings) {
      settings = next;
      const track = currentTrack();
      if (handle === undefined || track === null) return;
      try {
        handle.volume = playbackVolume(track, settings);
        if (settings.enabled) handle.play();
        else handle.pause();
      } catch { /* audio focus loss and silent mode are normal */ }
    },

    /** Switches to (or starts) the track for a mood. A no-op if that mood is already playing. */
    play(nextMood: MusicMood): void {
      if (mood === nextMood && handle !== undefined) return;
      mood = nextMood;
      const track = currentTrack();
      // No licensed track for this mood yet is a supported state: stay silent rather than throw.
      if (track === null) return;
      const module = nativeAudio();
      if (module === null) return;
      try {
        const source = loadSource(track.file);
        if (handle === undefined) {
          const create = module.createAudioPlayer as ((source: unknown) => MusicHandle) | undefined;
          if (create === undefined) return;
          handle = create(source);
        } else {
          handle.replace(source);
        }
        handle.loop = true;
        handle.volume = playbackVolume(track, settings);
        if (settings.enabled) handle.play();
      } catch { /* audio focus loss and silent mode are normal */ }
    },

    stop(): void {
      mood = null;
      if (handle === undefined) return;
      try { handle.pause(); } catch { /* nothing useful to do */ }
    },

    dispose(): void {
      mood = null;
      if (handle === undefined) return;
      try { handle.remove(); } catch { /* nothing useful to do while tearing down */ }
      handle = undefined;
    },
  } as const;
}
