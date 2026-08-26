import { MobileApiError } from '../api/mobile-api-transport';
import type {
  AccountDeletionAccepted,
  AccountDeletionStageName,
  AccountDeletionStageOutcome,
  AccountDeletionState,
  AccountDeletionStatus,
  DeletionTransport,
} from './account-deletion-client';

/**
 * Talks to the two deletion endpoints.
 *
 * Kept apart from `createMobileApiTransport` for one reason: that transport sources a bearer
 * token for every call and fails without one. Status lookup must work with no session at all —
 * that is its entire purpose, since the auth stage of a deletion removes the session it would
 * otherwise have used.
 */

const states = new Set<AccountDeletionState>([
  'ACCESS_BLOCKED', 'APP_DATA_DISPOSED', 'PROVIDERS_REVOKED', 'AUTH_DELETED', 'COMPLETED',
  'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'MANUAL_REVIEW', 'BLOCKED_LEGAL_HOLD',
]);
const stageNames = new Set<AccountDeletionStageName>(['APP_DATA', 'PROVIDERS', 'AUTH', 'NOTIFICATION']);
const stageOutcomes = new Set<AccountDeletionStageOutcome>([
  'PENDING', 'COMPLETED', 'NOT_APPLICABLE', 'FAILED_RETRYABLE', 'FAILED_PERMANENT',
]);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MobileApiError('RESPONSE_INVALID', null);
  }
  return value as Record<string, unknown>;
}

function parseStatus(value: unknown): AccountDeletionStatus {
  const row = record(value);
  const state = row['state'];
  const stagesValue = row['stages'];
  const requestId = row['requestId'];
  const updatedAt = row['updatedAt'];
  const receiptExpiresAt = row['receiptExpiresAt'];
  if (typeof state !== 'string' || !states.has(state as AccountDeletionState)) {
    throw new MobileApiError('RESPONSE_INVALID', null);
  }
  if (!Array.isArray(stagesValue)) throw new MobileApiError('RESPONSE_INVALID', null);
  if (typeof requestId !== 'string' || typeof updatedAt !== 'string' || typeof receiptExpiresAt !== 'string') {
    throw new MobileApiError('RESPONSE_INVALID', null);
  }
  const stages = stagesValue.map((entry) => {
    const stage = record(entry);
    const name = stage['name'];
    const outcome = stage['outcome'];
    if (typeof name !== 'string' || !stageNames.has(name as AccountDeletionStageName)) {
      throw new MobileApiError('RESPONSE_INVALID', null);
    }
    if (typeof outcome !== 'string' || !stageOutcomes.has(outcome as AccountDeletionStageOutcome)) {
      throw new MobileApiError('RESPONSE_INVALID', null);
    }
    return { name: name as AccountDeletionStageName, outcome: outcome as AccountDeletionStageOutcome };
  });
  return { requestId, state: state as AccountDeletionState, retryable: row['retryable'] === true, stages, updatedAt, receiptExpiresAt };
}

function errorFrom(status: number, body: unknown): MobileApiError {
  const code = typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string'
    ? (body as { code: string }).code
    : `HTTP_${status}`;
  return new MobileApiError(code, status);
}

export function createDeletionTransport(input: Readonly<{
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>): DeletionTransport {
  const origin = new URL(input.baseUrl).origin;
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 15_000;

  async function send(path: string, method: 'DELETE' | 'POST', body: unknown, headers: Record<string, string>): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(`${origin}${path}`, {
        method,
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let parsed: unknown = null;
      try { parsed = await response.json() as unknown; } catch { parsed = null; }
      if (!response.ok) throw errorFrom(response.status, parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      throw new MobileApiError(timedOut ? 'NETWORK_TIMEOUT' : 'NETWORK_UNAVAILABLE', null);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async requestDeletion({ accessToken, idempotencyKey, receiptSecret }): Promise<AccountDeletionAccepted> {
      // The secret goes in the body, never the URL: a query string lands in every access log
      // between the device and the server.
      const parsed = record(await send('/v1/me', 'DELETE', { receiptSecret }, {
        authorization: `Bearer ${accessToken}`,
        'idempotency-key': idempotencyKey,
      }));
      const requestId = parsed['requestId'];
      if (typeof requestId !== 'string' || parsed['state'] !== 'ACCESS_BLOCKED') {
        throw new MobileApiError('RESPONSE_INVALID', null);
      }
      return { requestId, state: 'ACCESS_BLOCKED' };
    },

    async readStatus(receiptSecret): Promise<AccountDeletionStatus> {
      // No authorization header. There may be no session left, and that is the normal case.
      return parseStatus(await send('/v1/me/deletion-status', 'POST', { receiptSecret }, {}));
    },
  };
}
