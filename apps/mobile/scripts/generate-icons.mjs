// Renders assets/*.svg to PNG with Playwright's Chromium (no extra deps). Run: node scripts/generate-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const dir = new URL('../assets/', import.meta.url);

/** Drops the alpha channel: App Store Connect rejects icons that have one. */
export function stripAlpha(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[25] === 2) return png;
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0)
    throw new Error('expected 8-bit RGBA, non-interlaced PNG');
  const idat = [];
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    if (png.toString('latin1', o + 4, o + 8) === 'IDAT')
      idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      const v = raw[y * (stride + 1) + 1 + x];
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + x] = (v + [0, a, b, (a + b) >> 1, paeth][f]) & 255;
    }
  }
  const out = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      px.copy(out, y * (width * 3 + 1) + 1 + x * 3, y * stride + x * 4, y * stride + x * 4 + 3);
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeInt32BE(crc32(body));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.from(png.subarray(16, 29));
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    png.subarray(0, 8),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({
  viewport: { width: 1024, height: 1024 },
  deviceScaleFactor: 1,
});
for (const [name, opaque] of [
  ['icon', true],
  ['adaptive-icon', false],
  ['splash', false],
]) {
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${readFileSync(new URL(`${name}.svg`, dir), 'utf8')}`,
  );
  const shot = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: 1024, height: 1024 },
  });
  writeFileSync(new URL(`${name}.png`, dir), opaque ? stripAlpha(shot) : shot);
}
await browser.close();
