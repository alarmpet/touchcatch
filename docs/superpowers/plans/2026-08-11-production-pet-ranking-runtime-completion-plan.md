# Production Pet and Ranking Runtime Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing pet reward and weekly-ranking domain logic to an authenticated, framework-independent HTTP runtime and PostgreSQL authority, then verify enabled flows on Android only after immutable policy, content, and art approvals exist.

**Architecture:** A small Fetch-compatible router in `apps/server` verifies Supabase asymmetric JWTs through JWKS, resolves the authenticated user to an opaque economy subject, and invokes PostgreSQL functions through restricted `economy_server` credentials. Pet and ranking handlers return strict public DTOs only; mobile uses one bearer-aware transport and never submits a subject ID, score, rank, reward type, or policy hash. All endpoints remain fail-closed while any required artifact is `DRAFT`, `PENDING`, missing, or hash-inconsistent.

**Tech Stack:** Node.js 24.18.0, pnpm 11.13.0, TypeScript 5.9, Fetch `Request`/`Response`, `jose` remote JWKS verification, `pg`, Supabase Auth/PostgreSQL, Expo 57, React Native 0.86, Vitest 4, pgTAP, ADB/Android emulator.

## Global Constraints

- Preserve the dirty worktree. Stage and commit only files explicitly listed by the active task.
- Keep active SDK, emulator, build, export, database-test evidence, and screenshots on `D:`. Before starting local Supabase, require `docker info --format '{{.DockerRootDir}}'` to resolve to a D-drive path; otherwise use an approved remote test database or stop the DB phase.
- Do not add `@expo/ui`; the application does not import it.
- Do not expose `DATABASE_URL`, Supabase secret keys, refresh tokens, auth UUIDs, subject keys, emails, private solutions, coordinates, hitboxes, or raw attempt events to mobile responses, logs, analytics, or screenshots.
- Verify JWT signature, issuer `${SUPABASE_URL}/auth/v1`, audience `authenticated`, expiry, `sub`, role, and anonymous status. Permit at most 30 seconds of clock tolerance. Do not verify application JWTs with `SUPABASE_SECRET_KEY` or a legacy shared JWT secret.
- Mobile sends only `Authorization: Bearer <access-token>` and UUIDv4 `Idempotency-Key` values. Refresh tokens never leave the Supabase client/session module.
- `DRAFT` or incomplete approval metadata means zero reward writes and no public ranking rows. Tests may use explicit test-only approved fixtures but production loaders must reject `test-*` approvers and test decision IDs.
- Ranked categories remain exactly `ENGLISH` and `PROVERB`; `IDIOM` and `GENERAL_KNOWLEDGE` stay disabled.
- Ranking authority is `BEST_COMPLETED_VERIFIED`. Pet rarity, level, and coach archetype cannot alter ranked score, hints, or eligibility.
- Current learning inventory is 79 manifest/registry entries and all remain `publishBlocked: true`. A local content validation pass is not publication, rights, or education approval.
- Current `config/economy.v1.json`, `config/pet-catalog.v1.json`, `config/daily-pet-loop.v1.json`, and `config/weekly-competition.v1.json` are candidates, not approved runtime authority.
- Current `content/pets/source-manifest.v1.json` rights and visual reviews are `PENDING`; no pet art URL may be invented to satisfy an API test.
- Local deterministic evidence may reach `LOCAL_CONTRACT_READY`, `LOCAL_DB_READY`, or `LOCAL_ANDROID_AUTHENTICATED`. It must not be relabeled `PRODUCTION_READY` without signed builds, production-like DB restore evidence, physical-device goldens, provider evidence, and human approvals from `docs/release-evidence-blockers.md`.

## Current Gap Map

| Gap | Verified repository state | Closure in this plan |
|---|---|---|
| Pet HTTP runtime | OpenAPI and pure logic exist; no executable handler/router exists | Tasks 1, 3, 5, and 6 |
| Authenticated subject | Pure logic accepts `authenticatedUserId`; no JWKS verifier or account bootstrap exists | Tasks 3 and 4 |
| Pet DB restoration | Daily/promotion transactions exist; no restricted collection read adapter is wired | Tasks 4 and 5 |
| Ranking transport | Mobile client exists; server references RPC names absent from SQL | Tasks 2, 4, and 5 |
| Weekly category aggregate | DB exposes per-challenge public rows only | Task 4 |
| Mobile live session | Pet/ranking routes are fail-closed static states; no auth/API transport is wired | Task 7 |
| Policy activation | Economy, catalog, daily loop, and weekly competition remain unapproved | Task 8 |
| Pet art | Candidate rights/reviews are pending and runtime art mapping is absent | Task 8 |
| Enabled Android proof | Only DRAFT/disabled states have device evidence | Task 9 |

