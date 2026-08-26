import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import type { ApprovedPetArtV1 } from '../../../packages/contracts/src/daily-pet-loop.js';
import { parsePetCatalog } from '../../../packages/contracts/src/economy.schema.js';
import { parsePetRuntimeArtV1 } from '../../../packages/contracts/src/pet-runtime-art.js';
import {
  parseMobileApiEnv,
  type Environment,
} from '../../../packages/config/src/env.js';
import { createSupabaseJwtVerifier } from './auth/supabase-jwt-verifier.js';
import type { BearerVerifier } from './auth/bearer.js';
import { createSubjectResolver } from './auth/subject-resolver.js';
import { createPgRpcClient, createSubjectResolutionRpc, type PgPoolLike } from './database/pg-rpc.js';
import { createMobileApiRouter } from './http/router.js';
import { createMobileApiHandlers, createPetHandlers } from './http/pet-handlers.js';
import { createAttemptHandlers } from './http/attempt-handlers.js';
import { createMeHandler, createDeleteMeHandler, createDeletionStatusHandler } from './http/me-handler.js';
import { createAccountDeletionStore } from './privacy/account-deletion-store.js';
import { createRankingHandler } from './http/ranking-handler.js';
import { startNodeServer, type NodeServerHandle } from './http/node-server.js';
import { AttemptVerifierAdapter } from './learning/attempt-verifier.js';
import { PostgresAttemptRepository } from './learning/postgres-attempt-repository.js';
import { PostgresWeeklyCategoryBoard } from './learning/weekly-category-board.js';
import { PostgresPetRepository } from './pets/postgres-pet-repository.js';
import { loadMobileRuntimePolicy, type MobileRuntimePolicy } from './policy/mobile-runtime-policy.js';
import { artifactSha256 } from '../../../tools/check-pet-runtime-approval.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export type RuntimeConfiguration = Readonly<{
  host: string;
  port: number;
  allowedOrigins: readonly string[];
  supabaseUrl: string;
  databaseUrl: string;
  policy: MobileRuntimePolicy;
  artByPetId: ReadonlyMap<string, ApprovedPetArtV1>;
}>;

export type RuntimePool = PgPoolLike & Readonly<{
  end(): Promise<void>;
  destroy(error: Error): void;
}>;

function readJson(root: string, path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
}

function readOptionalJson(root: string, path: string): unknown {
  try { return readJson(root, path); } catch { return undefined; }
}

export function verifiedRuntimeAssetHashes(root: string, manifest: unknown): Readonly<Record<string, string | null>> {
  const entries = manifest && typeof manifest === 'object' && Array.isArray((manifest as { entries?: unknown }).entries)
    ? (manifest as { entries: Array<Record<string, unknown>> }).entries : [];
  const runtimeAssetRoot = resolve(root, 'content/pets/runtime');
  return Object.fromEntries(entries.flatMap((entry) => ['thumbnailFile', 'fullFile'].map((field) => {
    const path = entry[field]; const absolute = typeof path === 'string' ? resolve(root, path) : '';
    const inside = absolute.startsWith(`${runtimeAssetRoot}\\`) || absolute.startsWith(`${runtimeAssetRoot}/`);
    return [String(path), inside && existsSync(absolute) ? createHash('sha256').update(readFileSync(absolute)).digest('hex') : null];
  })));
}

