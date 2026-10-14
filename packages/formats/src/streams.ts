/**
 * Work streams: the URL helpers behind `.kh/streams.md` (doc/work-streams.md).
 * An item is identified by its normalised URL, so every spelling of one pull request
 * (trailing slash, `/files`, a fragment, `www.`) has to collapse to the same string.
 */

/** `owner/repo#number` with owner and repo lowercased — GitHub treats them case-insensitively. */
export type GithubKey = string & { readonly __brand: 'GithubKey' };

export type GithubRef = {
  kind: 'github-pr' | 'github-issue';
  owner: string;
  repo: string;
  number: number;
  key: GithubKey;
};

export type ItemRef = GithubRef | { kind: 'link'; host: string };

const GITHUB_HOSTS: readonly string[] = ['github.com', 'www.github.com'];
const GITHUB_PATH = /^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)(\/|$)/;
const TRACKING_PARAMS: readonly string[] = ['fbclid', 'gclid', 'mc_cid', 'mc_eid'];

export const githubKey = (owner: string, repo: string, number: number): GithubKey =>
  `${owner.toLowerCase()}/${repo.toLowerCase()}#${number}` as GithubKey;

const parseSafe = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    // Only web links are ever rendered as anchors; javascript: and file: must never get that far.
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    return null;
  }
};

export const isSafeUrl = (url: string): boolean => parseSafe(url) !== null;

const githubRefOf = (url: URL): GithubRef | null => {
  if (!GITHUB_HOSTS.includes(url.hostname)) return null;
  const match = GITHUB_PATH.exec(url.pathname);
  if (!match) return null;
  const [, owner = '', repo = '', type, digits = ''] = match;
  const number = Number(digits);
  return {
    kind: type === 'pull' ? 'github-pr' : 'github-issue',
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    number,
    key: githubKey(owner, repo, number),
  };
};

/** What a URL points at, or `null` when it is unsafe or not a URL. */
export const itemRefOf = (url: string): ItemRef | null => {
  const parsed = parseSafe(url);
  if (!parsed) return null;
  return githubRefOf(parsed) ?? { kind: 'link', host: parsed.hostname };
};

const isTracking = (name: string) => name.startsWith('utm_') || TRACKING_PARAMS.includes(name);

/** The canonical spelling of an item's URL; unsafe URLs come back unchanged. */
export const normalizeItemUrl = (url: string): string => {
  const parsed = parseSafe(url);
  if (!parsed) return url;
  const ref = githubRefOf(parsed);
  if (ref) {
    const type = ref.kind === 'github-pr' ? 'pull' : 'issues';
    return `https://github.com/${ref.owner}/${ref.repo}/${type}/${ref.number}`;
  }
  parsed.hash = '';
  for (const name of [...parsed.searchParams.keys()]) {
    if (isTracking(name)) parsed.searchParams.delete(name);
  }
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
};

export const STREAMS_PATH = '.kh/browser.streams.json';

export type StreamId = string & { readonly __brand: 'StreamId' };
export type ItemId = string & { readonly __brand: 'ItemId' };

export interface StreamItem {
  id: ItemId;
  url: string;
  title: string;
  addedAt: string;
  labels: string[];
  doneAt?: string;
  /** Keys this version does not know; written back unchanged. */
  extra: Record<string, unknown>;
}

export interface Stream {
  id: StreamId;
  name: string;
  createdAt: string;
  items: StreamItem[];
  /** Entries that failed validation; kept so a newer writer's data is never dropped. */
  invalidItems: unknown[];
  extra: Record<string, unknown>;
}

export interface StreamsFile {
  version: 1;
  updatedAt: string;
  streams: Stream[];
  invalidStreams: unknown[];
  extra: Record<string, unknown>;
}

export type StreamsParse = { ok: true; file: StreamsFile } | { ok: false; error: string };

type Rec = Record<string, unknown>;

const isRec = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const without = (rec: Rec, known: readonly string[]): Rec =>
  Object.fromEntries(Object.entries(rec).filter(([key]) => !known.includes(key)));

