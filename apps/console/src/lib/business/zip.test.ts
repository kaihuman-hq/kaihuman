import { describe, expect, it } from 'vitest';
import { crc32 as ourCrc32, zipStore } from './zip';

// The console's tsconfig has browser types only, so Node's zlib (crc32 since 22.2) is typed here.
const zlib = 'node:zlib';
const { crc32 } = (await import(/* @vite-ignore */ zlib)) as {
  crc32: (data: Uint8Array) => number;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

type Parsed = {
  name: string;
  flags: number;
  method: number;
  time: number;
  date: number;
  crc: number;
  size: number;
  data: Uint8Array;
};

/** Reads the archive from its end-of-central-directory record, as unzip tools do. */
const parse = (zip: Uint8Array): Parsed[] => {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  expect(v.getUint32(eocd, true)).toBe(0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  const cdSize = v.getUint32(eocd + 12, true);
  let at = v.getUint32(eocd + 16, true);
  expect(at + cdSize).toBe(eocd);
  const out: Parsed[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const flags = v.getUint16(at + 8, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = dec.decode(zip.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    expect(v.getUint16(local + 6, true)).toBe(flags);
    expect(v.getUint32(local + 14, true)).toBe(v.getUint32(at + 16, true));
    const localNameLen = v.getUint16(local + 26, true);
    expect(dec.decode(zip.subarray(local + 30, local + 30 + localNameLen))).toBe(name);
    const size = v.getUint32(at + 24, true);
    const start = local + 30 + localNameLen + v.getUint16(local + 28, true);
    out.push({
      name,
      flags,
      method: v.getUint16(at + 10, true),
      time: v.getUint16(at + 12, true),
      date: v.getUint16(at + 14, true),
      crc: v.getUint32(at + 16, true),
      size,
      data: zip.subarray(start, start + size),
    });
    at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  return out;
};

describe('zipStore', () => {
  it('writes stored entries with UTF-8 names whose headers and offsets parse back', () => {
    const a = enc.encode('hello world');
    const b = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const zip = zipStore([
      { path: 'summary/README.txt', bytes: a, modified: new Date(2026, 10, 2, 13, 45, 30) },
      { path: 'expenses/2026/Beleg-ä.pdf', bytes: b },
    ]);
    const [first, second] = parse(zip);
    expect(first?.name).toBe('summary/README.txt');
    expect(second?.name).toBe('expenses/2026/Beleg-ä.pdf');
    for (const [entry, bytes] of [
      [first, a],
      [second, b],
    ] as const) {
      expect(entry?.method).toBe(0);
      expect((entry?.flags ?? 0) & 0x0800).toBe(0x0800);
      expect(entry?.size).toBe(bytes.length);
      expect(entry?.crc).toBe(crc32(bytes));
      expect(Array.from(entry?.data ?? [])).toEqual(Array.from(bytes));
    }
    expect(first?.date).toBe(((2026 - 1980) << 9) | (11 << 5) | 2);
    expect(first?.time).toBe((13 << 11) | (45 << 5) | 15);
    // No date given: 1980-01-01 00:00.
    expect(second?.date).toBe((1 << 5) | 1);
    expect(second?.time).toBe(0);
  });

  it('computes the same CRC-32 as zlib', () => {
    for (const s of ['', 'a', 'The quick brown fox jumps over the lazy dog', 'ä€😀']) {
      expect(ourCrc32(enc.encode(s))).toBe(crc32(enc.encode(s)));
    }
  });

  it('writes an empty archive as a lone end record', () => {
    expect(zipStore([])).toHaveLength(22);
  });

  it('refuses more than 65535 entries', () => {
    const entries = Array.from({ length: 65536 }, (_, i) => ({
      path: `f${i}`,
      bytes: new Uint8Array(0),
    }));
    expect(() => zipStore(entries)).toThrow('Zip too large.');
    expect(() => zipStore(entries.slice(1))).not.toThrow();
  });

  it('refuses an archive over 4 GiB before touching any bytes', () => {
    // A stand-in with only a length: the size check must come before any read or copy.
    const huge = { length: 0x1_0000_0000 } as unknown as Uint8Array;
    expect(() => zipStore([{ path: 'big.pdf', bytes: huge }])).toThrow('Zip too large.');
  });
});
