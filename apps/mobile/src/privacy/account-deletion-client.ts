/**
 * The device half of account deletion.
 *
 * The ordering here is the whole design. The receipt secret is generated and *written to
 * storage before the network call goes out*, because the failure that matters is not "the
 * request was refused" — it is "the request succeeded and the app forgot the only credential
 * that can ask whether it finished". After the auth stage completes there is no session left
 * to authenticate with, so a lost receipt means the person can never see their own deletion
 * complete.
 */

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

export type AccountDeletionStageName = 'APP_DATA' | 'PROVIDERS' | 'AUTH' | 'NOTIFICATION';
export type AccountDeletionStageOutcome =
  | 'PENDING' | 'COMPLETED' | 'NOT_APPLICABLE' | 'FAILED_RETRYABLE' | 'FAILED_PERMANENT';

export type AccountDeletionAccepted = Readonly<{ requestId: string; state: 'ACCESS_BLOCKED' }>;

export type AccountDeletionStatus = Readonly<{
  requestId: string;
  state: AccountDeletionState;
  retryable: boolean;
  stages: readonly Readonly<{ name: AccountDeletionStageName; outcome: AccountDeletionStageOutcome }>[];
  updatedAt: string;
  receiptExpiresAt: string;
}>;

/**
 * Where the receipt lives.
 *
 * Deliberately NOT the key prefix the session purge sweeps. Signing out must not throw away the
 * receipt: that is precisely the moment the person still needs it.
 */
export const RECEIPT_STORAGE_KEY = 'touchcatch.privacy.deletion-receipt.v1';

export type StoredReceipt = Readonly<{
  receiptSecret: string;
  requestId: string;
  createdAt: string;
}>;

export interface ReceiptStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface DeletionTransport {
  requestDeletion(input: Readonly<{
    accessToken: string;
    idempotencyKey: string;
    receiptSecret: string;
  }>): Promise<AccountDeletionAccepted>;
  readStatus(receiptSecret: string): Promise<AccountDeletionStatus>;
}

export class AccountDeletionClientError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AccountDeletionClientError';
  }
}

const hex = '0123456789abcdef';

/** 256 bits, lowercase hex — the exact shape the server's `^[0-9a-f]{64}$` check expects. */
export function encodeReceiptSecret(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new AccountDeletionClientError('RECEIPT_SECRET_LENGTH_INVALID');
  let out = '';
  for (const byte of bytes) out += hex[(byte >> 4) & 0xf]! + hex[byte & 0xf]!;
  return out;
}

export function parseStoredReceipt(raw: string | null): StoredReceipt | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const receiptSecret = record['receiptSecret'];
  const requestId = record['requestId'];
  const createdAt = record['createdAt'];
  if (typeof receiptSecret !== 'string' || !/^[0-9a-f]{64}$/u.test(receiptSecret)) return null;
  if (typeof requestId !== 'string' || typeof createdAt !== 'string') return null;
  return { receiptSecret, requestId, createdAt };
}

export interface AccountDeletionClient {
  /** The receipt from a deletion already requested on this device, if there is one. */
  readSavedReceipt(): Promise<StoredReceipt | null>;
  requestDeletion(accessToken: string): Promise<AccountDeletionAccepted>;
  readStatus(receiptSecret: string): Promise<AccountDeletionStatus>;
  forgetReceipt(): Promise<void>;
}

export function createAccountDeletionClient(dependencies: Readonly<{
  transport: DeletionTransport;
  storage: ReceiptStorage;
  randomBytes(byteCount: number): Uint8Array | Promise<Uint8Array>;
  newIdempotencyKey(): string;
  now?(): Date;
}>): AccountDeletionClient {
  const now = dependencies.now ?? (() => new Date());

  return {
    async readSavedReceipt() {
      return parseStoredReceipt(await dependencies.storage.getItem(RECEIPT_STORAGE_KEY));
    },

    async requestDeletion(accessToken) {
      // A deletion already requested on this device wins. Starting a second one would mint a
      // second receipt and orphan the first, leaving the person holding a credential for a
      // request they can no longer name.
      const existing = parseStoredReceipt(await dependencies.storage.getItem(RECEIPT_STORAGE_KEY));
      if (existing !== null) throw new AccountDeletionClientError('DELETION_ALREADY_REQUESTED');

      const receiptSecret = encodeReceiptSecret(await dependencies.randomBytes(32));
      const idempotencyKey = dependencies.newIdempotencyKey();

      // Persist BEFORE the network call. If the app dies between here and the response, the
      // receipt is still on disk and the same idempotency key replays onto the same request.
      // Doing this after the call would mean a crash loses the only way to check the outcome.
      await dependencies.storage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify({
        receiptSecret,
        requestId: '',
        createdAt: now().toISOString(),
      } satisfies StoredReceipt));

      try {
        const accepted = await dependencies.transport.requestDeletion({ accessToken, idempotencyKey, receiptSecret });
        await dependencies.storage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify({
          receiptSecret,
          requestId: accepted.requestId,
          createdAt: now().toISOString(),
        } satisfies StoredReceipt));
        return accepted;
      } catch (error) {
        // The secret stays on disk. The request may well have committed on the server before
        // the response was lost, and discarding the receipt here would strand it.
        throw error instanceof AccountDeletionClientError
          ? error
          : new AccountDeletionClientError(error instanceof Error ? error.message : 'DELETION_REQUEST_FAILED');
      }
    },

    async readStatus(receiptSecret) {
      return dependencies.transport.readStatus(receiptSecret);
    },

    async forgetReceipt() {
      await dependencies.storage.removeItem(RECEIPT_STORAGE_KEY);
    },
  };
}
