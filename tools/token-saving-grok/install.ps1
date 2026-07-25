#Requires -Version 5.1
<#
.SYNOPSIS
  Install Grok token-saving stack (rtk hooks + serena MCP harness + skill).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\tools\token-saving-grok\install.ps1 `
    -ProjectRoot (Get-Location).Path -RtkMode enforce
#>
param(
  [string]$ProjectRoot = "",
  [ValidateSet("enforce", "soft", "off")]
  [string]$RtkMode = "enforce",
  [switch]$SkipProject
)

$ErrorActionPreference = "Stop"
$BundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $BundleRoot "..\..")).Path
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path

$UserProfile = $env:USERPROFILE
$GrokRoot = Join-Path $UserProfile ".grok"
$HooksDir = Join-Path $GrokRoot "hooks"
$HooksBin = Join-Path $HooksDir "bin"
$SkillsDir = Join-Path $GrokRoot "skills\token-saving"
$LogsDir = Join-Path $GrokRoot "logs"
$ConfigToml = Join-Path $GrokRoot "config.toml"

function ConvertTo-WslPath([string]$WinPath) {
  $p = $WinPath -replace "\\", "/"
  if ($p -match "^([A-Za-z]):(.*)$") {
    $drive = $Matches[1].ToLower()
    $rest = $Matches[2]
    return "/mnt/$drive$rest"
  }
  return $p
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $dir = Split-Path $Path -Parent
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

Write-Host "==> Bundle: $BundleRoot"
Write-Host "==> Project: $ProjectRoot"
Write-Host "==> Grok: $GrokRoot"

# --- dirs ---
@(
  $HooksDir, $HooksBin, $SkillsDir, $LogsDir
) | ForEach-Object {
  if (-not (Test-Path $_)) { New-Item -ItemType Directory -Force -Path $_ | Out-Null }
}

# --- copy bin ---
$srcBin = Join-Path $BundleRoot "hooks\bin"
Get-ChildItem $srcBin -File | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $HooksBin $_.Name) -Force
  Write-Host "  copy bin/$($_.Name)"
}
$modeSrc = Join-Path $BundleRoot "hooks\token-saving.mode"
Write-Utf8NoBom (Join-Path $HooksDir "token-saving.mode") "$RtkMode`n"
Write-Host "  mode=$RtkMode"

# --- skill ---
$srcSkill = Join-Path $BundleRoot "skills\token-saving\SKILL.md"
Copy-Item $srcSkill (Join-Path $SkillsDir "SKILL.md") -Force
Write-Host "  skill token-saving"

# --- hooks json (absolute python paths) ---
$pySession = Join-Path $HooksBin "serena_grok_session.py"
$pyRtk = Join-Path $HooksBin "rtk_grok_pretool.py"
$hooksObj = [ordered]@{
  hooks = [ordered]@{
    SessionStart = @(
      @{
        hooks = @(
          @{
            type = "command"
            command = "python $pySession activate"
            timeout = 20
          }
        )
      }
    )
    SessionEnd = @(
      @{
        hooks = @(
          @{
            type = "command"
            command = "python $pySession cleanup"
            timeout = 15
          }
        )
      }
    )
    PreToolUse = @(
      @{
        matcher = "Bash"
        hooks = @(
          @{
            type = "command"
            command = "python $pyRtk"
            timeout = 8
          }
        )
      }
      @{
        matcher = "run_terminal_command"
        hooks = @(
          @{
            type = "command"
            command = "python $pyRtk"
            timeout = 8
          }
        )
      }
    )
  }
}
$hooksJson = $hooksObj | ConvertTo-Json -Depth 10
Write-Utf8NoBom (Join-Path $HooksDir "token-saving.json") $hooksJson
Write-Host "  hooks/token-saving.json"

# --- LF + chmod for shell script via WSL ---
$wslHooksBin = ConvertTo-WslPath $HooksBin
$sh = ConvertTo-WslPath (Join-Path $HooksBin "start_serena_mcp.sh")
try {
  wsl.exe -e bash -lc "sed -i 's/\r$//' '$wslHooksBin'/*.sh 2>/dev/null; chmod +x '$wslHooksBin'/*.sh; ls -la '$sh'" | Write-Host
} catch {
  Write-Warning "WSL LF/chmod failed (serena start may break until fixed): $_"
}

# --- patch ~/.grok/config.toml ---
$existing = ""
if (Test-Path $ConfigToml) {
  $existing = [System.IO.File]::ReadAllText($ConfigToml)
}

function Ensure-TomlBlock([string]$text, [string]$marker, [string]$block) {
  if ($text -match [regex]::Escape($marker)) {
    # Replace existing serena / token-saving managed regions if present
    return $text
  }
  if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) {
    $text += "`n"
  }
  return $text + "`n" + $block + "`n"
}

