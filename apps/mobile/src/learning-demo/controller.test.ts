import { describe, expect, it } from 'vitest';
import {
  createDemoState,
  pendingWordHunt,
  reduceDemoState,
  scoreDemoState,
  wordHuntSpawnMs,
  type DemoContent,
  type DemoWordHuntSchedule,
} from './controller.js';

const rules = { normalDifference: 6, normalWordHunt: 10, specialWordHunt: 15, finalWord: 25, meaning: 15 };

/** The admitted ruleset's schedule, restated so the test pins the shape it reads. */
const schedule: DemoWordHuntSchedule = [
  { spawnWindowMs: [16000, 22000] },
  { spawnWindowMs: [34000, 42000] },
  { spawnAtMs: 60000 },
];

const content: DemoContent = {
  key: 'demo',
  differences: [{ id: 'a', imageA: { cx: .2, cy: .3, r: .1 }, imageB: { cx: .2, cy: .3, r: .1 } }, { id: 'b', imageA: { cx: .8, cy: .7, r: .1 }, imageB: { cx: .8, cy: .7, r: .1 } }],
  correctOptionId: 'right',
};

const hunted: DemoContent = {
  ...content,
  wordHunts: [{
    missionId: 'sun',
    kind: 'NORMAL',
    publicPrompt: 'Sun',
    imageA: { cx: .5, cy: .1, r: .08 },
    imageB: { cx: .5, cy: .1, r: .08 },
  }],
};

