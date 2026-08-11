param(
  [string]$AccessToken = $env:MOBILE_API_ACCESS_TOKEN,
  [string]$BaseUri = 'http://127.0.0.1:8787',
  [string]$SeasonId = '30000000-0000-4000-8000-000000000001',
  [ValidateSet('Draft', 'Enabled')]
  [string]$Mode = 'Draft',
  [string]$FixturePath = '',
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

function Assert-Result {
  param($Result, [int]$Status, [string]$Code, [string]$Label)
  if ($Result.status -ne $Status -or ($Code -and $Result.code -ne $Code)) {
    throw "$Label mismatch: expected HTTP $Status/$Code, received HTTP $($Result.status)/$($Result.code)."
  }
}

function Invoke-ConcurrentDailyDraws {
  param([int]$Count = 20)
  $requests = @()
  $tasks = @()
  try {
    for ($index = 0; $index -lt $Count; $index += 1) {
      $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "$base/v1/pets/daily-draw")
      $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $AccessToken)
      $request.Headers.Add('Idempotency-Key', [guid]::NewGuid().ToString())
      $requests += $request
      $tasks += $client.SendAsync($request)
    }
    [System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]$tasks)
    $results = @()
    foreach ($task in $tasks) {
      $response = $task.Result
      try {
        $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $results += [pscustomobject]@{ status = [int]$response.StatusCode; body = $text | ConvertFrom-Json; raw = $text }
      } finally { $response.Dispose() }
    }
    return $results
  } finally {
    $requests | ForEach-Object { $_.Dispose() }
  }
}

