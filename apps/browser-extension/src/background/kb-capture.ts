// Builds the raw sources the knowledge base ingests: every capture becomes its own
// `.kh/raw/<epoch>-<slug>.md` file with frontmatter, so /kb-ingest sees it.

export const KB_RAW_DIR = '.kh/raw';
// Assets live outside raw/ because ingest moves raw files into raw/processed/, which would
// break relative links; notes reference them from the repo root instead.
export const KB_ASSET_DIR = '.kh/assets';
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// Storage key for the popup toggle; images are downloaded unless it is explicitly turned off.
export const KB_IMAGES_SETTING = 'kb_download_images';

export function imagesEnabled(stored: unknown): boolean {
  return stored !== false;
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

export function slugify(value: string, fallback: string): string {
  const slug = value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
  return slug || fallback;
}

export function urlToSlug(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const last = pathname.replace(/\/$/, '').split('/').pop() || '';
    return slugify(last || hostname.replace(/^www\./, ''), 'article');
  } catch {
    return 'article';
  }
}

export type CaptureType = 'snippet' | 'decision' | 'how-to' | 'reference' | 'idea';

export function buildRawNote(note: {
  title: string;
  url: string;
  text: string;
  tags: string[];
  date: string;
  type?: CaptureType;
  summary?: string[];
}): string {
  const title = note.title.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"');
  const url = note.url.replace(/'/g, "''");
  const type = note.type ? `type: ${note.type}\n` : '';
  // JSON strings are valid YAML double-quoted scalars, so quotes and backslashes need no more care.
  const points = (note.summary ?? []).map((point) => point.replace(/\s+/g, ' ').trim());
  const summary = points.length
    ? `summary:\n${points.map((point) => `  - ${JSON.stringify(point)}\n`).join('')}`
    : '';
  // Quoted like the title: a tag with a comma, colon or bracket would otherwise break the list.
  const tags = [...new Set(note.tags)].map((tag) => JSON.stringify(tag)).join(', ');
  return `---\ntitle: "${title}"\nurl: '${url}'\ndate: ${note.date}\nprocessed: false\n${type}tags: [${tags}]\n${summary}---\n\n${note.text}`;
}

export function selectionText(text: string, url: string, pageTitle: string): string {
  const quote = text
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? `> ${line.trim()}` : '>'))
    .join('\n');
  return `Clipped from [${pageTitle || url}](${url}):\n\n${quote}\n`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked so large images do not blow the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Downloads the note's images into the repo and points the Markdown at the copies, so the
 * knowledge base keeps working after the source page changes. Best effort: an image that
 * cannot be fetched, is not an image, or is too large keeps its remote url.
 */
export async function localizeImages(
  markdown: string,
  images: string[],
  assetDir: string,
  upload: (path: string, base64: string) => Promise<void>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let result = markdown;
  let index = 0;
  for (const src of images.slice(0, MAX_IMAGES)) {
    try {
      const res = await fetchImpl(src);
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      const ext = IMAGE_EXT[type];
      if (!ext) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) continue;
      index += 1;
      const path = `${assetDir}/${index}.${ext}`;
      await upload(path, bytesToBase64(bytes));
      result = result.split(`](${src})`).join(`](/${path})`);
    } catch (error) {
      console.warn('kaihuman: could not store image', src, error);
    }
  }
  return result;
}
