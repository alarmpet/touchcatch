import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(
  new URL("../openapi.yaml", import.meta.url),
  "utf8",
);
describe("OpenAPI contract", () => {
  it("pins the exact operation set and security/idempotency policy", () => {
    const operations = [
      ...source.matchAll(/^\s{4}(get|post|delete):\s*$/gm),
    ].map((x) => x[1]);
    expect(operations).toHaveLength(12);
    expect(source.match(/^\s{6}operationId:/gm)).toHaveLength(12);
    expect(
      new Set(
        [...source.matchAll(/^\s{6}operationId:\s*(\S+)/gm)].map((x) => x[1]),
      ).size,
    ).toBe(12);
    expect(source).toContain(
      "pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'",
    );
    expect(source).toContain("maximum: 100");
    expect(source).toContain("additionalProperties: false");
  });
});
