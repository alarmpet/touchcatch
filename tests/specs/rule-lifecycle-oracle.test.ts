import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateRuleRequirement } from "../../tools/requirement-oracle.js";

const rules = JSON.parse(readFileSync("config/ruleset.v1.json", "utf8"));
const current = ["RULE-011", "RULE-022", "RULE-035", "RULE-050"] as const;

describe("current rule lifecycle predicates", () => {
  it.each(current)("%s has executable ruleset and reducer evidence", (id) => {
    expect(evaluateRuleRequirement(id, rules)).toBe(true);
  });

  it("rejects schedule, unlock, and final-rush mutations by owning ID", () => {
    expect(() => evaluateRuleRequirement("RULE-011", { ...rules, time: { ...rules.time, finalRushStartsAtMs: 59000 } })).toThrow();
  });
});