try {
  $beforeCounters = if ($SkipDatabaseInvariant) { $null } else { Read-PetEffectCounters }
  $health = Invoke-MobileApiRequest -Method GET -Path '/healthz'
  if ($health.status -ne 200 -or $health.body.status -ne 'ok') {
    throw "Health probe failed with HTTP $($health.status)."
  }

  if ($Mode -eq 'Draft') {
    $collection = Invoke-MobileApiRequest -Method GET -Path '/v1/pets/collection' -Authenticated
    $daily = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/daily-draw' -Authenticated -IdempotencyKey ([guid]::NewGuid().ToString())
    $promotion = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/duplicate-promotion' -Authenticated -IdempotencyKey ([guid]::NewGuid().ToString()) -JsonBody '{"materials":[{"petId":"40000000-0000-4000-8000-000000000001","count":10}]}'
    $ranking = Invoke-MobileApiRequest -Method GET -Path "/v1/learning/leaderboard?seasonId=$SeasonId&category=ENGLISH&limit=10" -Authenticated
    foreach ($result in @($collection, $daily, $promotion)) { Assert-Result $result 409 $ExpectedRewardCode 'Reward gate' }
    Assert-Result $ranking 409 $ExpectedRankingCode 'Ranking gate'
    $afterCounters = if ($SkipDatabaseInvariant) { $null } else { Read-PetEffectCounters }
    if (-not $SkipDatabaseInvariant -and (($beforeCounters | ConvertTo-Json -Compress) -ne ($afterCounters | ConvertTo-Json -Compress))) {
      throw 'DRAFT policy smoke changed one or more pet effect counters.'
    }
    $summary = [ordered]@{
      apiSmoke = 'PASS'; mode = $Mode; timestamp = $timestamp; baseUri = $base; health = $health.status
      collection = "$($collection.status)/$($collection.code)"; dailyDraw = "$($daily.status)/$($daily.code)"
      duplicatePromotion = "$($promotion.status)/$($promotion.code)"; ranking = "$($ranking.status)/$($ranking.code)"
      databaseInvariant = if ($SkipDatabaseInvariant) { 'SKIPPED' } else { 'UNCHANGED' }
    }
  } else {
    if (-not $FixturePath -or -not (Test-Path -LiteralPath $FixturePath)) { throw 'Enabled mode requires FixturePath.' }
    $fixture = Get-Content -LiteralPath $FixturePath -Raw | ConvertFrom-Json
    if ($fixture.classification -ne 'LOCAL_ANDROID_AUTHENTICATED' -or -not $fixture.mainPetId -or -not $fixture.boundaryPetId) {
      throw 'Enabled fixture is invalid.'
    }
    $collectionBefore = Invoke-MobileApiRequest -Method GET -Path '/v1/pets/collection' -Authenticated
    Assert-Result $collectionBefore 200 '' 'Initial collection'
    if ($collectionBefore.body.claimedToday -ne $false) { throw 'Initial collection unexpectedly reports a daily claim.' }
    $boundaryBody = @{ materials = @(@{ petId = [string]$fixture.boundaryPetId; count = 10 }) } | ConvertTo-Json -Compress
    $boundary = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/duplicate-promotion' -Authenticated -IdempotencyKey ([guid]::NewGuid().ToString()) -JsonBody $boundaryBody
    Assert-Result $boundary 409 'INSUFFICIENT_DUPLICATES' 'Nine-spare boundary'
    $promotionKey = [guid]::NewGuid().ToString()
    $promotionBody = @{ materials = @(@{ petId = [string]$fixture.mainPetId; count = 10 }) } | ConvertTo-Json -Compress
    $promotion = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/duplicate-promotion' -Authenticated -IdempotencyKey $promotionKey -JsonBody $promotionBody
    Assert-Result $promotion 200 '' 'Duplicate promotion'
    $promotionReplay = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/duplicate-promotion' -Authenticated -IdempotencyKey $promotionKey -JsonBody $promotionBody
    Assert-Result $promotionReplay 200 '' 'Duplicate promotion replay'
    if (($promotion.body | ConvertTo-Json -Compress -Depth 10) -ne ($promotionReplay.body | ConvertTo-Json -Compress -Depth 10)) { throw 'Promotion replay did not return the stored response.' }
    $promotionConflict = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/duplicate-promotion' -Authenticated -IdempotencyKey $promotionKey -JsonBody $boundaryBody
    Assert-Result $promotionConflict 409 'IDEMPOTENCY_CONFLICT' 'Changed-body promotion replay'
    $dailyKey = [guid]::NewGuid().ToString()
    $daily = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/daily-draw' -Authenticated -IdempotencyKey $dailyKey
    Assert-Result $daily 200 '' 'Daily draw'
    $dailyReplay = Invoke-MobileApiRequest -Method POST -Path '/v1/pets/daily-draw' -Authenticated -IdempotencyKey $dailyKey
    Assert-Result $dailyReplay 200 '' 'Daily draw replay'
    $dailyJson = $daily.body | ConvertTo-Json -Compress -Depth 10
    if ($dailyJson -ne ($dailyReplay.body | ConvertTo-Json -Compress -Depth 10)) { throw 'Daily replay did not return the stored response.' }
    $concurrent = Invoke-ConcurrentDailyDraws 20
    if (@($concurrent | Where-Object { $_.status -ne 200 -or (($_.body | ConvertTo-Json -Compress -Depth 10) -ne $dailyJson) }).Count -ne 0) {
      throw 'One or more concurrent daily claims did not replay the stored response.'
    }
    $collectionAfter = Invoke-MobileApiRequest -Method GET -Path '/v1/pets/collection' -Authenticated
    Assert-Result $collectionAfter 200 '' 'Restored collection'
    if ($collectionAfter.body.claimedToday -ne $true -or $collectionAfter.body.ownedCount -lt 2) { throw 'Restored collection is missing the claimed state or promoted pet.' }
    $english = Invoke-MobileApiRequest -Method GET -Path "/v1/learning/leaderboard?seasonId=$SeasonId&category=ENGLISH&limit=10" -Authenticated
    $proverb = Invoke-MobileApiRequest -Method GET -Path "/v1/learning/leaderboard?seasonId=$SeasonId&category=PROVERB&limit=10" -Authenticated
    Assert-Result $english 200 '' 'English ranking'; Assert-Result $proverb 200 '' 'Proverb ranking'
    foreach ($board in @($english.body, $proverb.body)) {
      if ($board.rows.Count -ne [int]$fixture.expectedRankRows -or $board.myRank.rank -ne 3 -or $board.myRank.totalCompetitors -ne [int]$fixture.expectedRankRows) {
        throw 'Live ranking rows or myRank do not match the seeded DB snapshot.'
      }
    }
    $disabled = Invoke-MobileApiRequest -Method GET -Path "/v1/learning/leaderboard?seasonId=$SeasonId&category=IDIOM&limit=10" -Authenticated
    Assert-Result $disabled 400 'INVALID_QUERY' 'Disabled category'
    $afterCounters = if ($SkipDatabaseInvariant) { $null } else { Read-PetEffectCounters }
    if (-not $SkipDatabaseInvariant) {
      $expectedDeltas = @{ dailyClaims = 1; dailyHistory = 1; promotionReceipts = 1; promotionHistory = 1; outboxEvents = 2; economySubjects = 0; profiles = 0 }
      foreach ($name in $expectedDeltas.Keys) {
        if (($afterCounters.$name - $beforeCounters.$name) -ne $expectedDeltas[$name]) { throw "Unexpected $name effect count." }
      }
    }
    $summary = [ordered]@{
      apiSmoke = 'PASS'; mode = $Mode; classification = 'LOCAL_ANDROID_AUTHENTICATED'; timestamp = $timestamp; baseUri = $base
      health = $health.status; collectionRestore = 'PASS'; dailyEffectOnce = 'PASS_1_PLUS_1_REPLAY_PLUS_20_CONCURRENT'
      promotionBoundaries = 'PASS_9_REJECT_10_SUCCEED_REPLAY_CONFLICT'; englishRankingRows = $english.body.rows.Count
      proverbRankingRows = $proverb.body.rows.Count; myRank = $english.body.myRank.rank; disabledCategory = '400/INVALID_QUERY'
      databaseInvariant = if ($SkipDatabaseInvariant) { 'SKIPPED' } else { 'EXACT_EFFECT_DELTAS' }
    }
  }
  $summary | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runRoot 'summary.json') -Encoding utf8
  $summary.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
} finally {
  $client.Dispose()
}
