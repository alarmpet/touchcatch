import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type Ref = { $ref: string };
type Parameter = Ref | { name: string; in: string; required?: boolean; schema: Record<string, unknown> };
type Operation = { security?: unknown; parameters?: Parameter[]; requestBody?: Ref; responses: Record<string, Ref> };
type Schema = {
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, {
    enum?: string[];
    type?: unknown;
    additionalProperties?: boolean;
    required?: string[];
    properties?: Record<string, unknown>;
    items?: {
      additionalProperties?: boolean;
      required?: string[];
      properties?: Record<string, unknown>;
    };
    oneOf?: unknown[];
    "x-runtime-validation"?: { exactCountSum?: number; uniqueBy?: string };
  }> & {
    code?: { enum?: string[] };
    materials?: {
      "x-runtime-validation"?: { exactCountSum?: number; uniqueBy?: string };
    };
  };
};
type Document = { openapi: string; security: unknown; paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } };
const document = parse(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8")) as Document;
const expected = {
  // 410 is how a closed account reads while the worker is still disposing of it: the session is
  // valid, the account is not coming back.
  "GET /v1/me": { request: null, statuses: ["200", "401", "410"], response: "MeResponse", errors: ["UNAUTHORIZED", "ACCOUNT_CLOSED"] },
  "DELETE /v1/me": { request: "AccountDeletionRequest", statuses: ["202", "400", "401", "409", "410", "503"], response: "AccountDeletionAccepted", errors: ["INVALID_REQUEST", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "ACCOUNT_CLOSED", "DELETION_ALREADY_IN_PROGRESS", "IDEMPOTENCY_CONFLICT", "DELETION_REQUEST_NOT_FOUND", "RECEIPT_EXPIRED", "DELETION_UNAVAILABLE"] },
  "POST /v1/me/deletion-status": { request: "AccountDeletionRequest", statuses: ["200", "400", "404", "410", "503"], response: "AccountDeletionStatus", errors: ["INVALID_REQUEST", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "ACCOUNT_CLOSED", "DELETION_ALREADY_IN_PROGRESS", "IDEMPOTENCY_CONFLICT", "DELETION_REQUEST_NOT_FOUND", "RECEIPT_EXPIRED", "DELETION_UNAVAILABLE"] },
  "GET /v1/pets/collection": { request: null, statuses: ["200", "400", "401", "409", "503"], response: "PetCollectionResponse", errors: ["INVALID_REQUEST", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "REWARD_POLICY_NOT_APPROVED", "POLICY_MISMATCH", "DATABASE_UNAVAILABLE"] },
  "GET /v1/learning/leaderboard": { request: null, statuses: ["200", "400", "401", "409", "503"], response: "WeeklyCategoryBoardResponse", errors: ["INVALID_QUERY", "UNAUTHORIZED", "RANKING_POLICY_NOT_APPROVED", "LEADERBOARD_UNAVAILABLE"] },
  "POST /v1/pets/daily-draw": { request: null, statuses: ["200", "400", "401", "409", "503"], response: "DailyFreeDrawResponse", errors: ["INVALID_REQUEST", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "REWARD_POLICY_NOT_APPROVED", "POLICY_MISMATCH", "DATABASE_UNAVAILABLE"] },
  "POST /v1/pets/duplicate-promotion": { request: "DuplicatePromotionRequest", statuses: ["200", "400", "401", "404", "409", "503"], response: "DuplicatePromotionResponse", errors: ["INVALID_REQUEST", "INVALID_MATERIALS", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "NOT_OWNED", "IDEMPOTENCY_CONFLICT", "REWARD_POLICY_NOT_APPROVED", "POLICY_MISMATCH", "INSUFFICIENT_DUPLICATES", "COSMETIC_REWARD_POLICY_REQUIRED", "DATABASE_UNAVAILABLE"] },
  "GET /v1/learning/challenges": { request: null, statuses: ["200", "400", "401", "404", "409", "503"], response: "WeeklyChallengesResponse", errors: ["INVALID_REQUEST", "INVALID_ATTEMPT_START", "INVALID_VERIFIED_METRICS", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "ATTEMPT_NOT_FOUND", "OBJECTIVE_NOT_FOUND", "SEASON_NOT_FOUND", "CHALLENGE_PIN_MISMATCH", "IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "ATTEMPT_TERMINAL", "SEASON_NOT_OPEN", "SELECTED_PET_REQUIRED", "ASSETS_NOT_READY", "RANKING_POLICY_NOT_APPROVED", "HINT_POLICY_NOT_APPROVED", "RULESET_NOT_APPROVED", "DATABASE_UNAVAILABLE"] },
  "POST /v1/learning/attempts": { request: "AttemptStartRequest", statuses: ["200", "400", "401", "404", "409", "503"], response: "AttemptStartResponse", errors: ["INVALID_REQUEST", "INVALID_ATTEMPT_START", "INVALID_VERIFIED_METRICS", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "ATTEMPT_NOT_FOUND", "OBJECTIVE_NOT_FOUND", "SEASON_NOT_FOUND", "CHALLENGE_PIN_MISMATCH", "IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "ATTEMPT_TERMINAL", "SEASON_NOT_OPEN", "SELECTED_PET_REQUIRED", "ASSETS_NOT_READY", "RANKING_POLICY_NOT_APPROVED", "HINT_POLICY_NOT_APPROVED", "RULESET_NOT_APPROVED", "DATABASE_UNAVAILABLE"] },
  "POST /v1/learning/attempts/{id}/assets-ready": { request: "AttemptAssetsReadyRequest", statuses: ["200", "400", "401", "404", "409", "503"], response: "AttemptAssetsReadyResponse", errors: ["INVALID_REQUEST", "INVALID_ATTEMPT_START", "INVALID_VERIFIED_METRICS", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "ATTEMPT_NOT_FOUND", "OBJECTIVE_NOT_FOUND", "SEASON_NOT_FOUND", "CHALLENGE_PIN_MISMATCH", "IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "ATTEMPT_TERMINAL", "SEASON_NOT_OPEN", "SELECTED_PET_REQUIRED", "ASSETS_NOT_READY", "RANKING_POLICY_NOT_APPROVED", "HINT_POLICY_NOT_APPROVED", "RULESET_NOT_APPROVED", "DATABASE_UNAVAILABLE"] },
  "POST /v1/learning/attempts/{id}/tap": { request: "AttemptTapRequest", statuses: ["200", "400", "401", "404", "409", "503"], response: "AttemptTapResponse", errors: ["INVALID_REQUEST", "INVALID_ATTEMPT_START", "INVALID_VERIFIED_METRICS", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "ATTEMPT_NOT_FOUND", "OBJECTIVE_NOT_FOUND", "SEASON_NOT_FOUND", "CHALLENGE_PIN_MISMATCH", "IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "ATTEMPT_TERMINAL", "SEASON_NOT_OPEN", "SELECTED_PET_REQUIRED", "ASSETS_NOT_READY", "RANKING_POLICY_NOT_APPROVED", "HINT_POLICY_NOT_APPROVED", "RULESET_NOT_APPROVED", "DATABASE_UNAVAILABLE"] },
  "POST /v1/learning/attempts/{id}/complete": { request: "AttemptCompleteRequest", statuses: ["200", "400", "401", "404", "409", "503"], response: "AttemptCompleteResponse", errors: ["INVALID_REQUEST", "INVALID_ATTEMPT_START", "INVALID_VERIFIED_METRICS", "UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED", "ATTEMPT_NOT_FOUND", "OBJECTIVE_NOT_FOUND", "SEASON_NOT_FOUND", "CHALLENGE_PIN_MISMATCH", "IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "ATTEMPT_TERMINAL", "SEASON_NOT_OPEN", "SELECTED_PET_REQUIRED", "ASSETS_NOT_READY", "RANKING_POLICY_NOT_APPROVED", "HINT_POLICY_NOT_APPROVED", "RULESET_NOT_APPROVED", "DATABASE_UNAVAILABLE"] },
} as const;

const economyStatusErrors = {
  "POST /v1/pets/daily-draw": { "400": ["INVALID_REQUEST"], "401": ["UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED"], "409": ["REWARD_POLICY_NOT_APPROVED", "POLICY_MISMATCH"], "503": ["DATABASE_UNAVAILABLE"] },
  "POST /v1/pets/duplicate-promotion": { "400": ["INVALID_REQUEST", "INVALID_MATERIALS"], "401": ["UNAUTHORIZED", "AUTH_SUBJECT_REQUIRED"], "404": ["NOT_OWNED"], "409": ["IDEMPOTENCY_CONFLICT", "REWARD_POLICY_NOT_APPROVED", "POLICY_MISMATCH", "INSUFFICIENT_DUPLICATES", "COSMETIC_REWARD_POLICY_REQUIRED"], "503": ["DATABASE_UNAVAILABLE"] },
} as const;

describe("OpenAPI semantic contract", () => {
  it("pins the exact path and method set", () => {
    const actual = Object.entries(document.paths).flatMap(([path, item]) => Object.keys(item).filter((m) => ["get", "post", "delete"].includes(m)).map((m) => `${m.toUpperCase()} ${path}`));
    expect(actual.sort()).toEqual(Object.keys(expected).sort());
  });
  it("enforces auth, GET header policy, and mutation idempotency", () => {
    expect(document.security).toEqual([{ bearerAuth: [] }]);
    for (const key of Object.keys(expected)) {
      const [method, path] = key.split(" ") as [string, string];
      const operation = document.paths[path]![method.toLowerCase()]!;
      const refs = (operation.parameters ?? []).flatMap((p) => "$ref" in p ? [p.$ref] : []);
      if (method === "GET") expect(refs).not.toContain("#/components/parameters/IdempotencyKey");
      else expect(refs).toContain("#/components/parameters/IdempotencyKey");
    }
  });

  it("pins the leaderboard query and strict public response shape", () => {
    const operation = document.paths["/v1/learning/leaderboard"]!.get!;
    const parameters = (operation.parameters ?? []).filter((parameter): parameter is Exclude<Parameter, Ref> => !("$ref" in parameter));
    expect(parameters).toEqual([
      { name: "seasonId", in: "query", required: true, schema: { type: "string", format: "uuid" } },
      { name: "category", in: "query", required: true, schema: { type: "string", enum: ["ENGLISH", "PROVERB"] } },
      { name: "limit", in: "query", required: true, schema: { type: "integer", minimum: 1, maximum: 10 } },
    ]);

    const response = document.components.schemas.WeeklyCategoryBoardResponse!;
    expect(response.additionalProperties).toBe(false);
    expect(response.required).toEqual(["seasonId", "category", "snapshotRevision", "rows", "myRank"]);
    expect(Object.keys(response.properties ?? {}).sort()).toEqual(["category", "myRank", "rows", "seasonId", "snapshotRevision"]);
    expect(response.properties?.rows?.items?.additionalProperties).toBe(false);
    expect(response.properties?.rows?.items?.required).toEqual(["rank", "nickname", "displayScore"]);
    expect(Object.keys(response.properties?.rows?.items?.properties ?? {}).sort()).toEqual(["displayScore", "nickname", "rank"]);
  });
  it("pins route-specific request, response, status, and error schemas", () => {
    for (const [key, contract] of Object.entries(expected)) {
      const [method, path] = key.split(" ") as [string, string];
      const operation = document.paths[path]![method.toLowerCase()]!;
      expect(Object.keys(operation.responses).sort()).toEqual([...contract.statuses].sort());
      if (contract.request) expect(operation.requestBody?.$ref).toBe(`#/components/requestBodies/${contract.request}`);
      else expect(operation.requestBody).toBeUndefined();
      const success = operation.responses[contract.statuses[0]]!.$ref;
      expect(success).toBe(`#/components/responses/${contract.response}`);
      const actualErrors = contract.statuses.slice(1).flatMap((status) => {
        const responseName = operation.responses[status]!.$ref.split("/").at(-1)!;
        const schema = document.components.schemas[responseName]!;
        expect(schema.properties?.code?.enum?.every((code) => contract.errors.includes(code as never))).toBe(true);
        return schema.properties?.code?.enum ?? [];
      });
      expect(new Set(actualErrors)).toEqual(new Set(contract.errors));
    }
  });

  it("maps each economy error status to a distinct schema with exact codes", () => {
    for (const [key, statuses] of Object.entries(economyStatusErrors)) {
      const [method, path] = key.split(" ") as [string, string];
      const responses = document.paths[path]![method.toLowerCase()]!.responses;
      const refs = Object.entries(statuses).map(([status, codes]) => {
        const ref = responses[status]!.$ref;
        const schemaName = ref.split("/").at(-1)!;
        expect(document.components.schemas[schemaName]?.properties?.code?.enum).toEqual(codes);
        return ref;
      });
      expect(new Set(refs).size).toBe(refs.length);
    }
  });

  it("declares fusion runtime validation for an exact total of five and unique user-pet IDs", () => {
    const runtime = document.components.schemas.FusionRequest?.properties?.materials?.["x-runtime-validation"];
    expect(runtime).toEqual({ exactCountSum: 5, uniqueBy: "userPetId" });

    const accepts = (materials: Array<{ userPetId: string; count: number }>) =>
      materials.reduce((total, material) => total + material.count, 0) === runtime!.exactCountSum
      && new Set(materials.map((material) => material[runtime!.uniqueBy as "userPetId"])).size === materials.length;

    expect(accepts([{ userPetId: "a", count: 2 }, { userPetId: "b", count: 3 }])).toBe(true);
    expect(accepts([{ userPetId: "a", count: 2 }, { userPetId: "b", count: 2 }])).toBe(false);
    expect(accepts([{ userPetId: "a", count: 2 }, { userPetId: "a", count: 3 }])).toBe(false);
  });

  it("keeps unimplemented PvP and gacha routes out of the public contract", () => {
    expect(document.paths["/v1/gacha/draw"]).toBeUndefined();
    expect(document.paths["/v1/matches/queue"]).toBeUndefined();
    expect(document.paths["/v1/pet-showcases/{nickname}"]).toBeUndefined();
  });

  it("makes only the allowlisted showcase route public and forbids private showcase properties", () => {
    const planned = parse(readFileSync(new URL("../openapi.planned.yaml", import.meta.url), "utf8")) as Document;
    expect(planned.paths["/v1/pet-showcases/{nickname}"]!.get!.security).toEqual([]);
    for (const [path, item] of Object.entries(planned.paths)) {
      if (path === "/v1/pet-showcases/{nickname}") continue;
      for (const operation of Object.values(item)) expect(operation.security).toBeUndefined();
    }
    const showcase = planned.components.schemas.PetShowcaseResponse as Schema & { properties?: Record<string, unknown> };
    expect(showcase.additionalProperties).toBe(false);
    expect(Object.keys(showcase.properties ?? {}).sort()).toEqual([
      "approvedCosmetics",
      "championStarCount",
      "collectionPercentage",
      "favoritePets",
      "historicalNumberOneCount",
      "nickname",
      "selectedPet",
    ]);
    for (const privateKey of ["authId", "userId", "email", "subjectKey", "acquisitionHistory", "biography", "location"]) {
      expect(showcase.properties).not.toHaveProperty(privateKey);
    }
  });

  it("promotes by same catalog pet ID with an exact integer ten", () => {
    const request = document.components.schemas.DuplicatePromotionRequest as {
      properties?: { materials?: { items?: { properties?: Record<string, unknown>; required?: string[] } } };
    };
    expect(request.properties?.materials?.items?.required).toEqual(["petId", "count"]);
    expect(request.properties?.materials?.items?.properties).toHaveProperty("petId");
    expect(request.properties?.materials?.items?.properties).not.toHaveProperty("userPetId");
    expect(request.properties?.materials?.items?.properties?.count).toEqual({ type: "integer", const: 10 });
  });
});
