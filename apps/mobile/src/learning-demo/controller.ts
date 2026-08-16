export type Circle = Readonly<{ cx: number; cy: number; r: number }>;

/**
 * Single-player word hunt. Mirrors the match engine's `wordHunts`
 * (packages/contracts content schema): a prompt is shown and the player taps the
 * matching object in the picture.
 */
export type DemoWordHunt = Readonly<{
  missionId: string;
  kind: 'NORMAL' | 'SPECIAL';
  publicPrompt: string;
  imageA: Circle;
  imageB: Circle;
}>;

export type DemoContent = Readonly<{
  key: string;
  differences: ReadonlyArray<Readonly<{ id: string; imageA: Circle; imageB: Circle }>>;
  wordHunts?: readonly DemoWordHunt[];
  correctOptionId: string;
}>;

/**
 * `READING` mirrors the engine's `wordHuntRevealMs` grace: the prompt is visible but
 * taps are ignored, so the player gets time to read before the window opens.
 */
export type DemoMissionStage = 'READING' | 'HUNTING';
export type DemoActiveMission = Readonly<{ missionId: string; stage: DemoMissionStage }>;

export type DemoState = Readonly<{
  contentKey: string;
  claimedIds: string[];
  solvedMissionIds: string[];
  endedMissionIds: string[];
  activeMission: DemoActiveMission | null;
  /**
   * `SUDDEN_DEATH` is the ten seconds the deadline grants a board that was not cleared.
   * The differences stay live during it; only the clock is different.
   */
  phase: 'FIND' | 'SUDDEN_DEATH' | 'QUIZ' | 'COMPLETE';
  wrongAnswers: number;
  /**
   * Mirrors the match rule: the final answer opens on the first find or at
   * `finalChallenge.unlock.atMs`. Once open the player may answer at any time, without
   * having to clear the whole board first.
   */
  finalUnlocked: boolean;
  hintsUsed: number;
  /**
   * Why the board stopped taking finds, or null while it is still open.
   *
   * The quiz screen used to be reachable only by clearing the board, so it could congratulate
   * unconditionally. Once the clock became a deadline that stopped being true, and a screen
   * that says "차이점을 모두 찾았어요" to someone who ran out of time is simply lying. `null`
   * covers the run that answered while the board was still open.
   */
  boardClosedBy: 'CLEAR' | 'SUDDEN_DEATH_WIN' | 'DEADLINE' | null;
}>;

export type DemoAction =
  | Readonly<{ type: 'TAP'; side: 'A' | 'B'; x: number; y: number }>
  | Readonly<{ type: 'ANSWER'; optionId: string }>
  | Readonly<{ type: 'START_WORD_HUNT'; missionId: string }>
  | Readonly<{ type: 'OPEN_WORD_HUNT'; missionId: string }>
  | Readonly<{ type: 'END_WORD_HUNT'; missionId: string }>
  /** The play clock reached zero. Closes the board, or opens sudden death if anything is left. */
  | Readonly<{ type: 'DEADLINE' }>
  | Readonly<{ type: 'END_SUDDEN_DEATH' }>
  | Readonly<{ type: 'UNLOCK_FINAL' }>
  | Readonly<{ type: 'USE_HINT' }>;

export function createDemoState(content: DemoContent): DemoState {
  return {
    contentKey: content.key,
    claimedIds: [],
    solvedMissionIds: [],
    endedMissionIds: [],
    activeMission: null,
    phase: 'FIND',
    wrongAnswers: 0,
    finalUnlocked: false,
    hintsUsed: 0,
    boardClosedBy: null,
  };
}

/** The differences still on the board. Sudden death accepts any one of them. */
function unclaimed(state: DemoState, content: DemoContent): DemoContent['differences'] {
  return content.differences.filter((difference) => !state.claimedIds.includes(difference.id));
}

/**
 * Difference counts at which each word hunt becomes available, spread across the board
 * so prompts do not cluster at the start. Always non-decreasing; when the board is too
 * small to separate them the extras simply queue behind one another.
 */
export function wordHuntMilestones(differenceCount: number, missionCount: number): readonly number[] {
  if (missionCount <= 0 || differenceCount <= 0) return [];
  const step = differenceCount / (missionCount + 1);
  return Array.from({ length: missionCount }, (_unused, index) =>
    Math.min(Math.max(Math.round(step * (index + 1)), index + 1), differenceCount));
}

/** The next word hunt whose milestone is met and which has not run yet, or null. */
export function pendingWordHunt(content: DemoContent, state: DemoState): DemoWordHunt | null {
  if (state.phase !== 'FIND' || state.activeMission !== null) return null;
  const missions = content.wordHunts ?? [];
  const milestones = wordHuntMilestones(content.differences.length, missions.length);
  for (const [index, mission] of missions.entries()) {
    if (state.endedMissionIds.includes(mission.missionId)) continue;
    if (state.claimedIds.length >= (milestones[index] ?? Number.MAX_SAFE_INTEGER)) return mission;
    return null;
  }
  return null;
}

