import { normalizeItemUrl, type ReadItLaterItem, type StreamsFile } from '@kaihuman/formats';
import {
  type Bookmark,
  bookmarkEnvironment,
  ENVIRONMENTS,
  type Environment,
} from '../bookmarks.js';
import { promptJson } from './model.js';
import { readAiSettings } from './settings.js';

/** Save enrichment is answered within this long, or the rule draft stands (global constraints). */
const DRAFT_TIMEOUT_MS = 8000;
const MAX_TITLE = 60;
const MAX_TAGS = 3;
const MAX_NEAR = 5;

const SEPARATORS = / (?:-|–|—|\||·|:) /;

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Whether a title's trailing segment names the site: "GitHub" on github.com, "Vitest" on vitest.dev. */
const namesSite = (segment: string, host: string): boolean => {
  const name = squash(segment);
  if (!name) return false;
  return host.split('.').some((part) => part.length > 1 && squash(part) === name);
};

/**
 * The page title without what every page of the site repeats: a "(12) " unread counter and a
 * trailing " - Site", " | Site" or " · GitHub". Only a segment that names the page's own host is
 * cut, so "Cats - Dogs" keeps both halves.
 */
export function tidyTitle(title: string, url: string): string {
  let tidy = title.trim().replace(/^\(\d+\)\s+/, '');
  const host = hostOf(url);
  const parts = tidy.split(SEPARATORS);
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (last !== undefined && namesSite(last, host)) {
    tidy = tidy
      .slice(0, tidy.length - last.length)
      .replace(new RegExp(`${SEPARATORS.source}$`), '');
  }
  return tidy.trim() || title.trim();
}

export interface BookmarkDraftResult {
  title: string;
  tags: string[];
  environment: Environment | null;
}

interface ModelDraft {
  title: string;
  tags: string[];
  environment: Environment | null;
}

const SYSTEM = [
  'You help the user bookmark a web page.',
  'Give a short, clear title of at most 60 characters without the site name.',
  'Pick at most three of the user’s existing tags that fit; pick none if none fit.',
  'Say whether the page is a DEV, INT or PROD deployment of a tool, or "none".',
].join(' ');

/** Rules first; the model only improves what they leave open, and only with known tags. */
export async function draftBookmark(
  page: { url: string; title: string },
  knownTags: string[],
): Promise<BookmarkDraftResult> {
  const title = tidyTitle(page.title, page.url);
  const ruled: BookmarkDraftResult = {
    title,
    tags: [],
    environment: bookmarkEnvironment({ title: page.title, tags: [] }),
  };
  if (!(await readAiSettings()).enrichment) return ruled;

  const tagByLower = new Map(knownTags.map((tag) => [tag.toLowerCase(), tag]));
  const properties: Record<string, object> = {
    title: { type: 'string', maxLength: MAX_TITLE },
  };
  if (knownTags.length > 0) {
    properties.tags = {
      type: 'array',
      maxItems: MAX_TAGS,
      uniqueItems: true,
      items: { type: 'string', enum: knownTags },
    };
  }
  // The rule's answer is not up for debate, so the model is only asked when it found nothing.
  if (!ruled.environment) {
    properties.environment = { type: 'string', enum: [...ENVIRONMENTS, 'none'] };
  }

  const answer = await promptJson<ModelDraft>({
    system: SYSTEM,
    input: [
      `Page: ${title}`,
      `Address: ${page.url}`,
      `Existing tags: ${knownTags.length ? knownTags.join(', ') : '(none)'}`,
    ].join('\n'),
    schema: { type: 'object', properties, required: Object.keys(properties) },
    validate: (raw) => {
      const value = raw as { title?: unknown; tags?: unknown; environment?: unknown } | null;
      if (typeof value?.title !== 'string') return null;
      const modelTitle = value.title.trim();
      if (!modelTitle || modelTitle.length > MAX_TITLE) return null;
      const tags = Array.isArray(value.tags)
        ? [
            ...new Set(
              value.tags.flatMap((tag) =>
                typeof tag === 'string' && tagByLower.has(tag.toLowerCase())
                  ? [tagByLower.get(tag.toLowerCase()) as string]
                  : [],
              ),
            ),
          ].slice(0, MAX_TAGS)
        : [];
      const environment = (ENVIRONMENTS as readonly unknown[]).includes(value.environment)
        ? (value.environment as Environment)
        : null;
      return { title: modelTitle, tags, environment };
    },
    priority: 'interactive',
    timeoutMs: DRAFT_TIMEOUT_MS,
  });
  if (!answer) return ruled;
  return {
    title: answer.title,
    tags: answer.tags,
    environment: ruled.environment ?? answer.environment,
  };
}

