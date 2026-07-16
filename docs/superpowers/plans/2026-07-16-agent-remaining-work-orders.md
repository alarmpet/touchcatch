# TouchCatch Agent Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 남은 Task 1–4와 7–10을 작업별 새 구현 에이전트가 수행하고, 주 에이전트의 명세·품질·실행 검증을 통과한 커밋만 통합한다.

**Architecture:** `2026-07-15-spec-hardening-and-mvp-readiness.md`를 기능 요구의 동결 원본으로 사용하고, 이 문서는 현재 저장소 기준선에 맞춘 dispatch 순서와 제출·검증 계약을 정의한다. Task 5·6 standalone 구현은 반복하지 않고 Task 3/4 이후 cross-layer parity만 다시 연다.

**Tech Stack:** Node.js 24.18.0, pnpm 11.13.0, TypeScript, Vitest, Ajv, Supabase/PostgreSQL/pgTAP, Expo React Native, NestJS/Socket.IO, Next.js, Redis/BullMQ, Sentry/PostHog.

## Global Constraints

- Base commit은 `6e4e15c`이며 각 작업 시작 시 주 에이전트가 최신 accepted SHA로 다시 고정한다.
- 모든 production code 변경은 기대한 이유로 실패하는 RED 테스트가 먼저다.
- 기존 Task 5·6 테스트·schema·migration을 삭제, skip, 완화, 덮어쓰기 하지 않는다.
- public/private, client/server, auth participant/economy subject 경계를 합치지 않는다.
- canonical answer, alias, `correctOptionId`, 미발견 hitbox, JWT, credential, 실제 PII를 client payload·log·analytics에 넣지 않는다.
- 외부 credential·법률 승인·실기기·production 운영 증거를 로컬 fake로 완료 처리하지 않는다.
- 한 구현 에이전트는 한 Task만 맡고 자신의 `agent/<phase>-<task>-<slug>` branch에 커밋한다.
- 제출은 base/head SHA, 변경 파일, RED/GREEN 명령·결과, 알려진 blocker를 포함한다.
- 주 에이전트의 spec review와 quality review에서 Critical/Important가 0이어야 다음 Task를 연다.
- 모든 Task는 `pnpm check`, DB 변경 Task는 `pnpm check:db`를 통과한다.

---

### Task 1: A1 — 기존 기준선 위 재현 가능한 workspace gate

**Normative requirements:** `docs/superpowers/plans/2026-07-15-spec-hardening-and-mvp-readiness.md` Task 1. 단, “저장소·package 부재” RED와 `git init` 단계는 현재 기준선에서 이미 충족됐으므로 반복하지 않는다.

