import type { MatchEvent, MatchStateV1 } from "./match.js";
import type { MatchSnapshotV1, ServerEventEnvelope } from "./socket.js";
const base = (e: MatchEvent) => ({
  protocolVersion: 1 as const,
  eventId: e.eventId,
  matchId: e.matchId,
  eventSeq: e.eventSeq,
  stateRevision: e.stateRevision,
  occurredAtMs: e.occurredAtMs,
  phase: e.phase,
});
const redacted = (e: MatchEvent) => ({
  ...base(e),
  type: "state_advanced" as const,
  payload: { redacted: true as const },
});
export function projectMatchEvent(
  e: MatchEvent,
  state: Pick<MatchStateV1, "privateSolution">,
  viewer: string,
): ServerEventEnvelope {
  const b = base(e);
  switch (e.type) {
    case "TAP_RESOLVED": {
      const p = e.payload;
      return p.playerId === viewer
        ? {
            ...b,
            type: "tap_result",
            payload: {
              requestId: p.requestId,
              applied: true,
              hit: p.hit,
              objectiveId: p.objectiveId,
            },
          }
        : redacted(e);
    }
    case "MEANING_QUIZ_STARTED": {
      const p = e.payload;
      if (p.playerId !== viewer) return redacted(e);
      const m = state.privateSolution.finalChallenge.meaning;
      return {
        ...b,
        type: "meaning_quiz_started",
        payload: {
          playerId: p.playerId,
          quizOrdinal: p.quizOrdinal,
          prompt: m.prompt,
          options: m.options.map(({ id, label }) => ({ id, label })),
          endsAtMs: p.endsAtMs,
        },
      };
    }
    case "OBJECTIVE_CLAIMED": {
      const p = e.payload;
      const d = state.privateSolution.differences.find(
        (x) => x.objectiveId === p.objectiveId,
      );
      if (!d) return redacted(e);
      return {
        ...b,
        type: "difference_claimed",
        payload: {
          objectiveId: p.objectiveId,
          ownerPlayerId: p.ownerPlayerId,
          displayCircles: d.hitboxes,
        },
      };
    }
    case "ASSET_READY_CHANGED": return { ...b, type: "asset_ready_changed", payload: e.payload };
    case "MATCH_STARTED": return { ...b, type: "match_started", payload: e.payload };
    case "WORD_HUNT_STARTED": return { ...b, type: "word_hunt_started", payload: e.payload };
    case "WORD_HUNT_WON": return { ...b, type: "word_hunt_won", payload: e.payload };
    case "WORD_HUNT_ENDED": return { ...b, type: "word_hunt_ended", payload: e.payload };
    case "SCORE_CHANGED": return { ...b, type: "score_changed", payload: {playerId:e.payload.playerId,delta:e.payload.delta,absoluteScore:e.payload.absoluteScore!} };
    case "FINAL_RUSH_STARTED": return { ...b, type: "final_rush_started", payload: e.payload };
    case "FINAL_CHALLENGE_UNLOCKED": return { ...b, type: "final_challenge_unlocked", payload: e.payload };
    case "HINT_REVEALED": { const p=e.payload;
      return p.playerId === viewer
        ? { ...b, type: "hint_revealed", payload: p }
        : redacted(e); }
    case "HINT_STEP_REVEALED": {
      const { playerId, ...payload } = e.payload;
      return playerId === viewer
        ? { ...b, type: "hint_step_revealed", payload }
        : redacted(e);
    }
    case "HINT_CREDIT_CHANGED": { const p=e.payload;
      return p.playerId === viewer
        ? { ...b, type: "hint_credit_changed", payload: {playerId:p.playerId,delta:p.delta,absoluteCredits:p.absoluteCredits!} }
        : redacted(e); }
    case "ANSWER_LOCK_CHANGED": return { ...b, type: "answer_lock_changed", payload: e.payload };
    case "SUDDEN_DEATH_STARTED": {
      const p=e.payload;
      const d = state.privateSolution.suddenDeath;
      return {
        ...b,
        type: "sudden_death_started",
        payload: { ...p, displayCircles: d.hitboxes },
      };
    }
    case "INPUT_CLOSED": return { ...b, type: "input_closed", payload: e.payload };
    case "PLAYER_CONNECTION_CHANGED": return { ...b, type: "connection_changed", payload: e.payload };
    case "MATCH_FINISHED": return { ...b, type: "match_finished", payload: e.payload };
    default:
      return assertNever(e);
  }
}
function assertNever(x: never): never {
  throw Error(`unprojected event ${String(x)}`);
}
export function projectSnapshot(
  s: MatchStateV1,
  viewer: string,
  now: number,
): MatchSnapshotV1 {
  const participant = s.players.find((x) => x.playerId === viewer);
  const player = participant ?? {
    ...s.players[0]!,
    playerId: viewer,
    wrongFinalAttempts: 0,
    hintCredits: 0,
    revealedHintIndexes: [],
    publicPattern: null,
    learningHints: null,
    answerUntilMs: null,
  };
  const claimed = s.objectives
    .filter((x) => x.kind === "DIFFERENCE" && x.ownerPlayerId !== null)
    .map((x) => {
      const d = s.privateSolution.differences.find(
        (y) => y.objectiveId === x.objectiveId,
      );
      if (!d) throw Error("claimed objective missing");
      return {
        objectiveId: x.objectiveId,
        ownerPlayerId: x.ownerPlayerId!,
        displayCircles: d.hitboxes,
      };
    });
  const quiz = s.meaningQuizzes.find(
    (x) => x.playerId === viewer && !x.submitted,
  );
  const meaning = s.privateSolution.finalChallenge.meaning;
  const learning = player.learningHints;
  const currentOrdinal = learning?.revealedOrdinals.at(-1);
  const currentStep = currentOrdinal === undefined
    ? undefined
    : s.privateSolution.finalChallenge.hintLadder?.find(step=>step.ordinal===currentOrdinal);
  const terminal =
    s.endReason === null
      ? null
      : { winnerPlayerId: s.winnerPlayerId, endReason: s.endReason };
  return {
    protocolVersion: 1,
    matchId: s.matchId,
    viewerPlayerId: viewer,
    engineVersion: s.engineVersion,
    rulesetVersion: s.rulesetVersion,
    rulesetHash: s.rulesetHash,
    contentRevisionId: s.contentRevisionId,
    contentHash: s.contentHash,
    serverNowMs: now,
    phase: s.phase,
    phaseEndsAtMs: s.phaseEndsAtMs,
    stateRevision: s.stateRevision,
    lastEventSeq: s.nextEventSeq - 1,
    preload: {
      assetLoadDeadlineMs: s.assetLoadDeadlineMs,
      assetPolicyVersion: s.assetPolicyVersion,
      assets: s.expectedAssets,
      players: s.players.map((x) => ({
        playerId: x.playerId,
        status: x.assetLoadStatus,
      })),
    },
    viewerInput: {
      enabled:
        participant !== undefined &&
        ["WAITING_FOR_ASSETS", "PLAYING", "FINAL_RUSH", "SETTLING"].includes(
          s.phase,
        ) && player.answerUntilMs === null,
      reason: player.answerUntilMs === null ? null : "INPUT_LOCKED",
    },
    connections: s.connections.map((x) => ({
      playerId: x.playerId,
      status: x.status,
      disconnectEpoch: x.disconnectEpoch,
      forfeitAtMs: x.forfeitAtMs,
    })),
    scores: s.players.map((x) => ({
      playerId: x.playerId,
      absoluteScore: x.score,
    })),
    claimed,
    mission:
      s.activeMission === null
        ? null
        : {
            id: s.activeMission.missionId,
            kind: s.activeMission.kind,
            publicPrompt: s.activeMission.publicPrompt,
            startedAtMs: s.activeMission.startedAtMs,
            endsAtMs: s.activeMission.endsAtMs,
          },
    locks: s.players.map((x) => ({
      playerId: x.playerId,
      answerUntilMs: x.answerUntilMs,
    })),
    finalChallenge: {
      unlocked: s.finalChallenge.unlockedAtMs !== null,
      unlockedAtMs: s.finalChallenge.unlockedAtMs,
      viewer: {
        wrongAttempts: player.wrongFinalAttempts,
        maxWrongAttempts: 3,
        hintCredits: player.hintCredits,
        revealedHintCount: player.revealedHintIndexes.length,
        publicPattern: player.publicPattern,
        learningHints: learning==null?null:{
          mode:learning.mode,
          nextExpectedOrdinal:(learning.revealedOrdinals.length+1) as 1|2|3|4|5|6,
          revealedOrdinals:[...learning.revealedOrdinals],
          revealedCount:learning.revealedOrdinals.length,
          coachChargesRemaining:learning.mode==='CASUAL'?learning.coachChargesRemaining:null,
          cumulativeRankedPenaltyUnits:learning.cumulativeRankedPenaltyUnits,
          current:currentStep===undefined?null:{
            ordinal:currentStep.ordinal,
            kind:currentStep.kind,
            localizedText:currentStep.localizedText[s.contentLanguage==='ko'?'ko':'en'],
            publicPattern:player.publicPattern,
            publicRegion:currentStep.publicRegion??null,
          },
        },
      },
    },
    meaningQuiz: quiz
      ? {
          quizOrdinal: quiz.quizOrdinal,
          prompt: meaning.prompt,
          options: meaning.options.map(({ id, label }) => ({ id, label })),
          remainingMs: Math.max(0, quiz.endsAtMs - now),
        }
      : null,
    suddenDeath: s.suddenDeath
      ? {
          objectiveId: s.suddenDeath.objectiveId,
          endsAtMs: s.suddenDeath.endsAtMs,
          displayCircles: s.privateSolution.suddenDeath.hitboxes,
        }
      : null,
    result: terminal,
  };
}
