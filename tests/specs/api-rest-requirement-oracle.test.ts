import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateOpenApiRequirement, openApiArtifactPath } from "../../tools/requirement-oracle.js";

const restIds = ["API-001", "API-002", "API-003", "API-004", "API-006", "API-007", "API-008", "API-009"] as const;
const publicSource = readFileSync("packages/contracts/openapi.yaml", "utf8");
const plannedSource = readFileSync("packages/contracts/openapi.planned.yaml", "utf8");
const sourceFor = (id: string) => (openApiArtifactPath(id).endsWith("planned.yaml") ? plannedSource : publicSource);

describe("REST requirement oracle", () => {
  it.each(restIds)("%s derives exact route evidence from OpenAPI", (id) => {
    expect(evaluateOpenApiRequirement(id, sourceFor(id))).toBe(true);
  });

  it("rejects a missing bearer security boundary", () => {
    const mutated = publicSource.replace("security: [{ bearerAuth: [] }]", "security: []");
    expect(() => evaluateOpenApiRequirement("API-001", mutated)).toThrow(/bearer/i);
  });

  it("rejects GET idempotency and mutation idempotency drift", () => {
    const getMutated = publicSource.replace("summary: Get the authenticated profile", "summary: Get the authenticated profile\n      parameters: [{ $ref: \"#/components/parameters/IdempotencyKey\" }]");
    expect(() => evaluateOpenApiRequirement("API-001", getMutated)).toThrow(/idempotency/i);

    const postMutated = plannedSource.replace(
      'summary: Draw a pet\n      parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }]',
      'summary: Draw a pet\n      parameters: []',
    );
    expect(() => evaluateOpenApiRequirement("API-006", postMutated)).toThrow(/idempotency/i);
  });

  it("rejects route, request, response, status, and error-code mutations", () => {
    expect(() => evaluateOpenApiRequirement("API-002", plannedSource.replace("/v1/pets:", "/v1/pets-renamed:"))).toThrow(/operation/i);
    expect(() => evaluateOpenApiRequirement("API-003", plannedSource.replace("#/components/requestBodies/LockPetRequest", "#/components/requestBodies/FusionRequest"))).toThrow(/request/i);
    expect(() => evaluateOpenApiRequirement("API-004", plannedSource.replace("#/components/responses/SelectPetResponse", "#/components/responses/LockPetResponse"))).toThrow(/response/i);
    expect(() => evaluateOpenApiRequirement("API-007", plannedSource.replace("INVALID_MATERIALS", "INVALID_MATERIAL"))).toThrow(/error/i);
    expect(() => evaluateOpenApiRequirement("API-008", plannedSource.replace('responses: { "202": { $ref: "#/components/responses/QueueTicketResponse" }', 'responses: { "201": { $ref: "#/components/responses/QueueTicketResponse" }'))).toThrow(/status/i);
    expect(() => evaluateOpenApiRequirement("API-009", plannedSource.replace("#/components/requestBodies/FriendRoomCreateRequest", "#/components/requestBodies/FriendRoomJoinRequest"))).toThrow(/request/i);
  });
});
