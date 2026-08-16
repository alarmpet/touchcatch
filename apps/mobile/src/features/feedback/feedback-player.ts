/* eslint-disable @typescript-eslint/no-require-imports -- see the note below */

/*
 * Both uses of `require` in this file are deliberate and neither has an ESM equivalent.
 *
 *  - Assets: Metro only bundles a file it can see in a *literal* `require` during static
 *    analysis, so `import` or a computed path would ship a broken reference.
 *  - Native modules: importing `expo-haptics`/`expo-audio` at module scope pulls them into
 *    the graph of every test that renders the game screen, and those tests mock React Native
 *    down to a few host components. `Keyboard`, `Animated` and `Share` each broke that way
 *    before. Loading them lazily inside try/catch also gives the web build a free no-op.
 */
import {
  DEFAULT_FEEDBACK_SETTINGS,
  applySettings,
  clampVolume,
  cueForEvent,
  type BoardEvent,
  type FeedbackSettings,
  type FeedbackSound,
  type HapticWeight,
} from './feedback-cues';

/**
 * Plays a cue on the device.
 *
 * Everything here is best-effort and silent about failure. Audio focus, a phone in silent
 * mode, a simulator without a haptic engine, a web build where neither module exists — all of
 * those are normal, and none of them may interrupt a puzzle. The decision of *what* to play
 * lives in `feedback-cues.ts` where it can be tested; this file only tries to do it.
 *
 * The native modules load lazily. Importing them at module scope would pull them into the
 * bundle graph of every test that renders the game screen, and those tests mock React Native
 * down to a handful of host components — the exact trap that `Keyboard`, `Animated` and
 * `Share` each fell into before.
 */

type SoundHandle = { play: () => void; seekTo: (seconds: number) => void; volume: number };

/**
 * Metro needs a literal `require` per asset to put the file in the bundle, so this is a
 * switch rather than a computed path. It is called lazily because a `.wav` require has no
 * meaning outside Metro — evaluating it at module scope would break every test that imports
 * this file.
 */
function defaultSource(sound: FeedbackSound): unknown {
  switch (sound) {
    case 'find-1': return require('../../../assets/audio/find-1.wav');
    case 'find-2': return require('../../../assets/audio/find-2.wav');
    case 'find-3': return require('../../../assets/audio/find-3.wav');
    case 'find-4': return require('../../../assets/audio/find-4.wav');
    case 'find-5': return require('../../../assets/audio/find-5.wav');
    case 'find-6': return require('../../../assets/audio/find-6.wav');
    case 'find-7': return require('../../../assets/audio/find-7.wav');
    case 'find-8': return require('../../../assets/audio/find-8.wav');
    case 'miss': return require('../../../assets/audio/miss.wav');
    case 'complete': return require('../../../assets/audio/complete.wav');
    default: return undefined;
  }
}

export function createFeedbackPlayer(input: Readonly<{
  settings?: FeedbackSettings;
  /** Injected in tests; production resolves the real Expo modules. */
  loadHaptics?: () => unknown;
  loadAudio?: () => unknown;
  loadSource?: (sound: FeedbackSound) => unknown;
}> = {}) {
  let settings = input.settings ?? DEFAULT_FEEDBACK_SETTINGS;
  const players = new Map<FeedbackSound, SoundHandle>();
  let haptics: Record<string, unknown> | null | undefined;
  let audio: Record<string, unknown> | null | undefined;

  const loadHaptics = input.loadHaptics ?? (() => require('expo-haptics'));
  const loadAudio = input.loadAudio ?? (() => require('expo-audio'));
  const loadSource = input.loadSource ?? defaultSource;

  function nativeHaptics(): Record<string, unknown> | null {
    if (haptics === undefined) {
      try { haptics = loadHaptics() as Record<string, unknown>; }
      catch { haptics = null; }
    }
    return haptics;
  }

  function nativeAudio(): Record<string, unknown> | null {
    if (audio === undefined) {
      try { audio = loadAudio() as Record<string, unknown>; }
      catch { audio = null; }
    }
    return audio;
  }

  function fireHaptic(weight: HapticWeight): void {
    const module = nativeHaptics();
    if (module === null) return;
    try {
      if (weight === 'SELECTION') {
        (module.selectionAsync as (() => Promise<void>) | undefined)?.();
        return;
      }
      if (weight === 'SUCCESS') {
        const style = (module.NotificationFeedbackType as Record<string, unknown> | undefined)?.Success;
        (module.notificationAsync as ((s: unknown) => Promise<void>) | undefined)?.(style);
        return;
      }
      const styles = module.ImpactFeedbackStyle as Record<string, unknown> | undefined;
      (module.impactAsync as ((s: unknown) => Promise<void>) | undefined)?.(
        weight === 'MEDIUM' ? styles?.Medium : styles?.Light,
      );
    } catch { /* a phone without a haptic engine is not an error */ }
  }

  function fireSound(sound: FeedbackSound): void {
    const module = nativeAudio();
    if (module === null) return;
    try {
      let player = players.get(sound);
      if (player === undefined) {
        const create = module.createAudioPlayer as ((source: unknown) => SoundHandle) | undefined;
        if (create === undefined) return;
        player = create(loadSource(sound));
        players.set(sound, player);
      }
      player.volume = clampVolume(settings.effectVolume);
      // Rewinding first is what lets a fast tapper retrigger the same note; without it a
      // finished player would silently ignore the second tap.
      player.seekTo(0);
      player.play();
    } catch { /* audio focus loss and silent mode are normal */ }
  }

  return {
    getSettings: (): FeedbackSettings => settings,
    setSettings(next: FeedbackSettings) {
      settings = { ...next, effectVolume: clampVolume(next.effectVolume) };
    },

    /** Fire-and-forget. Never awaited, so a slow audio start cannot delay the next tap. */
    play(event: BoardEvent): void {
      const cue = applySettings(cueForEvent(event), settings);
      if (cue.haptic !== null) fireHaptic(cue.haptic);
      if (cue.sound !== null) fireSound(cue.sound);
    },

    dispose() {
      for (const player of players.values()) {
        try { (player as unknown as { remove?: () => void }).remove?.(); }
        catch { /* nothing useful to do while tearing down */ }
      }
      players.clear();
    },
  } as const;
}
