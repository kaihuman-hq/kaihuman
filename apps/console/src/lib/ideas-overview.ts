/**
 * Pure logic behind the `/ideas` overview: activity buckets, sorting, filtering and the colour
 * tokens. Kept free of Preact so it can be tested without a DOM.
 */

import {
  findIdeas,
  type Idea,
  type IdeaActivity,
  type IdeaRef,
  type IdeaStatus,
  ideaActivity,
  ideaLogEntryTime,
  OPEN_IDEA_STATUSES,
} from '@kaihuman/formats';

export const ACTIVITY_WEEKS = 12;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

export interface IdeaCard extends IdeaRef {
  activity: IdeaActivity;
  /** Log entries per week, oldest first; the last bucket is the 7 days up to now. */
  weeks: number[];
  openChallenges: number;
  /** `created` as ms since epoch, or null when missing or unreadable. */
  createdAt: number | null;
}

/** Log entries per 7-day window, oldest first. Entries older than the strip are left out. */
export const weeklyActivity = (idea: Idea, now: Date, weeks = ACTIVITY_WEEKS): number[] => {
  const counts = new Array<number>(weeks).fill(0);
  for (const entry of idea.log) {
    const at = ideaLogEntryTime(entry.at);
    if (at === null) continue;
    // A small clock skew can put an entry slightly in the future: count it as this week.
    const ago = Math.max(0, Math.floor((now.getTime() - at) / WEEK));
    if (ago < weeks) counts[weeks - 1 - ago] = (counts[weeks - 1 - ago] ?? 0) + 1;
  }
  return counts;
};

export const toIdeaCard = (ref: IdeaRef, now: Date): IdeaCard => {
  const created = ref.idea.created ? Date.parse(ref.idea.created) : Number.NaN;
  return {
    ...ref,
    activity: ideaActivity(ref.idea, now),
    weeks: weeklyActivity(ref.idea, now),
    openChallenges: ref.idea.challenges.filter((c) => !c.done).length,
    createdAt: Number.isNaN(created) ? null : created,
  };
};

export const isOpenStatus = (status: IdeaStatus) => OPEN_IDEA_STATUSES.includes(status);

export const IDEA_SORTS = ['activity', 'created', 'title'] as const;
export type IdeaSort = (typeof IDEA_SORTS)[number];

/** Newest first; a missing time sorts last. */
const byTimeDesc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

/** Open ideas first, then by the chosen key; the slug breaks ties so the order is stable. */
export const sortIdeaCards = (cards: readonly IdeaCard[], sort: IdeaSort): IdeaCard[] =>
  [...cards].sort((a, b) => {
    const open = Number(isOpenStatus(b.idea.status)) - Number(isOpenStatus(a.idea.status));
    if (open) return open;
    const key =
      sort === 'activity'
        ? byTimeDesc(a.activity.lastAt, b.activity.lastAt)
        : sort === 'created'
          ? byTimeDesc(a.createdAt, b.createdAt)
          : a.idea.title.localeCompare(b.idea.title, undefined, { sensitivity: 'base' });
    return key || a.slug.localeCompare(b.slug);
  });

export interface IdeaFilter {
  query: string;
  /** Empty string for every product. */
  product: string;
}

/** Cards matching the text (via `findIdeas`) and the product; the status filter comes later. */
export const matchIdeaCards = (cards: readonly IdeaCard[], { query, product }: IdeaFilter) => {
  const byProduct = product ? cards.filter((c) => c.idea.product === product) : [...cards];
  if (!query.trim()) return byProduct;
  const hits = new Set(findIdeas(byProduct, query).map((ref) => ref.slug));
  return byProduct.filter((c) => hits.has(c.slug));
};

export const countByStatus = (cards: readonly IdeaCard[]): Record<IdeaStatus, number> => {
  const counts: Record<IdeaStatus, number> = {
    seed: 0,
    exploring: 0,
    committed: 0,
    shipped: 0,
    parked: 0,
    dropped: 0,
  };
  for (const card of cards) counts[card.idea.status]++;
  return counts;
};

/**
 * Which cards the grid shows: a picked status shows exactly that status (closed or not);
 * otherwise the open ones, plus the closed ones when `showClosed` is on.
 */
export const visibleIdeaCards = (
  cards: readonly IdeaCard[],
  status: IdeaStatus | null,
  showClosed: boolean,
) =>
  cards.filter((c) =>
    status ? c.idea.status === status : showClosed || isOpenStatus(c.idea.status),
  );

export const ideaProducts = (cards: readonly IdeaCard[]) =>
  [...new Set(cards.flatMap((c) => (c.idea.product ? [c.idea.product] : [])))].sort();

// --- presentation -----------------------------------------------------------------------------

/** CSS colour of a status; the variables live in `ideas.css`, with a light-theme variant. */
export const statusColor = (status: IdeaStatus) => `var(--idea-status-${status})`;

/**
 * Shade 0–4 of one week's square: 0 is neutral (no entries), then 1, 2, 3–4 and 5+ entries.
 * Fixed steps rather than relative to the busiest week, so a square means the same on every card.
 */
export const weekShade = (count: number): 0 | 1 | 2 | 3 | 4 =>
  count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;

/** `just now`, `5 min ago`, `2 h ago`, `3 d ago`, `4 w ago`, `5 mo ago`, `2 y ago`. */
export const relativeTime = (at: number, now: Date) => {
  const diff = Math.max(0, now.getTime() - at);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} d ago`;
  if (days < 60) return `${Math.floor(days / 7)} w ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} y ago`;
};

/** `3 in 30 d · 12 total · 2 h ago`, or `no activity yet` for an idea without log entries. */
export const activitySummary = ({ recent, total, lastAt }: IdeaActivity, now: Date) => {
  if (total === 0) return 'no activity yet';
  const last = lastAt === null ? '' : ` · ${relativeTime(lastAt, now)}`;
  return `${recent} in 30 d · ${total} total${last}`;
};
