import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicalJsonSha256 } from './canonical-json.js';

describe('canonical JSON', () => {
  it('sorts object keys while preserving array order', () => {
    expect(canonicalJson({ z: 1, a: [3, { y: 2, x: 1 }] })).toBe('{"a":[3,{"x":1,"y":2}],"z":1}');
  });

  it('hashes semantically equivalent object key order identically', () => {
    expect(canonicalJsonSha256({ b: 2, a: 1 })).toBe(canonicalJsonSha256({ a: 1, b: 2 }));
  });

  it('uses ECMAScript number serialization and canonicalizes negative zero', () => {
    expect(canonicalJson([333333333.33333329, -0, 1e30])).toBe('[333333333.3333333,0,1e+30]');
  });

  it('rejects lone UTF-16 surrogates in values and keys', () => {
    expect(() => canonicalJson('\ud800')).toThrow('lone surrogates');
    expect(() => canonicalJson({ ['\udc00']: 1 })).toThrow('lone surrogates');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, undefined])('rejects non-JSON value %s', (value) => {
    expect(() => canonicalJson({ value })).toThrow();
  });
});
