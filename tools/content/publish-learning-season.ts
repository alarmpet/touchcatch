import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { Client } from 'pg';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.js';
import {
  parseHintPolicyV1WithHash,
  parseWeeklyCompetitionV1WithHash,
} from '../../packages/contracts/src/learning-policy.js';
import { hardDifferenceCount, parseRuleset, rulesetHash } from '../../packages/contracts/src/rules.schema.js';

/**
 * Publishes the approved closed-beta learning packs into the database and pins them to a
 * casual season. This is `docs/runbooks/google-play-release.md` §4 step 6 — the step the
 * runbook says the app is fail-closed without, and the one nothing in the repository could
 * perform until now.
 *
 * It is not the local test fixture. `tools/mobile/prepare-local-authenticated-fixture.ts`
 * pins seasons to placeholder rows (`{"localFixture": true}` with invented hashes), which
 * seeds a leaderboard but can never render a board — every attempt against that fixture
 * fails on content the client cannot draw. This tool publishes the real approved bundles
 * through `private.publish_content_revision_v1`, so the same command that proves the game
 * locally is the command that deploys it.
 *
 * Preflight runs before any write and mirrors the database's own predicates, driven by
 * `config/ruleset.v1.json` rather than restating its numbers. A pack that would be rejected
 * inside the transaction is reported here by name with the count it missed, because a
 * `PRIVATE_CONTENT_VALUE_INVALID` from Postgres names neither the pack nor the field.
 */

type Json = Record<string, unknown>;

export type ApprovalBundle = Readonly<{
  key: string;
  category: string;
  publicContent: Json;
  privateSolution: Json;
  rightsManifest: Json;
  sourceFiles: readonly string[];
}>;

export type PackFinding = Readonly<{ pack: string; check: string; detail: string }>;

const CONFIRMATION = 'TOUCHCATCH_LEARNING_PUBLISH_V1';
const VALIDATOR_VERSION = '1.0.0';
const ATTEMPT_TTL_SECONDS = 900;
/** Both season tables pin this with a check constraint, so it is a fact, not a preference. */
const CHALLENGES_PER_CATEGORY = 5;
/** `learning_competition_policies` requires this exact array; a season may open a subset of it. */
const POLICY_CATEGORIES = ['ENGLISH', 'PROVERB'];
/** Loud enough that a candidate publish can never be mistaken for an approved one. */
const LOCAL_PROOF_MARKER = 'LOCAL_VERIFICATION_ONLY_NOT_AN_APPROVAL';
const LOCAL_PROOF_AT = '1970-01-01T00:00:00.000Z';
const LOCAL_PROOF_GENERATOR = {
  provider: LOCAL_PROOF_MARKER,
  model: LOCAL_PROOF_MARKER,
  modelVersion: LOCAL_PROOF_MARKER,
  termsVersion: LOCAL_PROOF_MARKER,
  generatedAt: LOCAL_PROOF_AT,
} as const;

/** Candidate mode never leaves this machine: it signs nothing, so it may only reach a loopback database. */
function assertLoopback(databaseUrl: string): void {
  const host = new URL(databaseUrl).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new TypeError(`--from-derived is local-only; ${host} is not a loopback host. Production publishes from content/learning/approvals/.`);
  }
}

function repositoryRoot(): string {
  return resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1'));
}

