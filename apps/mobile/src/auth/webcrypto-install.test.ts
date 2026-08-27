import { describe, expect, it, vi } from 'vitest';
import { createDigest, installWebCrypto, type WebCryptoScope } from './webcrypto-install.js';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' },
  digest: vi.fn(),
  getRandomValues: vi.fn(),
}));

/**
 * supabase-js needs `getRandomValues` to build the PKCE verifier and `subtle.digest` to hash
 * it into an S256 challenge. Missing `subtle` downgrades the flow to `plain`; missing
 * `getRandomValues` breaks sign-in entirely. These cover both, and in particular the case
 * that shipped broken once: a `crypto` created with only `subtle`, which made Expo's own
 * installer skip and left `getRandomValues` undefined on the device.
 */
describe('WebCrypto install', () => {
  const backends = () => ({ digest: vi.fn(), getRandomValues: vi.fn() });

  it('creates a crypto that carries BOTH members, never subtle alone', () => {
    const scope: WebCryptoScope = {};
    const report = installWebCrypto(scope, backends());
    expect(report).toMatchObject({ cryptoCreated: true, getRandomValues: 'INSTALLED', subtle: 'INSTALLED' });
    // The regression this asserts against: a crypto object with subtle and nothing else.
    expect(typeof scope.crypto?.getRandomValues).toBe('function');
    expect(typeof scope.crypto?.subtle).toBe('object');
  });

  it('adds only subtle when the runtime already has getRandomValues', () => {
    const native = vi.fn();
    const scope: WebCryptoScope = { crypto: { getRandomValues: native } };
    const report = installWebCrypto(scope, backends());
    expect(report).toMatchObject({ cryptoCreated: false, getRandomValues: 'PRESENT', subtle: 'INSTALLED' });
    expect(scope.crypto?.getRandomValues).toBe(native);
  });

  it('adds only getRandomValues when the runtime already has subtle', () => {
    const native = { digest: vi.fn() };
    const scope: WebCryptoScope = { crypto: { subtle: native } };
    const report = installWebCrypto(scope, backends());
    expect(report).toMatchObject({ cryptoCreated: false, getRandomValues: 'INSTALLED', subtle: 'PRESENT' });
    expect(scope.crypto?.subtle).toBe(native);
  });

  it('leaves a complete WebCrypto entirely alone', () => {
    const crypto = { getRandomValues: vi.fn(), subtle: { digest: vi.fn() } };
    const scope: WebCryptoScope = { crypto };
    expect(installWebCrypto(scope, backends())).toMatchObject({ getRandomValues: 'PRESENT', subtle: 'PRESENT' });
    expect(scope.crypto).toBe(crypto);
  });

  it('reports a refused write instead of throwing', () => {
    const scope = Object.freeze({}) as WebCryptoScope;
    expect(installWebCrypto(scope, backends()).failed).toBe('CRYPTO');
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
    installWebCrypto(scope, {
      digest: (algorithm, data) => subtle.digest(algorithm, data as BufferSource),
      getRandomValues: vi.fn(),
    });
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