---

### Task 1: Make Daily Pet and Runtime Policy Loading Approval-Aware

**Files:**
- Modify: `packages/contracts/src/daily-pet-loop.ts`
- Modify: `packages/contracts/src/daily-pet-loop.test.ts`
- Modify: `schemas/daily-pet-loop.schema.json`
- Create: `apps/server/src/policy/mobile-runtime-policy.ts`
- Test: `apps/server/src/policy/mobile-runtime-policy.test.ts`
- Modify: `apps/server/tsconfig.json`

**Interfaces:**
- Consumes: `parseEconomy`, `loadProductionEconomy`, `parseWeeklyCompetitionV1`, and current JSON policy artifacts.
- Produces:

```ts
export type ApprovedDailyPetLoopPolicyV1 = Extract<DailyPetLoopPolicyV1, { status: 'APPROVED' }>;

export type MobileRuntimePolicyState =
  | Readonly<{ enabled: false; code: 'REWARD_POLICY_NOT_APPROVED' | 'RANKING_POLICY_NOT_APPROVED' | 'PET_ART_NOT_APPROVED' }>
  | Readonly<{
      enabled: true;
      economyVersion: string;
      economyHash: string;
      catalogRevision: string;
      catalogHash: string;
      competitionPolicyHash: string;
    }>;

export function loadMobileRuntimePolicy(input: Readonly<{
  economy: unknown;
  catalog: unknown;
  dailyPetLoop: unknown;
  weeklyCompetition: unknown;
  petRuntimeArt?: unknown;
}>): Readonly<{ rewards: MobileRuntimePolicyState; ranking: MobileRuntimePolicyState }>;
```

- [ ] **Step 1: Write failing lifecycle tests.** Add cases proving that a DRAFT daily loop parses for development, an APPROVED daily loop requires `approvalDecisionId`, `approvedBy`, and canonical millisecond UTC `approvedAt`, and the production loader rejects any DRAFT dependency or `test-*` approval identity.

```ts
expect(parseDailyPetLoopPolicyV1(draft).status).toBe('DRAFT');
expect(() => parseDailyPetLoopPolicyV1({ ...draft, status: 'APPROVED' })).toThrow(/approval/i);
expect(() => loadMobileRuntimePolicy({ economy: draftEconomy, catalog, dailyPetLoop: draft, weeklyCompetition }))
  .not.toThrow();
expect(loadMobileRuntimePolicy({ economy: draftEconomy, catalog, dailyPetLoop: draft, weeklyCompetition }).rewards)
  .toEqual({ enabled: false, code: 'REWARD_POLICY_NOT_APPROVED' });
```

- [ ] **Step 2: Run RED.** Run `corepack pnpm exec vitest run packages/contracts/src/daily-pet-loop.test.ts apps/server/src/policy/mobile-runtime-policy.test.ts`. Expected: failure because the daily policy schema accepts only literal `DRAFT` and the runtime loader is absent.
- [ ] **Step 3: Implement the discriminated policy union and loader.** Match the approval-envelope semantics already used by `packages/contracts/src/learning-policy.ts`; do not change any config status or approval field in this task.
- [ ] **Step 4: Keep reward and ranking gates independent.** An approved economy/daily loop may enable daily collection without weekly ranking; a weekly policy failure must not disable casual pet collection.
- [ ] **Step 5: Run GREEN.** Run the focused test command, `corepack pnpm content:schemas:check`, and `corepack pnpm server:check`. Expected: all pass while current runtime state remains disabled.
- [ ] **Step 6: Commit.** Stage only the six task files and commit with `feat(policy): add approval-aware mobile runtime gates`.

### Task 2: Freeze the Public Leaderboard HTTP Contract

**Files:**
- Modify: `packages/contracts/openapi.yaml`
- Modify: `packages/contracts/src/openapi.test.ts`
- Create: `packages/contracts/src/learning-leaderboard.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/mobile/src/features/ranking/ranking-client.ts`
- Modify: `apps/mobile/src/features/ranking/ranking-client.test.ts`

**Interfaces:**
- Consumes: the current `RankingRow`, `RankedCategory`, and server-authoritative weekly score definition.
- Produces:

```ts
export type PublicWeeklyRankingRowV1 = Readonly<{
  rank: number;
  nickname: string;
  displayScore: number;
}>;

export type WeeklyCategoryBoardResponseV1 = Readonly<{
  seasonId: string;
  category: 'ENGLISH' | 'PROVERB';
  snapshotRevision: string;
  rows: readonly PublicWeeklyRankingRowV1[];
  myRank: null | Readonly<{
    rank: number;
    totalCompetitors: number;
    percentile: number;
    displayScore: number;
  }>;
}>;
```

