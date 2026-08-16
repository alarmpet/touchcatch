import { MobileApiError } from '../../api/mobile-api-transport';
import type { createAttemptClient } from './attempt-client';
import type {
  AttemptCommandEventV1,
  AttemptCompleteResponseV1,
  AttemptTapResponseV1,
  WeeklyChallengeV1,
} from '../../../../../packages/contracts/src/learning-attempt';

type AttemptClient = ReturnType<typeof createAttemptClient>;
type SessionStatus = 'loading' | 'signed-out' | 'signed-in' | 'error';

/**
 * `OPENING` and `LOADING_ASSETS` are separate on purpose. The scoring clock starts at the
 * server-issued assets-ready stamp, not at start, so a slow image download must not cost the
 * player rank. The screen calls `markAssetsReady` only once both pictures have decoded.
 */
export type RankedSessionPhase =
  | 'IDLE'
  | 'OPENING'
  | 'LOADING_ASSETS'
  | 'PLAYING'
  | 'SUBMITTING'
  | 'SETTLED'
  | 'UNAVAILABLE';

/** A difference the server confirmed, with the circles to draw on both boards. */
export type ConfirmedFind = Readonly<{
  objectiveId: string;
  displayCircles: Readonly<{ imageA: TapCircle; imageB: TapCircle }>;
}>;

type TapCircle = Readonly<{ cx: number; cy: number; r: number }>;

export type RankedSessionState = Readonly<{
  phase: RankedSessionPhase;
  challenge: WeeklyChallengeV1 | null;
  attemptId: string | null;
  /** Server clock, never the device's. Rendered as a deadline, not used for scoring. */
  expiresAt: string | null;
  /** Only what the server confirmed. The client never decides a find. */
  finds: readonly ConfirmedFind[];
  /** Revealed answer units by slot index, each earned by one confirmed find. */
  openedUnits: Readonly<Record<number, string>>;
  wrongTaps: number;
  result: AttemptCompleteResponseV1 | null;
  reason: string | null;
}>;

/** Codes that mean "ranked is closed right now", as opposed to a retryable failure. */
const closedCodes = new Set([
  'RANKING_POLICY_NOT_APPROVED',
  'HINT_POLICY_NOT_APPROVED',
  'RULESET_NOT_APPROVED',
  'SEASON_NOT_OPEN',
  'SEASON_NOT_FOUND',
  'CHALLENGE_PIN_MISMATCH',
  'POLICY_MISMATCH',
  'SELECTED_PET_REQUIRED',
]);

function codeOf(error: unknown): string {
  if (error instanceof MobileApiError) return error.code;
  return error instanceof Error ? error.message : 'UNKNOWN_ERROR';
}

const idle: RankedSessionState = {
  phase: 'IDLE', challenge: null, attemptId: null, expiresAt: null,
  finds: [], openedUnits: {}, wrongTaps: 0, result: null, reason: null,
};

