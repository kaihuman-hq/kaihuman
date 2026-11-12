import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('app.json', root), 'utf8')).expo;

/** PNG IHDR: width, height, colour type (6 = RGBA, 4 = grey+alpha). */
function ihdr(path: string) {
  const png = readFileSync(fileURLToPath(new URL(path, root)));
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), colorType: png[25] };
}

describe('app icons', () => {
  it('uses a 1024x1024 icon without alpha (App Store Connect rejects alpha)', () => {
    expect(config.icon).toBe('./assets/icon.png');
    const { width, height, colorType } = ihdr(config.icon);
    expect([width, height]).toEqual([1024, 1024]);
    expect([4, 6]).not.toContain(colorType);
  });

  it('has an Android adaptive icon with an Ink background', () => {
    const adaptive = config.android.adaptiveIcon;
    expect(adaptive.backgroundColor).toBe('#0C0D0C');
    const { width, height } = ihdr(adaptive.foregroundImage);
    expect([width, height]).toEqual([1024, 1024]);
  });
});
