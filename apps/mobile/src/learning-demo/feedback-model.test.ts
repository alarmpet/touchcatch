import { describe, expect, it } from 'vitest';
import { FEEDBACK_MS, missNudge, nextPulse, pulseStyle, type FeedbackPulse } from './feedback-model';

const palette = { success: '#00875A', danger: '#D63B4A', accent: '#0068D9' };

describe('touch feedback model', () => {
  it('gives every pulse a fresh id so repeats restart the effect', () => {
    const first = nextPulse(null, { kind: 'HIT', side: 'A', x: .5, y: .5 });
    const second = nextPulse(first, { kind: 'HIT', side: 'A', x: .5, y: .5 });
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
  });

  it('scales the pulse and labels it by what happened', () => {
    expect(pulseStyle('HIT', palette)).toMatchObject({ color: palette.success, label: '+1' });
    expect(pulseStyle('MISS', palette)).toMatchObject({ color: palette.danger, label: null });
    expect(pulseStyle('MISSION_HIT', palette)).toMatchObject({ color: palette.accent, label: '단어 발견!' });
    // A word hunt win is the rarest event, so it reads largest.
    expect(pulseStyle('MISSION_HIT', palette).size).toBeGreaterThan(pulseStyle('HIT', palette).size);
    expect(pulseStyle('MISS', palette).size).toBeLessThan(pulseStyle('HIT', palette).size);
  });

  it('alternates the miss nudge so consecutive misses read as a shake', () => {
    const miss = (id: number): FeedbackPulse => ({ id, kind: 'MISS', side: 'A', x: 0, y: 0 });
    expect(missNudge(miss(1))).toBe(4);
    expect(missNudge(miss(2))).toBe(-4);
    expect(missNudge({ ...miss(1), kind: 'HIT' })).toBe(0);
    expect(missNudge(null)).toBe(0);
  });

  it('keeps a miss shorter than a hit so mistakes do not stall the board', () => {
    expect(FEEDBACK_MS.MISS).toBeLessThan(FEEDBACK_MS.HIT);
    expect(FEEDBACK_MS.MISSION_HIT).toBeGreaterThan(FEEDBACK_MS.HIT);
  });
});
