import { PgRpcError, type PgPoolLike } from '../database/pg-rpc.js';

/**
 * The worker's database surface. Separate module, separate allowlist, separate role.
 *
 * It would be less code to add these to `MobileRpcName` and reuse the existing client. That is
 * exactly what must not happen: the API's pool authenticates as a login that is a member of
 * `economy_server`, and `economy_server` has no grant on any function here. Sharing the client
 * would mean one connection string away from the service that faces the internet being able to
 * dispose of accounts.
 *
 * So the split is enforced twice — by the grants in 202608260003, and by there being no import
 * path from the API to this file.
 */
export type PrivacyWorkerRpcName =
  | 'claim_account_deletion_v1'
  | 'dispose_account_app_data_v1'
  | 'complete_deletion_stage_v1'
  | 'extend_account_deletion_lease_v1';

const statements: Record<PrivacyWorkerRpcName, string> = {
  claim_account_deletion_v1:
    'select private.claim_account_deletion_v1($1::uuid,$2::integer,$3::integer) response',
  dispose_account_app_data_v1:
    'select private.dispose_account_app_data_v1($1::uuid,$2::uuid,$3::bigint) response',
  complete_deletion_stage_v1:
    'select private.complete_deletion_stage_v1($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::text,$7::text) response',
  extend_account_deletion_lease_v1:
    'select private.extend_account_deletion_lease_v1($1::uuid,$2::uuid,$3::bigint,$4::integer) response',
};

/**
 * Outcomes the worker has to be able to branch on.
 *
 * `LEASE_LOST` in particular must survive as itself: flattened into DATABASE_UNAVAILABLE it looks
 * like an outage worth retrying, when it actually means another worker owns the request and this
 * one must stop touching it.
 */
const workerCodes = new Set([
  'LEASE_LOST',
  'DELETION_REQUEST_NOT_FOUND',
  'INVALID_REQUEST',
  'INVALID_STAGE',
  'INVALID_OUTCOME',
  'EFFECT_JOURNAL_IMMUTABLE',
]);

export interface PrivacyWorkerRpc {
  call(name: PrivacyWorkerRpcName, args: readonly unknown[]): Promise<unknown>;
}

export function createPrivacyWorkerRpc(pool: PgPoolLike): PrivacyWorkerRpc {
  return {
    async call(name, args) {
      const sql = statements[name];
      if (!sql) throw new TypeError('RPC_NOT_ALLOWED');
      const client = await pool.connect();
      let released = false;
      try {
        await client.query('begin');
        await client.query('set local role privacy_worker');
        const result = await client.query(sql, args);
        const response = result.rows[0]?.response;
        await client.query('commit');
        return response;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch (rollbackError) {
          const destroyError =
            rollbackError instanceof Error ? rollbackError : new Error('ROLLBACK_FAILED');
          client.release(destroyError);
          released = true;
        }
        const message = error instanceof Error ? error.message : '';
        throw new PgRpcError(workerCodes.has(message) ? message : 'DATABASE_UNAVAILABLE', {
          cause: error,
        });
      } finally {
        if (!released) client.release();
      }
    },
  };
}
