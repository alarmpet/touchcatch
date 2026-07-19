import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { createAccountWorkerDatabase, createDeletionAuthAdmin, createDeletionJobStore, createDeletionWorkerPoller, parseAccountWorkerEnv, runDeletionWorkerOnce } from './runtime.js';

const env = parseAccountWorkerEnv(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
const database = createAccountWorkerDatabase(pool);
const store = createDeletionJobStore(database);
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
const admin = createDeletionAuthAdmin(client.auth.admin);
let stopped = false;
const shutdown = () => { stopped = true; void pool.end().finally(() => process.exit(0)); };
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
const poll = createDeletionWorkerPoller({ runOnce: () => runDeletionWorkerOnce(env.ACCOUNT_WORKER_ID, admin, store), schedule(callback, delayMs) { if (!stopped) setTimeout(callback, delayMs).unref(); }, report(error) { process.stderr.write(`account worker retry: ${error.message}\n`); }, idleMs: 5_000, failureMs: 15_000 });
void poll();