/**
 * Practice-only score shape.
 *
 * The per-objective values come from the admitted ruleset so practice teaches the real
 * numbers. The multipliers below are **local to this casual screen** — a ranked score must
 * come from a server-validated match under approved economy values, never from the client.
 *
 * Why multipliers rather than a per-second bonus: a flat time bonus is additive income the
 * board cannot compete with, so the optimal line becomes "ignore the picture, answer the
 * instant the final challenge unlocks". That deletes the game. Speed is therefore a
 * multiplier on work already done — it separates two players who found the same things,
 * instead of substituting for finding them. It also only pays out on a solve, so the clock
 * cannot be banked by never answering.
 *
 * The speed bonus is additionally scaled by board completion. Without that, a small board
 * makes the multiplier worth more than every difference on it and guessing wins again;
 * with it, the ordering "clear more, faster" holds at any difference count. Stated to the
 * player: 빨리 푼 보너스는 그림을 찾은 만큼만 붙는다.
 *
 * The clock closes the board and nothing else. When it runs out the multiplier reaches 1.0
 * and the finding stops, but the final answer and the hints stay open for as long as the
 * player wants them: this is a casual screen for every age, and locking someone out of the
 * *learning* for being slow punishes the players least able to hurry. Losing the unfound
 * differences is the whole cost of being slow, and it is enough of one.
 */
export const DEMO_SPEED_BONUS_MAX = 0.8;
export const DEMO_HINT_PENALTY_PER_USE = 0.12;
export const DEMO_HINT_MULTIPLIER_FLOOR = 0.6;
export const DEMO_WRONG_ANSWER_PENALTY = 10;

export type DemoScoreBreakdown = Readonly<{
  finds: number;
  wordHunts: number;
  finalAnswer: number;
  penalty: number;
  base: number;
  /**
   * 1.0 at the buzzer, up to 1 + DEMO_SPEED_BONUS_MAX for an instant full clear; 1.0 while
   * unsolved, and 1.0 for a solve that found nothing.
   */
  speedMultiplier: number;
  /** Scales the whole run down, so a hint costs a strong run more than a weak one. */
  hintMultiplier: number;
  total: number;
}>;

export function scoreDemoState(
  state: DemoState,
  content: DemoContent,
  rules: Readonly<{ normalDifference: number; normalWordHunt: number; specialWordHunt: number; finalWord: number; meaning: number }>,
  clock: Readonly<{ remainingMs: number; totalMs: number }> = { remainingMs: 0, totalMs: 0 },
): DemoScoreBreakdown {
  const missions = content.wordHunts ?? [];
  const wordHunts = state.solvedMissionIds.reduce((total, missionId) => {
    const mission = missions.find((candidate) => candidate.missionId === missionId);
    return total + (mission?.kind === 'SPECIAL' ? rules.specialWordHunt : rules.normalWordHunt);
  }, 0);
  const finds = state.claimedIds.length * rules.normalDifference;
  const solved = state.phase === 'COMPLETE';
  const finalAnswer = solved ? rules.finalWord + rules.meaning : 0;
  const penalty = state.wrongAnswers * DEMO_WRONG_ANSWER_PENALTY;
  const base = Math.max(0, finds + wordHunts + finalAnswer - penalty);

  const remainingRatio = clock.totalMs > 0
    ? Math.min(1, Math.max(0, clock.remainingMs / clock.totalMs))
    : 0;
  const completionRatio = content.differences.length > 0
    ? Math.min(1, state.claimedIds.length / content.differences.length)
    : 0;
  const speedMultiplier = solved ? 1 + DEMO_SPEED_BONUS_MAX * remainingRatio * completionRatio : 1;
  const hintMultiplier = Math.max(DEMO_HINT_MULTIPLIER_FLOOR, 1 - DEMO_HINT_PENALTY_PER_USE * state.hintsUsed);

  return {
    finds,
    wordHunts,
    finalAnswer,
    penalty,
    base,
    speedMultiplier,
    hintMultiplier,
    total: Math.round(base * speedMultiplier * hintMultiplier),
  };
}

function hits(circle: Circle, x: number, y: number): boolean {
  const tolerance = Math.max(circle.r, 0.06);
  return Math.hypot(x - circle.cx, y - circle.cy) <= tolerance;
}

