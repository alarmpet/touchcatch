import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type Ref = { $ref: string };
type Operation = { security?: unknown; parameters?: Ref[]; requestBody?: Ref; responses: Record<string, Ref> };
type Document = { openapi: string; security: unknown; paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, { properties?: { code?: { enum?: string[] } } }> } };
const document = parse(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8")) as Document;
const expected = {
  "GET /v1/me": { request: null, statuses: ["200", "401"], response: "MeResponse", errors: ["UNAUTHORIZED"] },
  "GET /v1/pets": { request: null, statuses: ["200", "401"], response: "PetsResponse", errors: ["UNAUTHORIZED"] },
  "POST /v1/pets/{id}/select": { request: "SelectPetRequest", statuses: ["200", "400", "404", "409"], response: "SelectPetResponse", errors: ["INVALID_REQUEST", "NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/pets/{id}/lock": { request: "LockPetRequest", statuses: ["200", "400", "404", "409"], response: "LockPetResponse", errors: ["INVALID_REQUEST", "NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/gacha/draw": { request: "GachaDrawRequest", statuses: ["200", "400", "409"], response: "GachaDrawResponse", errors: ["INVALID_REQUEST", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/fusion": { request: "FusionRequest", statuses: ["200", "400", "404", "409"], response: "FusionResponse", errors: ["INVALID_REQUEST", "NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/matches/queue": { request: "QueueCreateRequest", statuses: ["202", "400", "409"], response: "QueueTicketResponse", errors: ["INVALID_REQUEST", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "GET /v1/matches/queue/{ticketId}": { request: null, statuses: ["200", "401", "404"], response: "QueueTicketResponse", errors: ["UNAUTHORIZED", "NOT_FOUND"] },
  "DELETE /v1/matches/queue/{ticketId}": { request: null, statuses: ["200", "404", "409"], response: "QueueCancelResponse", errors: ["NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/matches/friend-room": { request: "FriendRoomCreateRequest", statuses: ["201", "400", "409"], response: "FriendRoomResponse", errors: ["INVALID_REQUEST", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "POST /v1/matches/friend-room/{roomCode}/join": { request: "FriendRoomJoinRequest", statuses: ["200", "400", "404", "409"], response: "FriendRoomResponse", errors: ["INVALID_REQUEST", "NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
  "DELETE /v1/matches/friend-room/{roomCode}/members/me": { request: null, statuses: ["200", "404", "409"], response: "FriendRoomLeaveResponse", errors: ["NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT"] },
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
      for (const status of contract.statuses.slice(1)) {
        const responseName = operation.responses[status]!.$ref.split("/").at(-1)!;
        const schema = document.components.schemas[responseName]!;
        expect(schema.properties?.code?.enum).toEqual(expect.arrayContaining([...contract.errors]));
        expect(schema.properties?.code?.enum?.every((code) => contract.errors.includes(code as never))).toBe(true);
      }
    }
  });
});