- [ ] **Step 1: Write failing OpenAPI and client tests.** Add `GET /v1/learning/leaderboard` with required UUID `seasonId`, category enum, and integer `limit` from 1 through 10. Assert exact response keys and error mappings: `400 INVALID_QUERY`, `401 UNAUTHORIZED`, `409 RANKING_POLICY_NOT_APPROVED`, and `503 LEADERBOARD_UNAVAILABLE`.
- [ ] **Step 2: Add privacy mutation cases.** Reject rows containing `subjectKey`, `userId`, `email`, `coordinates`, `hitboxes`, or any unknown property. Require `myRank` to be either exact public metrics or `null`.
- [ ] **Step 3: Run RED.** Run `corepack pnpm exec vitest run packages/contracts/src/openapi.test.ts apps/mobile/src/features/ranking/ranking-client.test.ts`. Expected: the endpoint/schema is missing and the current client does not parse `myRank`.
- [ ] **Step 4: Implement the contract and strict parser.** Replace the current non-UUID test season with `30000000-0000-4000-8000-000000000001`. Keep GET free of `Idempotency-Key`; never accept a client score or subject parameter.
- [ ] **Step 5: Run GREEN.** Run the focused tests and `corepack pnpm openapi:lint`. Expected: exact statuses, schemas, and mobile projection pass.
- [ ] **Step 6: Commit.** Commit only the six task files with `feat(api): define weekly leaderboard read contract`.

### Task 3: Add Supabase JWKS Authentication and Opaque Subject Resolution

**Files:**
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/server/.env.example`
- Create: `apps/server/src/auth/bearer.ts`
- Create: `apps/server/src/auth/supabase-jwt-verifier.ts`
- Create: `apps/server/src/auth/subject-resolver.ts`
- Test: `apps/server/src/auth/bearer.test.ts`
- Test: `apps/server/src/auth/supabase-jwt-verifier.test.ts`
- Test: `apps/server/src/auth/subject-resolver.test.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, Fetch `Request`, `jose.createRemoteJWKSet`, `jose.jwtVerify`, and a restricted SQL caller.
- Produces:

```ts
export type AuthenticatedPrincipal = Readonly<{ authenticatedUserId: string }>;

export interface BearerVerifier {
  verify(request: Request): Promise<AuthenticatedPrincipal>;
}

export interface SubjectResolver {
  ensureAndResolve(authenticatedUserId: string): Promise<string>;
}
```

- [ ] **Step 1: Add `jose` explicitly.** Run `corepack pnpm --filter @spot-learn/server add jose@6`. Do not add Supabase secret/service-role libraries to the server.
- [ ] **Step 2: Write verifier RED tests with an in-memory asymmetric key pair.** Cover valid token, missing/multiple Authorization headers, expired token, wrong signature, issuer, audience, non-UUID `sub`, `role !== 'authenticated'`, and `is_anonymous === true`.
- [ ] **Step 3: Verify RED.** Run `corepack pnpm exec vitest run apps/server/src/auth`. Expected: module-not-found failures for the new verifier.
- [ ] **Step 4: Implement JWKS verification.** Use `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, issuer `${SUPABASE_URL}/auth/v1`, audience `authenticated`, algorithms `ES256` and `RS256`, and `clockTolerance: 30`. The error returned to handlers is always stable `UNAUTHORIZED`; internal causes are not serialized.

```ts
const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
const { payload } = await jwtVerify(token, jwks, {
  issuer: `${supabaseUrl}/auth/v1`,
  audience: 'authenticated',
  algorithms: ['ES256', 'RS256'],
  clockTolerance: 30,
});
```

- [ ] **Step 5: Implement subject-resolution abstraction.** It may return only the opaque subject key from `private.ensure_mobile_account_v1`; it must not place the auth UUID in downstream DTOs or logs.
- [ ] **Step 6: Run GREEN and secrets scan.** Run the focused tests, `corepack pnpm server:check`, and `corepack pnpm secret:scan`. Expected: all pass with no real token or key fixture committed.
- [ ] **Step 7: Commit.** Commit the task files with `feat(auth): verify mobile bearer tokens with Supabase JWKS`.

### Task 4: Add Restricted Account, Pet Projection, and Weekly Board SQL

**Files:**
- Create: `supabase/migrations/202608110001_mobile_runtime_projections.sql`
- Create: `supabase/tests/database/mobile-runtime-projections.test.sql`
- Create: `tests/database/mobile-runtime-concurrency.test.ts`
- Modify: `packages/contracts/src/daily-pet-loop.sql.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `auth.users`, `public.profiles`, `private.economy_subjects`, `private.pet_inventory`, `private.pet_definitions`, `private.weekly_challenge_pins`, `private.learning_best_records`, and `private.learning_attempts`.
- Produces these exact restricted functions:

