# ADR-001: Deterministic match resolution

Status: Proposed; frozen implementation baseline for RulesetV1

## Decision

`config/ruleset.v1.json` is the single source of truth for match timing, scoring, content cardinality, final-challenge unlock semantics, hints, and tie breaking. Its version is `1.0.0`. Consumers validate it with the strict schema and semantic parser before using its RFC 8785 canonical SHA-256 hash.

Time windows are half-open. Final rush begins at 60,000 ms, normal match input closes at 75,000 ms, and already-started meaning settlement is capped at 80,000 ms. Final-challenge unlock conditions are OR conditions. Scores never fall below zero. Ties follow the exact ordered chain in the ruleset and end in sudden death rather than a draw.

Content cardinalities are derived from this ruleset. A validated-config generator writes one complete, uniquely marked executable PL/pgSQL statement inside the publishing function applied by Supabase. Its checker enforces the statement byte-for-byte, pins its immediate statement boundaries, rejects missing/duplicate markers, and rejects duplicate active ruleset-owned cardinality predicates elsewhere in that publishing function. It does not claim to parse arbitrary SQL. The checker runs in both aggregate and DB verification paths; generated literals are implementation projections, not independent policy.

## Consequences

Any approved balance change requires a new ruleset version, updated boundary fixtures, and regenerated projections. Asset hashes remain raw-byte SHA-256 and are not ruleset canonical hashes.
