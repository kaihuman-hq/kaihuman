import { ideaSlugOf, parseActionLog, parseIdea, parseTodos } from '@kaihuman/formats';
import { todoDetailHref, todoRefId } from '../screens/todo-detail.js';
import { parseWikiFrontmatter, WIKI_FOLDER, wikiPageHref } from '../screens/wiki-screen.js';

export type SearchKind =
  | 'todo'
  | 'idea'
  | 'wiki'
  | 'knowledge'
  | 'bookmark'
  | 'log'
  | 'note'
  | 'file';

/** Where a tap on a result goes: an in-app screen, or a web page in the system browser. */
export type SearchTarget = { type: 'route'; href: string } | { type: 'url'; url: string };

export interface SearchDoc {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  /** Body text, searched but shown only as a snippet. */
  text?: string;
  /** Tags and the like: searched, never shown. */
  keywords?: string;
  path: string;
  target: SearchTarget;
}

/** A long file would dominate memory and the per-query scan for hits nobody scrolls to. */
export const MAX_TEXT = 20_000;

const RAW_FOLDER = '.kh/raw';

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

// Same encoding as `routeToHref`'s 'file' case.
const fileHref = (path: string) => `/files/${path.split('/').map(encodeURIComponent).join('/')}`;
const fileTarget = (path: string): SearchTarget => ({ type: 'route', href: fileHref(path) });

/** Encrypted blobs and binaries decode to noise that would only produce false hits. */
const searchableText = (path: string, content: string | null): string | undefined => {
  if (content === null || path.endsWith('.enc') || content.includes('\u0000')) return undefined;
  return content.slice(0, MAX_TEXT);
};

const firstLine = (content: string | undefined): string | undefined =>
  content
    ?.split('\n')
    .map((l) => l.replace(/^\s*#+\s*/, '').trim())
    .find(Boolean);

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// Opened in the system browser, so only web links count (a `javascript:` bookmark must not open).
const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

function bookmarkDocs(path: string, text: string | undefined): SearchDoc[] {
  if (text === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : asRecord(parsed)?.bookmarks;
  if (!Array.isArray(list)) return [];
  const docs: SearchDoc[] = [];
  list.forEach((entry, i) => {
    const b = asRecord(entry);
    const url = typeof b?.url === 'string' ? b.url : '';
    if (!b || !isWebUrl(url)) return;
    const title = typeof b.title === 'string' && b.title.trim() ? b.title : url;
    const tags = Array.isArray(b.tags)
      ? b.tags.filter((t): t is string => typeof t === 'string')
      : [];
    docs.push({
      id: `bookmark:${path}#${typeof b.id === 'string' ? b.id : i}`,
      kind: 'bookmark',
      title,
      subtitle: url,
      keywords: tags.join(' '),
      path,
      target: { type: 'url', url },
    });
  });
  return docs;
}

function todoDocs(path: string, text: string): SearchDoc[] {
  const data = parseTodos(text);
  const milestones = new Map(data.milestones.map((m) => [m.id, m.name]));
  return data.items.map((item, index) => {
    const milestone = item.milestoneId
      ? (milestones.get(item.milestoneId) ?? item.milestoneId)
      : '';
    const id = todoRefId({ path, index });
    return {
      id: `todo:${id}`,
      kind: 'todo' as const,
      title: item.text,
      subtitle: [item.status, milestone, basename(path)].filter(Boolean).join(' · '),
      keywords: [...item.tags, milestone].filter(Boolean).join(' '),
      path,
      target: { type: 'route' as const, href: todoDetailHref(id) },
    };
  });
}

function logDocs(path: string, text: string): SearchDoc[] {
  return parseActionLog(text).entries.map((entry, i) => ({
    id: `log:${path}#${i}`,
    kind: 'log' as const,
    title: entry.description,
    subtitle: entry.timestamp,
    keywords: entry.tags.join(' '),
    path,
    target: fileTarget(path),
  }));
}

/**
 * Every searchable thing one repo file holds. A file whose content is not cached yields
 * name-only docs, so it is still findable by its name.
 */
export function docsForFile(path: string, content: string | null): SearchDoc[] {
  const text = searchableText(path, content);
  const name = basename(path);
  const docs: SearchDoc[] = [];
  const isMarkdown = path.endsWith('.md');

  if (text !== undefined && path.endsWith('.todos.md')) docs.push(...todoDocs(path, text));
  else if (text !== undefined && path.endsWith('.actionlog.md')) docs.push(...logDocs(path, text));
  else if (path.endsWith('.bookmarks.json')) docs.push(...bookmarkDocs(path, text));
  else if (isMarkdown && ideaSlugOf(path)) {
    const slug = ideaSlugOf(path);
    const idea = text === undefined ? null : parseIdea(text);
    docs.push({
      id: `idea:${path}`,
      kind: 'idea',
      title: idea?.title || slug || name,
      subtitle: idea ? [idea.status, idea.product].filter(Boolean).join(' · ') : undefined,
      keywords: idea?.tags.join(' '),
      text,
      path,
      target: { type: 'route', href: `/ideas/${slug}` },
    });
  } else if (isMarkdown && path.startsWith(`${WIKI_FOLDER}/`)) {
    const meta = text === undefined ? null : parseWikiFrontmatter(text);
    docs.push({
      id: `wiki:${path}`,
      kind: 'wiki',
      title: meta?.title || name.replace(/\.md$/, ''),
      subtitle: dirname(path),
      keywords: meta?.tags.join(' '),
      text,
      path,
      target: { type: 'route', href: wikiPageHref(path) },
    });
  } else if (isMarkdown && path.startsWith(`${RAW_FOLDER}/`)) {
    docs.push({
      id: `knowledge:${path}`,
      kind: 'knowledge',
      title: (text && parseWikiFrontmatter(text).title) || firstLine(text) || name,
      subtitle: dirname(path),
      text,
      path,
      target: fileTarget(path),
    });
  } else if (isMarkdown && !path.endsWith('.todos.md') && !path.endsWith('.actionlog.md')) {
    docs.push({
      id: `note:${path}`,
      kind: 'note',
      title: firstLine(text) || name,
      subtitle: dirname(path),
      text,
      path,
      target: fileTarget(path),
    });
  }

  docs.push({
    id: `file:${path}`,
    kind: 'file',
    title: name,
    subtitle: dirname(path),
    // A richer doc already carries the body, so the file doc stays name-only to avoid a duplicate hit.
    text: docs.length > 0 ? undefined : text,
    path,
    target: fileTarget(path),
  });
  return docs;
}
