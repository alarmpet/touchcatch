import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson, canonicalJsonSha256, type ContentValidationResult, type PrivateGameSolutionV1, type PublicGameContentV1, type RightsManifestSetV1 } from '../../../../packages/contracts/src/index.js';
import type { AdminPreviewDto, AdminPublishResultDto } from '../client/public-dto.js';

type Session = Readonly<{ actorId: string; sessionId: string; roles: readonly string[] }>;
type RequestProof = Readonly<{ origin: string; csrfCookie: string; csrfHeader: string }>;
type ValidateInput = Readonly<{ artifact: unknown; session: Session | null; request: RequestProof }>;
type AttestationPayload = Readonly<{
  version: 1;
  artifactHash: string;
  rightsHash: string;
  rightsSetId: string;
  assetOrigins: readonly string[];
  actorRef: string;
  sessionRef: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}>;

export type DeploymentPublishInput = Readonly<{
  publicContent: PublicGameContentV1;
  privateSolution: PrivateGameSolutionV1;
  rightsManifest: RightsManifestSetV1;
  publicContentCanonicalJson: string;
  privateSolutionCanonicalJson: string;
  rightsManifestCanonicalJson: string;
  validatorAttestation: Readonly<{ artifactHash: string; actorId: string; sessionId: string }>;
}>;

export interface DeploymentPublisher {
  publish(input: DeploymentPublishInput): Promise<AdminPublishResultDto>;
}

