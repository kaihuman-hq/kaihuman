import { describe, expect, it, vi } from 'vitest';
import {
  buildRawNote,
  localizeImages,
  MAX_IMAGE_BYTES,
  selectionText,
  slugify,
  urlToSlug,
} from './kb-capture';

const image = (type: string, size = 4) =>
  ({
    ok: true,
    headers: new Headers({ 'content-type': type }),
    arrayBuffer: async () => new Uint8Array(size).fill(65).buffer,
  }) as unknown as Response;

describe('slugs', () => {
  it('uses the last path segment, then the host', () => {
    expect(urlToSlug('https://www.example.com/blog/My_Post/')).toBe('my-post');
    expect(urlToSlug('https://www.example.com/')).toBe('example-com');
    expect(urlToSlug('not a url')).toBe('article');
  });

  it('falls back when nothing sluggable is left', () => {
    expect(slugify('  ***  ', 'clipping')).toBe('clipping');
    expect(slugify('Hello, World!', 'x')).toBe('hello-world');
  });
});

describe('buildRawNote', () => {
  it('writes frontmatter ingest understands, escaping the title and url', () => {
    expect(
      buildRawNote({
        title: 'He said "hi"\nagain',
        url: "https://x.com/it's",
        text: 'body',
        tags: ['clipping'],
        date: '2026-09-23',
      }),
    ).toBe(
      `---\ntitle: "He said \\"hi\\" again"\nurl: 'https://x.com/it''s'\ndate: 2026-09-23\nprocessed: false\ntags: [clipping]\n---\n\nbody`,
    );
  });
});

describe('selectionText', () => {
  it('quotes every line and links the source page', () => {
    expect(selectionText(' one\n\ntwo ', 'https://a.b/c', 'Page')).toBe(
      'Clipped from [Page](https://a.b/c):\n\n> one\n>\n> two\n',
    );
  });
});

describe('localizeImages', () => {
  it('uploads images and rewrites links to repo-root paths', async () => {
    const upload = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => image('image/png')) as unknown as typeof fetch;
    const md = '![a](https://x.com/a.png) and ![b](https://x.com/a.png)';
    const out = await localizeImages(
      md,
      ['https://x.com/a.png'],
      '.kh/assets/1-p',
      upload,
      fetchImpl,
    );
    expect(out).toBe('![a](/.kh/assets/1-p/1.png) and ![b](/.kh/assets/1-p/1.png)');
    expect(upload).toHaveBeenCalledWith('.kh/assets/1-p/1.png', btoa('AAAA'));
  });

  it('keeps the remote url for failures, non-images and oversized files', async () => {
    const responses: Record<string, () => Promise<Response>> = {
      'https://x.com/404': async () => ({ ok: false }) as Response,
      'https://x.com/html': async () => image('text/html'),
      'https://x.com/big': async () => image('image/jpeg', MAX_IMAGE_BYTES + 1),
      'https://x.com/throws': async () => {
        throw new Error('offline');
      },
    };
    const urls = Object.keys(responses);
    const md = urls.map((u) => `![](${u})`).join('\n');
    const upload = vi.fn(async () => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await localizeImages(md, urls, 'dir', upload, ((u: string) =>
      responses[u]()) as unknown as typeof fetch);
    expect(out).toBe(md);
    expect(upload).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