```sql
private.ensure_mobile_account_v1(p_authenticated_user_id uuid) returns jsonb
private.read_pet_inventory_v1(p_subject_key uuid, p_catalog_revision text, p_catalog_hash text) returns jsonb
private.read_weekly_category_board_v1(p_subject_key uuid, p_season_id uuid, p_category text, p_limit integer) returns jsonb
```

- [ ] **Step 1: Write pgTAP RED assertions.** Require all three functions, safe `search_path = pg_catalog`, non-login ownership, `economy_server` EXECUTE, and no EXECUTE for `PUBLIC`, `anon`, `authenticated`, `service_role`, `app_server`, or deployment roles.
- [ ] **Step 2: Write account concurrency RED test.** Twenty concurrent `ensure_mobile_account_v1` calls for one valid auth UUID must return the same random subject key, create one profile and one subject mapping, and never derive the subject key from the auth UUID.
- [ ] **Step 3: Write pet restoration RED test.** Seed inventory, call the projection, reconnect with a second DB session, and assert the same positive-copy rows, selection, lock, acquisition date, and catalog pin. Return level `1` and XP `0` until an independently approved progression policy supplies authoritative values; do not read legacy `public.user_pets`.
- [ ] **Step 4: Write weekly aggregate RED test.** Seed five pinned challenges and verified best records. Assert weekly score is the sum across those pins, missing challenges contribute zero, lower replays do not replace bests, and order is total score DESC, hints ASC, wrong answers ASC, wrong taps ASC, completion milliseconds ASC, earliest qualifying completion ASC, then stable subject key internally.
- [ ] **Step 5: Add privacy and policy-negative DB cases.** Deleted/unlinked subjects, wrong catalog hashes, unknown seasons/categories, non-approved competition rows, quarantined attempts, and content outside the pinned five return stable rejection or empty results with zero writes.
- [ ] **Step 6: Verify RED.** With a D-drive Docker root, run `corepack pnpm check:db`. Expected: missing-function failures. If the Docker root is not on `D:`, record `BLOCKED_EXTERNAL_STORAGE` and do not start Supabase.
- [ ] **Step 7: Implement the migration.** Use row locks and `INSERT ... ON CONFLICT` only inside the bootstrap transaction. The weekly SQL may carry `subject_key` internally to calculate `myRank`, but the HTTP layer must remove it before serialization.
- [ ] **Step 8: Run GREEN.** Run `corepack pnpm check:db` twice from a reset database. Expected: pgTAP, lint, and Node concurrency tests pass on both runs.
- [ ] **Step 9: Commit.** Commit the five task files with `feat(db): add authenticated pet and weekly ranking projections`.

### Task 5: Implement PostgreSQL Adapters and Pure HTTP Handlers

**Files:**
- Create: `apps/server/src/database/pg-rpc.ts`
- Test: `apps/server/src/database/pg-rpc.test.ts`
- Create: `apps/server/src/pets/postgres-pet-repository.ts`
- Test: `apps/server/src/pets/postgres-pet-repository.test.ts`
- Create: `apps/server/src/learning/weekly-category-board.ts`
- Test: `apps/server/src/learning/weekly-category-board.test.ts`
- Create: `apps/server/src/http/errors.ts`
- Create: `apps/server/src/http/pet-handlers.ts`
- Create: `apps/server/src/http/ranking-handler.ts`
- Test: `apps/server/src/http/pet-handlers.test.ts`
- Test: `apps/server/src/http/ranking-handler.test.ts`

**Interfaces:**
- Consumes: Tasks 1 through 4, `claimDailyFreeDrawV1`, `promoteDuplicateCardsV1`, `getPetCollectionV1`, and `LeaderboardAdapter` concepts.
- Produces:

```ts
export type MobileApiHandlers = Readonly<{
  getPetCollection(request: Request): Promise<Response>;
  claimDailyDraw(request: Request): Promise<Response>;
  promoteDuplicates(request: Request): Promise<Response>;
  getWeeklyLeaderboard(request: Request): Promise<Response>;
}>;
```

