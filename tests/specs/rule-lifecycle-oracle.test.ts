import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateRuleRequirement } from "../../tools/requirement-oracle.js";

const rules = JSON.parse(readFileSync("config/ruleset.v1.json", "utf8"));
const current = ["RULE-006", "RULE-007", "RULE-008", "RULE-009", "RULE-010", "RULE-011", "RULE-013", "RULE-022", "RULE-035", "RULE-050"] as const;

describe("current rule lifecycle predicates", () => {
  it.each(current)("%s has executable ruleset and reducer evidence", (id) => {
    expect(evaluateRuleRequirement(id, rules)).toBe(true);
  });

  it("rejects schedule, unlock, and final-rush mutations by owning ID", () => {
    expect(() => evaluateRuleRequirement("RULE-007", { ...rules, finalChallenge: { ...rules.finalChallenge, unlock: { ...rules.finalChallenge.unlock, atMs: 13000 } } })).toThrow();
    expect(() => evaluateRuleRequirement("RULE-008", { ...rules, wordHuntSchedule: [{ ...rules.wordHuntSchedule[0], spawnWindowMs: [17000, 22000] }, ...rules.wordHuntSchedule.slice(1)] })).toThrow();
    expect(() => evaluateRuleRequirement("RULE-009", { ...rules, wordHuntSchedule: [rules.wordHuntSchedule[0], { ...rules.wordHuntSchedule[1], spawnWindowMs: [35000, 42000] }, rules.wordHuntSchedule[2]] })).toThrow();
    expect(() => evaluateRuleRequirement("RULE-010", { ...rules, finalChallenge: { ...rules.finalChallenge, unlock: { atMs: 12000, onDifferenceClaim: false, onWordHuntClaim: true } } })).toThrow();
    expect(() => evaluateRuleRequirement("RULE-011", { ...rules, time: { ...rules.time, finalRushStartsAtMs: 59000 } })).toThrow();
  });
});
