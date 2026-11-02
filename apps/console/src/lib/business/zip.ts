/** A minimal store-only (uncompressed) zip writer; receipts and PDFs are compressed already. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

export type ZipEntry = { path: string; bytes: Uint8Array; modified?: Date };

const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;
const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
/** Bit 11: names are UTF-8, so `Beleg-ä.pdf` reads back as written. */
const UTF8_FLAG = 0x0800;
const VERSION = 20;

/** MS-DOS date and time, in local time as zip tools expect; before 1980 it clamps to 1980-01-01. */
const dosDateTime = (d: Date | undefined): { date: number; time: number } => {
  if (!d || d.getFullYear() < 1980) return { date: (1 << 5) | 1, time: 0 };
  return {
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
};

/** Store-only zip without ZIP64: throws `Zip too large.` past 65535 entries or 4 GiB. */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > MAX_ENTRIES) throw new Error('Zip too large.');
  const enc = new TextEncoder();
  const names = entries.map((e) => enc.encode(e.path));
  let total = END_RECORD;
  for (const [i, e] of entries.entries()) {
    const nameLen = names[i]?.length ?? 0;
    total += LOCAL_HEADER + CENTRAL_HEADER + 2 * nameLen + e.bytes.length;
  }
  if (total > MAX_BYTES) throw new Error('Zip too large.');

  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  const central: { offset: number; crc: number; date: number; time: number }[] = [];
  let at = 0;
  for (const [i, e] of entries.entries()) {
    const name = names[i] ?? new Uint8Array(0);
    const crc = crc32(e.bytes);
    const { date, time } = dosDateTime(e.modified);
    central.push({ offset: at, crc, date, time });
    v.setUint32(at, 0x04034b50, true);
    v.setUint16(at + 4, VERSION, true);
    v.setUint16(at + 6, UTF8_FLAG, true);
    v.setUint16(at + 8, 0, true);
    v.setUint16(at + 10, time, true);
    v.setUint16(at + 12, date, true);
    v.setUint32(at + 14, crc, true);
    v.setUint32(at + 18, e.bytes.length, true);
    v.setUint32(at + 22, e.bytes.length, true);
    v.setUint16(at + 26, name.length, true);
    v.setUint16(at + 28, 0, true);
    out.set(name, at + LOCAL_HEADER);
    out.set(e.bytes, at + LOCAL_HEADER + name.length);
    at += LOCAL_HEADER + name.length + e.bytes.length;
  }

  const cdStart = at;
  for (const [i, e] of entries.entries()) {
    const name = names[i] ?? new Uint8Array(0);
    const c = central[i] as (typeof central)[number];
    v.setUint32(at, 0x02014b50, true);
    v.setUint16(at + 4, VERSION, true);
    v.setUint16(at + 6, VERSION, true);
    v.setUint16(at + 8, UTF8_FLAG, true);
    v.setUint16(at + 10, 0, true);
    v.setUint16(at + 12, c.time, true);
    v.setUint16(at + 14, c.date, true);
    v.setUint32(at + 16, c.crc, true);
    v.setUint32(at + 20, e.bytes.length, true);
    v.setUint32(at + 24, e.bytes.length, true);
    v.setUint16(at + 28, name.length, true);
    // Extra field, comment, disk number, internal and external attributes stay zero.
    v.setUint32(at + 42, c.offset, true);
    out.set(name, at + CENTRAL_HEADER);
    at += CENTRAL_HEADER + name.length;
  }

  v.setUint32(at, 0x06054b50, true);
  v.setUint16(at + 8, entries.length, true);
  v.setUint16(at + 10, entries.length, true);
  v.setUint32(at + 12, at - cdStart, true);
  v.setUint32(at + 16, cdStart, true);
  return out;
}
