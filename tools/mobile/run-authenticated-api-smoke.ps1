param(
  [string]$AccessToken = $env:MOBILE_API_ACCESS_TOKEN,
  [string]$BaseUri = 'http://127.0.0.1:8787',
  [string]$SeasonId = '30000000-0000-4000-8000-000000000001',
  [string]$ExpectedRewardCode = 'REWARD_POLICY_NOT_APPROVED',
  [string]$ExpectedRankingCode = 'RANKING_POLICY_NOT_APPROVED',
  [string]$EvidenceRoot = 'D:\tcbuild\mobile-api-smoke',
  [string]$NodePath = 'D:\devtools\node-v24.18.0-win-x64\node.exe',
  [switch]$SkipDatabaseInvariant
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  throw 'MOBILE_API_ACCESS_TOKEN is required.'
}
$approvedEvidenceRoot = [System.IO.Path]::GetFullPath('D:\tcbuild')
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if ($EvidenceRoot -ne $approvedEvidenceRoot -and -not $EvidenceRoot.StartsWith("$approvedEvidenceRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'EvidenceRoot must resolve under D:\tcbuild.'
}
$base = $BaseUri.TrimEnd('/')
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $EvidenceRoot $timestamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(15)

function Read-PetEffectCounters {
  if (-not (Test-Path -LiteralPath $NodePath)) {
    throw "Node.js was not found at $NodePath"
  }
  $json = & $NodePath 'tools/mobile/read-pet-effect-counters.mjs'
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to read pet effect counters.'
  }
  return $json | ConvertFrom-Json
}

function Invoke-MobileApiRequest {
  param(
    [string]$Method,
    [string]$Path,
    [switch]$Authenticated,
    [string]$JsonBody,
    [string]$IdempotencyKey
  )
  $request = [System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::new($Method),
    "$base$Path"
  )
  try {
    if ($Authenticated) {
      $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $AccessToken)
    }
    if ($IdempotencyKey) {
      $request.Headers.Add('Idempotency-Key', $IdempotencyKey)
    }
    if ($JsonBody) {
      $request.Content = [System.Net.Http.StringContent]::new($JsonBody, [System.Text.Encoding]::UTF8, 'application/json')
    }
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    try {
      $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      $body = if ($text) { $text | ConvertFrom-Json } else { $null }
      return [pscustomobject]@{ status = [int]$response.StatusCode; code = $body.code; body = $body }
    } finally {
      $response.Dispose()
    }
  } finally {
    $request.Dispose()
  }
}

try {
  $beforeCounters = if ($SkipDatabaseInvariant) { $null } else { Read-PetEffectCounters }
  $health = Invoke-MobileApiRequest -Method GET -Path '/healthz'
  if ($health.status -ne 200 -or $health.body.status -ne 'ok') {
    throw "Health probe failed with HTTP $($health.status)."
  }

  $collection = Invoke-MobileApiRequest -Method GET -Path '/v1/pets/collection' -Authenticated
  $daily = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/daily-draw' -Authenticated -IdempotencyKey ([guid]::NewGuid().ToString())
  $promotion = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/duplicate-promotion' -Authenticated -IdempotencyKey ([guid]::NewGuid().ToString()) -JsonBody '{"materials":[{"petId":"40000000-0000-4000-8000-000000000001","count":10}]}'
  $ranking = Invoke-MobileApiRequest -Method GET -Path "/v1/learning/leaderboard?seasonId=$SeasonId&category=ENGLISH&limit=10" -Authenticated

  foreach ($result in @($collection, $daily, $promotion)) {
    if ($result.status -ne 409 -or $result.code -ne $ExpectedRewardCode) {
      throw "Reward gate mismatch: expected HTTP 409/$ExpectedRewardCode, received HTTP $($result.status)/$($result.code)."
    }
  }
  if ($ranking.status -ne 409 -or $ranking.code -ne $ExpectedRankingCode) {
    throw "Ranking gate mismatch: expected HTTP 409/$ExpectedRankingCode, received HTTP $($ranking.status)/$($ranking.code)."
  }
  $afterCounters = if ($SkipDatabaseInvariant) { $null } else { Read-PetEffectCounters }
  if (-not $SkipDatabaseInvariant -and (($beforeCounters | ConvertTo-Json -Compress) -ne ($afterCounters | ConvertTo-Json -Compress))) {
    throw 'DRAFT policy smoke changed one or more pet effect counters.'
  }

  $summary = [ordered]@{
    apiSmoke = 'PASS'
    timestamp = $timestamp
    baseUri = $base
    health = $health.status
    collection = "$($collection.status)/$($collection.code)"
    dailyDraw = "$($daily.status)/$($daily.code)"
    duplicatePromotion = "$($promotion.status)/$($promotion.code)"
    ranking = "$($ranking.status)/$($ranking.code)"
    databaseInvariant = if ($SkipDatabaseInvariant) { 'SKIPPED' } else { 'UNCHANGED' }
  }
  $summary | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runRoot 'summary.json') -Encoding utf8
  $summary.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
} finally {
  $client.Dispose()
}
