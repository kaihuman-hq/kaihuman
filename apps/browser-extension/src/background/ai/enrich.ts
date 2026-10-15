import { type CaptureType, MAX_IMAGE_BYTES } from '../kb-capture.js';
import { promptJson, summarize } from './model.js';

export type { CaptureType } from '../kb-capture.js';

/** Enrichment runs inside a save the user is waiting on, so it gives up after this long (D5). */
export const ENRICH_TIMEOUT_MS = 8_000;
const TEXT_CAP = 12_000;
const MAX_ALT_IMAGES = 3;
const MAX_TAGS = 3;
const MAX_POINTS = 5;
const WORDS_PER_MINUTE = 230;

const CAPTURE_TYPES: readonly CaptureType[] = [
  'snippet',
  'decision',
  'how-to',
  'reference',
  'idea',
];

export function readMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * `work`'s answer, or `fallback` once `ms` pass. The model calls time out on their own; this also
 * covers what surrounds them, such as fetching the images, so a save never waits longer.
 */
export function within<T>(ms: number, work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The tags the schema allows, checked again: null when the model named one it was not given. */
function knownTagsOnly(raw: unknown, known: string[]): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every((tag) => typeof tag === 'string' && known.includes(tag))) return null;
  return [...new Set(raw as string[])].slice(0, MAX_TAGS);
}

const tagsSchema = (known: string[]) => ({
  type: 'array',
  items: { enum: known },
  maxItems: MAX_TAGS,
  uniqueItems: true,
});

export async function enrichReadLater(
  page: { url: string; title: string; text: string },
  knownTags: string[],
): Promise<{ summary?: string; tags: string[] }> {
  const text = page.text.slice(0, TEXT_CAP);
  const [summary, tags] = await Promise.all([
    summarize(text, {
      type: 'tldr',
      length: 'short',
      context: page.title,
      timeoutMs: ENRICH_TIMEOUT_MS,
    }),
    knownTags.length === 0
      ? null
      : promptJson<string[]>({
          system:
            'You file web pages on a reading list. Pick the tags that fit the page, only from the allowed ones; none is fine.',
          input: `Title: ${page.title}\nURL: ${page.url}\n\n${text}`,
          schema: {
            type: 'object',
            properties: { tags: tagsSchema(knownTags) },
            required: ['tags'],
            additionalProperties: false,
          },
          validate: (raw) => (isRecord(raw) ? knownTagsOnly(raw.tags, knownTags) : null),
          timeoutMs: ENRICH_TIMEOUT_MS,
        }),
  ]);
  return { ...(summary ? { summary } : {}), tags: tags ?? [] };
}

interface CaptureAnswer {
  type: CaptureType;
  keyPoints: string[];
  tags: string[];
}

export async function enrichCapture(
  note: { title: string; text: string; images: Blob[] },
  knownTags: string[],
): Promise<{ summary?: string[]; type?: CaptureType; tags: string[]; alts: string[] }> {
  const text = note.text.slice(0, TEXT_CAP);
  const [answer, alts] = await Promise.all([
    promptJson<CaptureAnswer>({
      system:
        'You file notes in a personal knowledge base. Give the kind of note, up to five short key points, and the tags that fit, only from the allowed ones.',
      input: `Title: ${note.title}\n\n${text}`,
      schema: {
        type: 'object',
        properties: {
          type: { enum: [...CAPTURE_TYPES] },
          keyPoints: {
            type: 'array',
            items: { type: 'string', maxLength: 200 },
            maxItems: MAX_POINTS,
          },
          ...(knownTags.length ? { tags: tagsSchema(knownTags) } : {}),
        },
        required: knownTags.length ? ['type', 'keyPoints', 'tags'] : ['type', 'keyPoints'],
        additionalProperties: false,
      },
      validate: (raw) => {
        if (!isRecord(raw)) return null;
        const { type, keyPoints } = raw;
        if (!CAPTURE_TYPES.includes(type as CaptureType)) return null;
        if (!Array.isArray(keyPoints) || !keyPoints.every((p) => typeof p === 'string')) {
          return null;
        }
        const tags = knownTagsOnly(raw.tags ?? [], knownTags);
        if (!tags) return null;
        const points = (keyPoints as string[]).map((p) => p.trim()).filter(Boolean);
        return { type: type as CaptureType, keyPoints: points.slice(0, MAX_POINTS), tags };
      },
      timeoutMs: ENRICH_TIMEOUT_MS,
    }),
    Promise.all(note.images.slice(0, MAX_ALT_IMAGES).map((image) => altText(image, note.title))),
  ]);
  return {
    ...(answer?.keyPoints.length ? { summary: answer.keyPoints } : {}),
    ...(answer ? { type: answer.type } : {}),
    tags: answer?.tags ?? [],
    alts,
  };
}

async function altText(image: Blob, pageTitle: string): Promise<string> {
  const alt = await promptJson<string>({
    system: 'You write alt text for images: one short plain sentence saying what the image shows.',
    input: `The image is from a page titled "${pageTitle}". Write its alt text.`,
    images: [image],
    schema: {
      type: 'object',
      properties: { alt: { type: 'string', maxLength: 125 } },
      required: ['alt'],
      additionalProperties: false,
    },
    validate: (raw) => {
      const alt = isRecord(raw) && typeof raw.alt === 'string' ? cleanAlt(raw.alt) : '';
      return alt && alt.length <= 125 ? alt : null;
    },
    timeoutMs: ENRICH_TIMEOUT_MS,
  });
  return alt ?? '';
}

// Square brackets would end the Markdown alt text early.
const cleanAlt = (alt: string) =>
  alt
    .replace(/[[\]\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Fills in empty alt text (`![](src)`) for the images `alts` describes, by image url. */
export function withAltText(markdown: string, srcs: string[], alts: string[]): string {
  let result = markdown;
  srcs.forEach((src, index) => {
    const alt = cleanAlt(alts[index] ?? '');
    if (alt) result = result.split(`![](${src})`).join(`![${alt}](${src})`);
  });
  return result;
}

/**
 * The first few images as blobs, for alt text. Best effort, like the copies localizeImages
 * stores: an image that cannot be fetched, is not a raster image or is too large is left out.
 */
export async function fetchImageBlobs(
  srcs: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ srcs: string[]; blobs: Blob[] }> {
  const kept = { srcs: [] as string[], blobs: [] as Blob[] };
  for (const src of srcs) {
    if (kept.blobs.length >= MAX_ALT_IMAGES) break;
    try {
      const res = await fetchImpl(src);
      if (!res.ok) continue;
      const blob = await res.blob();
      // The model reads rasters; an SVG is markup.
      if (!/^image\/(png|jpe?g|gif|webp|avif)/.test(blob.type)) continue;
      if (blob.size === 0 || blob.size > MAX_IMAGE_BYTES) continue;
      kept.srcs.push(src);
      kept.blobs.push(blob);
    } catch {
      // The image keeps its empty alt text.
    }
  }
  return kept;
}