type Receipt = Readonly<{ requestHash: string; result: AdminPublishResultDto }>;
export class InMemoryPublishReceiptStore {
  readonly #receipts = new Map<string, Receipt>();
  readonly #attestations = new Map<string, string>();
  readonly #pending = new Map<string, { requestHash: string; promise: Promise<Receipt> }>();
  get(key: string) { return this.#receipts.get(key); }
  commit(key: string, receipt: Receipt) { this.#receipts.set(key, receipt); }
  attestationOwner(hash: string) { return this.#attestations.get(hash); }
  claimAttestation(hash: string, key: string) { this.#attestations.set(hash, key); }
  releaseAttestation(hash: string, key: string) { if (this.#attestations.get(hash) === key) this.#attestations.delete(hash); }
  async effectOnce(key: string, requestHash: string, attestationHash: string, effect: () => Promise<AdminPublishResultDto>) {
    const existing = this.#receipts.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT');
      return existing.result;
    }
    const pending = this.#pending.get(key);
    if (pending) {
      if (pending.requestHash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT');
      return (await pending.promise).result;
    }
    const owner = this.#attestations.get(attestationHash);
    if (owner && owner !== key) throw new Error('ATTESTATION_REPLAY');
    this.#attestations.set(attestationHash, key);
    let resolve!: (receipt: Receipt) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Receipt>((ok, fail) => { resolve = ok; reject = fail; });
    void promise.catch(() => undefined);
    this.#pending.set(key, { requestHash, promise });
    try {
      const result = await effect();
      const receipt = { requestHash, result };
      this.#receipts.set(key, receipt);
      resolve(receipt);
      return result;
    } catch (error) {
      this.#attestations.delete(attestationHash);
      reject(error);
      throw error;
    } finally {
      this.#pending.delete(key);
    }
  }
}

type Options = Readonly<{
  allowedOrigin: string;
  attestationKey: string;
  attestationTtlMs: number;
  now: () => number;
  receipts: InMemoryPublishReceiptStore;
  validate: (artifact: unknown) => Promise<ContentValidationResult>;
  publisher: DeploymentPublisher;
}>;

function authorize(session: Session | null, request: RequestProof, allowedOrigin: string): asserts session is Session {
  if (!session) throw new Error('UNAUTHORIZED');
  if (!session.roles.includes('CONTENT_PUBLISHER')) throw new Error('FORBIDDEN');
  if (request.origin !== allowedOrigin) throw new Error('ORIGIN_MISMATCH');
  if (!request.csrfCookie || request.csrfCookie !== request.csrfHeader) throw new Error('CSRF_MISMATCH');
}

function preview(content: PublicGameContentV1): AdminPreviewDto {
  const asset = (value: PublicGameContentV1['imageA']) => ({
    url: value.url, sha256: value.sha256, width: value.width, height: value.height, mimeType: value.mimeType,
  });
  return {
    contentRevisionId: content.contentRevisionId,
    contentId: content.contentId,
    version: content.version,
    theme: content.theme,
    language: content.language,
    difficulty: content.difficulty,
    imageA: asset(content.imageA),
    imageB: asset(content.imageB),
  };
}

function artifactIdentity(artifact: unknown) {
  return canonicalJsonSha256(artifact);
}

function origins(content: PublicGameContentV1) {
  return [...new Set([new URL(content.imageA.url).origin, new URL(content.imageB.url).origin])].sort();
}

function encode(payload: AttestationPayload, key: string): string {
  const body = Buffer.from(canonicalJson(payload)).toString('base64url');
  const signature = createHmac('sha256', key).update(body).digest('base64url');
  return `v1.${body}.${signature}`;
}

function decode(token: string, key: string): AttestationPayload {
  const [version, body, signature, extra] = token.split('.');
  if (version !== 'v1' || !body || !signature || extra) throw new Error('ATTESTATION_INVALID');
  const expected = createHmac('sha256', key).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('ATTESTATION_INVALID');
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AttestationPayload; }
  catch { throw new Error('ATTESTATION_INVALID'); }
}

function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
function identityRef(scope: string, value: string, key: string) {
  return createHmac('sha256', key).update(`${scope}:${value}`).digest('base64url');
}

export function createPublishWorkflow(options: Options) {
  return {
    async validate(input: ValidateInput) {
      authorize(input.session, input.request, options.allowedOrigin);
      const result = await options.validate(input.artifact);
      if (!result.ok) return result;
      const artifactHash = artifactIdentity(input.artifact);
      const now = options.now();
      const payload: AttestationPayload = {
        version: 1,
        artifactHash,
        rightsHash: result.value.rightsManifestHash,
        rightsSetId: result.value.rightsManifest.manifestSetId,
        assetOrigins: origins(result.value.publicContent),
        actorRef: identityRef('actor', input.session.actorId, options.attestationKey),
        sessionRef: identityRef('session', input.session.sessionId, options.attestationKey),
        issuedAt: now,
        expiresAt: now + options.attestationTtlMs,
        nonce: randomBytes(24).toString('base64url'),
      };
      return { ok: true as const, preview: preview(result.value.publicContent), artifactHash, rightsHash: result.value.rightsManifestHash, attestation: encode(payload, options.attestationKey) };
    },

    async publish(input: ValidateInput & { attestation: string; idempotencyKey: string }) {
      authorize(input.session, input.request, options.allowedOrigin);
      if (!/^[A-Za-z0-9_-]{8,128}$/u.test(input.idempotencyKey)) throw new Error('IDEMPOTENCY_KEY_INVALID');
      const artifactHash = artifactIdentity(input.artifact);
      const requestHash = canonicalJsonSha256({ artifactHash, actorId: input.session.actorId, sessionId: input.session.sessionId });
      const existing = options.receipts.get(input.idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return existing.result;
      }
      const payload = decode(input.attestation, options.attestationKey);
      if (payload.expiresAt <= options.now()) throw new Error('ATTESTATION_EXPIRED');
      if (payload.artifactHash !== artifactHash || payload.actorRef !== identityRef('actor', input.session.actorId, options.attestationKey) || payload.sessionRef !== identityRef('session', input.session.sessionId, options.attestationKey)) throw new Error('ATTESTATION_MISMATCH');
      const validation = await options.validate(input.artifact);
      if (!validation.ok) throw new Error(`VALIDATION_FAILED:${validation.errors.map((error) => error.ruleId).join(',')}`);
      if (validation.value.rightsManifestHash !== payload.rightsHash || validation.value.rightsManifest.manifestSetId !== payload.rightsSetId || canonicalJson(origins(validation.value.publicContent)) !== canonicalJson(payload.assetOrigins)) {
        throw new Error('ATTESTATION_MISMATCH');
      }
      const attestationHash = tokenHash(input.attestation);
      const authorizedSession = input.session;
      return options.receipts.effectOnce(input.idempotencyKey, requestHash, attestationHash, async () => {
        return options.publisher.publish({
          publicContent: validation.value.publicContent,
          privateSolution: validation.value.privateSolution,
          rightsManifest: validation.value.rightsManifest,
          publicContentCanonicalJson: validation.value.publicContentCanonicalJson,
          privateSolutionCanonicalJson: validation.value.privateSolutionCanonicalJson,
          rightsManifestCanonicalJson: validation.value.rightsManifestCanonicalJson,
          validatorAttestation: { artifactHash, actorId: authorizedSession.actorId, sessionId: authorizedSession.sessionId },
        });
      });
    },
    async receipt(key: string) { return options.receipts.get(key); },
  };
}
import 'server-only';
