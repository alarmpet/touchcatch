import { afterEach, describe, expect, it } from 'vitest';
import { readMusicSettings, writeMusicSettings } from './music-settings-store';
import { DEFAULT_MUSIC_SETTINGS } from './music-model';

const KEY = 'touchcatch.music.settings.v1';

function withStorage(seed?: string) {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(KEY, seed);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
  return map;
}

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('music settings store', () => {
  it('falls back to the default when nothing has been stored', () => {
    withStorage();
    expect(readMusicSettings()).toEqual(DEFAULT_MUSIC_SETTINGS);
  });

  it('falls back to the default when storage is unavailable entirely', () => {
    // A web build or a test renderer without the polyfill must still get working settings.
    expect(readMusicSettings()).toEqual(DEFAULT_MUSIC_SETTINGS);
  });

  it('round-trips a preference', () => {
    withStorage();
    writeMusicSettings({ enabled: false, volume: 0.6 });
    expect(readMusicSettings()).toEqual({ enabled: false, volume: 0.6 });
  });

  it('clamps a stored volume rather than handing nonsense to the platform', () => {
    withStorage(JSON.stringify({ enabled: true, volume: 42 }));
    expect(readMusicSettings().volume).toBe(1);
  });

  it('ignores a corrupt or hand-edited entry field by field', () => {
    withStorage(JSON.stringify({ enabled: 'yes', volume: 0.5 }));
    expect(readMusicSettings()).toEqual({ enabled: DEFAULT_MUSIC_SETTINGS.enabled, volume: 0.5 });

    withStorage('not json at all');
    expect(readMusicSettings()).toEqual(DEFAULT_MUSIC_SETTINGS);
  });

  it('survives storage that throws', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => { throw new Error('quota'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(readMusicSettings()).toEqual(DEFAULT_MUSIC_SETTINGS);
    expect(() => writeMusicSettings(DEFAULT_MUSIC_SETTINGS)).not.toThrow();
  });
});
