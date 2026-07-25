# Set rtk adapter mode: enforce | soft | off
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("enforce", "soft", "off")]
  [string]$Mode
)

$modeFile = Join-Path $env:USERPROFILE ".grok\hooks\token-saving.mode"
$dir = Split-Path $modeFile -Parent
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Set-Content -Path $modeFile -Value $Mode -Encoding utf8NoBOM
Write-Host "RTK mode -> $Mode ($modeFile)"
