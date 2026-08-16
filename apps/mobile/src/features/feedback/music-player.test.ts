import { describe, expect, it, vi } from 'vitest';
import { createMusicPlayer } from './music-player';
import { DEFAULT_MUSIC_SETTINGS, type MusicTrack } from './music-model';

const relax: MusicTrack = { file: 'calm.mp3', mood: 'RELAX', gain: 1 };
const rush: MusicTrack = { file: 'chase.mp3', mood: 'RUSH', gain: 0.8 };

function fakeAudio() {
  const created: Array<{ volume: number; loop: boolean; plays: number; pauses: number; replacedWith: unknown[]; remove: () => void }> = [];
  const audio = {
    createAudioPlayer: vi.fn((source: unknown) => {
      const handle = {
        volume: 0,
        loop: false,
        plays: 0,
        pauses: 0,
        replacedWith: [source],
        play() { this.plays += 1; },
        pause() { this.pauses += 1; },
        replace(next: unknown) { this.replacedWith.push(next); },
        remove: vi.fn(),
      };
      created.push(handle);
      return handle;
    }),
  };
  return { audio, created };
}

function player(tracks = [relax, rush], settings = DEFAULT_MUSIC_SETTINGS) {
  const { audio, created } = fakeAudio();
  return {
    audio,
    created,
    subject: createMusicPlayer({
      tracks,
      settings,
      loadAudio: () => audio,
      loadSource: (file) => `asset:${file}`,
    }),
  };
}

describe('music player', () => {
  it('starts the track for the mood, looping, at the combined volume', () => {
    const { audio, created, subject } = player();
    subject.play('RUSH');
    expect(audio.createAudioPlayer).toHaveBeenCalledOnce();
    expect(created[0]).toMatchObject({ loop: true, volume: 0.8 * DEFAULT_MUSIC_SETTINGS.volume, plays: 1 });
  });

  it('does nothing when that mood is already playing', () => {
    const { audio, subject } = player();
    subject.play('RELAX');
    subject.play('RELAX');
    expect(audio.createAudioPlayer).toHaveBeenCalledOnce();
  });

  it('switches mood on the same handle rather than leaking a player per switch', () => {
    const { audio, created, subject } = player();
    subject.play('RELAX');
    subject.play('RUSH');
    expect(audio.createAudioPlayer).toHaveBeenCalledOnce();
    expect(created[0]?.replacedWith).toEqual(['asset:calm.mp3', 'asset:chase.mp3']);
  });

  it('stays silent for a mood with no licensed track yet', () => {
    const { audio, subject } = player([relax]);
    expect(() => subject.play('LOBBY')).not.toThrow();
    // LOBBY falls back to RELAX per trackForMood, so this only covers the truly empty case.
    const empty = player([]);
    empty.subject.play('RELAX');
    expect(empty.audio.createAudioPlayer).not.toHaveBeenCalled();
  });

  it('pauses rather than removes on stop, and forgets the mood', () => {
    const { created, subject } = player();
    subject.play('RELAX');
    subject.stop();
    expect(created[0]).toMatchObject({ pauses: 1 });
    subject.play('RELAX');
    expect(created[0]).toMatchObject({ plays: 2 });
  });

  it('removes the handle on dispose', () => {
    const { created, subject } = player();
    subject.play('RELAX');
    subject.dispose();
    expect(created[0]?.remove).toHaveBeenCalledOnce();
  });

  it('honours a settings change without a restart', () => {
    const { created, subject } = player();
    subject.play('RELAX');
    subject.setSettings({ enabled: true, volume: 0.5 });
    expect(created[0]).toMatchObject({ volume: 0.5 });

    subject.setSettings({ enabled: false, volume: 0.5 });
    expect(created[0]).toMatchObject({ pauses: 1 });
  });

  it('plays on silently when the native module is unavailable', () => {
    const subject = createMusicPlayer({
      tracks: [relax],
      loadAudio: () => { throw new Error('no native module'); },
      loadSource: (file) => `asset:${file}`,
    });
    expect(() => subject.play('RELAX')).not.toThrow();
    expect(() => subject.setSettings(DEFAULT_MUSIC_SETTINGS)).not.toThrow();
    expect(() => subject.stop()).not.toThrow();
    expect(() => subject.dispose()).not.toThrow();
  });

  it('survives a platform that throws mid-playback', () => {
    const subject = createMusicPlayer({
      tracks: [relax],
      loadAudio: () => ({ createAudioPlayer: vi.fn(() => { throw new Error('audio focus lost'); }) }),
      loadSource: (file) => `asset:${file}`,
    });
    expect(() => subject.play('RELAX')).not.toThrow();
  });

  it('loads the native module once, lazily', () => {
    const { audio } = fakeAudio();
    const loadAudio = vi.fn(() => audio);
    const lazy = createMusicPlayer({ tracks: [relax, rush], loadAudio, loadSource: (file) => `asset:${file}` });
    expect(loadAudio).not.toHaveBeenCalled();
    lazy.play('RELAX');
    lazy.play('RUSH');
    expect(loadAudio).toHaveBeenCalledOnce();
  });
});
