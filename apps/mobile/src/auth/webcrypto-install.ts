import * as Crypto from 'expo-crypto';

/**
 * Fills in the parts of `crypto` that React Native leaves out, so PKCE can use S256.
 *
 * supabase-js needs two things from `crypto` to start an OAuth sign-in: `getRandomValues`
 * to make the code verifier, and `subtle.digest` to hash it into an S256 challenge. When
 * `subtle` is missing it does not fail — it warns and sends the verifier itself as the
 * challenge (`plain`), and under `plain` the challenge *is* the secret, so anyone who
 * observes the authorization request can complete the token exchange. This app takes its
 * callback on `touchcatch://`, a custom scheme any other installed app may also claim, so
 * interception is the threat PKCE answers here and S256 is the half that answers it.
 *
 * Each piece is filled independently and only when absent. That matters more than it looks:
 * an earlier version created a whole `crypto` object holding nothing but `subtle`, which ran
 * before Expo installed its own and left `getRandomValues` undefined forever after, because
 * Expo's installer saw a `crypto` already there and skipped. The result passed every test and
 * the release bundle built, then broke OAuth outright on a device — no verifier, no sign-in.
 * A partial object is worse than no object, so this never constructs one.
 */

const DIGEST_ALGORITHMS: ReadonlyMap<string, Crypto.CryptoDigestAlgorithm> = new Map([
  ['SHA-1', Crypto.CryptoDigestAlgorithm.SHA1],
  ['SHA-256', Crypto.CryptoDigestAlgorithm.SHA256],
  ['SHA-384', Crypto.CryptoDigestAlgorithm.SHA384],
  ['SHA-512', Crypto.CryptoDigestAlgorithm.SHA512],
]);

type DigestBackend = (algorithm: Crypto.CryptoDigestAlgorithm, data: BufferSource) => Promise<ArrayBuffer>;
type RandomBackend = <T extends ArrayBufferView | null>(array: T) => T;

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

export type WebCryptoScope = { crypto?: { subtle?: unknown; getRandomValues?: unknown } };

export type InstallReport = Readonly<{
  /** Whether a `crypto` object had to be created, and whether each member was added. */
  cryptoCreated: boolean;
  getRandomValues: 'PRESENT' | 'INSTALLED';
  subtle: 'PRESENT' | 'INSTALLED';
  /** Set when the scope refused a write, so the caller is knowingly degraded, not silently. */
  failed?: string;
}>;

function define(target: object, key: string, value: unknown): boolean {
  try {
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns what it did, so a test can assert the branch instead of inferring it from a global.
 */
export function installWebCrypto(
  scope: WebCryptoScope,
  backends: Readonly<{ digest?: DigestBackend; getRandomValues?: RandomBackend }> = {},
): InstallReport {
  const randomBackend = backends.getRandomValues ?? (Crypto.getRandomValues as unknown as RandomBackend);

  let holder = scope.crypto;
  let cryptoCreated = false;
  if (!holder || typeof holder !== 'object') {
    holder = {};
    cryptoCreated = true;
    if (!define(scope as object, 'crypto', holder)) {
      return { cryptoCreated: false, getRandomValues: 'PRESENT', subtle: 'PRESENT', failed: 'CRYPTO' };
    }
  }

  let getRandomValues: InstallReport['getRandomValues'] = 'PRESENT';
  if (typeof holder.getRandomValues !== 'function') {
    if (!define(holder, 'getRandomValues', (array: ArrayBufferView | null) => randomBackend(array))) {
      return { cryptoCreated, getRandomValues: 'PRESENT', subtle: 'PRESENT', failed: 'GET_RANDOM_VALUES' };
    }
    getRandomValues = 'INSTALLED';
  }

  let subtle: InstallReport['subtle'] = 'PRESENT';
  if (!holder.subtle || typeof holder.subtle !== 'object') {
    if (!define(holder, 'subtle', { digest: createDigest(backends.digest) })) {
      return { cryptoCreated, getRandomValues, subtle: 'PRESENT', failed: 'SUBTLE' };
    }
    subtle = 'INSTALLED';
  }

  return { cryptoCreated, getRandomValues, subtle };
}

export const webCryptoInstallReport = installWebCrypto(globalThis as WebCryptoScope);
