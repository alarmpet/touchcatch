# Local Mobile API Runbook

This runbook starts the authenticated pet and ranking API without placing SDK, database, or evidence data on C:.

## Prerequisites

- Node.js 24.18.0 is available at D:\devtools\node-v24.18.0-win-x64.
- Docker Desktop stores its WSL data disk under D:\DockerData.
- Local Supabase PostgreSQL is running for database integration, and Docker Desktop uses the approved D-drive-backed data disk.
- An HTTPS Supabase development project supplies email-auth access tokens; the normal plain-HTTP local Auth issuer is intentionally rejected by the production verifier.
- apps/server/.env contains SUPABASE_URL and the restricted runtime DATABASE_URL. Never commit this file.

Copy apps/server/.env.example to apps/server/.env, then set:

    SUPABASE_URL=https://your-development-project.supabase.co
    DATABASE_URL=<restricted runtime database URL supplied out of band>
    MOBILE_API_HOST=127.0.0.1
    MOBILE_API_PORT=8787
    MOBILE_API_ALLOWED_ORIGINS=

The test-fixture writer and loopback runtime also require `LOCAL_ACCEPTANCE_CONFIRMATION=TOUCHCATCH_LOCAL_ACCEPTANCE_V1`, a loopback `LOCAL_SUPABASE_URL`, and a loopback PostgreSQL `LOCAL_DATABASE_URL`. They reject remote hosts before opening a database connection. Never set this marker in staging or production configuration.

Provision a dedicated login once from an administrator session, grant only membership in the existing NOLOGIN economy_server role, and put that login in DATABASE_URL:

    create role mobile_api_login login password '<generated local password>'
      nosuperuser nocreatedb nocreaterole noinherit noreplication;
    grant economy_server to mobile_api_login;

Do not commit the generated password. The production JWT verifier requires HTTPS, so SUPABASE_URL must name an HTTPS Supabase development project or a trusted local TLS endpoint. Plain HTTP local issuers are intentionally rejected; do not weaken production verification.

## Start and probe

    $env:PATH = 'D:\devtools\node-v24.18.0-win-x64;' + $env:PATH
    corepack pnpm server:start
    Invoke-RestMethod http://127.0.0.1:8787/healthz

Expected health response:

    {"status":"ok"}

Run the authenticated fail-closed smoke without writing the bearer token to evidence:

    $env:MOBILE_API_ACCESS_TOKEN = '<temporary access token>'
    $env:MOBILE_API_SMOKE_DATABASE_URL = '<read-only audit database URL supplied out of band>'
    corepack pnpm server:smoke

Do not pass either secret as a command-line argument; command lines may be visible to other local processes. The database probe credential is local-only and needs read-only SELECT access to public.profiles plus the six private account/pet-effect tables used by the counter probe. Current DRAFT policies must return 409/REWARD_POLICY_NOT_APPROVED for all pet routes and 409/RANKING_POLICY_NOT_APPROVED for the leaderboard, with identical before/after account-bootstrap and mutation counters. Evidence is written only below D:\tcbuild\mobile-api-smoke and contains statuses/codes and the unchanged verdict, never either credential.

## Android emulator routing

From a clean checkout, generate the native project from `apps/mobile/app.json` before building. Keep Gradle caches and build evidence on `D:`:

    $env:PATH = 'D:\devtools\node-v24.18.0-win-x64;' + $env:PATH
    $env:GRADLE_USER_HOME = 'D:\tcbuild\gradle-home'
    Push-Location apps/mobile
    corepack pnpm exec expo prebuild --platform android
    .\android\gradlew.bat assembleDebug --project-dir android --project-cache-dir D:\tcbuild\gradle-project-cache
    Pop-Location

The generated application ID must match `apps/mobile/app.json`. Do not reuse an older native directory with a different package ID as release evidence.

    & $env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe reverse tcp:8081 tcp:8081
    & $env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe reverse tcp:8787 tcp:8787

tools/mobile/run-android-smoke.ps1 applies both reverses automatically and stores its artifacts under D:\tcbuild\android-smoke.

Both smoke scripts reject evidence roots outside D:\tcbuild. Android capture is limited to the application PID; UI XML is checked before screenshots are captured, and logs are checked before persistence. A sensitive-content match records only a generic failure marker, never the matching value.

If 8787 is already occupied, select another explicit port in apps/server/.env and pass the same value to both -BaseUri on the API smoke and -ApiPort on the Android smoke. Do not terminate an unrelated listener merely to reclaim the default port.

## Shutdown

Press Ctrl+C. The Node bridge stops accepting requests, closes idle sockets, and closes the PostgreSQL pool. Do not place .env, access tokens, database URLs, raw auth IDs, or SQL errors in screenshots or reports.