export interface Duplicate {
  kind: 'bookmark' | 'read-later' | 'stream';
  title: string;
  url: string;
  exact: boolean;
}

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1),
  );

const overlap = (a: string, b: string): number => {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
};

type DuplicateData = {
  bookmarks: Bookmark[];
  readLater: ReadItLaterItem[];
  streams: StreamsFile | null;
};

/** Everything already saved, as duplicate candidates. */
function knownEntries(data: DuplicateData): Duplicate[] {
  return [
    ...data.bookmarks.map(
      (b): Duplicate => ({ kind: 'bookmark', title: b.title, url: b.url, exact: false }),
    ),
    ...data.readLater.map(
      (r): Duplicate => ({ kind: 'read-later', title: r.name, url: r.url, exact: false }),
    ),
    ...(data.streams?.streams.flatMap((stream) =>
      stream.items.map(
        (item): Duplicate => ({ kind: 'stream', title: item.title, url: item.url, exact: false }),
      ),
    ) ?? []),
  ];
}

/**
 * Saved entries with the same normalised url. No model: shown at once, before the draft is back.
 */
export function findExactDuplicates(page: { url: string }, data: DuplicateData): Duplicate[] {
  const wanted = normalizeItemUrl(page.url);
  return knownEntries(data)
    .filter((entry) => normalizeItemUrl(entry.url) === wanted)
    .map((entry) => ({ ...entry, exact: true }));
}

/**
 * Where the page is already saved: the same address (after tracking parameters and fragments are
 * dropped) is a certain duplicate; another page of the same site whose title reads alike is a
 * maybe the model is asked about, from the five closest titles. Without the model only the certain
 * ones are reported.
 */
export async function findDuplicates(
  page: { url: string; title: string },
  data: DuplicateData,
): Promise<Duplicate[]> {
  const known = knownEntries(data);
  const exact = findExactDuplicates(page, data);
  if (exact.length > 0 || !(await readAiSettings()).enrichment) return exact;

  const host = hostOf(page.url);
  const near = known
    .filter((entry) => host !== '' && hostOf(entry.url) === host)
    .map((entry) => ({ entry, score: overlap(page.title, entry.title) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_NEAR)
    .map(({ entry }) => entry);
  if (near.length === 0) return exact;

  const ids = near.map((_, index) => String(index + 1));
  const answer = await promptJson<string[]>({
    system:
      'You decide whether a web page the user is saving is the same page as one they already saved. Answer with the numbers of the saved entries that are the same page or a near copy; none if it is different.',
    input: [
      `New page: ${page.title}`,
      'Saved:',
      ...near.map((entry, index) => `${index + 1}. ${entry.title}`),
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        same: { type: 'array', uniqueItems: true, items: { type: 'string', enum: ids } },
      },
      required: ['same'],
    },
    validate: (raw) => {
      const same = (raw as { same?: unknown } | null)?.same;
      if (!Array.isArray(same)) return null;
      return same.filter((id): id is string => typeof id === 'string' && ids.includes(id));
    },
    priority: 'interactive',
    timeoutMs: DRAFT_TIMEOUT_MS,
  });
  return [
    ...exact,
    ...(answer ?? []).map((id) => near[Number(id) - 1]).filter((e) => e !== undefined),
  ];
}
