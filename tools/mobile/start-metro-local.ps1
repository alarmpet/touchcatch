param(
  [int]$Port = 8081,
  [string]$ApiOrigin = 'http://127.0.0.1:18787',
  [string]$EvidenceRoot = 'D:\tcbuild'
)

$ErrorActionPreference = 'Stop'
$approvedRoot = [System.IO.Path]::GetFullPath('D:\tcbuild')
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if ($EvidenceRoot -ne $approvedRoot -and -not $EvidenceRoot.StartsWith("$approvedRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'EvidenceRoot must resolve under D:\tcbuild.'
}
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$supabase = Join-Path $workspace 'node_modules\.bin\supabase.cmd'
$ErrorActionPreference = 'Continue'
$statusText = & $supabase status -o json 2>$null
$statusExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($statusExit -ne 0) { throw 'Unable to read local Supabase status.' }
$status = $statusText | ConvertFrom-Json
if (-not $status.API_URL -or -not $status.PUBLISHABLE_KEY) { throw 'Local Supabase public mobile configuration is unavailable.' }
$env:EXPO_PUBLIC_SUPABASE_URL = [string]$status.API_URL
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = [string]$status.PUBLISHABLE_KEY
$env:EXPO_PUBLIC_API_ORIGIN = $ApiOrigin
$env:EXPO_PUBLIC_WEEKLY_SEASON_ID = '30000000-0000-4000-8000-000000000001'
$env:TOUCHCATCH_NODE_HOME = 'D:\devtools\node-v24.18.0-win-x64'
$env:NODE_PATH = 'D:\tcbuild\runtime-node-modules;D:\tcbuild\mobiledeps\node_modules'
$out = Join-Path $EvidenceRoot 'metro-task9.out.log'
$err = Join-Path $EvidenceRoot 'metro-task9.err.log'
$runner = Join-Path $workspace 'tools\mobile\run-expo-pinned.ps1'
$process = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $runner,
  'start', '--lan', '--port', "$Port", '--clear'
) -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
$deadline = (Get-Date).AddSeconds(90)
do {
  Start-Sleep -Seconds 2
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
} while (-not $listener -and -not $process.HasExited -and (Get-Date) -lt $deadline)
if (-not $listener) {
  Get-Content -LiteralPath $err -Tail 40 -ErrorAction SilentlyContinue
  Get-Content -LiteralPath $out -Tail 40 -ErrorAction SilentlyContinue
  throw "Metro did not listen on port $Port."
}
"metroPid=$($process.Id)"
"metroPort=$Port"
