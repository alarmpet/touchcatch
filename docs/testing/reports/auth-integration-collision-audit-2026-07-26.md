# Auth integration collision audit — 2026-07-26

## Scope and result

This audit was recomputed against the live dirty `main` worktree and
`codex/supabase-auth-integration`.  No file in the `main` worktree was
written, staged, reset, stashed, checked out, or otherwise changed.

The exact path-level intersection is:

- `apps/mobile/package.json`
- `package.json`

This includes tracked and untracked dirty-main paths (`git status --porcelain=v1
--untracked-files=all`) compared with committed branch paths
(`git diff --name-only main...codex/supabase-auth-integration`).  There are no
other intersecting paths.

Audit refs:

- `main`: `44fbfd947d97bb03061246e7d318c3aca6bcca77`
- auth branch: `32f092f711a3815d1cacb0c5d74da4c7804eb608`
- merge base: `a4ab20c23c574e3bddc94a57534c4e25e07a7178`

## Collision evidence and ownership boundary

| Path | Dirty-main patch identity | Main / working / auth-branch blob | Dirty-main intent | Auth-branch intent |
| --- | --- | --- | --- | --- |
| `apps/mobile/package.json` | SHA-256 `dbba9adab21bd5629cfb53c6e368260274ebdbfd7bee8fe87fe1f979417bb23d` (1,331 bytes) | `736012a61fba43ca323d87bc098270fcebbadb3b` / `fd43fe530d5cc0257b4f587c71024c5532777042` / `145cf1c8ad45cc53907c7be11534569a8cffedac` | Pins the `react-native-web` version range. | Adds auth-related mobile dependencies. |
| `package.json` | SHA-256 `e7850f1582cc536f631bc725d5522a3f2581ffb00acd9aa01f99cf48c229275d` (2,387 bytes) | `e51de2374aaf46041eb42d36cf33d4e3a17ad8c9` / `a2293b8b8a27e2b0e970a6fcfedeb63980ea6218` / `539146bca29c9a8f56db94a12e8175946d3140d9` | Adds content-catalog commands and makes the catalog gate part of `check`. | Replaces direct `corepack pnpm` calls in `check` with the portable `node tools/run-pnpm.mjs` runner. |

The SHA-256 values are calculated from `git diff --binary -- <path>` at audit
time.  Before any later manual union, compare both the listed base/working blob
pair and the patch SHA-256; a mismatch means this audit is stale and must be
recomputed.  This report intentionally records patch identity and intent rather
than copying user file contents.

## Required clean-integration semantic union

The clean integration target must retain both the portable runner and the
content catalog gate.  Add the following acceptance test only at Task 7's clean
integration target; do not add it to this auth branch as an intentionally red
test.

```ts
it("keeps both the portable runner and the content catalog gate in check", () => {
  const check = readJson("package.json").scripts.check;
  expect(check).toContain("node tools/run-pnpm.mjs");
  expect(check).not.toContain("corepack pnpm");
  expect(check).toContain("content:catalog:check");
});
```

The final union must also preserve the three dirty-main content commands; the
auth branch does not contain their catalog gate.  This is an acceptance contract,
not authorization to resolve either collision now.

## Formatting ruling

`apps/mobile/package.json` is not a formatting-only change: removing the
`react-native-web` caret changes dependency version-selection semantics.  It
must not be split into a formatting commit on this auth branch.  No formatting
action was taken, and no authority exists here to format or otherwise change the
dirty `main` file.

## Required user decision

No integration resolution has been selected.  Choose exactly one handling path
for the two dirty-main files:

1. Commit the files on `main` first.
2. Preserve the dirty state and record the exact patch/hash above; manually
   perform the semantic union in a clean integration target later.
3. Discard the branch and restart integration later.

Until the user selects one, do not merge, stash, reset, check out, stage, format,
or write the dirty `main` files.
