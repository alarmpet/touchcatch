import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import type { ApprovedPetArtV1 } from '../../../packages/contracts/src/daily-pet-loop.js';
import { createSupabaseJwtVerifier } from './auth/supabase-jwt-verifier.js';
import type { BearerVerifier } from './auth/bearer.js';
import { createSubjectResolver } from './auth/subject-resolver.js';
import { createPgRpcClient, createSubjectResolutionRpc, type PgPoolLike } from './database/pg-rpc.js';
import { createMobileApiRouter } from './http/router.js';
import { createMobileApiHandlers, createPetHandlers } from './http/pet-handlers.js';
import { createRankingHandler } from './http/ranking-handler.js';
import { startNodeServer, type NodeServerHandle } from './http/node-server.js';
import { PostgresWeeklyCategoryBoard } from './learning/weekly-category-board.js';
import { PostgresPetRepository } from './pets/postgres-pet-repository.js';
import { loadMobileRuntimePolicy, type MobileRuntimePolicy } from './policy/mobile-runtime-policy.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export type RuntimeConfiguration = Readonly<{
  host: string;
  port: number;
  allowedOrigins: readonly string[];
  supabaseUrl: string;
  databaseUrl: string;
  policy: MobileRuntimePolicy;
}>;

export type RuntimePool = PgPoolLike & Readonly<{
  end(): Promise<void>;
  destroy(error: Error): void;
}>;

function required(env: NodeJS.ProcessEnv, name: 'SUPABASE_URL' | 'DATABASE_URL'): string {
  const value = env[name]?.trim();
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return 8787;
  if (!/^\d+$/u.test(value)) throw new TypeError('MOBILE_API_PORT must be an integer from 1 to 65535');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError('MOBILE_API_PORT must be an integer from 1 to 65535');
  }
  return port;
}

function parseDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('DATABASE_URL must be an absolute PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new TypeError('DATABASE_URL must use postgres:// or postgresql://');
  }
  return value;
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === '') return [];
  const origins = value.split(',').map((entry) => entry.trim());
  if (origins.some((entry) => entry === '')) throw new TypeError('MOBILE_API_ALLOWED_ORIGINS contains an empty origin');
  return origins.map((entry) => {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new TypeError('MOBILE_API_ALLOWED_ORIGINS must contain absolute HTTP origins');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash || url.origin !== entry) {
      throw new TypeError('MOBILE_API_ALLOWED_ORIGINS must contain exact credential-free HTTP origins');
    }
    return url.origin;
  });
}

function readJson(root: string, path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
}

export function loadRuntimeConfiguration(input: Readonly<{
  root?: string;
  env?: NodeJS.ProcessEnv;
}> = {}): RuntimeConfiguration {
  const root = resolve(input.root ?? repositoryRoot);
  const env = input.env ?? process.env;
  const supabaseUrl = required(env, 'SUPABASE_URL');
  const databaseUrl = parseDatabaseUrl(required(env, 'DATABASE_URL'));
  const policy = loadMobileRuntimePolicy({
    economy: readJson(root, 'config/economy.v1.json'),
    catalog: readJson(root, 'config/pet-catalog.v1.json'),
    dailyPetLoop: readJson(root, 'config/daily-pet-loop.v1.json'),
    weeklyCompetition: readJson(root, 'config/weekly-competition.v1.json'),
  });
  return {
    host: env['MOBILE_API_HOST']?.trim() || '127.0.0.1',
    port: parsePort(env['MOBILE_API_PORT']?.trim()),
    allowedOrigins: parseAllowedOrigins(env['MOBILE_API_ALLOWED_ORIGINS']),
    supabaseUrl,
    databaseUrl,
    policy,
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
    repository: new PostgresPetRepository(rpc, input.artForPet ?? (() => undefined)),
  });
  const ranking = createRankingHandler({
    verifier,
    subjectResolver,
    getPolicy: () => configuration.policy,
    board: new PostgresWeeklyCategoryBoard(rpc),
  });
  const router = createMobileApiRouter({
    handlers: createMobileApiHandlers(pets, ranking),
    allowedOrigins: configuration.allowedOrigins,
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
  })}\n`);
  await server.closed;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    process.stderr.write('mobile API failed to start\n');
    process.exitCode = 1;
  });
}
