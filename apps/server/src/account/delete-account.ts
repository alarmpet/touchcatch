import type { VerifiedIdentity } from '../auth/verify.js';

type DeletionResult = Readonly<{ jobId: string; status: 'DELETING'; policyPending: false }>;
type RequestInput = Readonly<{ authSub: string; idempotencyKey: string }>;
type Store = Readonly<{ request(input: RequestInput): Promise<DeletionResult> }>;
type Database = Readonly<{ query(text: string, values: readonly unknown[]): Promise<{ rows: Array<{ value: unknown }> }> }>;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function requestAccountDeletion(identity: VerifiedIdentity, idempotencyKey: string, store: Store): Promise<DeletionResult> {
  if (identity.isAnonymous) throw new Error('ANONYMOUS_FORBIDDEN');
  if (!uuidV4.test(idempotencyKey)) throw new Error('VALIDATION_FAILED');
  return store.request({ authSub: identity.authSub, idempotencyKey });
}

export function createAccountDeletionStore(database: Database): Store {
  return {
    async request(input) {
      const result = await database.query('select private.request_account_deletion_v1($1::uuid,$2::uuid) as value', [input.authSub, input.idempotencyKey]);
      const value = result.rows[0]?.value as { jobId?: unknown; status?: unknown; policyPending?: unknown } | undefined;
      if (typeof value?.jobId !== 'string' || value.status !== 'DELETING' || value.policyPending !== false) throw new Error('ACCOUNT_SETUP_FAILED');
      return { jobId: value.jobId, status: value.status, policyPending: value.policyPending };
    },
  };
}