export function loadRuntimeConfiguration(input: Readonly<{
  root?: string;
  env?: NodeJS.ProcessEnv;
  environment?: Environment;
}> = {}): RuntimeConfiguration {
  const root = resolve(input.root ?? repositoryRoot);
  const env = input.env ?? process.env;
  const parsedEnv = parseMobileApiEnv(env, input.environment);
  const supabaseUrl = parsedEnv.supabaseUrl;
  const databaseUrl = parsedEnv.databaseUrl;
  const economy = readJson(root, 'config/economy.v1.json');
  const catalog = readJson(root, 'config/pet-catalog.v1.json');
  const dailyPetLoop = readJson(root, 'config/daily-pet-loop.v1.json');
  const weeklyCompetition = readJson(root, 'config/weekly-competition.v1.json');
  const hintPolicy = readOptionalJson(root, 'config/hint-policy.v1.json');
  const ruleset = readOptionalJson(root, 'config/ruleset.v1.json');
  const petRuntimeArt = readOptionalJson(root, 'config/pet-runtime-art.v1.json');
  const sourceManifest = readOptionalJson(root, 'content/pets/source-manifest.v1.json');
  const rightsEvidence = readOptionalJson(root, 'config/pet-rights-evidence.v1.json');
  const approvalRecords = [
    'docs/approvals/pet-economy-v1-approval.json',
    'docs/approvals/daily-pet-loop-v1-approval.json',
    'docs/approvals/weekly-competition-v1-approval.json',
    'docs/approvals/pet-runtime-art-v1-approval.json',
  ].map((path) => readOptionalJson(root, path)).filter((value) => value !== undefined);
  const trustedApprovalSigners = readOptionalJson(root, 'config/trusted-approval-signers.v1.json');
  const computedSignerRegistrySha256 = trustedApprovalSigners === undefined
    ? undefined
    : artifactSha256(trustedApprovalSigners);
  const pinnedSignerRegistrySha256 = env['PET_APPROVAL_SIGNER_REGISTRY_SHA256']?.trim();
  if (pinnedSignerRegistrySha256 && computedSignerRegistrySha256
    && pinnedSignerRegistrySha256 !== computedSignerRegistrySha256) {
    throw new TypeError('PET_APPROVAL_SIGNER_REGISTRY_SHA256 does not match config/trusted-approval-signers.v1.json');
  }
  const trustedApprovalSignerRegistrySha256 = pinnedSignerRegistrySha256 ?? computedSignerRegistrySha256;
  const assetFileHashes = verifiedRuntimeAssetHashes(root, petRuntimeArt);
  const policy = loadMobileRuntimePolicy({
    economy, catalog, dailyPetLoop, weeklyCompetition, hintPolicy, ruleset, petRuntimeArt, sourceManifest, rightsEvidence, approvalRecords, trustedApprovalSigners, assetFileHashes,
    ...(trustedApprovalSignerRegistrySha256 === undefined ? {} : { trustedApprovalSignerRegistrySha256 }),
  });
  const artByPetId = new Map<string, ApprovedPetArtV1>();
  if (policy.rewards.enabled) {
    const art = parsePetRuntimeArtV1(petRuntimeArt, parsePetCatalog(catalog));
    for (const entry of art.entries) artByPetId.set(entry.petId, { thumbnailUrl: entry.thumbnailUrl, thumbnailSha256: entry.thumbnailSha256, fullUrl: entry.fullUrl, fullSha256: entry.fullSha256 });
  }
  return {
    host: parsedEnv.host,
    port: parsedEnv.port,
    allowedOrigins: parsedEnv.allowedOrigins,
    supabaseUrl,
    databaseUrl,
    policy,
    artByPetId,
  };
}

function adaptPool(pool: Pool, onIdleError: () => void): RuntimePool {
  const clients = new Map<PoolClient, { released: boolean }>();
  pool.on('error', () => {
    process.stderr.write('mobile API database idle client error\n');
    onIdleError();
  });
  return {
    async connect() {
      const client = await pool.connect();
      const state = { released: false };
      clients.set(client, state);
      return {
        async query(sql, values) {
          const result = await client.query(sql, values === undefined ? undefined : [...values]);
          return { rows: result.rows as readonly Record<string, unknown>[] };
        },
        release(error) {
          if (state.released) return;
          state.released = true;
          clients.delete(client);
          client.release(error);
        },
      };
    },
    async end() { await pool.end(); },
    destroy(error) {
      for (const [client, state] of clients) {
        state.released = true;
        client.release(error);
      }
      clients.clear();
    },
  };
}

