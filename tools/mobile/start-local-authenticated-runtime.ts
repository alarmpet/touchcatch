import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';
import type { ApprovedPetArtV1 } from '../../packages/contracts/src/daily-pet-loop.js';
import { validateEconomyBundleCore } from '../../packages/contracts/src/economy.schema.js';
import { parseWeeklyCompetitionV1WithHash } from '../../packages/contracts/src/learning-policy.js';
import { createLoopbackSupabaseJwtVerifier } from '../../apps/server/src/auth/loopback-supabase-jwt-verifier.js';
import { startMobileApiRuntime } from '../../apps/server/src/runtime.js';

function required(name: 'LOCAL_SUPABASE_URL' | 'LOCAL_DATABASE_URL'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as Record<string, unknown>;
}

function approvedTestBundle() {
  const rawCatalog = json('config/pet-catalog.v1.json');
  const catalogRevision = 'local-android-task9-v1';
  const catalogHash = canonicalJsonSha256({
    schemaVersion: rawCatalog['schemaVersion'],
    catalogRevision,
    entries: rawCatalog['entries'],
  });
  const catalog: Record<string, unknown> = {
    ...rawCatalog,
    catalogRevision,
    catalogHash,
    status: 'APPROVED',
    approvalDecisionId: 'TEST-DECISION',
    approvedBy: 'test-approver',
    approvedAt: '2026-08-11T00:00:00.000Z',
  };
  const economy = {
    ...json('config/economy.v1.json'),
    economyVersion: '9.9.9',
    status: 'APPROVED',
    catalogRevision: catalog['catalogRevision'],
    catalogHash: catalog['catalogHash'],
    approvalDecisionId: 'TEST-DECISION',
    approvedBy: 'test-approver',
    approvedAt: '2026-08-11T00:00:00.000Z',
  };
  return validateEconomyBundleCore(economy, catalog, {});
}

function localArt(petId: string): ApprovedPetArtV1 {
  const thumbnailUrl = `https://api.dicebear.com/9.x/fun-emoji/png?seed=${encodeURIComponent(petId)}&size=160`;
  const fullUrl = `https://api.dicebear.com/9.x/fun-emoji/png?seed=${encodeURIComponent(petId)}&size=512`;
  return {
    thumbnailUrl,
    thumbnailSha256: createHash('sha256').update(`local-thumbnail:${petId}`).digest('hex'),
    fullUrl,
    fullSha256: createHash('sha256').update(`local-full:${petId}`).digest('hex'),
  };
}

export async function startLocalAuthenticatedRuntime(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new TypeError('The loopback acceptance runtime is forbidden in production');
  }
  const bundle = approvedTestBundle();
  const weekly = parseWeeklyCompetitionV1WithHash(json('config/weekly-competition.v1.json'));
  const artByPetId = new Map(bundle.catalog.entries.map(({ petId }) => [petId, localArt(petId)]));
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  const portText = process.env['LOCAL_MOBILE_API_PORT']?.trim() || '18787';
  if (!/^\d+$/u.test(portText) || Number(portText) < 1 || Number(portText) > 65_535) {
    throw new TypeError('LOCAL_MOBILE_API_PORT must be an integer from 1 to 65535');
  }
  const enabled = {
    enabled: true as const,
    economyVersion: bundle.economy.economyVersion,
    economyHash: bundle.economyHash,
    catalogRevision: bundle.catalog.catalogRevision,
    catalogHash: bundle.catalog.catalogHash,
    competitionPolicyHash: weekly.canonicalHash,
  };
  const supabaseUrl = required('LOCAL_SUPABASE_URL');
  const server = await startMobileApiRuntime({
    configuration: {
      host: '127.0.0.1',
      port: Number(portText),
      allowedOrigins: [],
      supabaseUrl,
      databaseUrl: required('LOCAL_DATABASE_URL'),
      policy: { rewards: enabled, ranking: enabled },
      artByPetId,
    },
    verifier: createLoopbackSupabaseJwtVerifier({ supabaseUrl }),
    signal: controller.signal,
  });
  process.stdout.write(`${JSON.stringify({
    event: 'local-authenticated-mobile-api-listening',
    origin: server.origin,
    classification: 'LOCAL_ANDROID_AUTHENTICATED',
    rewards: 'test-fixture-enabled',
    ranking: 'test-fixture-enabled',
  })}\n`);
  await server.closed;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  void startLocalAuthenticatedRuntime().catch(() => {
    process.stderr.write('local authenticated mobile API failed to start\n');
    process.exitCode = 1;
  });
}
