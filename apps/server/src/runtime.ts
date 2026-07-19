import { createAccountStore } from './account/ensure-account.js';
import { createAccountDeletionStore, requestAccountDeletion } from './account/delete-account.js';
import { createProfileStore, updateProfile } from './account/update-profile.js';
import type { VerifiedIdentity } from './auth/verify.js';
import { createHttpRouter } from './http/router.js';
import { createLearningProgressStore, mergeLearningProgress } from './learning/merge-progress.js';

type Database = Readonly<{ query(text: string, values: readonly unknown[]): Promise<{ rows: Array<{ value: unknown }> }> }>;
type DatabaseClient = Readonly<{
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<{ value: unknown }> }>;
  release(): void;
}>;
type DatabasePool = Readonly<{ connect(): Promise<DatabaseClient> }>;

export function createAppServerDatabase(pool: DatabasePool): Database {
  return {
    async query(text, values) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('set local role app_server');
        const result = await client.query(text, values);
        await client.query('commit');
        return result;
      } catch (error) {
        try { await client.query('rollback'); } catch { /* preserve the original query error */ }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function createServerRuntime(dependencies: Readonly<{ database: Database; verifyAccessToken(token: string): Promise<VerifiedIdentity> }>) {
  const accounts = createAccountStore(dependencies.database);
  const progress = createLearningProgressStore(dependencies.database);
  const profiles = createProfileStore(dependencies.database);
  const deletion = createAccountDeletionStore(dependencies.database);
  return createHttpRouter({
    verifyAccessToken: dependencies.verifyAccessToken,
    ensureAccount: (authSub) => accounts.ensureAccount(authSub),
    readMe: (authSub) => accounts.readMe(authSub),
    mergeProgress: (identity, idempotencyKey, body) => mergeLearningProgress(identity, idempotencyKey, body, progress),
    updateProfile: (identity, idempotencyKey, body) => updateProfile(identity, idempotencyKey, body, profiles),
    requestAccountDeletion: (identity, idempotencyKey) => requestAccountDeletion(identity, idempotencyKey, deletion),
  });
}
