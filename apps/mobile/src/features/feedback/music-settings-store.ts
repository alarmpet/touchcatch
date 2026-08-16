import { DEFAULT_MUSIC_SETTINGS, clampVolume, type MusicSettings } from './music-model';

/**
 * The player's music preference, remembered across launches.
 *
 * Backed by the same `localStorage` polyfill `coach-store.ts` uses, so this adds no
 * dependency. Every access is guarded: if the polyfill is absent or storage throws, music
 * falls back to the default rather than taking the screen down with it.
 */
const KEY = 'touchcatch.music.settings.v1';

function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate !== undefined && typeof candidate.getItem === 'function' ? candidate : null;
  } catch {
    return null;
  }
}

export function readMusicSettings(): MusicSettings {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw === null || raw === undefined) return DEFAULT_MUSIC_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_MUSIC_SETTINGS;
    const { enabled, volume } = parsed as { enabled?: unknown; volume?: unknown };
    return {
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_MUSIC_SETTINGS.enabled,
      volume: typeof volume === 'number' ? clampVolume(volume) : DEFAULT_MUSIC_SETTINGS.volume,
    };
  } catch {
    return DEFAULT_MUSIC_SETTINGS;
  }
}

export function writeMusicSettings(settings: MusicSettings): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ enabled: settings.enabled, volume: clampVolume(settings.volume) }));
  } catch {
    // Losing the preference costs one re-adjustment; it is never worth an error on screen.
  }
}
