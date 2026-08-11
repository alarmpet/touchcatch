import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';
import { validateEconomyBundleCore } from '../../packages/contracts/src/economy.schema.js';
import { parseWeeklyCompetitionV1WithHash } from '../../packages/contracts/src/learning-policy.js';
import { assertLocalAcceptanceEnvironment } from '../../apps/server/src/runtime/local-acceptance-guard.js';

const seasonId = '30000000-0000-4000-8000-000000000001';
const rulesetHash = 'd'.repeat(64);
const hintPolicyHash = 'e'.repeat(64);

function required(name: 'LOCAL_SUPABASE_URL' | 'LOCAL_DATABASE_URL' | 'LOCAL_AUTHENTICATED_USER_ID' | 'LOCAL_FIXTURE_OUTPUT'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as Record<string, unknown>;
}

function approvedTestBundle() {
  const metadata = {
    status: 'APPROVED',
    approvalDecisionId: 'TEST-DECISION',
    approvedBy: 'test-approver',
    approvedAt: '2026-08-11T00:00:00.000Z',
  } as const;
  const rawCatalog = json('config/pet-catalog.v1.json');
  const catalogRevision = 'local-android-task9-v1';
  const catalogHash = canonicalJsonSha256({
    schemaVersion: rawCatalog['schemaVersion'],
    catalogRevision,
    entries: rawCatalog['entries'],
  });
  const catalog: Record<string, unknown> = { ...rawCatalog, ...metadata, catalogRevision, catalogHash };
  const economy = {
    ...json('config/economy.v1.json'),
    economyVersion: '9.9.9',
    ...metadata,
    catalogRevision: catalog['catalogRevision'],
    catalogHash: catalog['catalogHash'],
  };
  const validated = validateEconomyBundleCore(economy, catalog, {});
  return {
    ...validated,
    publishEconomy: { ...validated.economy, economyHash: validated.economyHash },
    publishCatalog: { ...validated.catalog, catalogArtifactHash: validated.catalogArtifactHash },
  };
}

type SeedUser = Readonly<{ userId: string; nickname: string; scoreBase: number }>;

