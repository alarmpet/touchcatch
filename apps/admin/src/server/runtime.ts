import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { canonicalJson, canonicalJsonSha256, type ContentValidationResult } from '../../../../packages/contracts/src/index.js';
import { safeAuditEvent } from './audit.js';
import { parseAdminRuntimeEnv } from './env.js';
import { createAdminHandlers } from './handlers.js';
import { intakeMultipart } from './intake.js';
import { createSubmittedArtifactValidator } from './submitted-validator.js';
import { parseAttestation } from './attestation.js';
import { readSessionCookie, sessionCookieHeaders } from './session-cookie.js';
import { createCookieSessionAuth } from './auth.js';

const env = parseAdminRuntimeEnv({ NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY, ADMIN_ALLOWED_ORIGIN: process.env.ADMIN_ALLOWED_ORIGIN, ADMIN_ATTESTATION_KEY: process.env.ADMIN_ATTESTATION_KEY, ADMIN_AUDIT_KEY: process.env.ADMIN_AUDIT_KEY, ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL, CONTENT_ASSET_ORIGINS: process.env.CONTENT_ASSET_ORIGINS });
const pool = new Pool({ connectionString: env.ADMIN_DATABASE_URL, max: 4, statement_timeout: 10_000, ssl: { rejectUnauthorized: true } });
const validateSubmission = createSubmittedArtifactValidator(env.CONTENT_ASSET_ORIGINS);
const ref = (scope: string, value: string) => createHmac('sha256', env.ADMIN_ATTESTATION_KEY).update(`${scope}:${value}`).digest('base64url');
const tokenVerifier = {
  async verifyToken(token: string) {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }, cache: 'no-store' });
    const user = await response.json() as { id?: unknown; app_metadata?: { roles?: unknown } };
    if (!response.ok || typeof user.id !== 'string') throw new Error('UNAUTHORIZED');
    if (!Array.isArray(user.app_metadata?.roles) || !user.app_metadata.roles.includes('CONTENT_PUBLISHER')) throw new Error('FORBIDDEN');
    return { actorId: user.id, tokenId: createHash('sha256').update(token).digest('hex') };
  },
};
const cookieAuth = createCookieSessionAuth({ hashSession: (value) => createHash('sha256').update(value).digest('hex'), async loadSession(tokenHash) { const result = await pool.query<{ session_id: string; actor_id: string; roles: string[] }>('select session_id,actor_id,roles from private.lookup_admin_session_v1($1)', [tokenHash]); const row=result.rows[0]; return row ? { sessionId: row.session_id, actorId: row.actor_id, roles: row.roles } : null; } });
const auth = { authenticate(request: Request) { const cookie=/(?:^|;\s*)admin_csrf=([^;]+)/u.exec(request.headers.get('cookie') ?? '')?.[1] ?? null; return cookieAuth.authenticate({ sessionId: readSessionCookie(request.headers.get('cookie')), origin: request.headers.get('origin'), allowedOrigin: env.ADMIN_ALLOWED_ORIGIN, csrfCookie: cookie, csrfHeader: request.headers.get('x-csrf-token') }); } };
type Valid = Extract<ContentValidationResult, { ok: true }>;
function encode(payload: unknown) { const body = Buffer.from(canonicalJson(payload)).toString('base64url'); return `${body}.${createHmac('sha256', env.ADMIN_ATTESTATION_KEY).update(body).digest('base64url')}`; }
function decode(token: string) {
  const [body, signature, extra] = token.split('.'); if (!body || !signature || extra) throw new Error('ATTESTATION_INVALID');
  let raw: unknown; try { raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw new Error('ATTESTATION_INVALID'); }
  const payload = parseAttestation(raw, { now: Date.now(), keyId: 'admin-v1', maxTtlMs: 60_000, maxClockSkewMs: 5_000 });
  const expected = createHmac('sha256', env.ADMIN_ATTESTATION_KEY).update(body).digest(); const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('ATTESTATION_INVALID'); return payload;
}
function binding(submission: Awaited<ReturnType<typeof intakeMultipart>>, session: { actorId: string; sessionId: string }) { return { artifactHash: canonicalJsonSha256(submission.artifact), assetAHash: submission.assets.imageA.sha256, assetBHash: submission.assets.imageB.sha256, actorRef: ref('actor', session.actorId), sessionRef: ref('session', session.sessionId) }; }

