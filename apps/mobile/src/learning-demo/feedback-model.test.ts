import { describe, expect, it } from 'vitest';
import { COMBO_ANNOUNCE_AT, COMBO_WINDOW_MS, EMPTY_COMBO, FEEDBACK_MS, STREAK_STEPS, advanceCombo, comboExpired, comboLabel, missNudge, nextPulse, pulseStyle, streakStep, type FeedbackPulse } from './feedback-model';

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

  it('leaves a lone find exactly as it was, and heats only from the second', () => {
    // The ladder is something a round heats into, not a restyling of the base case.
    expect(pulseStyle('HIT', palette, 1).color).toBe(palette.success);
    expect(pulseStyle('HIT', palette, 2).color).not.toBe(palette.success);
  });

  it('grows and heats the hit ring as the streak climbs, then stops climbing', () => {
    const first = pulseStyle('HIT', palette, 1);
    const seventh = pulseStyle('HIT', palette, 7);
    expect(seventh.size).toBeGreaterThan(first.size);
    expect(seventh.color).not.toBe(first.color);
    // Past the last rung the ladder holds rather than running off the end of the palette.
    expect(pulseStyle('HIT', palette, 99)).toEqual(pulseStyle('HIT', palette, STREAK_STEPS));
  });

  it('leaves miss and mission feedback outside the streak ladder', () => {
    expect(pulseStyle('MISS', palette, 7)).toEqual(pulseStyle('MISS', palette, 1));
    expect(pulseStyle('MISSION_HIT', palette, 7)).toEqual(pulseStyle('MISSION_HIT', palette, 1));
  });

  it('clamps the streak step to the ladder at both ends', () => {
    expect(streakStep(0)).toBe(0);
    expect(streakStep(-3)).toBe(0);
    expect(streakStep(Number.NaN)).toBe(0);
    expect(streakStep(1)).toBe(0);
    expect(streakStep(STREAK_STEPS + 10)).toBe(STREAK_STEPS - 1);
  });

  it('continues a combo inside the window and restarts it outside', () => {
    const first = advanceCombo(EMPTY_COMBO, 1000);
    expect(first.count).toBe(1);
    expect(advanceCombo(first, 1000 + COMBO_WINDOW_MS).count).toBe(2);
    expect(advanceCombo(first, 1001 + COMBO_WINDOW_MS).count).toBe(1);
  });

  it('announces a combo only once it is worth announcing', () => {
    let combo = EMPTY_COMBO;
    for (let find = 1; find < COMBO_ANNOUNCE_AT; find += 1) {
      combo = advanceCombo(combo, find * 100);
      expect(comboLabel(combo)).toBeNull();
    }
    combo = advanceCombo(combo, COMBO_ANNOUNCE_AT * 100);
    expect(comboLabel(combo)).toBe(`${COMBO_ANNOUNCE_AT}연속`);
  });

  it('never treats an empty combo as expired', () => {
    expect(comboExpired(EMPTY_COMBO, 10_000_000)).toBe(false);
    expect(comboExpired(advanceCombo(EMPTY_COMBO, 0), COMBO_WINDOW_MS + 1)).toBe(true);
  });
});
