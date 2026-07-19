# 12. Implementation roadmap

This roadmap is gate-based. A downstream gate cannot begin its release claim until every predecessor has produced its required executable evidence.

## Active dependency chain

1. **G3A — Core Engine and AI Practice**
2. **G3B — Authenticated Realtime** (depends on G3A)
3. **G3C — Mobile UI and Platform Goldens** (depends on G3B)
4. **G4 — Rewards and Pets Runtime/UI Integration** (depends on G3C)
5. **G5 — Content Administration and External Beta** (depends on G4)
6. **G6 — Experiment and Learning Evaluation** (depends on G5)

The former Step 0–8 sequence is retired and is not a normative implementation or release order. Historical step labels must not be used as evidence that a gate is complete.

## Retired schedule estimates

- `RETIRED_UNVALIDATED_ESTIMATE`: one developer with AI coding assistance, 6–10 weeks.
- `RETIRED_UNVALIDATED_ESTIMATE`: two developers, 4–7 weeks.

These figures did not include the security, operations, platform-golden, legal, rights, provider-credential, or production-soak gates. They are retained only as migration history and are not approved schedules, commitments, baselines, or release evidence. Remaining work must be re-estimated from the active G3A → G3B → G3C → G4 → G5 → G6 dependency chain after each gate's staffing, external approvals, and risks are known.

## Requirement-ID migration note

- `RISK-01` preserves the original same-coordinate burst risk as privacy-safe, observation-only telemetry; it is not an alias for or silent remapping of an `OBS-*` requirement.
- `RISK-02` preserves the original suspicious answer-reaction-time risk as privacy-safe, observation-only telemetry; it is not an alias for or silent remapping of an `OBS-*` requirement.
- The removed Step 0–8 requirement markers and ENV schedule markers are retired source mappings. Their stable IDs must not be reused for the G3A–G6 gates.