export async function startMobileApiRuntime(input: Readonly<{
  configuration?: RuntimeConfiguration;
  signal?: AbortSignal;
  verifier?: BearerVerifier;
  pool?: RuntimePool;
  artForPet?(petId: string): ApprovedPetArtV1 | undefined;
  dependencyShutdownGraceMs?: number;
}> = {}): Promise<NodeServerHandle> {
  const configuration = input.configuration ?? loadRuntimeConfiguration();
  const runtimeAbort = new AbortController();
  if (input.signal?.aborted === true) runtimeAbort.abort();
  else input.signal?.addEventListener('abort', () => runtimeAbort.abort(), { once: true });
  const pool = input.pool ?? adaptPool(new Pool({
    connectionString: configuration.databaseUrl,
    max: 10,
    application_name: 'touchcatch_mobile_api',
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 10_000,
  }), () => runtimeAbort.abort());
  const rpc = createPgRpcClient(pool);
  const verifier = input.verifier ?? createSupabaseJwtVerifier({ supabaseUrl: configuration.supabaseUrl });
  const subjectResolver = createSubjectResolver(createSubjectResolutionRpc(rpc));
  const pets = createPetHandlers({
    verifier,
    subjectResolver,
    getPolicy: () => configuration.policy,
    repository: new PostgresPetRepository(rpc, input.artForPet ?? ((petId) => configuration.artByPetId.get(petId))),
  });
  const ranking = createRankingHandler({
    verifier,
    subjectResolver,
    getPolicy: () => configuration.policy,
    board: new PostgresWeeklyCategoryBoard(rpc),
  });
  const me = createMeHandler({ verifier, subjectResolver });
  const deletionStore = createAccountDeletionStore(rpc);
  const deleteMe = createDeleteMeHandler({ verifier, deletionStore });
  const readDeletionStatus = createDeletionStatusHandler({ deletionStore });
  const attempts = createAttemptHandlers({
    verifier,
    subjectResolver,
    getPolicy: () => configuration.policy,
    repository: new PostgresAttemptRepository(rpc),
    attemptVerifier: new AttemptVerifierAdapter(),
  });
  const router = createMobileApiRouter({
    handlers: createMobileApiHandlers(pets, me, ranking, attempts, { deleteMe, readDeletionStatus }),
    allowedOrigins: configuration.allowedOrigins,
    probeReadiness: async () => {
      if (!configuration.policy.attempts.enabled) {
        return { status: 'not_ready', code: 'ATTEMPTS_POLICY_DISABLED' };
      }
      try {
        const client = await pool.connect();
        try {
          await client.query('select 1', []);
        } finally {
          client.release();
        }
      } catch {
        return { status: 'not_ready', code: 'DATABASE_UNAVAILABLE' };
      }
      return { status: 'ready' };
    },
  });
  try {
    return await startNodeServer({
      fetch: router,
      host: configuration.host,
      port: configuration.port,
      signal: runtimeAbort.signal,
      ...(input.dependencyShutdownGraceMs === undefined ? {} : { dependencyShutdownGraceMs: input.dependencyShutdownGraceMs }),
      closeDependencies: async () => pool.end(),
      forceCloseDependencies: (error) => pool.destroy(error),
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function main(): Promise<void> {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  const configuration = loadRuntimeConfiguration();
  const server = await startMobileApiRuntime({ configuration, signal: controller.signal });
  process.stdout.write(`${JSON.stringify({
    event: 'mobile-api-listening',
    origin: server.origin,
    rewards: configuration.policy.rewards.enabled ? 'enabled' : configuration.policy.rewards.code,
    ranking: configuration.policy.ranking.enabled ? 'enabled' : configuration.policy.ranking.code,
    attempts: configuration.policy.attempts.enabled ? 'enabled' : configuration.policy.attempts.code,
  })}\n`);
  await server.closed;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    process.stderr.write('mobile API failed to start\n');
    process.exitCode = 1;
  });
}
