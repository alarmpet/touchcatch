import type { BearerVerifier } from '../auth/bearer.js';
import { AccountClosedError, type SubjectResolver } from '../auth/subject-resolver.js';
import type { AccountDeletionStore } from '../privacy/account-deletion-store.js';
import { isValidReceiptSecret, isValidIdempotencyKey } from '../privacy/account-deletion-store.js';
import { errorCodeOf, jsonResponse } from './errors.js';

export function createMeHandler(input: Readonly<{
  verifier: BearerVerifier;
  subjectResolver: SubjectResolver;
}>): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if ([...new URL(request.url).searchParams].length !== 0) return jsonResponse(400, { code: 'INVALID_REQUEST' });
      const principal = await input.verifier.verify(request);
      await input.subjectResolver.ensureAndResolve(principal.authenticatedUserId);
      return jsonResponse(200, { accountReady: true });
    } catch (error) {
      if (error instanceof AccountClosedError) return jsonResponse(410, { code: 'ACCOUNT_CLOSED' });
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonResponse(401, { code: 'UNAUTHORIZED' });
      return jsonResponse(503, { code: 'ACCOUNT_SETUP_FAILED' });
    }
  };
}

function deletionErrorResponse(error: unknown): Response {
  const code = error instanceof AccountClosedError ? 'ACCOUNT_CLOSED' : errorCodeOf(error);
  if (code === 'UNAUTHORIZED' || code === 'AUTH_SUBJECT_REQUIRED') return jsonResponse(401, { code });
  if (code === 'INVALID_REQUEST') return jsonResponse(400, { code });
  if (code === 'DELETION_REQUEST_NOT_FOUND') return jsonResponse(404, { code });
  if (code === 'DELETION_ALREADY_IN_PROGRESS' || code === 'IDEMPOTENCY_CONFLICT') return jsonResponse(409, { code });
  // Gone, not Forbidden: the receipt or the account is not coming back, and a client that reads
  // this as "try again later" will poll a request that no longer exists.
  if (code === 'RECEIPT_EXPIRED' || code === 'ACCOUNT_CLOSED') return jsonResponse(410, { code });
  return jsonResponse(503, { code: 'DELETION_UNAVAILABLE' });
}

async function readReceiptSecret(request: Request): Promise<string> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new Error('INVALID_REQUEST');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('INVALID_REQUEST');
  const receiptSecret = (body as Record<string, unknown>)['receiptSecret'];
  // The secret travels in the body and only in the body. A query parameter would put it in
  // access logs, and a header would put it in proxy logs; neither is somewhere a credential
  // that outlives the account should end up.
  if (!isValidReceiptSecret(receiptSecret)) throw new Error('INVALID_REQUEST');
  return receiptSecret;
}

/**
 * Accepts a deletion request and answers 202.
 *
 * 202 rather than 200 because nothing is finished yet — but it is not a promise either. The
 * request row and the access tombstone commit together before this returns, so by the time the
 * caller reads the status the account is already unusable. What remains is disposal, which runs
 * in a worker with its own credentials.
 *
 * Note what this does NOT do: resolve the subject through `ensureAndResolve`. That call now
 * rejects closed accounts, so routing the deletion request through it would make the second
 * attempt at the same deletion fail — exactly the retry a flaky network produces.
 */
export function createDeleteMeHandler(input: Readonly<{
  verifier: BearerVerifier;
  deletionStore: AccountDeletionStore;
}>): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if ([...new URL(request.url).searchParams].length !== 0) return jsonResponse(400, { code: 'INVALID_REQUEST' });
      const idempotencyKey = request.headers.get('idempotency-key');
      if (!isValidIdempotencyKey(idempotencyKey)) return jsonResponse(400, { code: 'INVALID_REQUEST' });
      const principal = await input.verifier.verify(request);
      const receiptSecret = await readReceiptSecret(request);
      const accepted = await input.deletionStore.request({
        authenticatedUserId: principal.authenticatedUserId,
        idempotencyKey,
        receiptSecret,
      });
      // The receipt secret is not echoed. The client already has it; sending it back would put
      // it in every response log between here and the device.
      return jsonResponse(202, { requestId: accepted.requestId, state: accepted.state });
    } catch (error) {
      return deletionErrorResponse(error);
    }
  };
}

/**
 * Resolves a receipt to the state of its request.
 *
 * POST rather than GET because the receipt secret is the credential, and a GET would carry it
 * in the URL. It is unauthenticated by design: after the auth stage completes there is no
 * session left to present, and that is precisely when someone wants to confirm it finished.
 */
export function createDeletionStatusHandler(input: Readonly<{
  deletionStore: AccountDeletionStore;
}>): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if ([...new URL(request.url).searchParams].length !== 0) return jsonResponse(400, { code: 'INVALID_REQUEST' });
      const receiptSecret = await readReceiptSecret(request);
      return jsonResponse(200, await input.deletionStore.readStatus(receiptSecret));
    } catch (error) {
      return deletionErrorResponse(error);
    }
  };
}
