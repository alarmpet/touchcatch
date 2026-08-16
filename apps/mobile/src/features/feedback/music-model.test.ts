import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_SETTINGS,
  clampVolume,
  playbackVolume,
  trackForMood,
  type MusicTrack,
} from './music-model';

const relax: MusicTrack = { file: 'calm.mp3', mood: 'RELAX', gain: 1 };
const rush: MusicTrack = { file: 'chase.mp3', mood: 'RUSH', gain: 0.8 };

describe('music model', () => {
  it('is silent when no music has been licensed yet', () => {
    // The empty state is supported, not broken: wiring shipped before the assets.
    expect(trackForMood([], 'RELAX')).toBeNull();
    expect(trackForMood([], 'RUSH')).toBeNull();
  });

  it('picks the track for the mood', () => {
    expect(trackForMood([relax, rush], 'RUSH')).toBe(rush);
    expect(trackForMood([relax, rush], 'RELAX')).toBe(relax);
  });

  it('falls back to the calm track rather than to silence', () => {
    // A Rush round with the wrong music beats a Rush round with none.
    expect(trackForMood([relax], 'RUSH')).toBe(relax);
    expect(trackForMood([relax], 'LOBBY')).toBe(relax);
  });

  it('is deterministic, so the same screen does not open with a different song', () => {
    const tracks = [relax, rush, { ...relax, file: 'calm-2.mp3' }];
    expect(trackForMood(tracks, 'RELAX')).toBe(trackForMood(tracks, 'RELAX'));
  });

  it('keeps music under the effects by default', () => {
    // The find tones carry information; the music does not. Level them and the tones stop
    // reading as feedback.
    expect(DEFAULT_MUSIC_SETTINGS.volume).toBeLessThan(0.7);
  });

  it('combines the user setting with the per-track trim', () => {
    expect(playbackVolume(rush, { enabled: true, volume: 0.5 })).toBeCloseTo(0.4);
    expect(playbackVolume(relax, { enabled: true, volume: 0.5 })).toBeCloseTo(0.5);
  });

  it('goes to zero when music is off, whatever the volume says', () => {
    expect(playbackVolume(relax, { enabled: false, volume: 1 })).toBe(0);
  });

  it('clamps nonsense instead of handing it to the platform', () => {
    expect(clampVolume(5)).toBe(1);
    expect(clampVolume(-2)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_MUSIC_SETTINGS.volume);
    expect(playbackVolume({ ...relax, gain: 99 }, { enabled: true, volume: 1 })).toBe(1);
  });
});
