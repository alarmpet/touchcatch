import { describe, expect, it } from "vitest";
import {
  clientCommandEnvelopeSchema,
  commandAckSchema,
  compatibilityHandshakeSchema,
  matchSnapshotV1Schema,
  negotiateCompatibility,
  serverEventEnvelopeSchema,
} from "./socket.schema.js";
import { hashMatchCommandRequest } from "./idempotency.js";
import { parseMatchCommandV1 } from "./match.schema.js";

const requestId = "123e4567-e89b-42d3-a456-426614174000",
  matchId = "123e4567-e89b-12d3-a456-426614174000";
const base = {
  protocolVersion: 1 as const,
  requestId,
  matchId,
  expectedRevision: 0,
  clientSeq: 0,
  payload: {
    type: "TAP_IMAGE" as const,
    imageSide: "A" as const,
    x: 0.5,
    y: 0.5,
  },
};
describe("authenticated socket wire contracts", () => {
  it("uses the content answer limits at the exact wire and reducer-ingress boundaries", () => {
    const envelope = (answer: string) => ({
      ...base,
      payload: { type: "SUBMIT_FINAL_ANSWER" as const, answer },
    });
    const command = (answer: string) => ({
      source: "PLAYER" as const,
      commandId: `${matchId}:player:p1:${requestId}`,
      matchId,
      commandSeq: 1,
      receivedAtMs: 1,
      requestId,
      playerId: "p1",
      expectedRevision: 0,
      payload: { type: "SUBMIT_FINAL_ANSWER" as const, answer },
    });

    expect(clientCommandEnvelopeSchema.safeParse(envelope("a".repeat(64))).success).toBe(true);
    expect(clientCommandEnvelopeSchema.safeParse(envelope("😀".repeat(64))).success).toBe(true);
    expect(clientCommandEnvelopeSchema.safeParse(envelope("a".repeat(65))).success).toBe(false);
    expect(() => parseMatchCommandV1(command("a".repeat(64)))).not.toThrow();
    expect(() => parseMatchCommandV1(command("😀".repeat(64)))).not.toThrow();
    expect(() => parseMatchCommandV1(command("a".repeat(65)))).toThrow(/answer invalid/);
  });
  it("accepts raw answers above 64 only when normalization brings them within content limits",()=>{
    const envelope=(answer:string)=>({...base,payload:{type:"SUBMIT_FINAL_ANSWER" as const,answer}}),command=(answer:string)=>({source:"PLAYER" as const,commandId:`${matchId}:player:p1:${requestId}`,matchId,commandSeq:1,receivedAtMs:1,requestId,playerId:"p1",expectedRevision:0,payload:{type:"SUBMIT_FINAL_ANSWER" as const,answer}});
    const accepted=[`Ａ${" ".repeat(127)}`,"😀".repeat(64)],rejected=["a".repeat(65),"a".repeat(129),"😀".repeat(65)," ".repeat(128)];
    for(const answer of accepted){expect(clientCommandEnvelopeSchema.safeParse(envelope(answer)).success).toBe(true);expect(()=>parseMatchCommandV1(command(answer))).not.toThrow();}
    for(const answer of rejected){expect(clientCommandEnvelopeSchema.safeParse(envelope(answer)).success).toBe(false);expect(()=>parseMatchCommandV1(command(answer))).toThrow(/answer invalid/);}
  });
  it("strictly validates client-only commands and UUIDv4 request IDs", () => {
    expect(clientCommandEnvelopeSchema.safeParse(base).success).toBe(true);
    expect(
      clientCommandEnvelopeSchema.safeParse({ ...base, requestId: matchId })
        .success,
    ).toBe(false);
    expect(
      clientCommandEnvelopeSchema.safeParse({
        ...base,
        payload: { type: "CLOSE_INPUT" },
      }).success,
    ).toBe(false);
    expect(
      clientCommandEnvelopeSchema.safeParse({ ...base, authSubject: "secret" })
        .success,
    ).toBe(false);
    expect(
      clientCommandEnvelopeSchema.safeParse({
        ...base,
        payload: { ...base.payload, x: Infinity },
      }).success,
    ).toBe(false);
  });
  it("normalizes retry-only fields out of the request hash", () => {
    const a = {
      ...base,
      payload: { type: "SUBMIT_FINAL_ANSWER" as const, answer: "  Ｃａｔ  " },
    };
    const b = {
      ...a,
      expectedRevision: 99,
      clientSeq: 22,
      payload: { ...a.payload, answer: "cat" },
    };
    expect(hashMatchCommandRequest(a, "player-a")).toBe(
      hashMatchCommandRequest(b, "player-a"),
    );
    expect(hashMatchCommandRequest(a, "player-a")).not.toBe(
      hashMatchCommandRequest(a, "player-b"),
    );
  });
  it("fails closed on compatibility mismatch before ingress", () => {
    const hello = {
      protocolVersion: 1 as const,
      supportedEngineVersions: ["engine-1"],
      supportedRulesetVersions: ["1.0.0"],
    };
    expect(compatibilityHandshakeSchema.safeParse(hello).success).toBe(true);
    expect(
      negotiateCompatibility(hello, {
        protocolVersion: 1,
        engineVersion: "engine-2",
        rulesetVersion: "1.0.0",
        rulesetHash: "a".repeat(64),
        contentRevisionId: matchId,
        contentHash: "b".repeat(64),
      }),
    ).toEqual({ accepted: false, reason: "UPDATE_REQUIRED" });
  });
});
it("strictly validates ack and sequenced event branches", () => {
  expect(
    commandAckSchema.safeParse({
      protocolVersion: 1,
      requestId,
      accepted: true,
      stateRevision: 0,
      lastEventSeq: 0,
      snapshotRequired: false,
    }).success,
  ).toBe(true);
  expect(
    commandAckSchema.safeParse({
      protocolVersion: 1,
      requestId,
      accepted: true,
      reason: "RATE_LIMITED",
      stateRevision: 0,
      lastEventSeq: 0,
      snapshotRequired: false,
    }).success,
  ).toBe(false);
  const event = {
    protocolVersion: 1,
    eventId: "evt-1",
    matchId,
    eventSeq: 1,
    stateRevision: 1,
    occurredAtMs: 1,
    phase: "PLAYING",
    type: "state_advanced",
    payload: { redacted: true },
  };
  expect(serverEventEnvelopeSchema.safeParse(event).success).toBe(true);
  expect(
    serverEventEnvelopeSchema.safeParse({
      ...event,
      payload: { redacted: true, canonicalAnswer: "cat" },
    }).success,
  ).toBe(false);
});
it("accepts exact safe snapshots and rejects private/extra fields", () => {
  const s = {
    protocolVersion: 1,
    matchId,
    viewerPlayerId: "viewer",
    engineVersion: "engine-1",
    rulesetVersion: "1.0.0",
    rulesetHash: "a".repeat(64),
    contentRevisionId: matchId,
    contentHash: "b".repeat(64),
    serverNowMs: 10,
    phase: "PLAYING",
    phaseEndsAtMs: 20,
    stateRevision: 1,
    lastEventSeq: 1,
    preload: {
      assetLoadDeadlineMs: 20,
      assetPolicyVersion: "1.0.0",
      assets: [
        {
          side: "A",
          url: "https://cdn.example/assets/".concat("c".repeat(64), ".png"),
          sha256: "c".repeat(64),
          encodedBytes: 10,
          width: 10,
          height: 10,
          mimeType: "image/png",
        },
        {
          side: "B",
          url: "https://cdn.example/assets/".concat("d".repeat(64), ".webp"),
          sha256: "d".repeat(64),
          encodedBytes: 10,
          width: 10,
          height: 10,
          mimeType: "image/webp",
        },
      ],
      players: [
        { playerId: "viewer", status: "READY" },
        { playerId: "opponent", status: "READY" },
      ],
    },
    viewerInput: { enabled: true, reason: null },
    connections: [
      {
        playerId: "viewer",
        status: "CONNECTED",
        disconnectEpoch: 0,
        forfeitAtMs: null,
      },
      {
        playerId: "opponent",
        status: "CONNECTED",
        disconnectEpoch: 0,
        forfeitAtMs: null,
      },
    ],
    scores: [
      { playerId: "viewer", absoluteScore: 0 },
      { playerId: "opponent", absoluteScore: 0 },
    ],
    claimed: [],
    mission: null,
    locks: [
      { playerId: "viewer", answerUntilMs: null },
      { playerId: "opponent", answerUntilMs: null },
    ],
    finalChallenge: {
      unlocked: false,
      unlockedAtMs: null,
      viewer: {
        wrongAttempts: 0,
        maxWrongAttempts: 3,
        hintCredits: 0,
        revealedHintCount: 0,
        publicPattern: null,
      },
    },
    meaningQuiz: null,
    suddenDeath: null,
    result: null,
  };
  expect(matchSnapshotV1Schema.safeParse(s).success).toBe(true);
  for (const key of [
    "canonicalAnswer",
    "aliases",
    "correctOptionId",
    "authUuid",
    "rawJwt",
    "privateSolution",
  ])
    expect(
      matchSnapshotV1Schema.safeParse({ ...s, [key]: "secret" }).success,
    ).toBe(false);
});
