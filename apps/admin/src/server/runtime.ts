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
import { createAdminSessionBootstrap, createCookieSessionAuth } from './auth.js';
import { isProvenDatabaseRejection, resolvePublishAfterTransportFailure } from './publish-protocol.js';

const env = parseAdminRuntimeEnv({ NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ADMIN_ALLOWED_ORIGIN: process.env.ADMIN_ALLOWED_ORIGIN, ADMIN_ATTESTATION_KEY: process.env.ADMIN_ATTESTATION_KEY, ADMIN_AUDIT_KEY: process.env.ADMIN_AUDIT_KEY, ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL, CONTENT_ASSET_ORIGINS: process.env.CONTENT_ASSET_ORIGINS });
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
    const artifactRef = `artifact:${ref('artifact', canonicalJsonSha256(submission.artifact)).slice(0, 32)}`;
    const claimed = await pool.query<{ claim: { disposition: 'OWNER'|'REPLAY'|'IN_FLIGHT'|'CONFLICT'; fence?: number; result?: { contentRevisionId?: string } } }>('select private.claim_admin_publish_v1($1,$2,$3,$4,$5)::jsonb as claim', [idempotencyKey, requestHash, tokenHash, ownerId, 30]);
    const claim = claimed.rows[0]?.claim;
    if (claim?.disposition === 'CONFLICT') throw new Error('IDEMPOTENCY_CONFLICT');
    if (claim?.disposition === 'IN_FLIGHT') throw new Error('OUTCOME_UNKNOWN:RETRY_SAME_KEY');
    if (claim?.disposition === 'REPLAY' && claim.result?.contentRevisionId) { const contentRevisionId=claim.result.contentRevisionId; return { publishId:`content:${contentRevisionId}`,contentRevisionId }; }
    if (claim?.disposition !== 'OWNER' || !Number.isSafeInteger(claim.fence)) throw new Error('OUTCOME_UNKNOWN:RETRY_SAME_KEY');
    try {
      const result = await pool.query<{ content_revision_id: string }>('select private.complete_admin_publish_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)::text as content_revision_id', [idempotencyKey,requestHash,ownerId,claim.fence,v.publicContent,v.privateSolution,v.rightsManifest,v.publicContentCanonicalJson,v.privateSolutionCanonicalJson,v.rightsManifestCanonicalJson,expected.actorRef,expected.sessionRef,artifactRef]);
      const contentRevisionId=result.rows[0]?.content_revision_id; if(!contentRevisionId) throw new Error('DEPLOYMENT_PUBLISH_EMPTY_RESULT');
      return { publishId:`content:${contentRevisionId}`,contentRevisionId };
    } catch (error) {
      const resolution=await resolvePublishAfterTransportFailure(async()=>{const result=await pool.query<{receipt: {state:'PENDING'|'COMPLETED';requestHash:string;result:{contentRevisionId:string}|null}|null}>('select private.resolve_admin_publish_v1($1,$2)::jsonb as receipt',[idempotencyKey,requestHash]);return result.rows[0]?.receipt??null;},requestHash);
      if(resolution.kind==='SUCCESS') return {publishId:`content:${resolution.contentRevisionId}`,contentRevisionId:resolution.contentRevisionId};
      if(isProvenDatabaseRejection(error)) throw error;
      if(resolution.kind==='OUTCOME_UNKNOWN') throw new Error('OUTCOME_UNKNOWN:RETRY_SAME_KEY');
      throw error;
    }
  },
  async audit(event) { const artifactId = event.submission ? `artifact:${ref('artifact', canonicalJsonSha256(event.submission.artifact)).slice(0, 32)}` : `artifact:${randomBytes(18).toString('base64url')}`; const contentRevisionId = event.contentRevisionId ? `revision:${event.contentRevisionId}` : 'revision:unknown'; const safe = safeAuditEvent({ action: event.action as 'VALIDATION_FAILED' | 'VALIDATION_SUCCEEDED' | 'PUBLISH_FAILED' | 'PUBLISH_SUCCEEDED', actorId: event.session.actorId, sessionId: event.session.sessionId, artifactId, contentRevisionId, occurredAt: new Date().toISOString() }, env.ADMIN_AUDIT_KEY); await pool.query('select private.write_admin_publish_audit_v1($1,$2,$3,$4,$5,$6)', [safe.action, safe.actorRef, safe.sessionRef, safe.artifactId, safe.contentRevisionId, event.outcome]); },
});

export const bootstrapAdminSession=createAdminSessionBootstrap({allowedOrigin:env.ADMIN_ALLOWED_ORIGIN,verifyToken:token=>tokenVerifier.verifyToken(token),async createSession(value){await pool.query('select private.create_admin_session_v1($1,$2,$3)',[value.sessionId,value.sessionHash,value.actorId]);},randomToken:()=>randomBytes(24).toString('base64url'),hashSession:value=>createHash('sha256').update(value).digest('hex'),cookieHeaders:sessionCookieHeaders});
