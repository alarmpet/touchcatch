import { describe, expect, it, vi } from 'vitest';
import { createFeedbackPlayer } from './feedback-player';
import { DEFAULT_FEEDBACK_SETTINGS } from './feedback-cues';

function fakeNatives() {
  const calls: string[] = [];
  const players: Array<{ volume: number; seeks: number; plays: number }> = [];
  const haptics = {
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
    NotificationFeedbackType: { Success: 'success' },
    impactAsync: vi.fn(async (style: unknown) => { calls.push(`impact:${String(style)}`); }),
    selectionAsync: vi.fn(async () => { calls.push('selection'); }),
    notificationAsync: vi.fn(async (style: unknown) => { calls.push(`notify:${String(style)}`); }),
  };
  const audio = {
    createAudioPlayer: vi.fn(() => {
      const handle = {
        volume: 0,
        seeks: 0,
        plays: 0,
        seekTo(_seconds: number) { this.seeks += 1; },
        play() { this.plays += 1; },
      };
      players.push(handle);
      return handle;
    }),
  };
  return { calls, players, haptics, audio };
}

function player(settings = DEFAULT_FEEDBACK_SETTINGS) {
  const natives = fakeNatives();
  return {
    natives,
    subject: createFeedbackPlayer({
      settings,
      loadHaptics: () => natives.haptics,
      loadAudio: () => natives.audio,
      loadSource: (sound) => `asset:${sound}`,
    }),
  };
}

describe('feedback player', () => {
  it('fires both channels for a find', () => {
    const { natives, subject } = player();
    subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 });
    expect(natives.calls).toEqual(['impact:light']);
    expect(natives.players).toHaveLength(1);
    expect(natives.players[0]).toMatchObject({ plays: 1, volume: DEFAULT_FEEDBACK_SETTINGS.effectVolume });
  });

  it('rewinds before replaying so a fast tapper hears every note', () => {
    // A finished player ignores play(); without the seek the second tap would be silent.
    const { natives, subject } = player();
    subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 });
    subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 });
    expect(natives.audio.createAudioPlayer).toHaveBeenCalledOnce();
    expect(natives.players[0]).toMatchObject({ seeks: 2, plays: 2 });
  });

  it('keeps one player per sound rather than one per tap', () => {
    const { natives, subject } = player();
    subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 });
    subject.play({ kind: 'FIND', foundCount: 2, differenceCount: 10 });
    subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 });
    expect(natives.audio.createAudioPlayer).toHaveBeenCalledTimes(2);
  });

  it('uses the platform selection tap for a miss and the success notification for a solve', () => {
    const { natives, subject } = player();
    subject.play({ kind: 'MISS' });
    subject.play({ kind: 'SOLVED' });
    expect(natives.calls).toEqual(['selection', 'notify:success']);
  });

  it('stays completely quiet for a duplicate', () => {
    const { natives, subject } = player();
    subject.play({ kind: 'DUPLICATE' });
    expect(natives.calls).toEqual([]);
    expect(natives.players).toHaveLength(0);
  });

  it('honours each setting and picks up a change without a restart', () => {
    const { natives, subject } = player({ hapticsEnabled: false, soundEnabled: true, effectVolume: 0.3 });
    subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 });
    expect(natives.calls).toEqual([]);
    expect(natives.players[0]?.volume).toBe(0.3);

    subject.setSettings({ hapticsEnabled: true, soundEnabled: false, effectVolume: 2 });
    expect(subject.getSettings().effectVolume).toBe(1);
    subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 });
    expect(natives.calls).toEqual(['impact:light']);
    expect(natives.players).toHaveLength(1);
  });

  it('plays on silently when neither native module exists', () => {
    // A web build has no haptic engine and may have no audio module; that is not an error.
    const subject = createFeedbackPlayer({
      loadHaptics: () => { throw new Error('no native module'); },
      loadAudio: () => { throw new Error('no native module'); },
      loadSource: (sound) => `asset:${sound}`,
    });
    expect(() => subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 })).not.toThrow();
    expect(() => subject.play({ kind: 'SOLVED' })).not.toThrow();
    expect(() => subject.dispose()).not.toThrow();
  });

  it('survives a platform that throws mid-playback', () => {
    const natives = fakeNatives();
    natives.haptics.impactAsync = vi.fn(() => { throw new Error('audio focus lost'); });
    natives.audio.createAudioPlayer = vi.fn(() => { throw new Error('audio focus lost'); });
    const subject = createFeedbackPlayer({
      loadHaptics: () => natives.haptics,
      loadAudio: () => natives.audio,
      loadSource: (sound) => `asset:${sound}`,
    });
    expect(() => subject.play({ kind: 'FIND', foundCount: 1, differenceCount: 10 })).not.toThrow();
  });

  it('loads each native module once, lazily', () => {
    const natives = fakeNatives();
    const loadHaptics = vi.fn(() => natives.haptics);
    const loadAudio = vi.fn(() => natives.audio);
    const subject = createFeedbackPlayer({ loadHaptics, loadAudio, loadSource: (sound) => `asset:${sound}` });
    expect(loadHaptics).not.toHaveBeenCalled();
    subject.play({ kind: 'MISS' });
    subject.play({ kind: 'MISS' });
    expect(loadHaptics).toHaveBeenCalledOnce();
    expect(loadAudio).toHaveBeenCalledOnce();
  });
});
