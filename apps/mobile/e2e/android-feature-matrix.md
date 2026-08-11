# Android feature acceptance matrix

This matrix separates local emulator evidence from production/release readiness. The authenticated run uses disposable local Supabase users, explicit test-only policy decisions, and placeholder HTTPS art. Because enabled claim/promotion were exercised through the authenticated API harness rather than Android button taps, the current aggregate classification is `LOCAL_ANDROID_PARTIAL`.

| Flow | Expected result | Fresh evidence | Status (2026-08-12 KST) |
| --- | --- | --- | --- |
| Cold app boot | Native app opens without a fatal/runtime/module error | `D:\tcbuild\android-smoke-task9-preflight\20260812-044141` | PASS (`com.spotlearnbattle`) |
| Home | Primary learning CTA and live pet/ranking shortcuts render | `D:\tcbuild\android-authenticated\20260812-045826\home-runtime-ready.png`; no `준비 중` node in the paired XML | PASS |
| Integrated English flow | Ten actual normalized difference regions open the quiz; direct `resilience` answer completes | `game-en-quiz.xml`; `game-en-complete-3.xml`; `game-en-complete-3.png`; post-boundary-fix `game-safe-preview.xml` and `game-safe-preview.png` in the authenticated run | PASS (development preview judgment) |
| English hint ladder | Semantic/context/length/reveal steps advance on device | `game-en-hint.xml`; `game-en-spelling-hint.xml` | PASS |
| Proverb initial hint | The post-boundary-fix safe preview exposes `ㅂㅁㅇ ㅂㅇㅇㄱ` only after hint use | `safe-proverb.xml` | PASS (development safe preview) |
| Idiom initial hint | The post-boundary-fix safe preview reaches 사자성어 and exposes `ㅈㅎㅇㅂ` after the third hint | `safe-idiom.xml` | PASS (development safe preview) |
| Authenticated pet collection | Signed-in route reaches `READY`; inventory rows group by pet; unique-pet collection rate and copies render | `pet-fixed.xml`; `pet-fixed.png`; clean relaunch log check | PASS |
| Pet duplicate rendering regression | Same `petId` rows render once and no duplicate React key warning recurs after clean relaunch | `PetCollection.test.tsx` plus cleared-logcat Android relaunch | PASS |
| Daily draw effect once | First request, same-key replay, and 20 concurrent same-day calls produce exact single DB effect | `api-smoke\20260812-050438\summary.json` | PASS (authenticated API harness) |
| Duplicate promotion boundaries | Nine eligible spares reject; ten plus retained base succeeds; replay/conflict and exact DB deltas hold | same API summary | PASS (authenticated API harness) |
| English weekly ranking | Five server rows and authenticated user's rank 3 render | `ranking-en.xml`; `ranking-en.png` | PASS |
| Proverb weekly ranking | Five server rows and authenticated user's rank 3 render | `ranking-proverb.xml`; `ranking-proverb.png` | PASS |
| Disabled ranked category | IDIOM leaderboard query fails with `400/INVALID_QUERY` | authenticated API summary | PASS |
| Database suite | Reset, lint, 323 pgTAP assertions, and 33 concurrency tests pass | `D:\tcbuild\check-db-task9.out.log`; `check-db-task9.err.log` | PASS |
| Fatal/error filter | No new duplicate-key warning after fix; base smoke has no fatal/runtime/native-module finding | cleared-logcat relaunch; cold-smoke `logcat.txt` | PASS for tested run |

## Not proven by this matrix

- The learning route is still guarded by `__DEV__`; production answer submission and result projection are not connected.
- Production economy, daily-pet, weekly competition, ranked content, and pet-art approvals remain DRAFT/PENDING. The local runtime deliberately rejects production mode and uses `TEST-DECISION` fixtures.
- Claim and promotion transaction behavior was exercised through the authenticated HTTP harness, not by tapping an enabled mutation on a newly seeded second Android account.
- The native Android package currently resolves to `com.spotlearnbattle`, while `app.json` declares `com.touchcatch.mobile`; this identity drift must be resolved before signing/release work.
- Physical-device accessibility, signed release builds, production-like backup/PITR restore, provider telemetry, legal/rights approval, and production soak remain external blockers.
