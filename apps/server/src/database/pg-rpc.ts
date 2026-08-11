export type MobileRpcName =
  | 'ensure_mobile_account_v1'
  | 'read_pet_inventory_v1'
  | 'read_weekly_category_board_v1'
  | 'claim_daily_free_draw_v1'
  | 'promote_duplicate_cards_v1';

const statements: Record<MobileRpcName, string> = {
  ensure_mobile_account_v1: 'select private.ensure_mobile_account_v1($1::uuid) response',
  read_pet_inventory_v1: 'select private.read_pet_inventory_v1($1::uuid,$2::text,$3::text) response',
  read_weekly_category_board_v1: 'select private.read_weekly_category_board_v1($1::uuid,$2::uuid,$3::text,$4::integer) response',
  claim_daily_free_draw_v1: 'select private.claim_daily_free_draw_v1($1::uuid,$2::text,$3::text,$4::text) response',
  promote_duplicate_cards_v1: 'select private.promote_duplicate_cards_v1($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::text,$7::text) response',
};

type QueryResult = Readonly<{ rows: readonly Record<string, unknown>[] }>;
export interface PgClientLike {
  query(sql: string, values?: readonly unknown[]): Promise<QueryResult>;
  release(): void;
}
export interface PgPoolLike { connect(): Promise<PgClientLike> }

export class PgRpcError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'PgRpcError';
  }
}

export interface MobileRpcClient {
  call(name: MobileRpcName, args: readonly unknown[]): Promise<unknown>;
}

export function createSubjectResolutionRpc(rpc: MobileRpcClient): {
  call(functionName: string, args: Record<string, unknown>): Promise<unknown>;
} {
  return {
    async call(functionName, args) {
      if (functionName !== 'private.ensure_mobile_account_v1'
        || typeof args.authenticatedUserId !== 'string') throw new TypeError('RPC_NOT_ALLOWED');
      return rpc.call('ensure_mobile_account_v1', [args.authenticatedUserId]);
    },
  };
}

const publicCodes = new Set([
  'AUTH_USER_REQUIRED', 'AUTH_SUBJECT_REQUIRED', 'POLICY_MISMATCH',
  'NOT_OWNED', 'IDEMPOTENCY_CONFLICT', 'INSUFFICIENT_DUPLICATES',
  'COSMETIC_REWARD_POLICY_REQUIRED', 'INVALID_MATERIALS',
  'RANKING_POLICY_NOT_APPROVED', 'INVALID_CATEGORY', 'INVALID_LIMIT',
]);

export function createPgRpcClient(pool: PgPoolLike): MobileRpcClient {
  return {
    async call(name: MobileRpcName, args: readonly unknown[]): Promise<unknown> {
      const sql = statements[name];
      if (!sql) throw new TypeError('RPC_NOT_ALLOWED');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('set local role economy_server');
        const result = await client.query(sql, args);
        await client.query('commit');
        return result.rows[0]?.response;
      } catch (error) {
        await client.query('rollback').catch(() => ({ rows: [] }));
        const message = error instanceof Error ? error.message : '';
        const code = publicCodes.has(message) ? message : 'DATABASE_UNAVAILABLE';
        throw new PgRpcError(code, { cause: error });
      } finally {
        client.release();
      }
    },
  };
}
