import * as Crypto from 'expo-crypto';

/**
 * Gives the runtime a `crypto.subtle.digest` so PKCE can use S256.
 *
 * supabase-js derives the PKCE code challenge with `crypto.subtle.digest`, and when that is
 * missing it does not fail — it warns and sends the verifier itself as the challenge
 * (`plain`). React Native ships no WebCrypto, so every OAuth sign-in was taking that path.
 * Under `plain` the challenge is the secret: anyone who observes the authorization request
 * can complete the token exchange. This app receives its callback on a custom scheme
 * (`touchcatch://`), which any other installed app may also claim, so interception is the
 * threat PKCE is here to answer and S256 is the half that answers it.
 *
 * Only what is absent gets filled. A runtime that grows real WebCrypto keeps its own.
 */

const DIGEST_ALGORITHMS: ReadonlyMap<string, Crypto.CryptoDigestAlgorithm> = new Map([
  ['SHA-1', Crypto.CryptoDigestAlgorithm.SHA1],
  ['SHA-256', Crypto.CryptoDigestAlgorithm.SHA256],
  ['SHA-384', Crypto.CryptoDigestAlgorithm.SHA384],
  ['SHA-512', Crypto.CryptoDigestAlgorithm.SHA512],
]);

type DigestBackend = (algorithm: Crypto.CryptoDigestAlgorithm, data: BufferSource) => Promise<ArrayBuffer>;

/** WebCrypto accepts both `'SHA-256'` and `{ name: 'SHA-256' }`. */
function algorithmName(algorithm: unknown): string {
  if (typeof algorithm === 'string') return algorithm;
  if (algorithm !== null && typeof algorithm === 'object' && 'name' in algorithm) {
    const name = (algorithm as { name: unknown }).name;
    if (typeof name === 'string') return name;
  }
  throw new TypeError('WEBCRYPTO_DIGEST_ALGORITHM_INVALID');
}

export function createDigest(backend: DigestBackend = Crypto.digest) {
  return async function digest(algorithm: unknown, data: BufferSource): Promise<ArrayBuffer> {
    const mapped = DIGEST_ALGORITHMS.get(algorithmName(algorithm).toUpperCase());
    // Throwing on an unknown algorithm rather than substituting a known one: answering a
    // SHA-512 request with a SHA-256 digest would be the same silent downgrade this module
    // exists to remove, only harder to notice.
    if (!mapped) throw new Error('WEBCRYPTO_DIGEST_ALGORITHM_UNSUPPORTED');
    return backend(mapped, data);
  };
}

export type WebCryptoScope = { crypto?: { subtle?: unknown } };

export type InstallOutcome = 'ALREADY_PRESENT' | 'SUBTLE_ADDED' | 'CRYPTO_ADDED' | 'UNAVAILABLE';

/**
 * Returns what it did, so a test can assert the branch instead of inferring it from a global.
 * `UNAVAILABLE` means the scope refused the write — the caller is then knowingly on `plain`
 * rather than silently on it.
 */
export function installWebCryptoDigest(
  scope: WebCryptoScope,
  backend?: DigestBackend,
): InstallOutcome {
  const existing = scope.crypto;
  if (existing && typeof existing === 'object' && typeof existing.subtle === 'object' && existing.subtle !== null) {
    return 'ALREADY_PRESENT';
  }
  const subtle = { digest: createDigest(backend) };
  if (existing && typeof existing === 'object') {
    try {
      Object.defineProperty(existing, 'subtle', { value: subtle, configurable: true, writable: true });
      return 'SUBTLE_ADDED';
    } catch {
      return 'UNAVAILABLE';
    }
  }
  try {
    Object.defineProperty(scope, 'crypto', { value: { subtle }, configurable: true, writable: true });
    return 'CRYPTO_ADDED';
  } catch {
    return 'UNAVAILABLE';
  }
}

export const webCryptoInstallOutcome = installWebCryptoDigest(globalThis as WebCryptoScope);

