import { itemRefOf, type ReadItLaterItem } from '@kaihuman/formats';
import { type Bookmark, hostOf } from '../bookmarks.js';
import { frecency } from '../ranking.js';
import { contextText, type WorkContext } from './context.js';
import { promptJson } from './model.js';

/** An ordering of item ids, with a short reason for some of them. */
export interface Ranking {
  ids: string[];
  reasons: Record<string, string>;
  computedAt: number;
}

/** Global constraint: the model never sees more than this many candidates. */
const MAX_CANDIDATES = 20;
/** A small model orders a short list well and a long one badly. */
const MODEL_LIMIT = 12;
const MAX_REASON = 80;
const ARCHIVE_AFTER_MS = 60 * 86_400_000;

const SYSTEM = [
  'You order a list for a developer’s new tab page by what they are working on today.',
  'Put the most useful items first. Give each item you pick a reason of at most 80 characters.',
  'Use only the ids given, each at most once.',
].join(' ');

/**
 * The model's order for up to 20 candidates, or null when it is missing or its answer repeats or
 * invents an id (the schema forbids both, but a small model still does it). It may name only some
 * items; the caller appends the rest in rule order. Runs at background priority: it is precompute.
 */
export async function rerank(
  task: string,
  items: { id: string; text: string }[],
  ctx: WorkContext,
): Promise<Ranking | null> {
  const candidates = items.slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return null;
  const known = new Set(candidates.map((item) => item.id));
  const answer = await promptJson<{ ids: string[]; reasons: Record<string, string> }>({
    system: SYSTEM,
    input: [
      `Task: ${task}`,
      contextText(ctx),
      'Items:',
      ...candidates.map((item) => `${item.id}: ${item.text}`),
    ]
      .filter(Boolean)
      .join('\n'),
    schema: {
      type: 'object',
      properties: {
        ranked: {
          type: 'array',
          maxItems: candidates.length,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', enum: candidates.map((item) => item.id) },
              reason: { type: 'string', maxLength: MAX_REASON },
            },
            required: ['id', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: ['ranked'],
      additionalProperties: false,
    },
    validate: (raw) => {
      const ranked = (raw as { ranked?: unknown } | null)?.ranked;
      if (!Array.isArray(ranked)) return null;
      const ids: string[] = [];
      const reasons: Record<string, string> = {};
      for (const entry of ranked) {
        const id = (entry as { id?: unknown } | null)?.id;
        if (typeof id !== 'string' || !known.has(id) || ids.includes(id)) return null;
        ids.push(id);
        const reason = (entry as { reason?: unknown }).reason;
        if (typeof reason === 'string' && reason.trim()) {
          reasons[id] = reason.trim().slice(0, MAX_REASON);
        }
      }
      return { ids, reasons };
    },
    priority: 'background',
  });
  return answer ? { ...answer, computedAt: Date.now() } : null;
}

/**
 * `items` in the ranking's order. A cached ranking is hours old: ids it no longer knows are
 * dropped and items it never saw follow in the order they came in (the rule order).
 */
export function applyRanking<T extends { id: string }>(
  items: T[],
  ranking: Ranking | undefined,
): T[] {
  if (!ranking) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const ranked = ranking.ids.flatMap((id) => {
    const item = byId.get(id);
    byId.delete(id);
    return item ? [item] : [];
  });
  return [...ranked, ...byId.values()];
}

const normalHost = (host: string) => host.replace(/^www\./, '').toLowerCase();

/** `owner/repo` of a GitHub page, including a repo's home page, which `itemRefOf` calls a link. */
function repoOf(url: string): string | null {
  const ref = itemRefOf(url);
  if (ref && ref.kind !== 'link') return `${ref.owner}/${ref.repo}`.toLowerCase();
  try {
    const parsed = new URL(url);
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    return normalHost(parsed.hostname) === 'github.com' && owner && repo
      ? `${owner}/${repo}`.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

/** 1 when the bookmark's site or repo is one of a stream's, 0.5 when a tag is a stream label. */
export function streamBoost(b: Bookmark, ctx: WorkContext): number {
  const repo = repoOf(b.url);
  const host = hostOf(b.url).toLowerCase();
  const tags = new Set(b.tags.map((tag) => tag.toLowerCase()));
  let boost = 0;
  for (const stream of ctx.streams) {
    if (repo && stream.repos.some((value) => value.toLowerCase() === repo)) return 1;
    if (stream.hosts.some((value) => normalHost(value) === host)) return 1;
    if (stream.labels.some((label) => tags.has(label.toLowerCase()))) boost = 0.5;
  }
  return boost;
}

/** Rule order first, then the model's pick for the head, then whatever it left out. */
const merged = (rule: string[], answer: Ranking | null): Ranking => ({
  ids: answer ? [...answer.ids, ...rule.filter((id) => !answer.ids.includes(id))] : rule,
  reasons: answer?.reasons ?? {},
  computedAt: Date.now(),
});

/** Top 20 by frecency lifted by the work context, the model reordering the first 12. */
export async function likelyNext(
  bookmarks: Bookmark[],
  ctx: WorkContext,
  now: Date,
): Promise<Ranking> {
  // Pins have their own section on the page, so they would only waste candidate slots.
  const ruled = bookmarks
    .filter((b) => !b.pinned)
    .map((b) => ({ b, score: frecency(b, now) * (1 + streamBoost(b, ctx)) }))
    .sort((x, y) => y.score - x.score || y.b.lastUsedAt.localeCompare(x.b.lastUsedAt))
    .slice(0, MAX_CANDIDATES)
    .map(({ b }) => b);
  const answer = await rerank(
    'Which of these bookmarks will the user open next?',
    ruled.slice(0, MODEL_LIMIT).map((b) => ({
      id: b.id,
      text: `${b.title} (${hostOf(b.url)})${b.tags.length > 0 ? ` [${b.tags.join(', ')}]` : ''}`,
    })),
    ctx,
  );
  return merged(
    ruled.map((b) => b.id),
    answer,
  );
}

/** Oldest first is the rule; the model may lift what bears on today's work, saying why. */
export async function readLaterForToday(
  items: ReadItLaterItem[],
  ctx: WorkContext,
): Promise<Ranking> {
  const ruled = [...items].sort((a, b) => a.createdAt - b.createdAt).slice(0, MAX_CANDIDATES);
  const answer = await rerank(
    'Which of these saved pages are worth reading today?',
    ruled.map((item) => ({
      id: item.id,
      text: `${item.name || item.url}${item.summary ? ` - ${item.summary}` : ''}`,
    })),
    ctx,
  );
  return merged(
    ruled.map((item) => item.id),
    answer,
  );
}

/** Unread for two months: probably never, so the page offers to archive it. */
export function archiveCandidates(items: ReadItLaterItem[], now: Date): string[] {
  return items
    .filter((item) => item.status === 'new' && now.getTime() - item.createdAt > ARCHIVE_AFTER_MS)
    .map((item) => item.id);
}
