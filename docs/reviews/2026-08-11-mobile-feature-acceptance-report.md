# Mobile feature acceptance report — refreshed 2026-08-12 KST

## Outcome

The local Android client now boots, retains a real local Supabase session, reaches authenticated pet and weekly-ranking APIs, and exercises the integrated picture-to-answer learning flow. The fresh evidence qualifies as `LOCAL_ANDROID_PARTIAL`: the authenticated API/DB effects and Android read/game flows passed, but enabled pet mutations were not tapped through on a fresh Android account.

The run also found and fixed two real mobile defects: pet inventory rows sharing a catalog `petId` caused duplicate React keys and duplicate cards, and the home screen falsely showed live pet/ranking destinations as `준비 중` because it used hardcoded capability flags. Focused tests and a clean emulator relaunch verify both fixes.

## Fresh runtime and database evidence

- Android debug APK: `D:\touchcatch\apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk` (about 78.9 MB).
- Successful rebuild logs: `D:\tcbuild\android-rebuild-task9.out.log` and `D:\tcbuild\android-rebuild-task9.err.log`.
- Cold native smoke: `D:\tcbuild\android-smoke-task9-preflight\20260812-044141`.
- Authenticated run root: `D:\tcbuild\android-authenticated\20260812-045826`.
- Evidence provenance and limitations: `provenance.json` in that run root records the observed commit, dirty-worktree state, APK SHA-256, package-ID drift, and exact nested log/API/DB paths. It explicitly records that no complete HTTP transcript was retained.
- API acceptance summary: `api-smoke\20260812-050438\summary.json` under that run root.
- Full DB verification: `D:\tcbuild\check-db-task9.out.log` (323 pgTAP assertions and 33 DB-concurrency tests passed).
- Emulator routing used `adb reverse` for Metro `8081`, API `18787`, and local Supabase `55321`.
- Docker storage, Gradle cache, build output, and evidence remained on `D:`. The existing Android SDK/JBR executables on `C:` were reused without moving large artifacts there.

## Verified product behavior

- Home renders the integrated learning CTA and now enables pet/ranking shortcuts when the mobile runtime is configured.
- The game combines picture differences with the requested learning modes rather than presenting separate games.
- On Android, all ten real difference targets in the first English stage advanced to direct answer input; `resilience` completed the stage.
- English hint steps, proverb initial hint `ㄷㅈ ㅁㅇ ㅇㄷㄷ`, and idiom initial hint `ㅈㅎㅇㅂ` rendered only after hint actions.
- Signed-in Pets reached `READY`, persisted across app force-stop/relaunch, and rendered a server collection. Duplicate rows are now grouped by pet and promotion visibility mirrors the server boundary: at least 11 total copies and 10 unlocked/unselected eligible copies.
- The authenticated harness proved one daily effect across first call, replay, and 20 concurrent calls; promotion proved 9-copy rejection, 10-copy success with retained base, replay, changed-body conflict, and exact DB deltas.
- English and Proverb ranking tabs each rendered five server-authoritative rows and `Local Learner` at rank 3. IDIOM ranked access remained disabled with `400/INVALID_QUERY` as designed.
- After clearing logcat and relaunching into Pets, the duplicate React key warning did not recur.

## Code/runtime defects corrected during acceptance

1. PostgreSQL promotion materials were passed as a JavaScript array to a `jsonb` parameter and serialized by `pg` as a PostgreSQL array. The repository now sends canonical JSON text, with a regression test.
2. Local Supabase uses ES256 JWKS and loopback HTTP. A loopback-only verifier now validates that local test setup without weakening the HTTPS-only production verifier.
3. The device could reach Metro and the API but not local Supabase Auth until `adb reverse tcp:55321 tcp:55321` was added.
4. Same-pet inventory rows used duplicate `petId` keys. The mobile collection groups them, sums copies, excludes selected/locked copies from promotion material eligibility, and calculates collection completion by unique pet.
5. Home availability was static. It now follows mobile runtime readiness and delegates policy/category rejection to the authoritative destination routes.

## Remaining blockers and risks

1. `apps/mobile/app/game/spot-difference.tsx` still throws outside `__DEV__`. The demonstrated direct answer comparison is preview-only; a production route must consume server-projected public content and submit answer intents to server authority.
2. Production policy/art/content artifacts remain DRAFT/PENDING. Local `TEST-DECISION`, `test-approver`, and placeholder DiceBear art are deliberately rejected for production use.
3. The Android native package is `com.spotlearnbattle`, but Expo configuration declares `com.touchcatch.mobile`. Release identity, signing, deep links, and upgrade behavior must use one canonical identifier.
4. Pet cards still display catalog localization keys such as `pet.common.american-shorthair`, and placeholder art is not product-quality approved art.
5. Android status-bar icons have insufficient contrast on light home/pet/ranking backgrounds.
6. The enabled claim/promotion mutations were proven through the authenticated HTTP harness and reflected in the collection, but the exact tap-through UX needs a fresh second disposable account to capture pre/post mutation states.
7. Physical-device accessibility, signed/reproducible release builds, production backup/PITR restore, provider telemetry, rights/legal approval, and production soak are not covered by this local run.

## Classification

`LOCAL_ANDROID_PARTIAL`

This classification proves only the local authenticated DB/API integration and Android read/game flows described above. It does not satisfy the plan's full `LOCAL_ANDROID_AUTHENTICATED` gate, authorize production rewards/rankings, or close independent release blockers.
