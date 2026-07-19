# Requirements traceability

`docs/requirements-registry.v1.json` is the only generated traceability projection. Each exact normative statement in README and 01–13 carries one invisible `REQ` marker and maps to its source line/section/fingerprint, executable schema or type, implementation phase, real automated test, and operational metric. `tools/check-docs.mjs` rejects omissions, duplicates, reordered/source-drifted mappings, empty semantics, broken executable paths, stale generated projections, and stale simulation reports.