export function createRankedSessionController(input: Readonly<{
  session(): SessionStatus;
  seasonId: string;
  client: AttemptClient;
  createMutationKey(): string;
}>) {
  let disposed = false;
  let revision = 0;
  let state: RankedSessionState = idle;
  const listeners = new Set<(value: RankedSessionState) => void>();

  // One key per attempt lifecycle. Reusing the same key on a retry is what makes a dropped
  // response replay the stored outcome instead of opening a second session or conflicting.
  let startKey: string | null = null;
  let assetsKey: string | null = null;
  let completeKey: string | null = null;

  const publish = (next: RankedSessionState) => {
    if (disposed) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  const fail = (error: unknown, fallback: RankedSessionPhase): void => {
    const reason = codeOf(error);
    publish({ ...state, phase: closedCodes.has(reason) ? 'UNAVAILABLE' : fallback, reason });
  };
  const stale = (at: number): boolean => at !== revision || disposed;

  return {
    getState: () => state,
    subscribe(listener: (value: RankedSessionState) => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async listChallenges(): Promise<readonly WeeklyChallengeV1[]> {
      if (input.session() !== 'signed-in') return [];
      try {
        return (await input.client.getChallenges(input.seasonId)).challenges;
      } catch (error) {
        fail(error, 'IDLE');
        return [];
      }
    },

    /** Opens a ranked session for one pinned challenge. Safe to call again after a failure. */
    async open(challenge: WeeklyChallengeV1): Promise<void> {
      const at = ++revision;
      if (input.session() !== 'signed-in') {
        publish({ ...idle, phase: 'UNAVAILABLE', reason: 'SIGNED_OUT' });
        return;
      }
      startKey = startKey ?? input.createMutationKey();
      assetsKey = null;
      completeKey = null;
      publish({ ...idle, phase: 'OPENING', challenge });
      try {
        const opened = await input.client.start({
          seasonId: input.seasonId,
          contentRevisionId: challenge.contentRevisionId,
          contentHash: challenge.contentHash,
          idempotencyKey: startKey,
        });
        if (stale(at)) return;
        if (opened.status !== 'OPEN') {
          publish({ ...idle, phase: 'UNAVAILABLE', challenge, reason: opened.status });
          return;
        }
        publish({
          ...idle,
          phase: 'LOADING_ASSETS',
          challenge,
          attemptId: opened.attemptId,
          expiresAt: opened.expiresAt,
        });
      } catch (error) {
        if (stale(at)) return;
        startKey = null;
        fail(error, 'IDLE');
      }
    },

    /** Call once both images have decoded. This is the moment the ranked clock starts. */
    async markAssetsReady(): Promise<void> {
      const at = revision;
      if (state.phase !== 'LOADING_ASSETS' || !state.attemptId || !state.challenge) return;
      assetsKey = assetsKey ?? input.createMutationKey();
      try {
        const attested = await input.client.markAssetsReady({
          attemptId: state.attemptId,
          contentHash: state.challenge.contentHash,
          idempotencyKey: assetsKey,
        });
        if (stale(at)) return;
        if (attested.status === 'EXPIRED') {
          publish({ ...state, phase: 'UNAVAILABLE', reason: 'EXPIRED' });
          return;
        }
        publish({ ...state, phase: 'PLAYING', reason: null });
      } catch (error) {
        if (stale(at)) return;
        fail(error, 'LOADING_ASSETS');
      }
    },

    /**
     * Sends one tap and folds the server's verdict into the board.
     *
     * Nothing is drawn optimistically here. The screen may show a transient ring at the
     * finger, but a difference is only *marked* once the server names it — the client has
     * no hitboxes and therefore no honest opinion about whether the tap landed.
     */
    async tap(side: 'A' | 'B', x: number, y: number): Promise<AttemptTapResponseV1 | null> {
      const at = revision;
      if (state.phase !== 'PLAYING' || !state.attemptId || !state.challenge) return null;
      try {
        const result = await input.client.tap({
          attemptId: state.attemptId,
          contentHash: state.challenge.contentHash,
          side, x, y,
          idempotencyKey: input.createMutationKey(),
        });
        if (stale(at)) return null;
        if (result.status !== 'OPEN') {
          publish({ ...state, phase: 'UNAVAILABLE', reason: result.status });
          return result;
        }
        const alreadyFound = state.finds.some((find) => find.objectiveId === result.objectiveId);
        publish({
          ...state,
          wrongTaps: result.wrongTaps,
          finds: result.outcome === 'HIT' && result.objectiveId !== null
            && result.displayCircles !== null && !alreadyFound
            ? [...state.finds, { objectiveId: result.objectiveId, displayCircles: result.displayCircles }]
            : state.finds,
          openedUnits: result.openedUnit === null
            ? state.openedUnits
            : { ...state.openedUnits, [result.openedUnit.index]: result.openedUnit.text },
          reason: null,
        });
        return result;
      } catch (error) {
        if (stale(at)) return null;
        fail(error, 'PLAYING');
        return null;
      }
    },

    /**
     * Submits the run. No score is sent — the server recomputes it from its own clock, and
     * the wrong-tap count now comes from the tap log rather than from this number.
     */
    async submit(run: Readonly<{
      events: readonly AttemptCommandEventV1[];
      hintsUsed: number;
      wrongTaps: number;
      wrongAnswers: number;
    }>): Promise<AttemptCompleteResponseV1 | null> {
      const at = revision;
      if (state.phase !== 'PLAYING' || !state.attemptId || !state.challenge) return null;
      completeKey = completeKey ?? input.createMutationKey();
      publish({ ...state, phase: 'SUBMITTING' });
      try {
        const result = await input.client.complete({
          attemptId: state.attemptId,
          contentHash: state.challenge.contentHash,
          events: run.events,
          hintsUsed: run.hintsUsed,
          wrongTaps: run.wrongTaps,
          wrongAnswers: run.wrongAnswers,
          idempotencyKey: completeKey,
        });
        if (stale(at)) return null;
        publish({ ...state, phase: 'SETTLED', result, reason: null });
        return result;
      } catch (error) {
        if (stale(at)) return null;
        // The key is deliberately kept so a retry replays rather than opens a new commit.
        fail(error, 'PLAYING');
        return null;
      }
    },

    reset() {
      revision += 1;
      startKey = null;
      assetsKey = null;
      completeKey = null;
      publish(idle);
    },

    dispose() {
      disposed = true;
      revision += 1;
      listeners.clear();
    },
  } as const;
}
