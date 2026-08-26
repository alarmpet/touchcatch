# Frozen registry policy

`apps/mobile/src/learning-demo/registry.ts` is the generated working registry
for the current `content/learning/manifest.v1.json`. Historical 79-entry
snapshots are evidence artifacts, not a second source of truth, and must carry
an explicit snapshot ID/date when retained.

The drift gate compares the working registry only with the working manifest.
It does not compare a historical snapshot with the current working manifest.
Regenerating the working registry is explicit via `pnpm content:generate-registry`;
CI never mutates generated files.
