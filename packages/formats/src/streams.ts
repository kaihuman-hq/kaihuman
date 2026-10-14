/**
 * Work streams: the file format and URL helpers behind `.kh/browser.streams.json`
 * (doc/work-streams.md). An item is identified by its normalised URL, so every spelling of one
 * pull request (trailing slash, `/files`, a fragment, `www.`) has to collapse to the same string.
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

/**
 * Hash-routed apps (Gmail's `#inbox/<id>`, `#!/board/7`) keep the page identity in the fragment,
 * so dropping it would merge every thread into one item; plain anchors (`#top`) are just scroll
 * positions on the same page.
 */
const isRouteFragment = (hash: string): boolean => hash.startsWith('#!') || hash.includes('/');

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
  const route = isRouteFragment(parsed.hash);
  if (!route) parsed.hash = '';
  for (const name of [...parsed.searchParams.keys()]) {
    if (isTracking(name)) parsed.searchParams.delete(name);
  }
  // A hash-routed app is mounted at its exact path, so it is left as the app serves it.
  if (!route && parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
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
  if (!isRec(raw) || !isString(raw.id) || !isString(raw.name) || !isString(raw.createdAt)) {
    return null;
  }
  if (!Array.isArray(raw.items)) return null;
  const items: StreamItem[] = [];
  const invalidItems: unknown[] = [];
  for (const entry of raw.items) {
    const item = toItem(entry);
    if (item) items.push(item);
    else invalidItems.push(entry);
  }
  return {
    id: raw.id as StreamId,
    name: raw.name,
    createdAt: raw.createdAt,
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
  // Missing or mistyped known fields make the file read-only rather than being coerced:
  // a write would otherwise replace whatever a newer writer put there.
  if (!Array.isArray(raw.streams)) {
    return { ok: false, error: `${STREAMS_PATH} is missing a "streams" array` };
  }
  if (!isString(raw.updatedAt)) {
    return { ok: false, error: `${STREAMS_PATH} is missing "updatedAt"` };
  }
  const streams: Stream[] = [];
  const invalidStreams: unknown[] = [];
  for (const entry of raw.streams) {
    const stream = toStream(entry);
    if (stream) streams.push(stream);
    else invalidStreams.push(entry);
  }
  return {
    ok: true,
    file: {
      version: 1,
      updatedAt: raw.updatedAt,
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
  // Filtered so a stray known key in `extra` can never override a typed field.
  ...without(item.extra, ITEM_KEYS),
});

const streamOut = (stream: Stream): Rec => ({
  id: stream.id,
  name: stream.name,
  createdAt: stream.createdAt,
  items: [...stream.items.map(itemOut), ...stream.invalidItems],
  ...without(stream.extra, STREAM_KEYS),
});

export const serializeStreams = (file: StreamsFile): string =>
  `${JSON.stringify(
    {
      version: file.version,
      updatedAt: file.updatedAt,
      streams: [...file.streams.map(streamOut), ...file.invalidStreams],
      ...without(file.extra, FILE_KEYS),
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

export const PRUNE_AFTER_DAYS = 14;

export type StreamOp =
  | { op: 'addStream'; streamId: StreamId; name: string; at: string }
  | { op: 'renameStream'; streamId: StreamId; name: string }
  | { op: 'deleteStream'; streamId: StreamId }
  | { op: 'reorderStreams'; order: StreamId[] }
  | {
      op: 'pin';
      streamId: StreamId;
      itemId: ItemId;
      url: string;
      title: string;
      labels: string[];
      at: string;
    }
  | { op: 'move'; itemId: ItemId; streamId: StreamId; index?: number }
  | { op: 'setLabels'; itemId: ItemId; labels: string[] }
  | { op: 'markDone'; itemId: ItemId; at: string }
  | { op: 'undone'; itemId: ItemId }
  | { op: 'remove'; itemId: ItemId }
  | { op: 'prune'; now: string };

const cleanLabels = (labels: readonly string[]): string[] => [
  ...new Set(labels.map((label) => label.trim()).filter((label) => label !== '')),
];

const cleanName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('Give the stream a name');
  return trimmed;
};

const withStreams = (file: StreamsFile, streams: Stream[]): StreamsFile => ({ ...file, streams });

const mapItem = (
  file: StreamsFile,
  itemId: ItemId,
  change: (item: StreamItem) => StreamItem,
): StreamsFile =>
  withStreams(
    file,
    file.streams.map((stream) => ({
      ...stream,
      items: stream.items.map((item) => (item.id === itemId ? change(item) : item)),
    })),
  );

const findItem = (file: StreamsFile, itemId: ItemId): StreamItem | undefined => {
  for (const stream of file.streams) {
    const item = stream.items.find((candidate) => candidate.id === itemId);
    if (item) return item;
  }
  return undefined;
};

const dropItem = (file: StreamsFile, itemId: ItemId): StreamsFile =>
  withStreams(
    file,
    file.streams.map((stream) => ({
      ...stream,
      items: stream.items.filter((item) => item.id !== itemId),
    })),
  );

/** Put `item` into the stream at `index` (default: the end), removing it from wherever it was. */
const place = (
  file: StreamsFile,
  streamId: StreamId,
  item: StreamItem,
  index?: number,
): StreamsFile => {
  const without = dropItem(file, item.id);
  return withStreams(
    without,
    without.streams.map((stream) => {
      if (stream.id !== streamId) return stream;
      const items = [...stream.items];
      items.splice(index === undefined ? items.length : Math.max(0, index), 0, item);
      return { ...stream, items };
    }),
  );
};

export const findItemByUrl = (
  file: StreamsFile,
  url: string,
): { stream: Stream; item: StreamItem } | undefined => {
  const wanted = normalizeItemUrl(url);
  for (const stream of file.streams) {
    const item = stream.items.find((candidate) => normalizeItemUrl(candidate.url) === wanted);
    if (item) return { stream, item };
  }
  return undefined;
};

const DAY_MS = 86_400_000;

const pin = (file: StreamsFile, op: Extract<StreamOp, { op: 'pin' }>): StreamsFile => {
  if (!isSafeUrl(op.url)) throw new Error('Only http and https pages can be pinned');
  if (!file.streams.some((stream) => stream.id === op.streamId)) return file;
  const url = normalizeItemUrl(op.url);
  const existing = findItemByUrl(file, url);
  if (!existing) {
    const item: StreamItem = {
      id: op.itemId,
      url,
      title: op.title,
      addedAt: op.at,
      labels: cleanLabels(op.labels),
      extra: {},
    };
    return place(file, op.streamId, item);
  }
  const { doneAt: _cleared, ...rest } = existing.item;
  const merged: StreamItem = {
    ...rest,
    labels: cleanLabels([...existing.item.labels, ...op.labels]),
  };
  // Re-pinning inside the same stream keeps the item where the user put it.
  const index =
    existing.stream.id === op.streamId
      ? existing.stream.items.findIndex((item) => item.id === merged.id)
      : undefined;
  return place(file, op.streamId, merged, index);
};

export const applyOp = (file: StreamsFile, op: StreamOp): StreamsFile => {
  switch (op.op) {
    case 'addStream': {
      const name = cleanName(op.name);
      if (file.streams.some((stream) => stream.id === op.streamId)) return file;
      const stream: Stream = {
        id: op.streamId,
        name,
        createdAt: op.at,
        items: [],
        invalidItems: [],
        extra: {},
      };
      return withStreams(file, [...file.streams, stream]);
    }
    case 'renameStream': {
      const name = cleanName(op.name);
      return withStreams(
        file,
        file.streams.map((stream) => (stream.id === op.streamId ? { ...stream, name } : stream)),
      );
    }
    case 'deleteStream':
      return withStreams(
        file,
        file.streams.filter((stream) => stream.id !== op.streamId),
      );
    case 'reorderStreams': {
      const listed = op.order.flatMap((id) => file.streams.filter((stream) => stream.id === id));
      const first = [...new Set(listed)];
      return withStreams(file, [...first, ...file.streams.filter((s) => !first.includes(s))]);
    }
    case 'pin':
      return pin(file, op);
    case 'move': {
      const item = findItem(file, op.itemId);
      if (!item || !file.streams.some((stream) => stream.id === op.streamId)) return file;
      return place(file, op.streamId, item, op.index);
    }
    case 'setLabels': {
      const labels = cleanLabels(op.labels);
      return mapItem(file, op.itemId, (item) => ({ ...item, labels }));
    }
    case 'markDone':
      return mapItem(file, op.itemId, (item) =>
        item.doneAt === undefined ? { ...item, doneAt: op.at } : item,
      );
    case 'undone':
      return mapItem(file, op.itemId, (item) => {
        const { doneAt: _cleared, ...rest } = item;
        return rest;
      });
    case 'remove':
      return dropItem(file, op.itemId);
    case 'prune': {
      return withStreams(
        file,
        file.streams.map((stream) => ({
          ...stream,
          items: stream.items.filter((item) => {
            if (item.doneAt === undefined) return true;
            return !(Date.parse(op.now) - Date.parse(item.doneAt) > PRUNE_AFTER_DAYS * DAY_MS);
          }),
        })),
      );
    }
  }
};

export const applyOps = (file: StreamsFile, ops: StreamOp[], updatedAt: string): StreamsFile => {
  const applied = ops.reduce(applyOp, file);
  return { ...applyOp(applied, { op: 'prune', now: updatedAt }), updatedAt };
};

export const streamLabels = (file: StreamsFile): string[] =>
  [...new Set(file.streams.flatMap((stream) => stream.items.flatMap((item) => item.labels)))].sort(
    (a, b) => a.localeCompare(b),
  );
