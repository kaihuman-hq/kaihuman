import { describe, expect, it } from 'vitest';
import { asSlug, isUlid, newUlid, ulid } from './ids.js';

describe('newUlid', () => {
  it('encodes time and randomness in Crockford base32', () => {
    expect(newUlid(0, new Uint8Array(10))).toBe('00000000000000000000000000');
    expect(newUlid(1469918176385, new Uint8Array(10)).slice(0, 10)).toBe('01ARYZ6S41');
    expect(newUlid(0, new Uint8Array(10).fill(255)).slice(10)).toBe('ZZZZZZZZZZZZZZZZ');
  });

  it('sorts by time', () => {
    const zero = new Uint8Array(10);
    expect(newUlid(1000, zero) < newUlid(2000, zero)).toBe(true);
  });

  it('needs exactly 10 random bytes', () => {
    expect(() => newUlid(0, new Uint8Array(9))).toThrow();
  });
});

describe('ulid', () => {
  it('makes valid, distinct ids', () => {
    expect(isUlid(ulid())).toBe(true);
    expect(ulid()).not.toBe(ulid());
  });
});

describe('isUlid', () => {
  it('rejects wrong length, letters outside the alphabet and lowercase', () => {
    expect(isUlid('01ARYZ6S41')).toBe(false);
    expect(isUlid('0000000000000000000000000U')).toBe(false);
    expect(isUlid('0000000000000000000000000a')).toBe(false);
    expect(isUlid('81ARYZ6S4100000000000000000')).toBe(false);
  });
});

describe('asSlug', () => {
  it('accepts lowercase kebab-case of 2-40 characters', () => {
    expect(asSlug('acme-gmbh')).toBe('acme-gmbh');
    expect(asSlug('a1')).toBe('a1');
    expect(asSlug('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('rejects the rest', () => {
    expect(asSlug('Acme')).toBeNull();
    expect(asSlug('a')).toBeNull();
    expect(asSlug('-ab')).toBeNull();
    expect(asSlug('a'.repeat(41))).toBeNull();
    expect(asSlug('a b')).toBeNull();
  });
});
