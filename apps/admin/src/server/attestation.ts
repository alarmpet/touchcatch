import 'server-only';

type Options = Readonly<{ now: number; keyId: string; maxTtlMs: number; maxClockSkewMs: number }>;
const HASH = /^[a-f0-9]{64}$/u;
const REF = /^[A-Za-z0-9_-]{20,64}$/u;
const NONCE = /^(?:[A-Fa-f0-9]{32,128}|[A-Za-z0-9_-]{32,128})$/u;
const KEYS = ['actorRef','artifactHash','assetAHash','assetBHash','expiresAt','issuedAt','keyId','nonce','rightsHash','sessionRef','version'] as const;

export function parseAttestation(value: unknown, options: Options) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('ATTESTATION_INVALID');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== [...KEYS].sort().join(',')) throw new Error('ATTESTATION_INVALID');
  if (v.version !== 1 || v.keyId !== options.keyId || !HASH.test(String(v.artifactHash)) || !HASH.test(String(v.assetAHash)) || !HASH.test(String(v.assetBHash)) || !HASH.test(String(v.rightsHash)) || !REF.test(String(v.actorRef)) || !REF.test(String(v.sessionRef)) || !NONCE.test(String(v.nonce))) throw new Error('ATTESTATION_INVALID');
  if (!Number.isSafeInteger(v.issuedAt) || !Number.isSafeInteger(v.expiresAt)) throw new Error('ATTESTATION_INVALID');
  const issuedAt = v.issuedAt as number; const expiresAt = v.expiresAt as number;
  if (issuedAt > options.now + options.maxClockSkewMs || expiresAt <= options.now || expiresAt <= issuedAt || expiresAt - issuedAt > options.maxTtlMs) throw new Error('ATTESTATION_INVALID');
  return value as { readonly version: 1; readonly artifactHash: string; readonly assetAHash: string; readonly assetBHash: string; readonly rightsHash: string; readonly actorRef: string; readonly sessionRef: string; readonly keyId: string; readonly nonce: string; readonly issuedAt: number; readonly expiresAt: number };
}