describe('learning demo controller', () => {
  it('claims each difference once and opens the quiz after the final claim', () => {
    let state = createDemoState(content);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    state = reduceDemoState(state, content, { type: 'TAP', side: 'B', x: .2, y: .3 });
    expect(state.claimedIds).toEqual(['a']);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'B', x: .8, y: .7 });
    expect(state.phase).toBe('QUIZ');
  });

  it('ignores misses and completes only for the correct meaning', () => {
    let state = createDemoState(content);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'A', x: .5, y: .5 });
    expect(state.claimedIds).toEqual([]);
    state = { ...state, phase: 'QUIZ' };
    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'wrong' });
    expect(state.phase).toBe('QUIZ');
    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'right' });
    expect(state.phase).toBe('COMPLETE');
  });

  it('schedules word hunts on the ruleset clock, repeatably per board', () => {
    const spawns = wordHuntSpawnMs('demo', 3, schedule);
    expect(spawns[0]).toBeGreaterThanOrEqual(16000);
    expect(spawns[0]).toBeLessThanOrEqual(22000);
    expect(spawns[1]).toBeGreaterThanOrEqual(34000);
    expect(spawns[1]).toBeLessThanOrEqual(42000);
    // The SPECIAL is an instant, not a window, and the ruleset puts it on the final rush.
    expect(spawns[2]).toBe(60000);
    // Same board, same moments — the ghost race compares two runs of one board, so a moment
    // that moved between them would read as the player having done something different.
    expect(wordHuntSpawnMs('demo', 3, schedule)).toEqual(spawns);
    expect(wordHuntSpawnMs('other-board', 3, schedule)).not.toEqual(spawns);
    // More hunts than the schedule covers simply never spawn, rather than all firing at zero.
    expect(wordHuntSpawnMs('demo', 4, schedule)[3]).toBe(Number.MAX_SAFE_INTEGER);
    expect(wordHuntSpawnMs('demo', 0, schedule)).toEqual([]);
  });

  it('offers a word hunt on its moment, not on progress, and never while one is running', () => {
    let state = createDemoState(hunted);
    const at = wordHuntSpawnMs(hunted.key, 1, schedule)[0]!;
    // Finding things does not summon it any more: the clock does.
    state = reduceDemoState(state, hunted, { type: 'TAP', side: 'A', x: .2, y: .3 });
    expect(pendingWordHunt(hunted, state, at - 1, schedule)).toBeNull();
    // ...and neither does finding nothing hold it back.
    expect(pendingWordHunt(hunted, createDemoState(hunted), at, schedule)?.missionId).toBe('sun');

    expect(pendingWordHunt(hunted, state, at, schedule)?.missionId).toBe('sun');
    state = reduceDemoState(state, hunted, { type: 'START_WORD_HUNT', missionId: 'sun' });
    expect(pendingWordHunt(hunted, state, at, schedule)).toBeNull();
  });

  it('locks the board while the prompt is being read, then accepts the matching object', () => {
    let state = createDemoState(hunted);
    state = reduceDemoState(state, hunted, { type: 'TAP', side: 'A', x: .2, y: .3 });
    state = reduceDemoState(state, hunted, { type: 'START_WORD_HUNT', missionId: 'sun' });
    expect(state.activeMission).toEqual({ missionId: 'sun', stage: 'READING' });

    // Reading grace: a correct tap is ignored rather than consumed.
    state = reduceDemoState(state, hunted, { type: 'TAP', side: 'A', x: .5, y: .1 });
    expect(state.solvedMissionIds).toEqual([]);

    state = reduceDemoState(state, hunted, { type: 'OPEN_WORD_HUNT', missionId: 'sun' });
    state = reduceDemoState(state, hunted, { type: 'TAP', side: 'A', x: .5, y: .1 });
    expect(state.solvedMissionIds).toEqual(['sun']);
    expect(state.activeMission).toBeNull();
    // Late in the round, well past every spawn moment: a spent hunt never comes back.
    expect(pendingWordHunt(hunted, state, 70000, schedule)).toBeNull();
  });

  it('holds the board for the mission and never penalises a miss', () => {
    let state = createDemoState(hunted);
    state = reduceDemoState(state, hunted, { type: 'TAP', side: 'A', x: .2, y: .3 });
    state = reduceDemoState(state, hunted, { type: 'START_WORD_HUNT', missionId: 'sun' });
    state = reduceDemoState(state, hunted, { type: 'OPEN_WORD_HUNT', missionId: 'sun' });

    // The second difference is under the finger, but the mission owns the board.
    const before = state;
    state = reduceDemoState(state, hunted, { type: 'TAP', side: 'B', x: .8, y: .7 });
    expect(state).toEqual(before);

    state = reduceDemoState(state, hunted, { type: 'END_WORD_HUNT', missionId: 'sun' });
    expect(state.solvedMissionIds).toEqual([]);
    expect(state.endedMissionIds).toEqual(['sun']);
    // A missed hunt is spent, not retried, and the board returns to the differences.
    // Late in the round, well past every spawn moment: a spent hunt never comes back.
    expect(pendingWordHunt(hunted, state, 70000, schedule)).toBeNull();
    state = reduceDemoState(state, hunted, { type: 'TAP', side: 'B', x: .8, y: .7 });
    expect(state.phase).toBe('QUIZ');
  });

  it('grants sudden death at the deadline and ends it on any remaining difference', () => {
    let state = createDemoState(content);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    state = reduceDemoState(state, content, { type: 'DEADLINE' });
    expect(state.phase).toBe('SUDDEN_DEATH');
    // The board closing must never close the answer with it.
    expect(state.finalUnlocked).toBe(true);

    // Any one of the leftovers wins it. Nominating a single spot is what the drafts'
    // `suddenDeath` hitbox would do, and two thirds of those are not on the artwork.
    state = reduceDemoState(state, content, { type: 'TAP', side: 'B', x: .5, y: .5 });
    expect(state.phase).toBe('SUDDEN_DEATH');
    state = reduceDemoState(state, content, { type: 'TAP', side: 'B', x: .8, y: .7 });
    expect(state.phase).toBe('QUIZ');
    expect(state.boardClosedBy).toBe('SUDDEN_DEATH_WIN');
    expect(state.claimedIds).toEqual(['a', 'b']);
  });

  it('records how the board closed so the result cannot congratulate a run that ran out', () => {
    let cleared = createDemoState(content);
    cleared = reduceDemoState(cleared, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    cleared = reduceDemoState(cleared, content, { type: 'TAP', side: 'B', x: .8, y: .7 });
    expect(cleared).toMatchObject({ phase: 'QUIZ', boardClosedBy: 'CLEAR' });

    let expired = createDemoState(content);
    expired = reduceDemoState(expired, content, { type: 'DEADLINE' });
    expired = reduceDemoState(expired, content, { type: 'END_SUDDEN_DEATH' });
    expect(expired).toMatchObject({ phase: 'QUIZ', boardClosedBy: 'DEADLINE' });
    // Nothing was found, so nothing was scored — but the answer is still worth its points.
    expired = reduceDemoState(expired, content, { type: 'ANSWER', optionId: 'right' });
    expect(expired.phase).toBe('COMPLETE');
    expect(scoreDemoState(expired, content, rules, { remainingMs: 0, totalMs: 90000 }).total).toBe(40);
  });

  it('skips sudden death when the deadline finds nothing left to look for', () => {
    // Reachable only from a board with no differences at all: a cleared one is already
    // past FIND. It must still land on the answer rather than hanging on an empty stage.
    const empty: DemoContent = { ...content, key: 'empty', differences: [] };
    let state = createDemoState(empty);
    state = reduceDemoState(state, empty, { type: 'DEADLINE' });
    expect(state).toMatchObject({ phase: 'QUIZ', boardClosedBy: 'DEADLINE' });
  });

  it('spends a word hunt caught by the buzzer instead of resuming it', () => {
    let state = createDemoState(hunted);
    state = reduceDemoState(state, hunted, { type: 'TAP', side: 'A', x: .2, y: .3 });
    state = reduceDemoState(state, hunted, { type: 'START_WORD_HUNT', missionId: 'sun' });
    state = reduceDemoState(state, hunted, { type: 'DEADLINE' });
    expect(state.activeMission).toBeNull();
    expect(state.endedMissionIds).toEqual(['sun']);
    // Late in the round, well past every spawn moment: a spent hunt never comes back.
    expect(pendingWordHunt(hunted, state, 70000, schedule)).toBeNull();
  });

  it('opens the final answer on the first find and accepts it before the board is cleared', () => {
    let state = createDemoState(content);
    // Nothing found yet: answering is not yet available.
    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'right' });
    expect(state.phase).toBe('FIND');

    state = reduceDemoState(state, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    expect(state.finalUnlocked).toBe(true);
    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'right' });
    expect(state.phase).toBe('COMPLETE');
    expect(state.claimedIds).toHaveLength(1);
  });

  it('opens the final answer on the timed unlock even with nothing found', () => {
    let state = createDemoState(content);
    state = reduceDemoState(state, content, { type: 'UNLOCK_FINAL' });
    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'right' });
    expect(state.phase).toBe('COMPLETE');
  });

  it('pays the speed bonus only on a solve, and only for what was found', () => {
    let state = createDemoState(content);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    const unsolved = scoreDemoState(state, content, rules, { remainingMs: 60000, totalMs: 90000 });
    // An unsolved run banks no clock, so waiting is never worth points.
    expect(unsolved).toMatchObject({ finds: 6, finalAnswer: 0, speedMultiplier: 1, base: 6, total: 6 });

    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'right' });
    const fast = scoreDemoState(state, content, rules, { remainingMs: 60000, totalMs: 90000 });
    const slow = scoreDemoState(state, content, rules, { remainingMs: 5000, totalMs: 90000 });
    expect(fast.base).toBe(6 + 25 + 15);
    expect(fast.total).toBeGreaterThan(slow.total);
    // Half the board found, two thirds of the clock left: 1 + 0.8 * 2/3 * 1/2.
    expect(fast.speedMultiplier).toBeCloseTo(1.2667, 4);
    expect(fast.total).toBe(58);
  });

  /**
   * The property that keeps the picture relevant. A flat per-second bonus broke it: on a
   * small board the clock was worth more than every difference on it, so the best line was
   * to skip the board entirely.
   */
  it('ranks a slow full clear above a fast answer that found nothing', () => {
    let guessed = createDemoState(content);
    guessed = reduceDemoState(guessed, content, { type: 'UNLOCK_FINAL' });
    guessed = reduceDemoState(guessed, content, { type: 'ANSWER', optionId: 'right' });
    const guess = scoreDemoState(guessed, content, rules, { remainingMs: 78000, totalMs: 90000 });
    expect(guess.speedMultiplier).toBe(1);
    expect(guess.total).toBe(40);

    let cleared = createDemoState(content);
    cleared = reduceDemoState(cleared, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    cleared = reduceDemoState(cleared, content, { type: 'TAP', side: 'B', x: .8, y: .7 });
    cleared = reduceDemoState(cleared, content, { type: 'ANSWER', optionId: 'right' });
    const slowClear = scoreDemoState(cleared, content, rules, { remainingMs: 10000, totalMs: 90000 });
    expect(slowClear.total).toBeGreaterThan(guess.total);
  });

  it('scales the whole run down per hint rather than charging a flat fee', () => {
    let state = createDemoState(content);
    state = reduceDemoState(state, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    state = reduceDemoState(state, content, { type: 'ANSWER', optionId: 'right' });
    const clean = scoreDemoState(state, content, rules, { remainingMs: 60000, totalMs: 90000 });

    let hinted = createDemoState(content);
    hinted = reduceDemoState(hinted, content, { type: 'USE_HINT' });
    hinted = reduceDemoState(hinted, content, { type: 'USE_HINT' });
    hinted = reduceDemoState(hinted, content, { type: 'TAP', side: 'A', x: .2, y: .3 });
    hinted = reduceDemoState(hinted, content, { type: 'ANSWER', optionId: 'right' });
    const scored = scoreDemoState(hinted, content, rules, { remainingMs: 60000, totalMs: 90000 });
    expect(scored.hintMultiplier).toBeCloseTo(0.76, 4);
    expect(scored.total).toBeLessThan(clean.total);
  });

  it('floors the hint multiplier and never reports a negative total', () => {
    let state = createDemoState(content);
    for (let index = 0; index < 9; index += 1) state = reduceDemoState(state, content, { type: 'USE_HINT' });
    // Hints stop compounding, so a long run is never worth less than playing it out.
    expect(scoreDemoState(state, content, rules, { remainingMs: 0, totalMs: 90000 }).hintMultiplier).toBe(0.6);

    let wrong = createDemoState(content);
    wrong = reduceDemoState(wrong, content, { type: 'UNLOCK_FINAL' });
    for (let index = 0; index < 4; index += 1) wrong = reduceDemoState(wrong, content, { type: 'ANSWER', optionId: 'nope' });
    const scored = scoreDemoState(wrong, content, rules, { remainingMs: 0, totalMs: 90000 });
    expect(scored.penalty).toBe(40);
    expect(scored.total).toBe(0);
  });
});
