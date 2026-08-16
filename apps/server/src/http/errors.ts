import { PgRpcError } from '../database/pg-rpc.js';

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export function petErrorResponse(error: unknown): Response {
  const code = error instanceof PgRpcError ? error.code : error instanceof Error ? error.message : '';
  if (code === 'UNAUTHORIZED' || code === 'AUTH_SUBJECT_REQUIRED') return jsonResponse(401, { code: code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : code });
  if (code === 'NOT_OWNED') return jsonResponse(404, { code });
  if (['IDEMPOTENCY_CONFLICT', 'POLICY_MISMATCH', 'INSUFFICIENT_DUPLICATES', 'COSMETIC_REWARD_POLICY_REQUIRED'].includes(code)) return jsonResponse(409, { code });
  if (code === 'INVALID_MATERIALS' || code === 'INVALID_REQUEST') return jsonResponse(400, { code });
  return jsonResponse(503, { code: 'DATABASE_UNAVAILABLE' });
}

export function errorCodeOf(error: unknown): string {
  return error instanceof PgRpcError ? error.code : error instanceof Error ? error.message : '';
}

const attemptNotFound = ['ATTEMPT_NOT_FOUND', 'SEASON_NOT_FOUND', 'CHALLENGE_PIN_MISMATCH', 'OBJECTIVE_NOT_FOUND'];
const attemptConflict = [
  'IDEMPOTENCY_CONFLICT', 'POLICY_MISMATCH', 'ATTEMPT_TERMINAL',
  'SEASON_NOT_OPEN', 'SELECTED_PET_REQUIRED', 'ASSETS_NOT_READY',
  'RANKING_POLICY_NOT_APPROVED', 'HINT_POLICY_NOT_APPROVED', 'RULESET_NOT_APPROVED',
];
const attemptInvalid = ['INVALID_REQUEST', 'INVALID_ATTEMPT_START', 'INVALID_VERIFIED_METRICS'];

export function attemptErrorResponse(error: unknown): Response {
  const code = errorCodeOf(error);
  if (code === 'UNAUTHORIZED' || code === 'AUTH_SUBJECT_REQUIRED') return jsonResponse(401, { code });
  if (attemptNotFound.includes(code)) return jsonResponse(404, { code });
  if (attemptConflict.includes(code)) return jsonResponse(409, { code });
  if (attemptInvalid.includes(code)) return jsonResponse(400, { code });
  return jsonResponse(503, { code: 'DATABASE_UNAVAILABLE' });
}
