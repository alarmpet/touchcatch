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
  phase: 'FIND' | 'QUIZ' | 'COMPLETE';
  wrongAnswers: number;
  /**
   * Mirrors the match rule: the final answer opens on the first find or at
   * `finalChallenge.unlock.atMs`. Once open the player may answer at any time, without
   * having to clear the whole board first.
   */
  finalUnlocked: boolean;
  hintsUsed: number;
}>;

export type DemoAction =
  | Readonly<{ type: 'TAP'; side: 'A' | 'B'; x: number; y: number }>
  | Readonly<{ type: 'ANSWER'; optionId: string }>
  | Readonly<{ type: 'START_WORD_HUNT'; missionId: string }>
  | Readonly<{ type: 'OPEN_WORD_HUNT'; missionId: string }>
  | Readonly<{ type: 'END_WORD_HUNT'; missionId: string }>
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
  };
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
 * The clock is a bonus, never a gate. When it runs out the multiplier simply reaches 1.0
 * and play continues — this is a casual screen for every age, and locking someone out of
 * the board for being slow punishes the players least able to hurry.
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

  if (state.phase !== 'FIND' || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;

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

  const match = content.differences.find((difference) => {
    if (state.claimedIds.includes(difference.id)) return false;
    return hits(action.side === 'A' ? difference.imageA : difference.imageB, action.x, action.y);
  });
  if (!match) return state;
  const claimedIds = [...state.claimedIds, match.id];
  return {
    ...state,
    claimedIds,
    finalUnlocked: true,
    phase: claimedIds.length === content.differences.length ? 'QUIZ' : 'FIND',
  };
}
