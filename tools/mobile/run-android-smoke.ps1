param(
  [string]$PackageName = 'com.touchcatch.mobile',
  [string]$Activity = '.MainActivity',
  [string]$AdbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  [string]$EvidenceRoot = 'D:\tcbuild\android-smoke',
  [int]$MetroPort = 8081,
  [int]$ApiPort = 8787,
  [switch]$SkipLaunch
)

$ErrorActionPreference = 'Stop'

$approvedEvidenceRoot = [System.IO.Path]::GetFullPath('D:\tcbuild')
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if ($EvidenceRoot -ne $approvedEvidenceRoot -and -not $EvidenceRoot.StartsWith("$approvedEvidenceRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'EvidenceRoot must resolve under D:\tcbuild.'
}

if (-not (Test-Path -LiteralPath $AdbPath)) {
  throw "adb was not found at $AdbPath"
}

$deviceLines = & $AdbPath devices
$device = $deviceLines |
  Select-String -Pattern '^([^\s]+)\s+device$' |
  Select-Object -First 1
if (-not $device) {
  throw 'No booted Android device or emulator is visible to adb.'
}

$serial = $device.Matches[0].Groups[1].Value
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $EvidenceRoot $timestamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

& $AdbPath -s $serial reverse "tcp:$MetroPort" "tcp:$MetroPort" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "adb reverse failed for tcp:$MetroPort"
}

& $AdbPath -s $serial reverse "tcp:$ApiPort" "tcp:$ApiPort" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "adb reverse failed for tcp:$ApiPort"
}

& $AdbPath -s $serial logcat -c
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to clear logcat before the smoke run.'
}

if (-not $SkipLaunch) {
  & $AdbPath -s $serial shell am force-stop $PackageName
  & $AdbPath -s $serial shell am start -W -n "$PackageName/$Activity" | Tee-Object -FilePath (Join-Path $runRoot 'launch.txt')
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to launch $PackageName/$Activity"
  }
}

$deadline = (Get-Date).AddSeconds(30)
$focusedActivity = ''
do {
  Start-Sleep -Milliseconds 750
  $windowLines = & $AdbPath -s $serial shell dumpsys window
  $currentFocus = ($windowLines | Select-String -Pattern 'mCurrentFocus=' | Select-Object -First 1).Line
  if ($currentFocus -and $currentFocus.Contains($PackageName)) {
    $focusedActivity = $currentFocus.Trim()
  }
} while (-not $focusedActivity -and (Get-Date) -lt $deadline)

if (-not $focusedActivity) {
  throw "$PackageName did not become the focused Android activity within 30 seconds."
}

$remoteXml = '/sdcard/touchcatch-smoke.xml'
$remotePng = '/sdcard/touchcatch-smoke.png'
$localXml = Join-Path $runRoot 'ui.xml'
$uiDeadline = (Get-Date).AddSeconds(45)
$ui = ''
do {
  & $AdbPath -s $serial shell uiautomator dump $remoteXml | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to produce the Android UI hierarchy.'
  }
  $ui = ((& $AdbPath -s $serial shell cat $remoteXml) -join "`n")
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to read the Android UI hierarchy in memory.'
  }
  & $AdbPath -s $serial shell rm $remoteXml | Out-Null
  $hasTouchCatchUi = $ui -cmatch 'text="TouchCatch"|content-desc="Learning spot the difference"|content-desc="Learning complete"'
  if (-not $hasTouchCatchUi) {
    Start-Sleep -Seconds 1
  }
} while (-not $hasTouchCatchUi -and (Get-Date) -lt $uiDeadline)

if (-not $hasTouchCatchUi) {
  throw 'TouchCatch JavaScript UI did not render within 45 seconds.'
}

$sensitiveUiPattern = 'Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|access[_-]?token|refresh[_-]?token|DATABASE_URL|SUPABASE_SECRET_KEY|subject[_ -]?key|authenticatedUserId|postgres(?:ql)?://|password\s*[=:]|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
if ($ui | Select-String -Pattern $sensitiveUiPattern -CaseSensitive:$false) {
  'Sensitive UI content was detected and UI/screenshot evidence was not persisted.' |
    Set-Content -LiteralPath (Join-Path $runRoot 'sensitive-ui-detected.txt') -Encoding utf8
  throw "Android smoke detected sensitive UI content. See $runRoot\sensitive-ui-detected.txt"
}
$ui | Set-Content -LiteralPath $localXml -Encoding utf8

& $AdbPath -s $serial shell screencap -p $remotePng
& $AdbPath -s $serial pull $remotePng (Join-Path $runRoot 'screen.png') | Out-Null
& $AdbPath -s $serial shell rm $remotePng | Out-Null

$appPid = ((& $AdbPath -s $serial shell pidof -s $PackageName) -join '').Trim()
if ($appPid -notmatch '^\d+$') {
  throw "Unable to resolve the Android PID for $PackageName."
}

$logcat = (& $AdbPath -s $serial logcat "--pid=$appPid" -d) -join "`n"
if ($LASTEXITCODE -ne 0) {
  throw "Unable to capture PID-scoped logcat for $PackageName."
}
$sensitivePattern = 'Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|access[_-]?token|refresh[_-]?token|DATABASE_URL|SUPABASE_SECRET_KEY|subject[_ -]?key|authenticatedUserId|postgres(?:ql)?://|password\s*[=:]|privateSolution|hitbox|coordinates|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
if ($logcat | Select-String -Pattern $sensitivePattern -CaseSensitive:$false) {
  'Sensitive application log content was detected and the raw log was not persisted.' |
    Set-Content -LiteralPath (Join-Path $runRoot 'sensitive-log-detected.txt') -Encoding utf8
  throw "Android smoke detected sensitive application log content. Raw logcat was not written. See $runRoot\sensitive-log-detected.txt"
}
$logPath = Join-Path $runRoot 'logcat.txt'
$logcat | Set-Content -LiteralPath $logPath -Encoding utf8
$fatalPattern = 'FATAL EXCEPTION|Cannot find native module|Unable to resolve module|ReactNativeJS\s*:\s*E|AndroidRuntime\s*:\s*E|Expo\s*:\s*E|SQLSTATE|PostgresError|relation .* does not exist|permission denied for (table|schema|function)'
$fatalMatches = $logcat | Select-String -Pattern $fatalPattern
if ($fatalMatches) {
  $fatalMatches | Set-Content -LiteralPath (Join-Path $runRoot 'fatal-errors.txt') -Encoding utf8
  throw "Android smoke detected fatal runtime errors. See $runRoot\fatal-errors.txt"
}

$summary = @(
  'androidSmoke=PASS'
  "timestamp=$timestamp"
  "serial=$serial"
  "package=$PackageName"
  "activity=$focusedActivity"
  "metroReverse=tcp:$MetroPort"
  "apiReverse=tcp:$ApiPort"
  "logcatScope=pid:$appPid"
  "uiDump=$runRoot\ui.xml"
  "screenshot=$runRoot\screen.png"
  "logcat=$logPath"
) -join "`r`n"
$summary | Set-Content -LiteralPath (Join-Path $runRoot 'summary.txt') -Encoding utf8
Write-Output $summary
