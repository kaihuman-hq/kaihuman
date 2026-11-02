import { describe, expect, it } from 'vitest';
import {
  b64urlDecode,
  b64urlEncode,
  decryptShareBlob,
  encryptShareBlob,
  newShareKey,
  newShareToken,
  parseShareUrl,
  shareUrl,
} from './index.js';

describe('share crypto', () => {
  it('generates keys and tokens of the right shape', () => {
    expect(newShareKey()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newShareToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('round-trips and rejects wrong key or tampering', async () => {
    const key = newShareKey();
    const plain = new TextEncoder().encode('%PDF-1.7 hello');
    const blob = await encryptShareBlob(plain, key);
    expect(blob.length).toBe(plain.length + 28);
    expect(await decryptShareBlob(blob, key)).toEqual(plain);
    await expect(decryptShareBlob(blob, newShareKey())).rejects.toThrow(
      'Wrong key or damaged file',
    );
    const bad = blob.slice();
    bad[20] = (bad[20] ?? 0) ^ 1;
    await expect(decryptShareBlob(bad, key)).rejects.toThrow('Wrong key or damaged file');
  });

  it('uses a fresh IV per encryption', async () => {
    const key = newShareKey();
    const p = new Uint8Array([1, 2, 3]);
    const a = await encryptShareBlob(p, key);
    const b = await encryptShareBlob(p, key);
    expect(a.slice(0, 12)).not.toEqual(b.slice(0, 12));
  });

  it('decryptShareBlob is self-contained', async () => {
    const key = newShareKey();
    const plain = new TextEncoder().encode('<xml/>');
    const blob = await encryptShareBlob(plain, key);
    const inlined = new Function(
      `return (${decryptShareBlob.toString()})`,
    )() as typeof decryptShareBlob;
    expect(await inlined(blob, key)).toEqual(plain);
    await expect(inlined(blob, newShareKey())).rejects.toThrow('Wrong key or damaged file');
  });

  it('builds and parses share urls', () => {
    const key = newShareKey();
    const token = 't'.repeat(22);
    expect(shareUrl('https://docs.kaihuman.com/', token, key)).toBe(
      `https://docs.kaihuman.com/d/${token}#${key}`,
    );
    expect(parseShareUrl(shareUrl('https://x.test', 'abc', key))).toEqual({
      host: 'https://x.test',
      token: 'abc',
      key,
    });
    expect(parseShareUrl('https://x.test/d/abc')).toBeNull();
    expect(parseShareUrl('https://x.test/other/abc#k')).toBeNull();
    expect(parseShareUrl('not a url')).toBeNull();
  });

  it('base64url round-trips and rejects invalid characters', () => {
    const bytes = new Uint8Array([0, 255, 62, 63]);
    expect(b64urlEncode(bytes)).toBe('AP8-Pw');
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes);
    expect(() => b64urlDecode('ab+/')).toThrow();
    expect(() => b64urlDecode('a b')).toThrow();
  });
});