export function reduceDemoState(state: DemoState, content: DemoContent, action: DemoAction): DemoState {
  if (state.contentKey !== content.key) return createDemoState(content);
  const missions = content.wordHunts ?? [];

  if (action.type === 'START_WORD_HUNT') {
    if (state.phase !== 'FIND' || state.activeMission !== null) return state;
    if (state.endedMissionIds.includes(action.missionId)) return state;
    if (!missions.some((mission) => mission.missionId === action.missionId)) return state;
    return { ...state, activeMission: { missionId: action.missionId, stage: 'READING' } };
  }
  if (action.type === 'OPEN_WORD_HUNT') {
    if (state.activeMission?.missionId !== action.missionId || state.activeMission.stage !== 'READING') return state;
    return { ...state, activeMission: { missionId: action.missionId, stage: 'HUNTING' } };
  }
  if (action.type === 'END_WORD_HUNT') {
    if (state.activeMission?.missionId !== action.missionId) return state;
    return {
      ...state,
      activeMission: null,
      endedMissionIds: [...state.endedMissionIds, action.missionId],
    };
  }
  /**
   * The deadline. The board closes here — everything not found is lost, which is the whole
   * point of giving the clock teeth — but the round does not end: the final answer and the
   * hints stay open afterwards, so running out of time costs points and never costs learning.
   *
   * Anything still unfound buys ten more seconds. The target is any remaining difference
   * rather than one nominated spot: the drafts do carry a `privateSolution.suddenDeath`
   * hitbox, but two thirds of those coordinates do not sit on the artwork's actual
   * differences — the same defect that already keeps the drafts' word-hunt coordinates out
   * of the preview registry. A last chance the player cannot hit is worse than none.
   */
  if (action.type === 'DEADLINE') {
    if (state.phase !== 'FIND') return state;
    // A prompt caught by the buzzer is spent, not resumed. The board is closing either way.
    const closing = {
      ...state,
      activeMission: null,
      endedMissionIds: state.activeMission === null
        ? state.endedMissionIds
        : [...state.endedMissionIds, state.activeMission.missionId],
      finalUnlocked: true,
    };
    return unclaimed(state, content).length > 0
      ? { ...closing, phase: 'SUDDEN_DEATH' as const }
      : { ...closing, phase: 'QUIZ' as const, boardClosedBy: 'DEADLINE' as const };
  }
  if (action.type === 'END_SUDDEN_DEATH') {
    if (state.phase !== 'SUDDEN_DEATH') return state;
    return { ...state, phase: 'QUIZ', boardClosedBy: 'DEADLINE' };
  }
  if (action.type === 'UNLOCK_FINAL') {
    return state.finalUnlocked ? state : { ...state, finalUnlocked: true };
  }
  if (action.type === 'USE_HINT') {
    return state.phase === 'COMPLETE' ? state : { ...state, hintsUsed: state.hintsUsed + 1 };
  }
  if (action.type === 'ANSWER') {
    if (state.phase === 'COMPLETE') return state;
    if (state.phase === 'FIND' && !state.finalUnlocked) return state;
    return action.optionId === content.correctOptionId
      ? { ...state, phase: 'COMPLETE', activeMission: null }
      : { ...state, wrongAnswers: state.wrongAnswers + 1 };
  }

  if ((state.phase !== 'FIND' && state.phase !== 'SUDDEN_DEATH') || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;

  // One find ends sudden death, whichever difference it was. Nothing else about the board
  // changes, so the player is looking for the same things in the same places as a second ago.
  if (state.phase === 'SUDDEN_DEATH') {
    const found = unclaimed(state, content).find((difference) =>
      hits(action.side === 'A' ? difference.imageA : difference.imageB, action.x, action.y));
    if (!found) return state;
    return {
      ...state,
      claimedIds: [...state.claimedIds, found.id],
      phase: 'QUIZ',
      boardClosedBy: 'SUDDEN_DEATH_WIN',
    };
  }

  // While a prompt is on screen the mission owns the board, exactly as the match engine does.
  if (state.activeMission !== null) {
    if (state.activeMission.stage === 'READING') return state;
    const mission = missions.find((candidate) => candidate.missionId === state.activeMission!.missionId);
    if (!mission) return state;
    const circle = action.side === 'A' ? mission.imageA : mission.imageB;
    if (!hits(circle, action.x, action.y)) return state;
    return {
      ...state,
      activeMission: null,
      solvedMissionIds: [...state.solvedMissionIds, mission.missionId],
      endedMissionIds: [...state.endedMissionIds, mission.missionId],
    };
  }

  const match = unclaimed(state, content).find((difference) =>
    hits(action.side === 'A' ? difference.imageA : difference.imageB, action.x, action.y));
  if (!match) return state;
  const claimedIds = [...state.claimedIds, match.id];
  const cleared = claimedIds.length === content.differences.length;
  return {
    ...state,
    claimedIds,
    finalUnlocked: true,
    phase: cleared ? 'QUIZ' : 'FIND',
    ...(cleared ? { boardClosedBy: 'CLEAR' as const } : {}),
  };
}
