import { describe, expect, it, vi } from 'vitest';
import {
  AccountDeletionClientError,
  createAccountDeletionClient,
  encodeReceiptSecret,
  parseStoredReceipt,
  RECEIPT_STORAGE_KEY,
  type DeletionTransport,
  type ReceiptStorage,
} from './account-deletion-client';
import { createLocalAuthPurge, PRESERVED_KEYS } from './local-auth-purge';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    storage: {
      getItem: vi.fn((key: string) => map.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { map.set(key, value); }),
      removeItem: vi.fn((key: string) => { map.delete(key); }),
    } satisfies ReceiptStorage & { removeItem: (key: string) => void },
  };
}

const bytes = new Uint8Array(32).fill(0xab);
const accepted = { requestId: '20000000-0000-4000-8000-000000000002', state: 'ACCESS_BLOCKED' as const };

function client(transport: Partial<DeletionTransport>, storageInit: Record<string, string> = {}) {
  const { map, storage } = memoryStorage(storageInit);
  const deletion = createAccountDeletionClient({
    transport: {
      requestDeletion: vi.fn().mockResolvedValue(accepted),
      readStatus: vi.fn(),
      ...transport,
    } as DeletionTransport,
    storage,
    randomBytes: () => bytes,
    newIdempotencyKey: () => 'deletion-key-0000001',
    now: () => new Date('2026-08-26T00:00:00Z'),
  });
  return { deletion, map, storage };
}

describe('account deletion client', () => {
  // The ordering this asserts is the reason the client exists. If the receipt were written
  // after the response, a crash mid-request would leave a deletion running on the server with
  // no way for the device to ever ask about it -- and after the auth stage there is no session
  // left to authenticate a different lookup with.
  it('persists the receipt before the request leaves the device', async () => {
    const order: string[] = [];
    const { map, storage } = memoryStorage();
    storage.setItem.mockImplementation((key: string, value: string) => { order.push('store'); map.set(key, value); });
    const deletion = createAccountDeletionClient({
      transport: {
        requestDeletion: vi.fn(async () => { order.push('network'); return accepted; }),
        readStatus: vi.fn(),
      },
      storage,
      randomBytes: () => bytes,
      newIdempotencyKey: () => 'deletion-key-0000001',
    });

    await deletion.requestDeletion('token');

    expect(order[0]).toBe('store');
    expect(order).toContain('network');
    expect(order.indexOf('store')).toBeLessThan(order.indexOf('network'));
  });

  it('keeps the receipt when the request fails, because the server may still have it', async () => {
    const { deletion, map } = client({
      requestDeletion: vi.fn().mockRejectedValue(new Error('NETWORK_TIMEOUT')),
    });

    await expect(deletion.requestDeletion('token')).rejects.toThrow(AccountDeletionClientError);

    const saved = parseStoredReceipt(map.get(RECEIPT_STORAGE_KEY) ?? null);
    expect(saved?.receiptSecret).toBe(encodeReceiptSecret(bytes));
  });

  it('refuses a second deletion while a receipt is already held', async () => {
    const existing = JSON.stringify({ receiptSecret: 'c'.repeat(64), requestId: 'r', createdAt: '2026-08-26T00:00:00Z' });
    const requestDeletion = vi.fn();
    const { deletion } = client({ requestDeletion }, { [RECEIPT_STORAGE_KEY]: existing });

    await expect(deletion.requestDeletion('token')).rejects.toThrow(/DELETION_ALREADY_REQUESTED/u);
    expect(requestDeletion).not.toHaveBeenCalled();
  });

  it('records the request id once the server names it', async () => {
    const { deletion, map } = client({});

    await expect(deletion.requestDeletion('token')).resolves.toEqual(accepted);
    expect(parseStoredReceipt(map.get(RECEIPT_STORAGE_KEY) ?? null)?.requestId).toBe(accepted.requestId);
  });

  it('encodes exactly 256 bits of lowercase hex and rejects anything else', () => {
    expect(encodeReceiptSecret(bytes)).toMatch(/^[0-9a-f]{64}$/u);
    expect(() => encodeReceiptSecret(new Uint8Array(16))).toThrow(AccountDeletionClientError);
  });

  it('treats a corrupt or truncated stored receipt as absent rather than usable', () => {
    expect(parseStoredReceipt(null)).toBeNull();
    expect(parseStoredReceipt('not json')).toBeNull();
    expect(parseStoredReceipt(JSON.stringify({ receiptSecret: 'short', requestId: 'r', createdAt: 'x' }))).toBeNull();
    expect(parseStoredReceipt(JSON.stringify({ receiptSecret: 'a'.repeat(64) }))).toBeNull();
  });
});

describe('local auth purge', () => {
  // Signing out must not throw away the receipt: that is the moment the person most needs it.
  it('never sweeps the deletion receipt', async () => {
    const { map, storage } = memoryStorage({ [RECEIPT_STORAGE_KEY]: JSON.stringify({ receiptSecret: 'a'.repeat(64), requestId: 'r', createdAt: 'x' }) });
    const purge = createLocalAuthPurge({ signOutLocal: vi.fn().mockResolvedValue(undefined), storage });

    await purge.purgeAll();

    expect(map.has(RECEIPT_STORAGE_KEY)).toBe(true);
    expect(PRESERVED_KEYS).toContain(RECEIPT_STORAGE_KEY);
    for (const call of storage.removeItem.mock.calls) expect(call[0]).not.toBe(RECEIPT_STORAGE_KEY);
  });

  // The old path swallowed sign-out failures and reported success anyway, telling people their
  // account was gone while their tokens sat on disk.
  it('reports which steps failed instead of claiming success', async () => {
    const { storage } = memoryStorage();
    const purge = createLocalAuthPurge({
      signOutLocal: vi.fn().mockRejectedValue(new Error('AUTH_SIGN_OUT_FAILED')),
      storage,
    });

    const outcome = await purge.purgeAll();

    expect(outcome).toEqual({ ok: false, failed: ['session'] });
    // The later step still ran; a failed sign-out is no reason to leave a pending PKCE
    // transaction behind.
    expect(storage.removeItem).toHaveBeenCalled();
  });
});
