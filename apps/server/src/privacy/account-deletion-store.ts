import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The receipt secret never reaches the database, and never comes back to the client.
 *
 * The device generates 256 bits, writes them to its own secure storage, and only then sends
 * them. We keep the hash. That way a database dump does not hand anyone the ability to read
 * other people's deletion status, and there is no code path that could log the secret because
 * no response ever carries it.
 */
export function hashReceiptSecret(receiptSecret: string): string {
  return createHash('sha256').update(receiptSecret, 'utf8').digest('hex');
}

/** 256 bits, hex-encoded. Anything else is a client that got the contract wrong. */
const receiptSecretPattern = /^[0-9a-f]{64}$/u;
const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,128}$/u;

export function isValidReceiptSecret(value: unknown): value is string {
  return typeof value === 'string' && receiptSecretPattern.test(value);
}

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && idempotencyKeyPattern.test(value);
}

/**
 * Compares two hex digests without leaking how far the comparison got.
 *
 * A receipt hash is the only credential guarding deletion status after the auth user is gone,
 * so it gets the same treatment any other bearer credential would.
 */
export function receiptHashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export type AccountDeletionStageName = 'APP_DATA' | 'PROVIDERS' | 'AUTH' | 'NOTIFICATION';
export type AccountDeletionStageOutcome =
  | 'PENDING' | 'COMPLETED' | 'NOT_APPLICABLE' | 'FAILED_RETRYABLE' | 'FAILED_PERMANENT';

export type AccountDeletionState =
  | 'ACCESS_BLOCKED'
  | 'APP_DATA_DISPOSED'
  | 'PROVIDERS_REVOKED'
  | 'AUTH_DELETED'
  | 'COMPLETED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'
  | 'MANUAL_REVIEW'
  | 'BLOCKED_LEGAL_HOLD';

export type AccountDeletionAccepted = Readonly<{
  requestId: string;
  state: 'ACCESS_BLOCKED';
  replayed: boolean;
}>;

export type AccountDeletionStatus = Readonly<{
  requestId: string;
  state: AccountDeletionState;
  retryable: boolean;
  stages: readonly Readonly<{ name: AccountDeletionStageName; outcome: AccountDeletionStageOutcome }>[];
  updatedAt: string;
  receiptExpiresAt: string;
}>;

export interface AccountDeletionStore {
  request(input: Readonly<{
    authenticatedUserId: string;
    idempotencyKey: string;
    receiptSecret: string;
  }>): Promise<AccountDeletionAccepted>;
  readStatus(receiptSecret: string): Promise<AccountDeletionStatus>;
}

/**
 * The subset of the RPC client this store needs. Matching the repository pattern used elsewhere
 * keeps the allowlist in pg-rpc.ts as the single place that decides which functions exist.
 */
export interface AccountDeletionRpc {
  callParsed<T>(name: 'request_account_deletion_v1' | 'read_account_deletion_status_v1', args: readonly unknown[], parse: (value: unknown) => T): Promise<T>;
}

export class AccountDeletionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AccountDeletionError';
  }
}

const deletionStates = new Set<AccountDeletionState>([
  'ACCESS_BLOCKED', 'APP_DATA_DISPOSED', 'PROVIDERS_REVOKED', 'AUTH_DELETED', 'COMPLETED',
  'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'MANUAL_REVIEW', 'BLOCKED_LEGAL_HOLD',
]);
const stageOutcomes = new Set<AccountDeletionStageOutcome>([
  'PENDING', 'COMPLETED', 'NOT_APPLICABLE', 'FAILED_RETRYABLE', 'FAILED_PERMANENT',
]);
const stageNames = new Set<AccountDeletionStageName>(['APP_DATA', 'PROVIDERS', 'AUTH', 'NOTIFICATION']);

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AccountDeletionError('DELETION_STORE_UNAVAILABLE');
  }
  return value as Record<string, unknown>;
}

function parseStatus(value: unknown): AccountDeletionStatus {
  const row = asRecord(value);
  const state = row['state'];
  const stagesValue = row['stages'];
  if (typeof state !== 'string' || !deletionStates.has(state as AccountDeletionState)) {
    throw new AccountDeletionError('DELETION_STORE_UNAVAILABLE');
  }
  if (!Array.isArray(stagesValue)) throw new AccountDeletionError('DELETION_STORE_UNAVAILABLE');
  const stages = stagesValue.map((entry) => {
    const stage = asRecord(entry);
    const name = stage['name'];
    const outcome = stage['outcome'];
    if (typeof name !== 'string' || !stageNames.has(name as AccountDeletionStageName)) {
      throw new AccountDeletionError('DELETION_STORE_UNAVAILABLE');
    }
    if (typeof outcome !== 'string' || !stageOutcomes.has(outcome as AccountDeletionStageOutcome)) {
      throw new AccountDeletionError('DELETION_STORE_UNAVAILABLE');
    }
    return { name: name as AccountDeletionStageName, outcome: outcome as AccountDeletionStageOutcome };
  });
  const requestId = row['requestId'];
  const updatedAt = row['updatedAt'];
  const receiptExpiresAt = row['receiptExpiresAt'];
  if (typeof requestId !== 'string' || typeof updatedAt !== 'string' || typeof receiptExpiresAt !== 'string') {
    throw new AccountDeletionError('DELETION_STORE_UNAVAILABLE');
  }
  return {
    requestId,
    state: state as AccountDeletionState,
    retryable: row['retryable'] === true,
    stages,
    updatedAt,
    receiptExpiresAt,
  };
}

/**
 * How long a receipt stays resolvable.
 *
 * This is not a retention period for the person's data, and it is not a deadline for finishing
 * the deletion — Google sets no maximum for that, only "a reasonably quick period". It is how
 * long the device can keep asking whether its own request finished. The value is deliberately
 * generous relative to the work, so a stalled request is still visible to the person who made
 * it rather than expiring into silence.
 */
export const RECEIPT_TTL_DAYS = 30;

export function createAccountDeletionStore(rpc: AccountDeletionRpc): AccountDeletionStore {
  return {
    async request(input): Promise<AccountDeletionAccepted> {
      if (!isValidReceiptSecret(input.receiptSecret) || !isValidIdempotencyKey(input.idempotencyKey)) {
        throw new AccountDeletionError('INVALID_REQUEST');
      }
      return rpc.callParsed(
        'request_account_deletion_v1',
        [
          input.authenticatedUserId,
          input.idempotencyKey,
          hashReceiptSecret(input.receiptSecret),
          `${RECEIPT_TTL_DAYS} days`,
        ],
        (value) => {
          const accepted = asRecord(value);
          const requestId = accepted['requestId'];
          if (typeof requestId !== 'string' || accepted['state'] !== 'ACCESS_BLOCKED') {
            throw new AccountDeletionError('DELETION_STORE_UNAVAILABLE');
          }
          return { requestId, state: 'ACCESS_BLOCKED' as const, replayed: accepted['replayed'] === true };
        },
      );
    },
    async readStatus(receiptSecret): Promise<AccountDeletionStatus> {
      if (!isValidReceiptSecret(receiptSecret)) throw new AccountDeletionError('INVALID_REQUEST');
      return rpc.callParsed(
        'read_account_deletion_status_v1',
        [hashReceiptSecret(receiptSecret)],
        parseStatus,
      );
    },
  };
}
