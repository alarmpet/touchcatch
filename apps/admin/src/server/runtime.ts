import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { canonicalJson, canonicalJsonSha256, type ContentValidationResult } from '../../../../packages/contracts/src/index.js';
import { safeAuditEvent } from './audit.js';
import { createVerifiedAuthAdapter } from './auth.js';
import { parseAdminRuntimeEnv } from './env.js';
import { createAdminHandlers } from './handlers.js';
import { intakeMultipart } from './intake.js';
import { createSubmittedArtifactValidator } from './submitted-validator.js';

const env = parseAdminRuntimeEnv({ NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY, ADMIN_ALLOWED_ORIGIN: process.env.ADMIN_ALLOWED_ORIGIN, ADMIN_ATTESTATION_KEY: process.env.ADMIN_ATTESTATION_KEY, ADMIN_AUDIT_KEY: process.env.ADMIN_AUDIT_KEY, ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL, CONTENT_ASSET_ORIGINS: process.env.CONTENT_ASSET_ORIGINS });
const pool = new Pool({ connectionString: env.ADMIN_DATABASE_URL, max: 4, statement_timeout: 10_000, ssl: { rejectUnauthorized: true } });
const validateSubmission = createSubmittedArtifactValidator(env.CONTENT_ASSET_ORIGINS);
const ref = (scope: string, value: string) => createHmac('sha256', env.ADMIN_ATTESTATION_KEY).update(`${scope}:${value}`).digest('base64url');
const auth = createVerifiedAuthAdapter({
  async verifyToken(token) {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }, cache: 'no-store' });
    const user = await response.json() as { id?: unknown };
    if (!response.ok || typeof user.id !== 'string') throw new Error('UNAUTHORIZED');
    return { actorId: user.id, tokenId: createHash('sha256').update(token).digest('hex') };
  },
  async loadSession(tokenId) {
    const result = await pool.query<{ session_id: string; actor_id: string; roles: string[] }>('select session_id,actor_id,roles from private.admin_sessions where token_hash=$1 and revoked_at is null and expires_at>clock_timestamp()', [tokenId]);
    const row = result.rows[0]; return row ? { sessionId: row.session_id, actorId: row.actor_id, roles: row.roles } : null;
  },
});
function requestProof(request: Request) { const cookie = /(?:^|;\s*)admin_csrf=([^;]+)/u.exec(request.headers.get('cookie') ?? '')?.[1] ?? null; return { authorization: request.headers.get('authorization'), origin: request.headers.get('origin'), csrfCookie: cookie, csrfHeader: request.headers.get('x-csrf-token') }; }
type Valid = Extract<ContentValidationResult, { ok: true }>;
function encode(payload: unknown) { const body = Buffer.from(canonicalJson(payload)).toString('base64url'); return `${body}.${createHmac('sha256', env.ADMIN_ATTESTATION_KEY).update(body).digest('base64url')}`; }
function decode(token: string) { const [body, signature, extra] = token.split('.'); if (!body || !signature || extra) throw new Error('ATTESTATION_INVALID'); const expected = createHmac('sha256', env.ADMIN_ATTESTATION_KEY).update(body).digest(); const actual = Buffer.from(signature, 'base64url'); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('ATTESTATION_INVALID'); return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>; }
function binding(submission: Awaited<ReturnType<typeof intakeMultipart>>, session: { actorId: string; sessionId: string }) { return { artifactHash: canonicalJsonSha256(submission.artifact), assetAHash: submission.assets.imageA.sha256, assetBHash: submission.assets.imageB.sha256, actorRef: ref('actor', session.actorId), sessionRef: ref('session', session.sessionId) }; }

export const adminHandlers = createAdminHandlers({
  authenticate: (request) => auth.authenticate(requestProof(request), env.ADMIN_ALLOWED_ORIGIN), intake: intakeMultipart, validate: validateSubmission,
  async issueAttestation(validation, session, submission) { return encode({ version: 1, ...binding(submission, session), rightsHash: validation.value.rightsManifestHash, issuedAt: Date.now(), expiresAt: Date.now() + 60_000, nonce: randomBytes(24).toString('base64url') }); },
  async publish({ submission, session, attestation, idempotencyKey }) {
    if (!/^[A-Za-z0-9_-]{8,128}$/u.test(idempotencyKey)) throw new Error('IDEMPOTENCY_KEY_INVALID');
    const payload = decode(attestation); const expected = binding(submission, session);
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= Date.now() || Object.entries(expected).some(([key, value]) => payload[key] !== value)) throw new Error('ATTESTATION_MISMATCH');
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