export async function prepareLocalAuthenticatedFixture(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') throw new TypeError('Local test fixtures are forbidden in production');
  const databaseUrl = required('LOCAL_DATABASE_URL');
  assertLocalAcceptanceEnvironment({
    marker: process.env['LOCAL_ACCEPTANCE_CONFIRMATION'],
    supabaseUrl: required('LOCAL_SUPABASE_URL'),
    databaseUrl,
  });
  const userId = required('LOCAL_AUTHENTICATED_USER_ID');
  const output = resolve(required('LOCAL_FIXTURE_OUTPUT'));
  const approvedRoot = resolve('D:\\tcbuild');
  if (output !== approvedRoot && !output.startsWith(`${approvedRoot}\\`)) throw new TypeError('LOCAL_FIXTURE_OUTPUT must be under D:\\tcbuild');
  const bundle = approvedTestBundle();
  const weekly = parseWeeklyCompetitionV1WithHash(json('config/weekly-competition.v1.json'));
  const mainPetId = bundle.catalog.entries[0]?.petId;
  const boundaryPetId = bundle.catalog.entries[1]?.petId;
  if (!mainPetId || !boundaryPetId) throw new TypeError('The local catalog needs at least two COMMON pets');
  const users: readonly SeedUser[] = [
    { userId, nickname: 'Local Learner', scoreBase: 110 },
    { userId: '91000000-0000-4000-8000-000000000011', nickname: 'Sky', scoreBase: 130 },
    { userId: '91000000-0000-4000-8000-000000000012', nickname: 'Miso', scoreBase: 120 },
    { userId: '91000000-0000-4000-8000-000000000013', nickname: 'Coco', scoreBase: 100 },
    { userId: '91000000-0000-4000-8000-000000000014', nickname: 'Luna', scoreBase: 90 },
  ];
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('begin');
    await client.query('select private.publish_economy_bundle_v1($1::jsonb, $2::jsonb)', [bundle.publishEconomy, bundle.publishCatalog]);
    for (const user of users.slice(1)) {
      await client.query(
        "insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2) on conflict(id) do nothing",
        [user.userId, `${user.nickname.toLowerCase()}-task9@example.test`],
      );
    }
    const subjects = new Map<string, string>();
    const selectedPets = new Map<string, string>();
    for (const user of users) {
      const subject = await client.query<{ subject_key: string }>(
        'select (private.ensure_mobile_account_v1($1::uuid) #>> \'{}\')::uuid subject_key',
        [user.userId],
      );
      const subjectKey = subject.rows[0]?.subject_key;
      if (!subjectKey) throw new TypeError('Unable to bootstrap local subject');
      subjects.set(user.userId, subjectKey);
      await client.query('update public.profiles set nickname=$2 where id=$1::uuid', [user.userId, user.nickname]);
      const selected = await client.query<{ user_pet_id: string }>(
        `insert into private.pet_inventory(subject_key,pet_id,rarity,copies,selected,locked,acquired_catalog_revision,acquired_catalog_hash)
         values($1::uuid,$2::uuid,'COMMON',1,true,false,$3,$4) returning user_pet_id`,
        [subjectKey, mainPetId, bundle.catalog.catalogRevision, bundle.catalog.catalogHash],
      );
      selectedPets.set(user.userId, selected.rows[0]!.user_pet_id);
    }
    const localSubject = subjects.get(userId)!;
    await client.query(
      `insert into private.pet_inventory(subject_key,pet_id,rarity,copies,selected,locked,acquired_catalog_revision,acquired_catalog_hash)
       values($1::uuid,$2::uuid,'COMMON',10,false,false,$3,$4),
             ($1::uuid,$2::uuid,'COMMON',3,false,true,$3,$4),
             ($1::uuid,$5::uuid,'COMMON',9,false,false,$3,$4),
             ($1::uuid,$5::uuid,'COMMON',1,false,true,$3,$4)`,
      [localSubject, mainPetId, bundle.catalog.catalogRevision, bundle.catalog.catalogHash, boundaryPetId],
    );
    await client.query(
      `insert into private.learning_competition_policies(competition_policy_hash,ruleset_hash,hint_policy_hash,attempt_ttl_seconds,enabled_categories,challenges_per_category)
       values($1,$2,$3,900,array['ENGLISH','PROVERB'],5)`,
      [weekly.canonicalHash, rulesetHash, hintPolicyHash],
    );
    await client.query(
      `insert into private.weekly_seasons(season_id,starts_at,ends_at,ruleset_hash,hint_policy_hash,competition_policy_hash,attempt_ttl_seconds,enabled_categories,challenges_per_category,pet_catalog_revision,pet_catalog_hash,response_body)
       values($1::uuid,'2026-08-10T15:00:00Z','2026-08-17T15:00:00Z',$2,$3,$4,900,array['ENGLISH','PROVERB'],5,$5,$6,'{}'::jsonb)`,
      [seasonId, rulesetHash, hintPolicyHash, weekly.canonicalHash, bundle.catalog.catalogRevision, bundle.catalog.catalogHash],
    );
    const pins: Array<{ category: 'ENGLISH' | 'PROVERB'; ordinal: number; revisionId: string; contentId: string; hash: string }> = [];
    await client.query('grant game_security_owner to postgres');
    for (const category of ['ENGLISH', 'PROVERB'] as const) {
      for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
        const revisionId = randomUUID();
        const contentId = randomUUID();
        const hash = `${category === 'ENGLISH' ? 'a' : 'b'}${String(ordinal).repeat(63)}`.slice(0, 64);
        pins.push({ category, ordinal, revisionId, contentId, hash });
        await client.query('set local role game_security_owner');
        await client.query(
          `insert into public.game_content_revisions(content_revision_id,content_id,version,schema_version,asset_policy_version,public_content,public_content_hash,status,approved_at,rights_manifest_set_id,validator_version)
           values($1::uuid,$2::uuid,1,'1.0.0','1.0.0',$3::jsonb,$4,'PUBLISHED','2026-08-10T00:00:00Z',$5,'1.0.0')`,
          [revisionId, contentId, JSON.stringify({ localFixture: true, category, ordinal }), hash, `task9-${category.toLowerCase()}-${ordinal}`],
        );
        await client.query('reset role');
        await client.query(
          `insert into private.weekly_challenge_pins(season_id,category,challenge_ordinal,content_revision_id,content_hash)
           values($1::uuid,$2,$3,$4::uuid,$5)`,
          [seasonId, category, ordinal, revisionId, hash],
        );
      }
    }
    await client.query('revoke game_security_owner from postgres');
    for (const [userIndex, user] of users.entries()) {
      for (const pin of pins) {
        const attemptId = randomUUID();
        const acceptedAt = new Date(Date.UTC(2026, 7, 11, 1, userIndex, pin.ordinal)).toISOString();
        const displayScore = user.scoreBase + pin.ordinal + (pin.category === 'PROVERB' ? 5 : 0);
        await client.query(
          `insert into private.learning_attempts(attempt_id,subject_key,season_id,category,content_revision_id,content_hash,mode,started_at,expires_at,assets_ready_at,completed_at,accepted_at,completion_ms,display_score,hints_used,wrong_taps,wrong_answers,selected_user_pet_id,selected_pet_catalog_id,pet_catalog_revision,pet_catalog_hash,ruleset_hash,hint_policy_hash,competition_policy_hash,event_digest,verification_status,start_idempotency_key,start_request_hash,completion_idempotency_key,completion_request_hash,terminal_response,terminal_at)
           values($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6,'RANKED','2026-08-11T00:00:00Z','2026-08-11T02:00:00Z',$7::timestamptz,$7::timestamptz,$7::timestamptz,$8,$9,$10,0,0,$11::uuid,$12::uuid,$13,$14,$15,$16,$17,$18,'COMPLETED_VERIFIED',$19::uuid,$20,$21::uuid,$22,$23::jsonb,$7::timestamptz)`,
          [attemptId, subjects.get(user.userId), seasonId, pin.category, pin.revisionId, pin.hash, acceptedAt, 1000 + pin.ordinal, displayScore, userIndex, selectedPets.get(user.userId), mainPetId, bundle.catalog.catalogRevision, bundle.catalog.catalogHash, rulesetHash, hintPolicyHash, weekly.canonicalHash, 'c'.repeat(64), randomUUID(), '8'.repeat(64), randomUUID(), '9'.repeat(64), JSON.stringify({ status: 'COMPLETED_VERIFIED' })],
        );
        await client.query(
          'insert into private.learning_best_records(subject_key,season_id,content_revision_id,attempt_id) values($1::uuid,$2::uuid,$3::uuid,$4::uuid)',
          [subjects.get(user.userId), seasonId, pin.revisionId, attemptId],
        );
      }
    }
    await client.query('commit');
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({
      classification: 'LOCAL_TEST_FIXTURE',
      seasonId,
      mainPetId,
      boundaryPetId,
      catalogRevision: bundle.catalog.catalogRevision,
      catalogHash: bundle.catalog.catalogHash,
      economyVersion: bundle.economy.economyVersion,
      economyHash: bundle.economyHash,
      competitionPolicyHash: weekly.canonicalHash,
      expectedRankRows: users.length,
      pinsPerEnabledCategory: 5,
    }, null, 2), 'utf8');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

void prepareLocalAuthenticatedFixture().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`local authenticated fixture preparation failed (${code}): ${message}\n`);
  process.exitCode = 1;
});
