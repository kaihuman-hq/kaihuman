/**
 * Pure presenters and mutators for the file kinds beyond the dashboard basics: RSS feeds, travel
 * plans, the board overview and the command-palette settings. Same contract as
 * `tile-controllers.ts`: `*View` turns file text into plain view data, mutators return new text.
 */
import {
  addRssFeed,
  type BoardOverviewConfig,
  markRssItemRead,
  parseBoardOverviewConfig,
  parseRssConfig,
  parseTodos,
  type RssItem,
  readPaletteSettings,
  removeRssFeed,
  searchEngineProblem,
  serializeRssConfig,
  toolProblem,
} from '@kaihuman/formats';

import type { TileResult } from './tile-controllers.js';

const ok = (content: string): TileResult => ({ ok: true, content });
const fail = (error: string): TileResult => ({ ok: false, error });
const DAY_MS = 86_400_000;

const httpHref = (url: string): string | null => {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

// ─── .rss.json ───────────────────────────────────────────────────────────────

export interface FeedState {
  title?: string;
  items: RssItem[];
  fetchedAt: number;
  loading: boolean;
  error?: string;
}

/** Fetched feeds keyed by feed url. */
export type FeedSnapshot = Readonly<Record<string, FeedState>>;

export interface RssItemRow {
  feedId: string;
  /** guid, else link: what `read` stores. */
  key: string;
  title: string;
  link: string;
  /** Feed title or hostname. */
  source: string;
  /** ISO, or null when the feed gave no usable date. */
  date: string | null;
  unread: boolean;
}

export interface RssFeedRow {
  id: string;
  url: string;
  title: string;
  unread: number;
  total: number;
  status: 'idle' | 'loading' | 'error';
  error?: string;
}

export interface RssView {
  feeds: RssFeedRow[];
  /** Newest first, at most 50. */
  items: RssItemRow[];
  unreadCount: number;
}

const RSS_ITEM_LIMIT = 50;

export const rssView = (content: string, feeds: FeedSnapshot, _now: Date): RssView => {
  const config = parseRssConfig(content);
  const feedRows: RssFeedRow[] = [];
  const all: RssItemRow[] = [];
  let unreadCount = 0;
  for (const feed of config.feedOptions) {
    const state = feeds[feed.url];
    const source = state?.title || hostOf(feed.url);
    const read = new Set(feed.read);
    let unread = 0;
    for (const item of state?.items ?? []) {
      const key = item.guid || item.link;
      const isUnread = !read.has(key);
      if (isUnread) unread++;
      const ms = item.pubDate ? Date.parse(item.pubDate) : Number.NaN;
      all.push({
        feedId: feed.id,
        key,
        title: item.title,
        link: item.link,
        source,
        date: Number.isNaN(ms) ? null : new Date(ms).toISOString(),
        unread: isUnread,
      });
    }
    unreadCount += unread;
    feedRows.push({
      id: feed.id,
      url: feed.url,
      title: source,
      unread,
      total: state?.items.length ?? 0,
      status: state?.loading ? 'loading' : state?.error ? 'error' : 'idle',
      ...(state?.error ? { error: state.error } : {}),
    });
  }
  // Array.sort is stable, so equal dates keep feed order; undated items sink.
  all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return { feeds: feedRows, items: all.slice(0, RSS_ITEM_LIMIT), unreadCount };
};

/** Which items the RSS list shows; Unread is the default everywhere. */
export type RssFilter = 'unread' | 'all';

export const filterRssItems = (items: readonly RssItemRow[], filter: RssFilter): RssItemRow[] =>
  filter === 'unread' ? items.filter((i) => i.unread) : [...items];

export const markRssRead = (content: string, feedId: string, key: string): string =>
  serializeRssConfig(markRssItemRead(parseRssConfig(content), feedId, key));

export const addRssFeedUrl = (content: string, url: string, id: string): TileResult => {
  const href = httpHref(url);
  if (!href) return fail('Enter an http(s) URL');
  const config = parseRssConfig(content);
  if (config.feedOptions.some((f) => httpHref(f.url) === href)) {
    return fail('That feed is already added');
  }
  return ok(serializeRssConfig(addRssFeed(config, url.trim(), id)));
};

export const removeRssFeedById = (content: string, feedId: string): string =>
  serializeRssConfig(removeRssFeed(parseRssConfig(content), feedId));

export * from './travel-tile.js';

// ─── .board-overview.json ────────────────────────────────────────────────────

export interface BoardItem {
  text: string;
  file: string;
  ageDays: number;
  overdue: boolean;
}

export interface BoardColumn {
  status: 'backlog' | 'in-progress' | 'done' | 'rejected';
  label: string;
  count: number;
  items: BoardItem[];
}

export interface BoardOverviewView {
  /** Only the columns the config enables. */
  columns: BoardColumn[];
  overdueCount: number;
  files: number;
}

const BUSINESS_PREFIX = '.kh/business/';

const COLUMNS: readonly {
  status: BoardColumn['status'];
  label: string;
  flag: keyof BoardOverviewConfig;
}[] = [
  { status: 'backlog', label: 'Inbox', flag: 'showBacklog' },
  { status: 'in-progress', label: 'In Progress', flag: 'showInProgress' },
  { status: 'done', label: 'Done', flag: 'showDone' },
  { status: 'rejected', label: 'Rejected', flag: 'showRejected' },
];

export const boardOverviewView = (
  configContent: string,
  todoFiles: readonly { path: string; content: string }[],
  now: Date,
): BoardOverviewView => {
  const cfg = parseBoardOverviewConfig(configContent);
  const scope = cfg.scope ?? 'all';
  const files = todoFiles.filter(
    (f) => scope === 'all' || (scope === 'business') === f.path.startsWith(BUSINESS_PREFIX),
  );
  const nowMs = now.getTime();
  const minAge = cfg.minAgeDays * DAY_MS;
  const overdueAfter = cfg.overdueDays * DAY_MS;
  const buckets = new Map<BoardColumn['status'], BoardItem[]>();
  let overdueCount = 0;

  for (const file of files) {
    for (const item of parseTodos(file.content).items) {
      const created = item.createdAt ? Date.parse(item.createdAt) : Number.NaN;
      const createdMs = Number.isNaN(created) ? 0 : created;
      if (minAge > 0 && createdMs > 0 && nowMs - createdMs < minAge) continue;
      let overdue = false;
      if (item.status === 'in-progress' && cfg.showOverdue) {
        const ts = item.updatedAt ?? (createdMs || null);
        overdue = !ts || nowMs - ts >= overdueAfter;
        if (overdue) overdueCount++;
      }
      const since = createdMs || item.updatedAt || 0;
      const list = buckets.get(item.status) ?? [];
      list.push({
        text: item.text,
        file: file.path,
        ageDays: since ? Math.max(0, Math.floor((nowMs - since) / DAY_MS)) : 0,
        overdue,
      });
      buckets.set(item.status, list);
    }
  }

  return {
    columns: COLUMNS.filter((c) => cfg[c.flag]).map(({ status, label }) => {
      const items = (buckets.get(status) ?? []).sort((a, b) => b.ageDays - a.ageDays);
      return { status, label, count: items.length, items };
    }),
    overdueCount,
    files: files.length,
  };
};

// ─── command-palette.settings.json ───────────────────────────────────────────

export interface PaletteEntryRow {
  prefix: string;
  name: string;
  detail: string;
  enabled: boolean;
  problem: string | null;
}

export interface PaletteSettingsView {
  engines: PaletteEntryRow[];
  assistants: PaletteEntryRow[];
  tools: PaletteEntryRow[];
  problems: string[];
}

export const paletteSettingsView = (content: string): PaletteSettingsView => {
  const { settings, error } = readPaletteSettings(content);
  const row = (
    prefix: string,
    name: string,
    detail: string,
    problem: string | null,
  ): PaletteEntryRow => ({ prefix, name, detail, enabled: problem === null, problem });
  const engines = settings.searchEngines.map((e) => row('', e.name, e.url, searchEngineProblem(e)));
  const assistants = settings.assistants.map((a) =>
    row('', a.name, a.url, searchEngineProblem(a, 'An assistant')),
  );
  const tools = settings.tools.map((t, i) =>
    row(t.prefix, t.name, t.description ?? t.url, toolProblem(t, settings.tools.slice(0, i))),
  );
  const problems = [...engines, ...assistants, ...tools]
    .map((r) => r.problem)
    .filter((p): p is string => p !== null);
  return { engines, assistants, tools, problems: error ? [error, ...problems] : problems };
};