$serenaArgsPath = ConvertTo-WslPath (Join-Path $HooksBin "start_serena_mcp.sh")
$managed = @"
# --- token-saving-grok (managed) ---
[session]
auto_compact_threshold_percent = 80

[mcp]
max_output_bytes = 20000

[mcp_servers.serena]
command = "C:\\Windows\\System32\\wsl.exe"
args = [
  "-e",
  "bash",
  "$serenaArgsPath",
]
enabled = true
startup_timeout_sec = 180
tool_timeout_sec = 180

[compat.claude]
hooks = true
skills = true
rules = true
mcps = true
# --- end token-saving-grok ---
"@

if ($existing -match "token-saving-grok \(managed\)") {
  $pattern = "(?s)# --- token-saving-grok \(managed\) ---.*?# --- end token-saving-grok ---"
  $newConfig = [regex]::Replace($existing, $pattern, $managed.Trim())
  Write-Host "  config.toml: replaced managed block"
} elseif ($existing -match "\[mcp_servers\.serena\]") {
  $newConfig = $existing
  if ($existing -notmatch "max_output_bytes") {
    $newConfig = Ensure-TomlBlock $newConfig "[mcp]" @"
[mcp]
max_output_bytes = 20000
"@
  }
  if ($existing -notmatch "auto_compact_threshold_percent") {
    $newConfig = Ensure-TomlBlock $newConfig "[session]" @"
[session]
auto_compact_threshold_percent = 80
"@
  }
  Write-Host "  config.toml: serena already present — harness keys ensured only"
} else {
  $newConfig = if ($existing) { $existing.TrimEnd() + "`n`n" + $managed } else { $managed }
  Write-Host "  config.toml: appended managed block"
}

# Ensure group_tool_verbs under a single [ui] table (avoid duplicate [ui] keys)
if ($newConfig -notmatch "group_tool_verbs\s*=") {
  if ($newConfig -match "(?m)^\[ui\]\s*$") {
    $newConfig = [regex]::Replace(
      $newConfig,
      "(?m)^\[ui\]\s*$",
      "[ui]`ngroup_tool_verbs = true",
      1
    )
  } else {
    $newConfig = $newConfig.TrimEnd() + "`n`n[ui]`ngroup_tool_verbs = true`n"
  }
  Write-Host "  config.toml: group_tool_verbs=true"
}

Write-Utf8NoBom $ConfigToml $newConfig

# --- project files ---
if (-not $SkipProject) {
  $projGrok = Join-Path $ProjectRoot ".grok"
  $projRules = Join-Path $projGrok "rules"
  $projSerena = Join-Path $ProjectRoot ".serena"
  @($projGrok, $projRules, $projSerena) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Force -Path $_ | Out-Null }
  }

  $projConfig = @"
# token-saving project MCP pin (folder trust required)
[mcp]
max_output_bytes = 20000

[mcp_servers.serena]
command = "C:\\Windows\\System32\\wsl.exe"
args = [
  "-e",
  "bash",
  "$serenaArgsPath",
]
enabled = true
startup_timeout_sec = 180
tool_timeout_sec = 180
"@
  Write-Utf8NoBom (Join-Path $projGrok "config.toml") $projConfig

  $rule = @"
# Token saving (project)

- Prefer Serena symbol tools over full-file reads.
- Prefer built-in read_file/grep/list_dir over shell cat/find/ls -R.
- When PreToolUse denies with TOKEN-SAVE(rtk), re-run the **exact** command in the deny reason.
- Do not load MCP tools until needed (search_tool first).
"@
  Write-Utf8NoBom (Join-Path $projRules "token-saving.md") $rule

  $yml = Join-Path $projSerena "project.yml"
  if (-not (Test-Path $yml)) {
    $name = Split-Path $ProjectRoot -Leaf
    $projectYml = @"
# Serena project (token-saving-grok install)
project_name: $name
# Languages: TypeScript monorepo + some Python tools
language: typescript
"@
    Write-Utf8NoBom $yml $projectYml
    Write-Host "  created .serena/project.yml"
  } else {
    Write-Host "  keep existing .serena/project.yml"
  }
  Write-Host "  project .grok + rules"
}

Write-Host ""
Write-Host "Install complete."
Write-Host "Next:"
Write-Host "  1) Ensure WSL has: uv, rtk, serena (see token-saving-grok-portable-install.md)"
Write-Host "  2) Fully restart Grok"
Write-Host "  3) In project: /hooks-trust  (or grok --trust)"
Write-Host "  4) Verify: python rtk_pretool with git status → deny"
Write-Host "  5) /mcps → serena enabled (not timeout)"