**Files:**
- Create: `.nvmrc`, `.npmrc`, `.secretlintrc.json`, `.secretlintignore`, `eslint.config.mjs`, `tools/check-runtime.mjs`
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/env.ts`, `packages/config/src/env.test.ts`
- Create: `apps/mobile/.env.example`, `apps/server/.env.example`, `apps/admin/.env.example`
- Create: `.github/workflows/ci.yml`, `docs/operations/repository-rules.md`
- Modify: `.gitignore`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, TypeScript/Vitest config
- Preserve: all files introduced by commits `3aae6c1` and `6e4e15c`

**Interfaces:**
- Consumes: existing Task 5·6 `check`, `check:db`, schemas, fixtures, migrations.
- Produces: exact runtime gate, lint/secret scan, env allow-list parsers, CI `check`/`database`, root `verify`.

- [ ] Write subprocess tests that reject Node other than `24.18.0`, pnpm user-agent other than `11.13.0`, unknown env keys, public secret keys, empty required values, and production loopback URLs.
- [ ] Run focused tests and record RED caused by missing runtime/env implementations.
- [ ] Implement the exact Task 1 scripts without weakening the existing `content:schemas:check`, `content:validate`, DB concurrency test, or schema tests.
- [ ] Run `corepack pnpm install --frozen-lockfile`, `pnpm check`, `pnpm check:db`, and staged secret scan.
- [ ] Commit with `chore: complete reproducible workspace gates`.

### Task 2: A2 — RulesetV1 SSOT와 기존 상수 migration

**Normative requirements:** frozen plan Task 2 plus remaining-work design A.

**Files:**
- Create/modify the exact Task 2 file list in the frozen plan.
- Modify: `packages/contracts/src/content.ts`, `packages/content-validator/src/validate-content.ts`, affected SQL constraints/functions.
- Test: Task 2 ruleset suites plus generated TS/JSON/DB parity.

**Interfaces:**
- Consumes: existing canonical JSON/hash and Task 5 content limits.
- Produces: `RulesetV1`, strict `parseRuleset`, `rulesetVersion = '1.0.0'`, canonical `rulesetHash`, generated DB/content projections.

- [ ] Add the frozen plan’s missing-file and invalid-rules fixtures, plus a drift test proving existing content/DB constants no longer diverge.
- [ ] Verify RED before creating `config/ruleset.v1.json` and parser/projection artifacts.
- [ ] Implement exact frozen values and RFC 8785 hash behavior; do not maintain a second hand-written SQL value list.
- [ ] Run focused ruleset/parity tests, `pnpm check`, `pnpm check:db`.
- [ ] Commit with `feat: freeze shared deterministic ruleset`.

### Task 3: B — 결정론 state machine과 replay engine

**Normative requirements:** frozen plan Task 3 in full.

**Files:** Use the exact Task 3 Files list. Keep reducer, scheduler, replay, schema, projection helpers in focused files.

**Interfaces:**
- Consumes: `RulesetV1`, `PrivateGameSolutionV1`, `normalizeFinalAnswer`, canonical hash.
- Produces: strict match state/command/event schemas, pure `createMatchInitialState`, `reduceMatch`, `replayMatch`, timer intents, terminal mapping projection.

- [ ] Implement each frozen-plan reducer behavior as a separate RED→GREEN slice: creation/asset gate, command ordering, scoring/windows, final package, reconnect/forfeit, tie-break/sudden death, replay determinism.
- [ ] Prove no reducer use of clock, RNG, DB, Redis, UUID generation, or network I/O.
- [ ] Run focused reducer/replay schemas and 100-run hash conformance, then `pnpm check`.
- [ ] Commit coherent slices; final Task commit must be `feat: add deterministic match engine`.

### Task 4: C — 인증·wire·idempotency·reconnect

**Normative requirements:** frozen plan Task 4 plus remaining-work design C.

**Files:** Use the exact Task 4 Files list for REST/Socket contracts, idempotency, delivery policy, projection, ADRs and docs.

**Interfaces:**
- Consumes: Task 3 state/commands/events and pinned engine/ruleset/content descriptors.
- Produces: authenticated wire envelopes, version compatibility handshake, viewer-safe snapshot/events, command receipts, `lastEventSeq` replay policy.

- [ ] Build runtime schemas and idempotency hash fixtures first; verify malformed/private-leaking branches fail.
- [ ] Require client-supported protocol/engine/ruleset and fail closed before command ingress on incompatibility.
- [ ] Use durable journal as replay authority; Redis/memory may only be a bounded cache. Gap unavailable or revision mismatch must replace with a private-safe snapshot.
- [ ] Run duplicate/conflict, two-subject, projection redaction, stale/gap/reconnect boundary suites and `pnpm check`.
- [ ] Commit with `feat: define authenticated realtime delivery contracts`.

### Task 5: D — Task 5·6 cross-layer integration closure

**Normative requirements:** remaining-work design D. Do not reimplement completed standalone validator/RLS work.

**Files:**
- Modify: generated domain/DB parity artifacts, prerequisite derivation, content/DB origin parity tests.
- Create: quarantine policy schema/template and privacy operator/job contracts only where approved policy values are not fabricated.
- Test: generated phase/end-reason/winner mapping, ruleset/content/DB parity, production-like publisher login, origin equality, quarantine synthetic nested-PII lifecycle.

**Interfaces:**
- Consumes: Tasks 2–4 shared contracts and existing Task 5·6 implementation.
- Produces: derived prerequisite evidence and explicit production-readiness blockers.

- [ ] Replace manual prerequisite booleans as evidence with import/schema/parity tests; only then update their derived status.
- [ ] Generate DB phase/end-reason/winner-nullability expectations from Task 3 projection and reject drift.
- [ ] Verify `CONTENT_ASSET_ORIGINS` exact equality with DB rows and preserve origins referenced by immutable revisions.
- [ ] Implement only policy-neutral quarantine machinery; retain legal/backup/PITR/restore approval as external blocker.
- [ ] Run `pnpm check`, `pnpm check:db`, and commit with `test: close content database integration gates`.

### Task 6: E — effect-once reward and pet economy

**Normative requirements:** frozen plan Task 7 in full.

**Interfaces:**
- Consumes: Task 3 terminal event/result, Task 4 durable delivery, immutable economy/catalog policy.
- Produces: subject-scoped receipts, append-only ledger/history, pinned pity, reward/draw/fusion/select/lock functions and outbox.

- [ ] Follow frozen Task 7 file list and transaction contracts exactly.
- [ ] Enforce receipt replay before lock/entropy; lock subject, pity, then pet IDs in deterministic order.
- [ ] Prove same-key collapse, different-hash conflict, distinct-key serialization, draw/fusion/select/lock races with real 20-session connections.
- [ ] Run focused economy loaders, pgTAP, concurrency harness, `pnpm check`, `pnpm check:db`.
- [ ] Commit with `feat: add effect-once pet economy`.

### Task 7: F1 — UI reference and native interaction shell

**Normative requirements:** frozen plan Task 8A and the approved high-fidelity UI design.

**Interfaces:**
- Consumes: Task 4 public wire projection and approved reference/token manifests.
- Produces: Expo screens/components, geometry transforms, accessibility semantics, platform-pinned golden evidence.

- [ ] Use the exact Task 8A file/hash/token contracts; never infer excluded device frame or sample copy as runtime UI.
- [ ] Implement zoom/pan/tap transforms and accessibility with component/geometry tests before UI code.
- [ ] Pin runner/emulator/font/scale/locale/GPU/seed/time; use masks and calibrated thresholds, not concept-image SSIM as sole oracle.
- [ ] Run component/accessibility/visual checks, `pnpm check`, and documented iOS/Android manual gate.
- [ ] Commit with `feat: add accessible battle ui shell`.

### Task 8: F2 — 콘텐츠 운영 게시 도구

**Normative requirements:** frozen plan Task 8B.

**Interfaces:**
- Consumes: Task 5 validator output and deployment-only publish boundary.
- Produces: Next.js admin validation/preview/publish workflow that never exposes deployment credentials to client code.

- [ ] Implement validation/preview failures before publish UI.
- [ ] Keep secret access server-only and call only the validator-attested backend publish path.
- [ ] Test invalid assets, rights blocks, stale hashes, authorization, and client bundle secret absence.
- [ ] Run admin tests/build, `pnpm check`, and commit with `feat: add validated content publishing workflow`.

### Task 9: G — 관측성·부하·밸런스·최종 traceability

**Normative requirements:** frozen plan Tasks 9 and 10 in full.

**Interfaces:**
- Consumes: all accepted A–F contracts and operational blockers.
- Produces: privacy allow-listed telemetry, load/restart/replay evidence, balance simulation, docs checker, traceability, final `pnpm verify`.

- [ ] Add strict analytics schemas and prove forbidden fields are rejected before adapters.
- [ ] Add load/soak/fault/replay tests with explicit thresholds from the frozen plan.
- [ ] Add deterministic balance simulation and versioned reports.
- [ ] Generate requirement traceability and fail on missing/duplicate IDs or normative-number drift.
- [ ] Run clean-checkout `pnpm verify`; keep external evidence as blockers rather than faking success.
- [ ] Commit with `chore: add release verification and traceability`.

## Per-task Review Protocol

For every Task, the controller records the base SHA, extracts only that Task’s brief, and dispatches one fresh implementer. On DONE, a separate reviewer receives the brief, implementer report, and full base..head diff package. Critical/Important findings return to a fixer and the same review gate repeats. The controller independently reruns the required commands before recording `Task N: complete` in `.superpowers/sdd/progress.md`.

## Final Gate

After Task 9, dispatch a whole-branch reviewer against the merge-base. Then use `superpowers:finishing-a-development-branch`. Completion requires clean review, clean checkout `pnpm verify`, no hidden external-success claims, and an explicit list of production blockers that require human or environment evidence.
