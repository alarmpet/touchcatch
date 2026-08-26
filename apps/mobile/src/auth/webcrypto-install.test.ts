import { describe, expect, it, vi } from 'vitest';
import { createDigest, installWebCryptoDigest, type WebCryptoScope } from './webcrypto-install.js';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' },
  digest: vi.fn(),
}));

/**
 * The behaviour under test is the one supabase-js probes for. `generatePKCEChallenge` checks
 * `typeof crypto.subtle !== 'undefined'` and, when that fails, returns the verifier itself as
 * the challenge (`plain`) after a console warning. These assert the probe now succeeds, that
 * the digest it then calls is a real SHA-256, and that nothing here overwrites a runtime that
 * brings its own WebCrypto.
 */
describe('WebCrypto digest install', () => {
  it('adds subtle to an existing crypto object so the PKCE capability check passes', () => {
    const scope: WebCryptoScope = { crypto: { } };
    expect(installWebCryptoDigest(scope, vi.fn())).toBe('SUBTLE_ADDED');
    expect(typeof scope.crypto?.subtle).toBe('object');
  });

  it('creates crypto entirely when the runtime has none', () => {
    const scope: WebCryptoScope = {};
    expect(installWebCryptoDigest(scope, vi.fn())).toBe('CRYPTO_ADDED');
    expect(typeof scope.crypto?.subtle).toBe('object');
  });

  it('leaves a real WebCrypto alone', () => {
    const native = { digest: vi.fn() };
    const scope: WebCryptoScope = { crypto: { subtle: native } };
    expect(installWebCryptoDigest(scope, vi.fn())).toBe('ALREADY_PRESENT');
    expect(scope.crypto?.subtle).toBe(native);
  });

  it('reports UNAVAILABLE rather than throwing when the scope refuses the write', () => {
    const scope = Object.freeze({}) as WebCryptoScope;
    expect(installWebCryptoDigest(scope, vi.fn())).toBe('UNAVAILABLE');
  });

  it('passes SHA-256 through for both the string and the object algorithm form', async () => {
    const backend = vi.fn().mockResolvedValue(new ArrayBuffer(32));
    const digest = createDigest(backend);
    const data = new Uint8Array([1, 2, 3]);
    await digest('SHA-256', data);
    await digest({ name: 'sha-256' }, data);
    expect(backend.mock.calls).toEqual([['SHA-256', data], ['SHA-256', data]]);
  });

  it('refuses an algorithm it cannot compute instead of substituting one it can', async () => {
    const backend = vi.fn();
    await expect(createDigest(backend)('SHA-3-256', new Uint8Array())).rejects.toThrow('WEBCRYPTO_DIGEST_ALGORITHM_UNSUPPORTED');
    expect(backend).not.toHaveBeenCalled();
  });

  it('rejects a malformed algorithm argument', async () => {
    await expect(createDigest(vi.fn())(42, new Uint8Array())).rejects.toThrow('WEBCRYPTO_DIGEST_ALGORITHM_INVALID');
  });

  it('produces the SHA-256 that supabase-js turns into an S256 challenge', async () => {
    const { subtle } = await import('node:crypto');
    const scope: WebCryptoScope = {};
    installWebCryptoDigest(scope, (algorithm, data) => subtle.digest(algorithm, data as BufferSource));
    const installed = scope.crypto?.subtle as { digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> };

    // The verifier below is arbitrary; the expectation is its real SHA-256, so a backend that
    // returned anything else -- including the input, which is what `plain` does -- fails here.
    const verifier = 'touchcatch-pkce-verifier';
    const hashed = new Uint8Array(await installed.digest('SHA-256', new TextEncoder().encode(verifier)));
    const expected = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    expect(Array.from(hashed)).toEqual(Array.from(expected));
    expect(hashed).toHaveLength(32);
  });
});
