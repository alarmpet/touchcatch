param(
  [string]$ProjectRoot = (Join-Path $PSScriptRoot '..\..\apps\mobile'),
  [int]$Port = 8081
)

$ErrorActionPreference = 'Continue'
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$WorkspaceRoot = (Resolve-Path (Join-Path $ProjectRoot '..\..')).Path

Write-Output "=== Expo Metro diagnostic ==="
Write-Output "projectRoot=$ProjectRoot"
Write-Output "workspaceRoot=$WorkspaceRoot"
Write-Output "node=$(node --version 2>$null)"
Write-Output "pnpm=$(corepack pnpm --version 2>$null)"
Write-Output "expo=$(corepack pnpm --dir $ProjectRoot exec expo --version 2>$null)"
Write-Output "EXPO_ROUTER_APP_ROOT=$env:EXPO_ROUTER_APP_ROOT"

foreach ($relative in @('app.json','app.config.js','babel.config.js','babel.config.cjs','metro.config.js','metro.config.cjs','package.json','tsconfig.json')) {
  $path = Join-Path $ProjectRoot $relative
  Write-Output ("{0}={1}" -f $relative, (Test-Path $path))
}

Write-Output "--- package versions ---"
Push-Location $WorkspaceRoot
try {
  corepack pnpm --config.engine-strict=false why expo expo-router @expo/metro-runtime metro metro-config --depth 2 2>&1
} finally { Pop-Location }

Write-Output "--- resolved files ---"
Push-Location $ProjectRoot
try {
  node -e "for (const p of ['expo-router/entry','expo/metro-config','@expo/metro-runtime/package.json']) { try { console.log(p+'='+require.resolve(p)) } catch (e) { console.log(p+'=ERROR:'+e.message) } }"
} finally { Pop-Location }

Write-Output "--- app root candidates ---"
foreach ($path in @((Join-Path $ProjectRoot 'app'), (Join-Path $WorkspaceRoot 'app'), (Join-Path $ProjectRoot '..\app'))) {
  $resolved = try { (Resolve-Path $path -ErrorAction Stop).Path } catch { $path }
  Write-Output "$resolved exists=$(Test-Path $path)"
}

Write-Output "--- Expo manifest and launch bundle ---"
try {
  $manifestHeaders = @{
    'expo-platform' = 'android'
    'expo-protocol-version' = '0'
  }
  $manifestResponse = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port" -Headers $manifestHeaders -TimeoutSec 15
  Write-Output "manifestStatus=$($manifestResponse.StatusCode)"

  $manifest = $manifestResponse.Content | ConvertFrom-Json
  $bundleUrl = $manifest.launchAsset.url
  if (-not $bundleUrl) {
    throw 'Expo manifest did not contain launchAsset.url'
  }

  Write-Output "bundleUrl=$bundleUrl"
  $bundleResponse = Invoke-WebRequest -UseBasicParsing $bundleUrl -TimeoutSec 60
  Write-Output "bundleStatus=$($bundleResponse.StatusCode)"
  Write-Output "bundleBytes=$($bundleResponse.RawContentLength)"
} catch {
  Write-Output "manifestOrBundleStatus=ERROR"
  Write-Output $_.Exception.Message
}
