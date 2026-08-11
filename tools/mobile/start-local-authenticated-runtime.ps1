param(
  [string]$SessionPath = 'D:\tcbuild\task9-local-session.tmp.json',
  [string]$RunRoot = '',
  [int]$Port = 18787
)

$ErrorActionPreference = 'Stop'
if (-not $RunRoot) { $RunRoot = (Get-Content 'D:\tcbuild\task9-run-root.txt' -Raw).Trim() }
$approvedRoot = [System.IO.Path]::GetFullPath('D:\tcbuild')
$RunRoot = [System.IO.Path]::GetFullPath($RunRoot)
if (-not $RunRoot.StartsWith("$approvedRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'RunRoot must resolve under D:\tcbuild.'
}
$existing = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($existing) { throw "Port $Port is already in use." }
$secret = Get-Content -LiteralPath $SessionPath -Raw | ConvertFrom-Json
$env:LOCAL_SUPABASE_URL = [string]$secret.apiUrl
$env:LOCAL_DATABASE_URL = [string]$secret.databaseUrl
$env:LOCAL_ACCEPTANCE_CONFIRMATION = 'TOUCHCATCH_LOCAL_ACCEPTANCE_V1'
$env:LOCAL_MOBILE_API_PORT = [string]$Port
$out = Join-Path $RunRoot 'api.out.log'
$err = Join-Path $RunRoot 'api.err.log'
$process = Start-Process -FilePath 'D:\devtools\node-v24.18.0-win-x64\node.exe' -ArgumentList @(
  'node_modules\tsx\dist\cli.mjs',
  'tools/mobile/start-local-authenticated-runtime.ts'
) -WorkingDirectory 'D:\touchcatch' -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
$deadline = (Get-Date).AddSeconds(45)
do {
  Start-Sleep -Seconds 2
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
} while (-not $listener -and -not $process.HasExited -and (Get-Date) -lt $deadline)
if (-not $listener) {
  Get-Content -LiteralPath $err -Tail 40 -ErrorAction SilentlyContinue
  throw "Local authenticated API did not listen on port $Port."
}
Set-Content -LiteralPath 'D:\tcbuild\task9-api-pid.txt' -Value $process.Id -Encoding ascii
"apiPid=$($process.Id)"
"apiPort=$Port"