function readJson(root: string, path: string): Json {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Json;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function fileSha256(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

/** `publish_content_revision_v1` hashes the canonical JSON text, and excludes the attestation it is checking. */
function publicCanonicalJson(bundle: ApprovalBundle): string {
  return canonicalJson(bundle.publicContent);
}

function privateCanonicalJson(bundle: ApprovalBundle): string {
  const { privateSolutionHash: _omitted, ...rest } = bundle.privateSolution as Json & { privateSolutionHash?: unknown };
  return canonicalJson(rest);
}

/**
 * Repoints a bundle's assets at a different registered origin.
 *
 * `publish_content_revision_v1` accepts any origin in `private.content_asset_origins` for the
 * bundle's asset policy version, so the CDN is a deployment choice — but the URL is inside
 * `publicContent`, and `publicContent` is what the content hash covers. Moving origins
 * therefore mints a new revision, or the publish collides with `CONTENT_REVISION_CONFLICT`.
 * The id is derived from the old one and the origin so re-running is idempotent, and the
 * sha256 is untouched: the bytes are the integrity anchor, the origin is only where they live.
 */
export function repointAssets(bundle: ApprovalBundle, origin: string): ApprovalBundle {
  const trimmed = origin.replace(/\/+$/u, '');
  const publicContent: Json = { ...bundle.publicContent };
  for (const side of ['imageA', 'imageB'] as const) {
    const image = { ...(publicContent[side] as Json) };
    image['url'] = `${trimmed}/assets/${String(image['sha256'])}.png`;
    publicContent[side] = image;
  }
  const seed = sha256Hex(`${String(publicContent['contentRevisionId'])}\0${trimmed}`);
  const contentRevisionId = [
    seed.slice(0, 8), seed.slice(8, 12), `4${seed.slice(13, 16)}`,
    `${'89ab'[parseInt(seed[16] ?? '0', 16) % 4]}${seed.slice(17, 20)}`, seed.slice(20, 32),
  ].join('-');
  publicContent['contentRevisionId'] = contentRevisionId;
  const privateSolution: Json = { ...bundle.privateSolution, contentRevisionId };
  delete privateSolution['privateSolutionHash'];
  privateSolution['privateSolutionHash'] = sha256Hex(canonicalJson(privateSolution));
  return { ...bundle, publicContent, privateSolution };
}

function loadApprovedKeys(root: string): readonly string[] {
  const record = readJson(root, 'docs/decisions/2026-08-24-android-casual-content-approval.json');
  const keys = record['keys'];
  if (!Array.isArray(keys) || keys.length === 0) throw new TypeError('content approval record lists no keys');
  return keys.map((key) => String(key));
}

/**
 * Composes a publishable bundle the way `generate-preview-registry.js` composes the preview:
 * hitboxes from the artwork, word hunts from the curated file, everything else from the draft.
 * The drafts' own coordinates are not used — barely half of them sit on a real difference.
 *
 * This is local-only on purpose. It synthesises a rights manifest, and rights and education
 * approval are a person's signature, not a generated field. Production publishing reads
 * `content/learning/approvals/*.v1.json`, where a named human has already signed.
 */
export function buildCandidateBundle(root: string, key: string): ApprovalBundle {
  const draft = readJson(root, `content/learning/drafts/${key}.json`);
  const derived = (readJson(root, 'content/learning/derived-hitboxes.v1.json')['packs'] as Json)[key] as Json | undefined;
  const curated = (readJson(root, 'content/learning/word-hunts.curated.v1.json')['packs'] as Json)[key] as Json[] | undefined;
  const manifestEntry = (readJson(root, 'content/learning/manifest.v1.json')['entries'] as Json[])
    .find((entry) => entry['key'] === key);
  if (derived === undefined || derived['usable'] !== true) throw new TypeError(`${key}: no usable derived hitboxes`);
  if (curated === undefined) throw new TypeError(`${key}: no curated word hunts`);
  if (manifestEntry === undefined) throw new TypeError(`${key}: not in content/learning/manifest.v1.json`);

  // Take every difference the artwork actually holds, capped at what a board may carry.
  // Boards are no longer a fixed size, so a 16-difference picture ships 16.
  const ruleset = parseRuleset(readJson(root, 'config/ruleset.v1.json'));
  const points = (derived['differences'] as Json[]).slice(0, ruleset.content.maxDifferences);
  if (points.length < ruleset.content.minDifferences) {
    throw new TypeError(`${key}: artwork yields ${points.length} differences, the minimum board is ${ruleset.content.minDifferences}`);
  }
  const hardCount = hardDifferenceCount(ruleset.content, points.length);

  // The derivation emits clusters largest first, so the tail is the hardest to spot. Tiering
  // by that order keeps HARD meaning "small and easy to miss" rather than an arbitrary label.
  const differences = points.map((point, index) => ({
    objectiveId: String(point['id']),
    tier: index >= points.length - hardCount ? 'HARD' : 'NORMAL',
    hitboxes: {
      imageA: { cx: point['cx'], cy: point['cy'], r: point['r'] },
      imageB: { cx: point['cx'], cy: point['cy'], r: point['r'] },
    },
  }));

  // Most drafts omit `category` from publicContent and carry it only on the manifest entry.
  // The database requires the exact key set, so take the manifest's answer rather than fail.
  const publicContent: Json = { category: manifestEntry['category'], ...(draft['publicContent'] as Json) };
  const finalChallenge = (draft['privateSolution'] as Json)['finalChallenge'] as Json;
  const last = points[points.length - 1] as Json;
  const privateSolution: Json = {
    contentRevisionId: publicContent['contentRevisionId'],
    schemaVersion: '1.0.0',
    differences,
    wordHunts: curated.map((hunt) => ({
      missionId: String(hunt['missionId']),
      kind: String(hunt['kind']),
      publicPrompt: String(hunt['publicPrompt']),
      hitboxes: {
        imageA: { cx: hunt['cx'], cy: hunt['cy'], r: hunt['r'] },
        imageB: { cx: hunt['cx'], cy: hunt['cy'], r: hunt['r'] },
      },
    })),
    suddenDeath: {
      objectiveId: `sudden-${String(last['id'])}`,
      hitboxes: {
        imageA: { cx: last['cx'], cy: last['cy'], r: last['r'] },
        imageB: { cx: last['cx'], cy: last['cy'], r: last['r'] },
      },
    },
    // `hintLadder` is deliberately dropped: the database does not accept it, and nothing in
    // the server reads it — hints are revealed from `canonicalAnswer` inside Postgres.
    finalChallenge: {
      canonicalAnswer: finalChallenge['canonicalAnswer'],
      aliases: finalChallenge['aliases'],
      hintUnits: finalChallenge['hintUnits'],
      meaning: finalChallenge['meaning'],
    },
  };
  privateSolution['privateSolutionHash'] = sha256Hex(canonicalJson(privateSolution));

  const promptEvidence = (manifestEntry['promptEvidence'] as Json[] | undefined) ?? [];
  const rightsManifest: Json = {
    schemaVersion: '1.0.0',
    manifestSetId: `local-proof-${key}`,
    entries: (['imageA', 'imageB'] as const).map((side, index) => {
      const sha = String((publicContent[side] as Json)['sha256']);
      return {
        rightsRecordId: `local-proof-${key}-${side}`,
        assetSha256: sha,
        source: { kind: 'OWNED', sourceRecordId: `source-${key}-${side}`, sourceUri: `content/learning/source/${key}-${side === 'imageA' ? 'a' : 'b'}.png` },
        generator: LOCAL_PROOF_GENERATOR,
        prompt: {
          available: promptEvidence[index] !== undefined,
          sha256: promptEvidence[index] === undefined ? null : String(promptEvidence[index]['sha256']),
          unavailabilityReason: promptEvidence[index] === undefined ? 'BOUND_IN_REPO_PROMPT_EVIDENCE' : null,
        },
        rights: { status: 'APPROVED', licenseOrPermission: LOCAL_PROOF_MARKER, approverId: LOCAL_PROOF_MARKER, approvedAt: LOCAL_PROOF_AT },
        education: { status: 'APPROVED', reviewerId: LOCAL_PROOF_MARKER, reviewedAt: LOCAL_PROOF_AT },
        takedown: { ownerId: LOCAL_PROOF_MARKER, contact: LOCAL_PROOF_MARKER, runbookVersion: '1.0.0' },
      };
    }),
  };

  return {
    key,
    category: String(publicContent['category']),
    publicContent,
    privateSolution,
    rightsManifest,
    sourceFiles: [`content/learning/source/${key}-a.png`, `content/learning/source/${key}-b.png`],
  };
}

function loadBundle(root: string, key: string): ApprovalBundle {
  const raw = readJson(root, `content/learning/approvals/${key}.v1.json`);
  return {
    key,
    category: String(raw['category']),
    publicContent: raw['publicContent'] as Json,
    privateSolution: raw['privateSolution'] as Json,
    rightsManifest: raw['rightsManifest'] as Json,
    sourceFiles: (raw['sourceFiles'] as string[] | undefined) ?? [],
  };
}

function countBy(items: readonly unknown[], key: string, value: string): number {
  return items.filter((item) => (item as Json | null)?.[key] === value).length;
}

/**
 * The same predicates `private.publish_content_revision_v1` enforces, read from the ruleset
 * rather than repeated as literals. When the ruleset moves, this moves with it; when a pack
 * does not fit, the operator learns which pack and by how much before a transaction opens.
 */
export function preflight(root: string, bundles: readonly ApprovalBundle[]): readonly PackFinding[] {
  const ruleset = parseRuleset(readJson(root, 'config/ruleset.v1.json'));
  const content = ruleset.content;
  const expectedHunts = content.wordHunts;
  const schedule = ruleset.wordHuntSchedule;
  const expectedNormalHunts = schedule.filter((slot) => slot.kind === 'NORMAL').length;
  const expectedSpecialHunts = schedule.filter((slot) => slot.kind === 'SPECIAL').length;
  const findings: PackFinding[] = [];
  const add = (pack: string, check: string, detail: string) => findings.push({ pack, check, detail });

  const publicKeys = ['assetPolicyVersion', 'category', 'contentId', 'contentRevisionId', 'difficulty', 'imageA', 'imageB', 'language', 'schemaVersion', 'theme', 'version'];
  const imageKeys = ['encodedBytes', 'height', 'mimeType', 'sha256', 'url', 'width'];
  // Art defects are invisible to every other check here: a baked composition guide grid
  // produces a perfectly well-formed bundle whose picture a player cannot play. The
  // derivation already rejects those on evidence, so read its verdict rather than keep a
  // second list that can disagree with it.
  const derived = readJson(root, 'content/learning/derived-hitboxes.v1.json')['packs'] as Json;

  for (const bundle of bundles) {
    const verdict = derived[bundle.key] as Json | undefined;
    if (verdict === undefined) {
      add(bundle.key, 'ARTWORK_NOT_DERIVED', 'no entry in derived-hitboxes.v1.json; run pnpm content:hitboxes:derive');
    } else if (verdict['usable'] !== true) {
      add(bundle.key, 'ARTWORK_REJECTED', `derive-hitboxes rejected this artwork: ${String(verdict['reason'])}`);
    }
    // `PUBLIC_CONTENT_SHAPE_INVALID` names neither the pack nor the key it objected to.
    const actualPublicKeys = Object.keys(bundle.publicContent).sort();
    if (canonicalJson(actualPublicKeys) !== canonicalJson(publicKeys)) {
      const missing = publicKeys.filter((key) => !actualPublicKeys.includes(key));
      const extra = actualPublicKeys.filter((key) => !publicKeys.includes(key));
      add(bundle.key, 'PUBLIC_CONTENT_KEYS', `missing [${missing.join(', ')}] extra [${extra.join(', ')}]`);
    }
    for (const side of ['imageA', 'imageB'] as const) {
      const actual = Object.keys((bundle.publicContent[side] as Json | undefined) ?? {}).sort();
      if (canonicalJson(actual) !== canonicalJson(imageKeys)) {
        add(bundle.key, 'PUBLIC_IMAGE_KEYS', `${side} has [${actual.join(', ')}], needs [${imageKeys.join(', ')}]`);
      }
    }

    const differences = (bundle.privateSolution['differences'] as unknown[] | undefined) ?? [];
    const hunts = (bundle.privateSolution['wordHunts'] as unknown[] | undefined) ?? [];
    const normal = countBy(differences, 'tier', 'NORMAL');
    const hard = countBy(differences, 'tier', 'HARD');

    if (differences.length < content.minDifferences || differences.length > content.maxDifferences) {
      add(bundle.key, 'DIFFERENCE_COUNT', `${differences.length} differences, ruleset admits ${content.minDifferences}–${content.maxDifferences}`);
    } else {
      const expectedHard = hardDifferenceCount(content, differences.length);
      if (hard !== expectedHard) {
        add(bundle.key, 'HARD_TIER_COUNT', `${hard} HARD on a board of ${differences.length}, ruleset requires ${expectedHard}`);
      }
      if (normal !== differences.length - expectedHard) {
        add(bundle.key, 'NORMAL_TIER_COUNT', `${normal} NORMAL on a board of ${differences.length}, ruleset requires ${differences.length - expectedHard}`);
      }
    }
    if (hunts.length !== expectedHunts) {
      add(bundle.key, 'WORD_HUNT_COUNT', `${hunts.length} word hunts, ruleset requires ${expectedHunts}`);
    }
    if (countBy(hunts, 'kind', 'NORMAL') !== expectedNormalHunts) {
      add(bundle.key, 'WORD_HUNT_KINDS', `${countBy(hunts, 'kind', 'NORMAL')} NORMAL hunts, schedule requires ${expectedNormalHunts}`);
    }
    if (countBy(hunts, 'kind', 'SPECIAL') !== expectedSpecialHunts) {
      add(bundle.key, 'WORD_HUNT_KINDS', `${countBy(hunts, 'kind', 'SPECIAL')} SPECIAL hunts, schedule requires ${expectedSpecialHunts}`);
    }

    const objectiveIds = new Set(differences.map((item) => (item as Json)['objectiveId']));
    if (objectiveIds.size !== differences.length) {
      add(bundle.key, 'OBJECTIVE_IDS_UNIQUE', `${objectiveIds.size} distinct ids across ${differences.length} differences`);
    }

    const attested = String(bundle.privateSolution['privateSolutionHash'] ?? '');
    const computed = sha256Hex(privateCanonicalJson(bundle));
    if (attested !== computed) {
      add(bundle.key, 'PRIVATE_SOLUTION_HASH', `attested ${attested.slice(0, 12)}…, computed ${computed.slice(0, 12)}…`);
    }

    const entries = (bundle.rightsManifest['entries'] as Json[] | undefined) ?? [];
    const rightsHashes = entries.map((entry) => String(entry['assetSha256'])).sort();
    const imageHashes = ['imageA', 'imageB']
      .map((side) => String((bundle.publicContent[side] as Json | undefined)?.['sha256'] ?? ''))
      .sort();
    if (rightsHashes.length !== 2 || canonicalJson(rightsHashes) !== canonicalJson(imageHashes)) {
      add(bundle.key, 'RIGHTS_ASSET_BIJECTION', `rights covers ${rightsHashes.length} assets, images need exactly 2 matching`);
    }
    for (const entry of entries) {
      const rights = (entry['rights'] as Json | undefined)?.['status'];
      const education = (entry['education'] as Json | undefined)?.['status'];
      if (rights !== 'APPROVED' || education !== 'APPROVED') {
        add(bundle.key, 'RIGHTS_APPROVAL', `${String(entry['rightsRecordId'])} rights=${String(rights)} education=${String(education)}`);
      }
    }

    // `content_asset_origins` decides which origins may be served; the shape below is the
    // half the database cannot repair for you, since it derives the URL from the hash.
    for (const side of ['imageA', 'imageB'] as const) {
      const image = bundle.publicContent[side] as Json | undefined;
      const sha = String(image?.['sha256'] ?? '');
      const url = String(image?.['url'] ?? '');
      if (!url.endsWith(`/assets/${sha}.png`)) {
        add(bundle.key, 'ASSET_URL_SHAPE', `${side} url ${url} is not <origin>/assets/${sha.slice(0, 12)}….png`);
      }
    }

    for (const relative of bundle.sourceFiles) {
      const absolute = resolve(root, relative);
      const actual = fileSha256(absolute);
      if (actual === null) {
        add(bundle.key, 'SOURCE_FILE_MISSING', relative);
        continue;
      }
      const claimed = ['imageA', 'imageB']
        .map((side) => String((bundle.publicContent[side] as Json | undefined)?.['sha256'] ?? ''));
      if (!claimed.includes(actual)) {
        add(bundle.key, 'SOURCE_FILE_HASH', `${relative} hashes to ${actual.slice(0, 12)}…, which no published image claims`);
      }
    }
  }
  return findings;
}

async function publishBundles(client: Client, bundles: readonly ApprovalBundle[]) {
  const published: Array<{ key: string; contentRevisionId: string; contentHash: string; category: string }> = [];
  await client.query('set local role deployment_role');
  for (const bundle of bundles) {
    const publicJson = publicCanonicalJson(bundle);
    const rightsJson = canonicalJson(bundle.rightsManifest);
    // The submitted solution carries its attestation; the canonical binding is the same
    // document with that attestation removed, because it is what the attestation is over.
    const solutionJson = canonicalJson(bundle.privateSolution);
    const solutionBinding = privateCanonicalJson(bundle);
    const result = await client.query<{ content_revision_id: string }>(
      'select private.publish_content_revision_v1($1::jsonb,$2::jsonb,$3::jsonb,$4,$5,$6,$7)::text as content_revision_id',
      [publicJson, solutionJson, rightsJson, publicJson, solutionBinding, rightsJson, VALIDATOR_VERSION],
    );
    const contentRevisionId = result.rows[0]?.content_revision_id;
    if (!contentRevisionId) throw new TypeError(`${bundle.key}: publish returned no revision id`);
    published.push({
      key: bundle.key,
      contentRevisionId,
      // The client is handed this as `contentHash`, and `start_learning_attempt_v1` compares
      // it against the pin. It is the hash of the canonical text, not of the object.
      contentHash: sha256Hex(publicJson),
      category: bundle.category,
    });
  }
  await client.query('reset role');
  return published;
}

/**
 * The season is created through `private.create_casual_season_v1` rather than by inserting
 * rows, because that function is the thing that actually knows what a season must satisfy:
 * the policy row must already exist with matching hashes, the window must land on an
 * Asia/Seoul week boundary, all five pins must be distinct and pass
 * `learning_content_eligible_v1`, and the reward-settlement row has to exist alongside.
 * Writing the tables directly reproduces none of that.
 *
 * A casual season pins no pet catalog. `202608270001` made that legal; before it, the season's
 * foreign key into `private.pet_catalog_revisions` could only be satisfied by the test-only
 * economy publisher, so no casual season could exist on a deployed environment at all.
 */
async function createCasualSeason(client: Client, input: Readonly<{
  seasonId: string;
  rulesetHash: string;
  hintPolicyHash: string;
  competitionPolicyHash: string;
  revisionIds: readonly string[];
}>): Promise<{ startsAt: string; endsAt: string }> {
  const week = await client.query<{ starts_at: string; ends_at: string }>(
    `select (pg_catalog.date_trunc('week', pg_catalog.timezone('Asia/Seoul', pg_catalog.now())) at time zone 'Asia/Seoul') as starts_at,
            ((pg_catalog.date_trunc('week', pg_catalog.timezone('Asia/Seoul', pg_catalog.now())) + interval '7 days') at time zone 'Asia/Seoul') as ends_at`,
  );
  const { starts_at: startsAt, ends_at: endsAt } = week.rows[0]!;
  await client.query(
    'select private.create_casual_season_v1($1::uuid,$2::timestamptz,$3::timestamptz,$4,$5,$6,$7,null,null,$8::jsonb)',
    [input.seasonId, startsAt, endsAt, input.rulesetHash, input.hintPolicyHash, input.competitionPolicyHash, ATTEMPT_TTL_SECONDS, JSON.stringify(input.revisionIds)],
  );
  return { startsAt, endsAt };
}

async function main(): Promise<void> {
  const root = repositoryRoot();
  const apply = process.argv.includes('--apply');
  const databaseUrl = required('LEARNING_PUBLISH_DATABASE_URL');
  if (apply && process.env['LEARNING_PUBLISH_CONFIRMATION']?.trim() !== CONFIRMATION) {
    throw new TypeError(`--apply requires LEARNING_PUBLISH_CONFIRMATION=${CONFIRMATION}`);
  }

  const derivedFlag = process.argv.find((argument) => argument.startsWith('--from-derived='));
  let keys: readonly string[];
  let bundles: readonly ApprovalBundle[];
  if (derivedFlag === undefined) {
    keys = loadApprovedKeys(root);
    bundles = keys.map((key) => loadBundle(root, key));
    process.stdout.write(`approved packs: ${keys.join(', ')}\n`);
  } else {
    assertLoopback(databaseUrl);
    keys = derivedFlag.slice('--from-derived='.length).split(',').map((key) => key.trim()).filter(Boolean);
    bundles = keys.map((key) => buildCandidateBundle(root, key));
    process.stdout.write(`candidate packs (${LOCAL_PROOF_MARKER}): ${keys.join(', ')}\n`);
  }

  const originFlag = process.argv.find((argument) => argument.startsWith('--asset-origin='));
  if (originFlag !== undefined) {
    const origin = originFlag.slice('--asset-origin='.length);
    bundles = bundles.map((bundle) => repointAssets(bundle, origin));
    process.stdout.write(`assets repointed at ${origin} (new revision ids)\n`);
  }

  const findings = preflight(root, bundles);
  if (findings.length > 0) {
    process.stdout.write(`\npreflight rejected ${new Set(findings.map((f) => f.pack)).size} of ${bundles.length} packs:\n`);
    for (const finding of findings) {
      process.stdout.write(`  ${finding.pack.padEnd(24)} ${finding.check.padEnd(24)} ${finding.detail}\n`);
    }
    process.stdout.write('\nNo database write was attempted. Most of these mirror the database\'s own\n');
    process.stdout.write('predicates, so publishing would fail inside the transaction with the same\n');
    process.stdout.write('result. DEFECTIVE_ART does not: the database would accept that bundle, and\n');
    process.stdout.write('the picture is what a player cannot play.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`preflight passed for all ${bundles.length} packs\n`);
  if (!apply) {
    process.stdout.write('dry run — pass --apply to publish and pin a season\n');
    return;
  }

  const ruleset = parseRuleset(readJson(root, 'config/ruleset.v1.json'));
  const hint = parseHintPolicyV1WithHash(readJson(root, 'config/hint-policy.v1.json'));
  const weekly = parseWeeklyCompetitionV1WithHash(readJson(root, 'config/weekly-competition.v1.json'));
  const seasonId = process.env['LEARNING_PUBLISH_SEASON_ID']?.trim() || randomUUID();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('begin');
    const published = await publishBundles(client, bundles);
    const categories = [...new Set(published.map((entry) => entry.category))].sort();
    if (categories.length !== 1 || categories[0] !== 'ENGLISH') {
      throw new TypeError(`a casual season opens ENGLISH only; got ${categories.join(', ')}`);
    }
    if (published.length !== CHALLENGES_PER_CATEGORY) {
      throw new TypeError(`a season pins exactly ${CHALLENGES_PER_CATEGORY} challenges; got ${published.length}`);
    }

    // The policy row must list every category the schema knows, even when a season opens only
    // one of them: `learning_competition_policies` pins equality, `weekly_seasons` a subset.
    await client.query(
      `insert into private.learning_competition_policies(competition_policy_hash,ruleset_hash,hint_policy_hash,attempt_ttl_seconds,enabled_categories,challenges_per_category)
       values($1,$2,$3,$4,$5::text[],$6)
       on conflict do nothing`,
      [weekly.canonicalHash, rulesetHash(ruleset), hint.canonicalHash, ATTEMPT_TTL_SECONDS, POLICY_CATEGORIES, CHALLENGES_PER_CATEGORY],
    );
    const { startsAt, endsAt } = await createCasualSeason(client, {
      seasonId,
      rulesetHash: rulesetHash(ruleset),
      hintPolicyHash: hint.canonicalHash,
      competitionPolicyHash: weekly.canonicalHash,
      revisionIds: published.map((entry) => entry.contentRevisionId),
    });
    await client.query('commit');
    process.stdout.write(`\npublished ${published.length} revisions and pinned season ${seasonId}\n`);
    process.stdout.write(`${JSON.stringify({
      seasonId,
      startsAt,
      endsAt,
      categories,
      challengesPerCategory: CHALLENGES_PER_CATEGORY,
      rulesetHash: rulesetHash(ruleset),
      hintPolicyHash: hint.canonicalHash,
      competitionPolicyHash: weekly.canonicalHash,
      petCatalog: null,
      revisions: published,
    }, null, 2)}\n`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('publish-learning-season.ts')) {
  await main().catch((error: unknown) => {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
    process.stderr.write(`learning season publish failed (${code}): ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