- [ ] **Step 1: Write handler RED tests.** Use fake verifier, subject resolver, policy loader, and repository. Cover successful DTOs plus `401 UNAUTHORIZED`, `400 INVALID_REQUEST`, `404 NOT_OWNED`, `409` domain/policy conflicts, and `503 DATABASE_UNAVAILABLE`.
- [ ] **Step 2: Prove subject isolation and idempotency.** Requests containing `subjectKey`, `userId`, policy hashes, or extra JSON fields are rejected. Promotion requires a canonical UUIDv4 key; same key/body replays the stored result and same key/different body returns `IDEMPOTENCY_CONFLICT`.
- [ ] **Step 3: Prove DRAFT has zero effects.** The policy check must occur before subject bootstrap and repository invocation for claim/promotion/ranking. Assert all dependency spies have zero mutation calls.
- [ ] **Step 4: Verify RED.** Run `corepack pnpm exec vitest run apps/server/src/http apps/server/src/database apps/server/src/pets/postgres-pet-repository.test.ts apps/server/src/learning/weekly-category-board.test.ts`. Expected: missing-handler failures.
- [ ] **Step 5: Implement adapters.** Use parameterized `pg` queries, `SET LOCAL ROLE economy_server` inside transactions where needed, stable request hashing, exact Zod parsing of DB JSON, and explicit rollback on every failure.
- [ ] **Step 6: Implement error mapping.** Never return raw PostgreSQL messages, constraint names, stack traces, or policy hashes. Map only the OpenAPI code/status combinations from Task 2 and existing pet contracts.
- [ ] **Step 7: Run GREEN.** Run the focused tests and `corepack pnpm server:check`. Expected: all pass with exact response bodies.
- [ ] **Step 8: Commit.** Commit the task files with `feat(server): add authenticated pet and ranking handlers`.

### Task 6: Add an Executable Node Bridge and Local Health Probes

**Files:**
- Create: `apps/server/src/http/router.ts`
- Test: `apps/server/src/http/router.test.ts`
- Create: `apps/server/src/http/node-server.ts`
- Test: `apps/server/src/http/node-server.test.ts`
- Create: `apps/server/src/runtime.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/server/.env.example`
- Create: `tools/mobile/run-authenticated-api-smoke.ps1`
- Modify: `tools/mobile/run-android-smoke.ps1`
- Create: `docs/runbooks/mobile-api-local.md`

**Interfaces:**
- Consumes: `MobileApiHandlers` and runtime dependencies from Tasks 1, 3, and 5.
- Produces: `createMobileApiRouter(deps): (request: Request) => Promise<Response>` and a Node listener on `MOBILE_API_HOST=127.0.0.1`, `MOBILE_API_PORT=8787` by default.

- [ ] **Step 1: Write router RED tests.** Require exact method/path matching, JSON content type, request-body byte limit, `405` for known paths with wrong methods, `404` for unknown paths, and a non-secret `/healthz` response.
- [ ] **Step 2: Write lifecycle RED test.** Start on an ephemeral port, issue one request, abort the server, and assert sockets and the PostgreSQL pool close without an unhandled rejection.
- [ ] **Step 3: Verify RED.** Run `corepack pnpm exec vitest run apps/server/src/http/router.test.ts apps/server/src/http/node-server.test.ts`. Expected: missing router/bridge failures.
- [ ] **Step 4: Implement the Fetch-to-Node bridge.** Bind loopback by default; reject non-loopback production origins in development configuration and require explicit `MOBILE_API_ALLOWED_ORIGINS` for non-device web callers.
- [ ] **Step 5: Add scripts.** Add `server:start` and `server:smoke` to the root scripts. Update Android smoke to reverse both `tcp:8081` and `tcp:8787`, with all evidence under `D:\tcbuild`.
- [ ] **Step 6: Run GREEN.** Start the server with current DRAFT configs and verify `/healthz` returns `200`, reward/ranking endpoints return their named policy-disabled status, and DB mutation counters remain zero.
- [ ] **Step 7: Commit.** Commit the task files with `feat(server): add executable mobile API runtime`.

### Task 7: Wire Mobile Authentication, Bearer Transport, Pets, and Ranking

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/mobile/.env.example`
- Create: `apps/mobile/src/auth/env.ts`
- Test: `apps/mobile/src/auth/env.test.ts`
- Create: `apps/mobile/src/auth/supabase-client.ts`
- Create: `apps/mobile/src/auth/session-controller.ts`
- Test: `apps/mobile/src/auth/session-controller.test.ts`
- Create: `apps/mobile/src/api/mobile-api-transport.ts`
- Test: `apps/mobile/src/api/mobile-api-transport.test.ts`
- Modify: `apps/mobile/src/features/pets/pet-api.ts`
- Modify: `apps/mobile/src/features/pets/pet-api.test.ts`
- Modify: `apps/mobile/app/pets.tsx`
- Test: `apps/mobile/app/pets.test.tsx`
- Modify: `apps/mobile/app/ranking.tsx`
- Test: `apps/mobile/app/ranking.test.tsx`
- Modify: `apps/mobile/app/profile.tsx`

**Interfaces:**
- Consumes: Supabase access sessions, Task 2 DTOs, Task 5 HTTP endpoints, existing `PetCollection`, `DailyFreeDraw`, `RankingScreen`, and `WeeklyCategoryBoard`.
- Produces one transport:

```ts
export interface AccessTokenProvider {
  getAccessToken(): Promise<string | null>;
}

