import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEEDBACK_SETTINGS,
  FIND_TONE_STEPS,
  applySettings,
  clampVolume,
  cueForEvent,
  findToneStep,
} from './feedback-cues';

const find = (foundCount: number, differenceCount = 10) =>
  cueForEvent({ kind: 'FIND', foundCount, differenceCount });

describe('feedback cues', () => {
  it('climbs one step per find so a streak is audible', () => {
    expect(find(1).sound).toBe('find-1');
    expect(find(2).sound).toBe('find-2');
    expect(find(5).sound).toBe('find-5');
  });

  it('holds at the top of the scale rather than wrapping back down', () => {
    // Wrapping would sound like losing ground on the find that should feel best.
    expect(findToneStep(FIND_TONE_STEPS + 4)).toBe(FIND_TONE_STEPS);
    // A board wider than the scale: still mid-run, so it is the clamp being exercised
    // rather than the resolution chord.
    expect(find(FIND_TONE_STEPS + 1, 12).sound).toBe(`find-${FIND_TONE_STEPS}`);
    expect(find(11, 12).sound).toBe(`find-${FIND_TONE_STEPS}`);
  });

  it('derives the note from board progress, not from a local counter', () => {
    // The same find must always sound the same, so a replayed tap cannot advance the scale.
    expect(find(3).sound).toBe(find(3).sound);
    expect(findToneStep(0)).toBe(1);
    expect(findToneStep(-5)).toBe(1);
  });

  it('resolves the board with the chord instead of a ninth tick', () => {
    expect(find(10, 10)).toEqual({ sound: 'complete', haptic: 'SUCCESS' });
    expect(find(9, 10).sound).toBe('find-8');
    expect(cueForEvent({ kind: 'SOLVED' })).toEqual({ sound: 'complete', haptic: 'SUCCESS' });
  });

  it('leans harder on the haptic once a streak is running', () => {
    expect(find(1).haptic).toBe('LIGHT');
    expect(find(2).haptic).toBe('LIGHT');
    expect(find(3).haptic).toBe('MEDIUM');
  });

  it('answers a miss with the lightest thing the OS has, not a failure buzz', () => {
    // A wrong tap in a relaxing puzzle should read as "not here", never as punishment.
    expect(cueForEvent({ kind: 'MISS' })).toEqual({ sound: 'miss', haptic: 'SELECTION' });
  });

  it('says nothing at all when a found difference is touched again', () => {
    // The player made no mistake, so there is nothing to report.
    expect(cueForEvent({ kind: 'DUPLICATE' })).toEqual({ sound: null, haptic: null });
  });

  it('silences each channel independently so either can be turned off alone', () => {
    const cue = find(2);
    expect(applySettings(cue, { ...DEFAULT_FEEDBACK_SETTINGS, soundEnabled: false }))
      .toEqual({ sound: null, haptic: 'LIGHT' });
    expect(applySettings(cue, { ...DEFAULT_FEEDBACK_SETTINGS, hapticsEnabled: false }))
      .toEqual({ sound: 'find-2', haptic: null });
    expect(applySettings(cue, { hapticsEnabled: false, soundEnabled: false, effectVolume: 1 }))
      .toEqual({ sound: null, haptic: null });
  });

  it('treats zero volume as off rather than playing silence', () => {
    expect(applySettings(find(2), { ...DEFAULT_FEEDBACK_SETTINGS, effectVolume: 0 }).sound).toBeNull();
  });

  it('clamps a nonsense volume instead of handing it to the platform', () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_FEEDBACK_SETTINGS.effectVolume);
  });
});