const ITEM_KEYS = ['id', 'url', 'title', 'addedAt', 'labels', 'doneAt'] as const;
const STREAM_KEYS = ['id', 'name', 'createdAt', 'items'] as const;
const FILE_KEYS = ['version', 'updatedAt', 'streams'] as const;

const toItem = (raw: unknown): StreamItem | null => {
  if (!isRec(raw)) return null;
  const { id, url, title, addedAt, labels, doneAt } = raw;
  if (!isString(id) || !isString(url) || !isSafeUrl(url)) return null;
  if (!isString(title) || !isString(addedAt)) return null;
  if (!Array.isArray(labels) || !labels.every(isString)) return null;
  if (doneAt !== undefined && !isString(doneAt)) return null;
  const item: StreamItem = {
    id: id as ItemId,
    url,
    title,
    addedAt,
    labels: [...labels],
    extra: without(raw, ITEM_KEYS),
  };
  if (doneAt !== undefined) item.doneAt = doneAt;
  return item;
};

const toStream = (raw: unknown): Stream | null => {
  if (!isRec(raw) || !isString(raw.id) || !Array.isArray(raw.items)) return null;
  const items: StreamItem[] = [];
  const invalidItems: unknown[] = [];
  for (const entry of raw.items) {
    const item = toItem(entry);
    if (item) items.push(item);
    else invalidItems.push(entry);
  }
  return {
    id: raw.id as StreamId,
    name: isString(raw.name) ? raw.name : '',
    createdAt: isString(raw.createdAt) ? raw.createdAt : '',
    items,
    invalidItems,
    extra: without(raw, STREAM_KEYS),
  };
};

export const parseStreams = (content: string): StreamsParse => {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false, error: `${STREAMS_PATH} is not valid JSON` };
  }
  if (!isRec(raw)) return { ok: false, error: `${STREAMS_PATH} is not a JSON object` };
  // A different version is reported, never "repaired": rewriting it would lose the other
  // version's data.
  if (raw.version !== 1) {
    return {
      ok: false,
      error: `${STREAMS_PATH} has version ${String(raw.version)}; this extension reads version 1`,
    };
  }
  const streams: Stream[] = [];
  const invalidStreams: unknown[] = [];
  for (const entry of Array.isArray(raw.streams) ? raw.streams : []) {
    const stream = toStream(entry);
    if (stream) streams.push(stream);
    else invalidStreams.push(entry);
  }
  return {
    ok: true,
    file: {
      version: 1,
      updatedAt: isString(raw.updatedAt) ? raw.updatedAt : '',
      streams,
      invalidStreams,
      extra: without(raw, FILE_KEYS),
    },
  };
};

const itemOut = (item: StreamItem): Rec => ({
  id: item.id,
  url: item.url,
  title: item.title,
  addedAt: item.addedAt,
  labels: item.labels,
  ...(item.doneAt === undefined ? {} : { doneAt: item.doneAt }),
  ...item.extra,
});

const streamOut = (stream: Stream): Rec => ({
  id: stream.id,
  name: stream.name,
  createdAt: stream.createdAt,
  items: [...stream.items.map(itemOut), ...stream.invalidItems],
  ...stream.extra,
});

export const serializeStreams = (file: StreamsFile): string =>
  `${JSON.stringify(
    {
      version: file.version,
      updatedAt: file.updatedAt,
      streams: [...file.streams.map(streamOut), ...file.invalidStreams],
      ...file.extra,
    },
    null,
    2,
  )}\n`;

export const emptyStreams = (now: string): StreamsFile => ({
  version: 1,
  updatedAt: now,
  streams: [],
  invalidStreams: [],
  extra: {},
});

const randomSuffix = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  // 256 is not a multiple of 36, but the slight bias is irrelevant for a local id.
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
};

export const newStreamId = (): StreamId => `st_${randomSuffix()}` as StreamId;
export const newItemId = (): ItemId => `it_${randomSuffix()}` as ItemId;
