import { describe, expect, it } from 'vitest';
import { extractBearerToken, UnauthorizedError } from './bearer.js';

describe('bearer token extraction', () => {
  it('returns the single opaque bearer token', () => {
    const request = new Request('https://api.touchcatch.test/v1/pets', {
      headers: { Authorization: 'Bearer header.payload.signature' },
    });
    expect(extractBearerToken(request)).toBe('header.payload.signature');
  });

  it.each([
    undefined,
    '',
    'Basic credentials',
    'Bearer',
    'Bearer first, Bearer second',
    'Bearer token with-space',
  ])('rejects missing, malformed, or multiple authorization values: %s', (authorization) => {
    const headers = new Headers();
    if (authorization !== undefined) headers.set('Authorization', authorization);
    expect(() => extractBearerToken(new Request('https://api.touchcatch.test/v1/pets', { headers })))
      .toThrow(UnauthorizedError);
  });
});
