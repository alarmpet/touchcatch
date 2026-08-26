<#
.SYNOPSIS
  Builds and inspects the Android release App Bundle.

.DESCRIPTION
  Three things this guards that the previous version did not.

  Exit codes survive. `Pop-Location` in a `finally` runs after gradle and resets `$?`, so a
  failed build could leave the script exiting 0 with a cheerful "complete" message. Every native
  call now goes through Invoke-Step, which captures the code immediately and stops.

  The artifact is checked, not assumed. A build can succeed and still produce a bundle signed by
  the wrong key, pointing at a loopback API, or carrying the private solution keys. The bundle is
  the thing that ships, so the bundle is the thing that gets read.

  Metro is not killed. It holds file handles under android/app/build and gradle fails on them,
  but a script that terminates a developer's bundler in the background is worse than one that
  says so and stops.

.PARAMETER SkipGates
  Skips the repository gates. For iterating on the native build only; never for a bundle that
  will be uploaded.
#>
[CmdletBinding()]
param(
  [switch]$SkipGates
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..' '..')
$androidDir = Join-Path $repoRoot 'apps/mobile/android'
$bundlePath = Join-Path $androidDir 'app/build/outputs/bundle/release/app-release.aab'

function Invoke-Step {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][scriptblock]$Body
  )
  Write-Host "--> $Name" -ForegroundColor Cyan
  & $Body
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-Host "FAILED: $Name (exit $code)" -ForegroundColor Red
    exit $code
  }
}

# --- Preflight -------------------------------------------------------------------------------

$missing = @(
  @('KEYSTORE_PATH', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD') |
    Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
)
if ($missing.Count -gt 0) {
  Write-Host "Missing release signing inputs: $($missing -join ', ')" -ForegroundColor Red
  Write-Host 'See docs/runbooks/google-play-release.md. The release build refuses to fall back to the debug key.' -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path $env:KEYSTORE_PATH)) {
  Write-Host "KEYSTORE_PATH does not exist: $env:KEYSTORE_PATH" -ForegroundColor Red
  exit 1
}

# Metro crawls the whole project and keeps handles inside android/app/build open. When it is up,
# :app:mergeReleaseResources fails to clean its outputs with an access-denied error that names a
# file rather than the cause, and the directory cannot be removed from PowerShell either.
$metro = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'expo start|metro' }
if ($metro) {
  Write-Host 'Metro is running. Stop it before building - it holds file handles under android/app/build.' -ForegroundColor Red
  Write-Host ($metro | ForEach-Object { "  pid $($_.ProcessId): $($_.CommandLine)" }) -ForegroundColor Yellow
  exit 1
}

# --- Gates -----------------------------------------------------------------------------------

if (-not $SkipGates) {
  Invoke-Step 'Scanning mobile production routes' { node (Join-Path $repoRoot 'tools/check-mobile-production-boundary.mjs') }
  Invoke-Step 'Mobile typecheck' { corepack pnpm mobile:typecheck }
  Invoke-Step 'Portal is publishable' { corepack pnpm portal:publishable }
}

# From 2026-08-31 Play rejects new apps and updates that target below Android 16 (API 36). The
# value is not written anywhere in this repository -- it comes from Expo's Gradle plugin defaults
# -- so a dependency bump could lower it and nothing static would notice. Ask the build itself.
Write-Host '--> Verifying target SDK' -ForegroundColor Cyan
Push-Location $androidDir
try {
  $properties = & .\gradlew.bat -q :app:properties --no-daemon 2>$null
}
finally {
  Pop-Location
}
$targetSdk = ($properties | Select-String -Pattern '^targetSdkVersion:\s*(\d+)$').Matches.Groups[1].Value
if (-not $targetSdk) {
  Write-Host 'Could not read targetSdkVersion from Gradle.' -ForegroundColor Red
  exit 1
}
if ([int]$targetSdk -lt 36) {
  Write-Host "targetSdkVersion is $targetSdk; Play requires 36 or higher from 2026-08-31." -ForegroundColor Red
  exit 1
}
Write-Host "    targetSdkVersion $targetSdk" -ForegroundColor DarkGray

# --- Build -----------------------------------------------------------------------------------

Push-Location $androidDir
try {
  Invoke-Step 'Building Android App Bundle' { & .\gradlew.bat :app:clean :app:bundleRelease --no-daemon }
}
finally {
  Pop-Location
}

if (-not (Test-Path $bundlePath)) {
  Write-Host "Gradle reported success but produced no bundle at $bundlePath" -ForegroundColor Red
  exit 1
}

# --- Inspect ---------------------------------------------------------------------------------

Invoke-Step 'Inspecting the bundle' {
  node (Join-Path $repoRoot 'tools/mobile/inspect-release-aab.mjs') --aab $bundlePath
}

$hash = (Get-FileHash -Algorithm SHA256 -Path $bundlePath).Hash.ToLowerInvariant()
$size = [math]::Round((Get-Item $bundlePath).Length / 1MB, 2)

Write-Host ''
Write-Host 'Android release bundle ready.' -ForegroundColor Green
Write-Host "  path    $bundlePath"
Write-Host "  size    $size MB"
Write-Host "  sha256  $hash"
Write-Host ''
Write-Host 'Record that hash with the upload. It is what ties the Play artifact to this source.' -ForegroundColor Yellow
