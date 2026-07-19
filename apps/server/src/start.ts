import { Pool } from 'pg';
import { parseServerEnv } from '../../../packages/config/src/env.js';
import { createAccessTokenVerifier } from './auth/verify.js';
import { createNodeServer } from './http/node-adapter.js';
import { createAppServerDatabase, createServerRuntime } from './runtime.js';

const env = parseServerEnv({ PORT: process.env.PORT, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY, DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL, SENTRY_DSN: process.env.SENTRY_DSN }, process.env.NODE_ENV === 'production' ? 'production' : 'development');
const database = new Pool({ connectionString: env.DATABASE_URL });
const appDatabase = createAppServerDatabase(database);
const verifier = createAccessTokenVerifier({ supabaseUrl: env.SUPABASE_URL, async loadJwks() { const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/u, '')}/auth/v1/.well-known/jwks.json`); if (!response.ok) throw new Error('JWKS_FETCH_FAILED'); return await response.json() as { keys: JsonWebKey[] }; } });
const server = createNodeServer(createServerRuntime({ database: appDatabase, verifyAccessToken: (token) => verifier.verifyAccessToken(token) }));
server.listen(env.PORT);
const shutdown = () => server.close(() => { void database.end().finally(() => process.exit(0)); });
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
