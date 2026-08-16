import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_MUSIC_SETTINGS, type MusicMood, type MusicSettings } from './music-model';
import { createMusicPlayer } from './music-player';
import { readMusicSettings, writeMusicSettings } from './music-settings-store';

/**
 * One background player for the whole app, and the settings that drive it.
 *
 * App-wide rather than per-screen for two reasons: a single handle means navigating from the
 * home screen into a board swaps the track instead of tearing one player down and building
 * another, and a volume change made on the profile screen reaches the music that is already
 * playing without any plumbing between routes.
 *
 * Deliberately free of any React Native import, like the models beside it: screens that
 * consume this are covered by tests that mock React Native down to a few host components.
 */

type MusicContextValue = Readonly<{
  settings: MusicSettings;
  setSettings: (next: MusicSettings) => void;
  play: (mood: MusicMood) => void;
}>;

/**
 * The default is a working no-op, so a screen rendered outside the provider — every unit
 * test does exactly that — is silent rather than broken.
 */
const MusicContext = createContext<MusicContextValue>({
  settings: DEFAULT_MUSIC_SETTINGS,
  setSettings: () => {},
  play: () => {},
});

export function MusicProvider({ children }: Readonly<{ children: ReactNode }>) {
  // The stored preference is read before the player exists, so someone who turned music off
  // last time never hears a bar of it on launch.
  const stored = useMemo(() => readMusicSettings(), []);
  const [settings, setLocalSettings] = useState<MusicSettings>(stored);
  const player = useMemo(() => createMusicPlayer({ settings: stored }), [stored]);

  useEffect(() => () => player.dispose(), [player]);

  const value = useMemo<MusicContextValue>(() => ({
    settings,
    setSettings(next) {
      setLocalSettings(next);
      writeMusicSettings(next);
      player.setSettings(next);
    },
    play: (mood) => player.play(mood),
  }), [player, settings]);

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusicSettings(): MusicContextValue {
  return useContext(MusicContext);
}

/** Declares the mood a screen wants while it is mounted. */
export function useMusicMood(mood: MusicMood): void {
  const { play } = useMusicSettings();
  useEffect(() => { play(mood); }, [play, mood]);
}
