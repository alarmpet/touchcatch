import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type Ref = { $ref: string };
type Operation = { security?: unknown; parameters?: Ref[]; requestBody?: Ref; responses: Record<string, Ref> };
type Schema = {
  additionalProperties?: boolean;
  properties?: {
    code?: { enum?: string[] };
    materials?: {
      "x-runtime-validation"?: { exactCountSum?: number; uniqueBy?: string };
    };
  };
};
type Document = { openapi: string; security: unknown; paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } };
const document = parse(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8")) as Document;
const expected = {
  "GET /v1/me": { request: null, statuses: ["200", "401"], response: "MeResponse", errors: ["UNAUTHORIZED"] },
  "GET /v1/pets": { request: null, statuses: ["200", "401"], response: "PetsResponse", errors: ["UNAUTHORIZED"] },
  "GET /v1/pets/collection": { request: null, statuses: ["200", "401"], response: "PetCollectionResponse", errors: ["UNAUTHORIZED"] },
  "POST /v1/pets/daily-draw": { request: null, statuses: ["200", "409"], response: "DailyFreeDrawResponse", errors: ["POLICY_MISMATCH"] },
  "POST /v1/pets/duplicate-promotion": { request: "DuplicatePromotionRequest", statuses: ["200", "400", "404", "409"], response: "DuplicatePromotionResponse", errors: ["INVALID_MATERIALS", "NOT_OWNED", "IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "INSUFFICIENT_DUPLICATES", "COSMETIC_REWARD_POLICY_REQUIRED"] },
  "POST /v1/pets/{id}/select": { request: null, statuses: ["200", "404", "409"], response: "SelectPetResponse", errors: ["NOT_OWNED", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/pets/{id}/lock": { request: "LockPetRequest", statuses: ["200", "404", "409"], response: "LockPetResponse", errors: ["NOT_OWNED", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/gacha/draw": { request: null, statuses: ["200", "409"], response: "GachaDrawResponse", errors: ["IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "INSUFFICIENT_FUNDS"] },
  "POST /v1/fusion": { request: "FusionRequest", statuses: ["200", "400", "404", "409"], response: "FusionResponse", errors: ["INVALID_MATERIALS", "NOT_OWNED", "IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH"] },
  "POST /v1/matches/queue": { request: "QueueCreateRequest", statuses: ["202", "400", "409"], response: "QueueTicketResponse", errors: ["INVALID_REQUEST", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "GET /v1/matches/queue/{ticketId}": { request: null, statuses: ["200", "401", "404"], response: "QueueTicketResponse", errors: ["UNAUTHORIZED", "NOT_FOUND"] },
  "DELETE /v1/matches/queue/{ticketId}": { request: null, statuses: ["200", "404", "409"], response: "QueueCancelResponse", errors: ["NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/matches/friend-room": { request: "FriendRoomCreateRequest", statuses: ["201", "400", "409"], response: "FriendRoomResponse", errors: ["INVALID_REQUEST", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/matches/friend-room/{roomCode}/join": { request: "FriendRoomJoinRequest", statuses: ["200", "400", "404", "409"], response: "FriendRoomResponse", errors: ["INVALID_REQUEST", "NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "DELETE /v1/matches/friend-room/{roomCode}/members/me": { request: null, statuses: ["200", "404", "409"], response: "FriendRoomLeaveResponse", errors: ["NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "GET /v1/pet-showcases/{nickname}": { request: null, statuses: ["200", "404"], response: "PetShowcaseResponse", errors: ["NOT_FOUND"] },
} as const;

const economyStatusErrors = {
  "POST /v1/pets/{id}/select": { "404": ["NOT_OWNED"], "409": ["IDEMPOTENCY_CONFLICT"] },
  "POST /v1/pets/{id}/lock": { "404": ["NOT_OWNED"], "409": ["IDEMPOTENCY_CONFLICT"] },
  "POST /v1/gacha/draw": { "409": ["IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "INSUFFICIENT_FUNDS"] },
  "POST /v1/fusion": { "400": ["INVALID_MATERIALS"], "404": ["NOT_OWNED"], "409": ["IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH"] },
  "POST /v1/pets/daily-draw": { "409": ["POLICY_MISMATCH"] },
  "POST /v1/pets/duplicate-promotion": { "400": ["INVALID_MATERIALS"], "404": ["NOT_OWNED"], "409": ["IDEMPOTENCY_CONFLICT", "POLICY_MISMATCH", "INSUFFICIENT_DUPLICATES", "COSMETIC_REWARD_POLICY_REQUIRED"] },
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
      const refs = (operation.parameters ?? []).map((p) => p.$ref);
      if (method === "GET") expect(refs).not.toContain("#/components/parameters/IdempotencyKey");
      else expect(refs).toContain("#/components/parameters/IdempotencyKey");
    }
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

  it("makes only the allowlisted showcase route public and forbids private showcase properties", () => {
    expect(document.paths["/v1/pet-showcases/{nickname}"]!.get!.security).toEqual([]);
    for (const [path, item] of Object.entries(document.paths)) {
      if (path === "/v1/pet-showcases/{nickname}") continue;
      for (const operation of Object.values(item)) expect(operation.security).toBeUndefined();
    }
    const showcase = document.components.schemas.PetShowcaseResponse as Schema & { properties?: Record<string, unknown> };
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
});
