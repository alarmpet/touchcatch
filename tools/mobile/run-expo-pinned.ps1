param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExpoArguments
)

$ErrorActionPreference = 'Stop'
$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$MobileRoot = Join-Path $WorkspaceRoot 'apps\mobile'
$RequiredNodeVersion = (Get-Content (Join-Path $WorkspaceRoot 'package.json') -Raw | ConvertFrom-Json).engines.node
$NodeHome = if ($env:TOUCHCATCH_NODE_HOME) {
  $env:TOUCHCATCH_NODE_HOME
} else {
  "D:\devtools\node-v$RequiredNodeVersion-win-x64"
}
$NodeExe = Join-Path $NodeHome 'node.exe'

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "Pinned Node.js v$RequiredNodeVersion was not found at $NodeExe. Set TOUCHCATCH_NODE_HOME to its extracted directory."
}

$ActualNodeVersion = (& $NodeExe --version).TrimStart('v')
if ($ActualNodeVersion -ne $RequiredNodeVersion) {
  throw "Node.js version mismatch: expected $RequiredNodeVersion, got $ActualNodeVersion from $NodeExe"
}

$env:PATH = "$NodeHome;$env:PATH"
$env:EXPO_ROUTER_APP_ROOT = Join-Path $MobileRoot 'app'
$ExpoCli = Join-Path $WorkspaceRoot 'node_modules\expo\bin\cli'

Push-Location $MobileRoot
try {
  & $NodeExe $ExpoCli @ExpoArguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
