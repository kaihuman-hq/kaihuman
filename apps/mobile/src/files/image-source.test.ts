import { describe, expect, it, vi } from 'vitest';
import { loadImage, toBase64 } from './image-source.js';

describe('loadImage', () => {
  it('reads svg as text', async () => {
    const readText = vi.fn(async () => '<svg/>');
    const readBytes = vi.fn();
    expect(await loadImage('a.svg', 'image/svg+xml', { readText, readBytes })).toEqual({
      kind: 'svg',
      xml: '<svg/>',
    });
    expect(readBytes).not.toHaveBeenCalled();
  });
  it('turns raster bytes into a data uri', async () => {
    const deps = {
      readText: vi.fn(),
      readBytes: vi.fn(async () => new TextEncoder().encode('hello')),
    };
    expect(await loadImage('a.png', 'image/png', deps)).toEqual({
      kind: 'uri',
      uri: 'data:image/png;base64,aGVsbG8=',
    });
  });
  it('matches Buffer base64 for every padding length', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
