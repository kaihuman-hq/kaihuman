import { describe, expect, it, vi } from 'vitest';
import { saveToReadLater } from './save-read-later.js';

const NOW = new Date(2026, 10, 11, 9);
const item = { title: 'Post', url: 'https://x.test/p', source: 'X' };
const PATH = 'app/.readitlater.json';

const files = (existing?: string) => ({
  tree: () => (existing === undefined ? [] : [{ path: PATH, type: 'blob' as const }]) as never,
  read: vi.fn(async () => existing ?? ''),
  write: vi.fn(async () => {}),
  create: vi.fn(async () => {}),
});

describe('saveToReadLater', () => {
  it('writes into an existing file in the app folder', async () => {
    const f = files('{"items":[]}');
    expect(await saveToReadLater(f, 'app', item, NOW)).toBe('added');
    expect(f.write).toHaveBeenCalledWith(PATH, expect.stringContaining('https://x.test/p'));
    expect(f.create).not.toHaveBeenCalled();
  });
  it('creates the file when missing', async () => {
    const f = files();
    expect(await saveToReadLater(f, 'app', item, NOW)).toBe('added');
    expect(f.create).toHaveBeenCalledWith(PATH, expect.stringContaining('"X"'));
  });
  it('reports a duplicate without writing', async () => {
    const f = files(
      JSON.stringify({
        items: [
          {
            id: 'a',
            url: 'https://x.test/p',
            name: 'n',
            status: 'new',
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    );
    expect(await saveToReadLater(f, 'app', item, NOW)).toBe('duplicate');
    expect(f.write).not.toHaveBeenCalled();
  });
  it('rejects when the write fails', async () => {
    const f = files('{"items":[]}');
    f.write.mockRejectedValue(new Error('offline'));
    await expect(saveToReadLater(f, 'app', item, NOW)).rejects.toThrow('offline');
  });
});