export const adminHandlers = createAdminHandlers({
  authenticate: (request) => auth.authenticate(request), intake: intakeMultipart, validate: validateSubmission,
  async issueAttestation(validation, session, submission) { return encode({ version: 1, ...binding(submission, session), rightsHash: validation.value.rightsManifestHash, keyId: 'admin-v1', issuedAt: Date.now(), expiresAt: Date.now() + 60_000, nonce: randomBytes(24).toString('base64url') }); },
  async publish({ submission, session, attestation, idempotencyKey }) {
    if (!/^[A-Za-z0-9_-]{8,128}$/u.test(idempotencyKey)) throw new Error('IDEMPOTENCY_KEY_INVALID');
    const payload = decode(attestation); const expected = binding(submission, session);
    if (Object.entries(expected).some(([key, value]) => payload[key as keyof typeof payload] !== value)) throw new Error('ATTESTATION_MISMATCH');
    const validation = await validateSubmission(submission); if (!validation.ok) throw new Error('VALIDATION_FAILED');
    if (payload.rightsHash !== validation.value.rightsManifestHash) throw new Error('ATTESTATION_MISMATCH');
    const requestHash = canonicalJsonSha256({ ...expected, rightsHash: validation.value.rightsManifestHash });
    const tokenHash = createHash('sha256').update(attestation).digest('hex');
    const v: Valid['value'] = validation.value;
    const ownerId = `worker_${randomBytes(18).toString('base64url')}`;
    const result = await pool.query<{ content_revision_id: string }>('select private.publish_attested_content_revision_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)::text as content_revision_id', [idempotencyKey, requestHash, tokenHash, v.publicContent, v.privateSolution, v.rightsManifest, v.publicContentCanonicalJson, v.privateSolutionCanonicalJson, v.rightsManifestCanonicalJson, expected.actorRef, expected.sessionRef, ownerId]);
    const contentRevisionId = result.rows[0]?.content_revision_id; if (!contentRevisionId) throw new Error('DEPLOYMENT_PUBLISH_EMPTY_RESULT');
    return { publishId: `content:${contentRevisionId}`, contentRevisionId };
  },
  async audit(event) { const artifactId = event.submission ? `artifact:${ref('artifact', canonicalJsonSha256(event.submission.artifact)).slice(0, 32)}` : `event:${randomBytes(12).toString('base64url')}`; const contentRevisionId = event.contentRevisionId ? `revision:${event.contentRevisionId}` : 'revision:unknown'; const safe = safeAuditEvent({ action: event.action as 'VALIDATION_FAILED' | 'VALIDATION_SUCCEEDED' | 'PUBLISH_FAILED' | 'PUBLISH_SUCCEEDED', actorId: event.session.actorId, sessionId: event.session.sessionId, artifactId, contentRevisionId, occurredAt: new Date().toISOString() }, env.ADMIN_AUDIT_KEY); await pool.query('insert into private.admin_publish_audit(action,actor_ref,session_ref,artifact_id,content_revision_id,occurred_at,outcome) values($1,$2,$3,$4,$5,$6,$7)', [safe.action, safe.actorRef, safe.sessionRef, safe.artifactId, safe.contentRevisionId, safe.occurredAt, event.outcome]); },
});

export async function bootstrapAdminSession(request: Request): Promise<Response> {
  if (request.headers.get('origin') !== env.ADMIN_ALLOWED_ORIGIN) return Response.json({ ok: false }, { status: 403 });
  const match = /^Bearer ([A-Za-z0-9._~-]{8,4096})$/u.exec(request.headers.get('authorization') ?? '');
  if (!match) return Response.json({ ok: false }, { status: 401 });
  const verified = await tokenVerifier.verifyToken(match[1]!);
  const sessionId = randomBytes(24).toString('base64url'); const csrf = randomBytes(24).toString('base64url'); const hash = createHash('sha256').update(sessionId).digest('hex');
  await pool.query('select private.create_admin_session_v1($1,$2,$3)', [sessionId, hash, verified.actorId]);
  const response = Response.json({ ok: true, csrfToken: csrf });
  for (const cookie of sessionCookieHeaders(sessionId, csrf)) response.headers.append('set-cookie', cookie);
  return response;
}