export function createMobileApiTransport(input: Readonly<{
  baseUrl: string;
  tokens: AccessTokenProvider;
  fetchImpl?: typeof fetch;
}>): PetApiTransport & RankingClientTransport;
```

- [ ] **Step 1: Install Expo-compatible auth dependencies.** From `apps/mobile`, run `npx expo install @supabase/supabase-js react-native-url-polyfill expo-sqlite expo-crypto`. Keep only URL, publishable key, and API base URL under `EXPO_PUBLIC_*`.
- [ ] **Step 2: Write environment/session RED tests.** Reject missing/malformed URLs, any secret/service-role-looking mobile key, production loopback API origins, and session callbacks after disposal. Assert sign-out clears only local session data.
- [ ] **Step 3: Write transport RED tests.** Assert bearer header injection, UUIDv4 idempotency keys, no refresh token header/body, JSON parsing, timeout/abort, one authorized retry after Supabase refresh, and stable error-code projection.
- [ ] **Step 4: Write route RED tests.** Cover loading, signed-out, DRAFT-disabled, ready, claiming, replay, promotion, empty, stale, and network-error states. Ranking renders `WeeklyCategoryBoard` from server rows and never from local gameplay scores.
- [ ] **Step 5: Verify RED.** Run `corepack pnpm mobile:contracts`. Expected: missing modules and live-route state failures.
- [ ] **Step 6: Implement the minimal authenticated UX.** Profile owns email sign-in/sign-out and session status; pets/ranking consume only the session-controller interface. OAuth provider setup remains governed by `docs/superpowers/specs/2026-07-19-supabase-auth-integration-design.md` and is not required for the first local email-auth acceptance.
- [ ] **Step 7: Implement route controllers.** Generate one UUIDv4 key per user mutation and retain it through retries until a terminal response. After a successful claim/promotion, refetch collection from server authority.
- [ ] **Step 8: Run GREEN.** Run `corepack pnpm mobile:check` and scan the web/Android bundle for `DATABASE_URL`, `SUPABASE_SECRET_KEY`, refresh-token fixture text, subject IDs, and private solution imports.
- [ ] **Step 9: Commit.** Commit the listed files with `feat(mobile): connect authenticated pet and ranking APIs`.

### Task 8: Produce Real Approval and Pet-Art Activation Artifacts

**Files:**
- Create after human decisions: `docs/approvals/pet-economy-v1-approval.json`
- Create after human decisions: `docs/approvals/daily-pet-loop-v1-approval.json`
- Create after human decisions: `docs/approvals/weekly-competition-v1-approval.json`
- Create after rights/visual review: `docs/approvals/pet-runtime-art-v1-approval.json`
- Modify after approval: `config/economy.v1.json`
- Modify after approval: `config/pet-catalog.v1.json`
- Modify after approval: `config/daily-pet-loop.v1.json`
- Modify after approval: `config/weekly-competition.v1.json`
- Modify after approval: `content/pets/source-manifest.v1.json`
- Create: `config/pet-runtime-art.v1.json`
- Create: `schemas/pet-runtime-art.schema.json`
- Create: `tools/check-pet-runtime-approval.mjs`
- Test: `tests/pet-runtime-approval.test.ts`
- Modify: `apps/server/src/policy/mobile-runtime-policy.ts`
- Modify: `apps/server/src/policy/mobile-runtime-policy.test.ts`
- Modify after approval: `apps/server/src/runtime.ts`

**Interfaces:**
- Consumes: named product owner, economy reviewer, rights reviewer, visual reviewer, 50 admitted catalog identities, immutable hashes, and at least five genuinely published/admitted revisions in each ranked category.
- Produces: immutable, non-test approval records and an exact one-to-one HTTPS art mapping for every active pet.

- [ ] **Step 1: Implement the approval checker before creating approvals.** It must reject missing signatures, `test-*` reviewers, noncanonical timestamps, stale hashes, duplicate pet IDs/files/hashes, HTTP URLs, source entries still marked `PENDING`, and any active catalog pet without thumbnail/full asset hashes.
- [ ] **Step 2: Add negative fixtures and run RED/GREEN.** Run `corepack pnpm exec vitest run tests/pet-runtime-approval.test.ts` and `node tools/check-pet-runtime-approval.mjs`. Current repository artifacts must produce an explicit blocked result, not a false PASS.
- [ ] **Step 3: Complete human product decisions.** Decide daily probabilities, duplicate/promotion behavior, active 50-pet catalog, weekly categories, challenge pins, ranking rules, and disclosure copy. The approvers—not the implementation agent—supply decision IDs, names, and timestamps.
- [ ] **Step 4: Complete rights and visual review.** Each active art asset must have provenance, permission/license evidence, source and runtime hashes, crop/background/small-card review, approved HTTPS delivery URLs, and takedown ownership.
- [ ] **Step 5: Complete ranked content admission.** Publish five distinct, rights-approved, education-reviewed, asset-complete `ENGLISH` and five `PROVERB` revisions. Do not reuse or pad content to reach five.
- [ ] **Step 6: Activate immutable config revisions.** Change status only after the checker verifies the exact approval artifacts and recomputed hashes. Extend `loadMobileRuntimePolicy` to parse the approved art manifest and return `PET_ART_NOT_APPROVED` for missing, DRAFT, stale, or incomplete art. Publish through the restricted deployment role; never use the existing test-only `TEST-DECISION` publisher as production evidence.
- [ ] **Step 7: Verify activation.** Run policy/schema/content checks plus DB publication tests. Expected: production loaders accept the exact approved revisions; any one-byte mutation or missing approval fails closed.
- [ ] **Step 8: Commit.** Commit only genuine approval/config/art artifacts after named reviewers authorize them, using `chore(release): activate approved pet and ranking policies`.

### Task 9: Run Local Authenticated DB and Android Acceptance

**Result (2026-08-12 KST):** `LOCAL_ANDROID_AUTHENTICATED` evidence is recorded under `D:\tcbuild\android-authenticated\20260812-045826`. The API/DB boundaries, collection restoration, ranking UI, and integrated learning preview passed. A fresh-account Android tap-through for the enabled draw/promotion buttons remains open, so this task is not treated as production or physical-device acceptance.

**Files:**
- Modify: `tools/mobile/run-authenticated-api-smoke.ps1`
- Modify: `apps/mobile/e2e/android-feature-matrix.md`
- Modify: `docs/reviews/2026-08-11-mobile-feature-acceptance-report.md`
- Create per run outside Git: `D:\tcbuild\android-authenticated\<timestamp>\summary.json`
- Create per run outside Git: screenshots, UI dumps, logcat, API transcript, and redacted DB assertions under the same D-drive directory.

**Interfaces:**
- Consumes: Tasks 1 through 8, a D-drive-backed local Supabase or approved test environment, emulator `emulator-5554` or a physical Android device, and a disposable verified email account.
- Produces: `LOCAL_ANDROID_AUTHENTICATED` evidence only.

- [x] **Step 1: Preflight storage and secrets.** Confirm Docker data root and all evidence/build paths are on `D:`. Confirm transcript redaction removes access/refresh tokens, cookies, emails, auth UUIDs, subject keys, DB URLs, and secrets.
- [x] **Step 2: Reset and seed the test environment.** Run `corepack pnpm check:db`, create one disposable auth user, bootstrap its opaque subject, publish only test-environment approved fixtures, seed promotion-boundary inventory, five weekly pins, and verified best rows.
- [x] **Step 3: Start runtime and device routing.** The isolated run used API port `18787`, Metro `8081`, and local Supabase Auth `55321`; all three ports were reversed to the emulator.
- [x] **Step 4: Verify pet collection restoration.** Sign in, open Pets, capture owned count/rarity/copies, force-stop the app, restart, and require the same server collection projection.
- [ ] **Step 5: Verify daily claim effect-once behavior.** The authenticated API harness passed first call, same-key replay, and 20 concurrent calls with exact single DB deltas. A fresh-account Android button-tap capture is still required for the complete UI wording of this step.
- [x] **Step 6: Verify promotion boundaries.** Nine spare copies reject, ten spare plus one retained base succeeds once, selected/locked copies are not consumed, same-key retry replays, changed-body same key conflicts, and COMMON/RARE transitions produce only the approved next rarity.
- [x] **Step 7: Verify live ranking.** Confirm ENGLISH and PROVERB rows match DB ordering, `myRank` matches the same snapshot, a lower replay does not replace the best, and IDIOM/GK remain disabled. Inspect UI dump and network transcript for private fields.
- [x] **Step 8: Verify fatal/error logs.** Fail on fatal exceptions, unresolved modules, native-module errors, React errors, raw SQL errors, secrets, auth/subject IDs, or private-solution terms.
- [x] **Step 9: Record evidence classification.** Mark only the tested rows PASS in `android-feature-matrix.md`; keep physical-device accessibility and production readiness external until separately approved.
- [x] **Step 10: Commit documentation.** Commit the matrix/report paths, not the token-bearing raw environment, with `docs(mobile): record authenticated pet and ranking acceptance`.

### Task 10: Final Gates, Regression Proof, and Plan Closure

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/superpowers/plans/2026-08-11-mobile-feature-completion-plan.md`
- Modify: `docs/reviews/2026-08-11-mobile-feature-acceptance-report.md`
- Modify: `docs/release-evidence-blockers.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: every preceding task and its evidence classification.
- Produces: repeatable repository gates and a truthful closure record.

- [ ] **Step 1: Add local contract gates.** Include server auth/HTTP tests, mobile transport tests, OpenAPI lint, policy approval checker in blocked/approved mode, secrets scan, and bundle boundary scan in `pnpm check` without requiring external credentials.
- [ ] **Step 2: Keep DB checks separate and mandatory for DB readiness.** `pnpm verify` must remain `pnpm check && pnpm check:db`; CI jobs must not mark DB readiness when the DB job is skipped.
- [ ] **Step 3: Run fresh verification.** Execute `corepack pnpm check`, `corepack pnpm check:db`, Android cold smoke, authenticated Android matrix, and `git diff --check`. Record exact counts and evidence paths from the fresh run only.
- [ ] **Step 4: Run negative release assertions.** Remove one approval in a temporary fixture, mutate one policy hash, use a forged JWT, add a private leaderboard field, retry promotion with a changed body, and point production mobile config at loopback. Each case must fail with the named stable reason and zero unauthorized writes.
- [ ] **Step 5: Update the original four open items.** Check them only when the HTTP runtime, live DB restoration, live weekly rows, and enabled Android flows all have evidence. Do not check an umbrella item because its unit tests alone pass.
- [ ] **Step 6: Preserve external blockers.** Signed reproducible builds, production backup/PITR restore, physical Android/iOS goldens and accessibility, provider telemetry evidence, legal/rights approval, and production soak remain independently tracked until their own artifacts exist.
- [ ] **Step 7: Commit.** Commit the gate/document changes with `chore(release): gate authenticated pet and ranking runtime`.

## Completion Matrix

| State | Required evidence | May enable |
|---|---|---|
| `LOCAL_CONTRACT_READY` | Tasks 1-3 and 5-7 unit/type/build checks | DRAFT UI and local handler tests only |
| `LOCAL_DB_READY` | Task 4 `check:db` twice from reset on D-drive-backed DB | Local authenticated integration harness |
| `EXTERNAL_APPROVED` | Task 8 genuine economy/catalog/daily/weekly/content/art approvals | Test/staging reward and ranking activation |
| `LOCAL_ANDROID_AUTHENTICATED` | Task 9 effect-once pet and live ranking evidence | Local acceptance report update |
| `PRODUCTION_READY` | Task 10 plus every independent release blocker closed | Release decision by authorized owners |

## Plan Success Criteria

- A valid Supabase user can restart the app and recover the same authoritative collection.
- A daily claim commits exactly once per opaque subject/KST date and replays the stored result after retry.
- Duplicate promotion consumes exactly ten eligible spare copies, retains the base copy, and is idempotent by subject/key/request hash.
- Weekly rows come only from verified best records over exactly five approved pinned challenges; local scores never enter the response.
- Top 10 and `myRank` come from one snapshot and contain no private identifiers or solution data.
- DRAFT, missing, stale, test-only, or hash-inconsistent approvals prevent all reward writes and live ranking rows.
- The Android matrix passes collection restoration, enabled claim, promotion, and live ranking without fatal/runtime/security-log findings.
- Local evidence remains correctly classified and does not erase external release blockers.

## Primary References

- `docs/superpowers/specs/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-design.md`
- `docs/superpowers/specs/2026-07-19-supabase-auth-integration-design.md`
- `docs/decisions/ADR-004-pet-economy.md`
- `docs/release-evidence-blockers.md`
- `docs/superpowers/plans/2026-08-11-mobile-feature-completion-plan.md`
- Supabase JWT/JWKS guidance: `https://supabase.com/docs/guides/auth/jwts`
- Supabase React Native Auth guidance: `https://supabase.com/docs/guides/auth/quickstarts/react-native`
- `jose` JWT verification API: `https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md`
