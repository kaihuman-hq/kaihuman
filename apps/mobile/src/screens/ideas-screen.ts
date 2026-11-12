import {
  addIdeaChallenge,
  findIdeas,
  type Idea,
  type IdeaActivity,
  type IdeaSlug,
  type IdeaStatus,
  ideaActivity,
  ideaLogEntryTime,
  ideaPath,
  ideaSlugOf,
  isIdeaStatus,
  logIdea,
  type NewIdea,
  newIdea,
  OPEN_IDEA_STATUSES,
  parseIdea,
  setIdeaStatus,
} from '@kaihuman/formats';
import { type ContentFiles, githubContentFiles } from './file-editor-screen.js';

export interface IdeaEntry {
  slug: IdeaSlug;
  idea: Idea;
  activity: IdeaActivity;
  /** Log entries per week for the last 12 weeks, oldest first; the last bucket is the past 7 days. */
  strip: number[];
}

export type IdeaStatusFilter = IdeaStatus | 'open' | 'all';
export type IdeaSort = 'activity' | 'updated' | 'title';

export interface IdeaFilters {
  status: IdeaStatusFilter;
  query: string;
  /** Exact product name, or null for all. */
  product: string | null;
  sort: IdeaSort;
}

export interface StatusChip {
  status: IdeaStatusFilter;
  count: number;
}

export interface IdeasDeps {
  files?: ContentFiles;
  now?: () => Date;
  /** Written into log entries; `human` unless an agent is acting. */
  author?: string;
}

export const ACTIVITY_WEEKS = 12;
const WEEK = 7 * 86_400_000;

export const activityStrip = (idea: Idea, now: Date): number[] => {
  const strip = new Array<number>(ACTIVITY_WEEKS).fill(0);
  for (const entry of idea.log) {
    const at = ideaLogEntryTime(entry.at);
    if (at === null) continue;
    const weeksAgo = Math.floor((now.getTime() - at) / WEEK);
    if (weeksAgo < 0 || weeksAgo >= ACTIVITY_WEEKS) continue;
    strip[ACTIVITY_WEEKS - 1 - weeksAgo] = (strip[ACTIVITY_WEEKS - 1 - weeksAgo] ?? 0) + 1;
  }
  return strip;
};

export class IdeasScreenController {
  private readonly files: ContentFiles;
  private readonly now: () => Date;
  private readonly author: string;
  private ideas = new Map<IdeaSlug, IdeaEntry>();
  private readonly listeners = new Set<() => void>();
  filters: IdeaFilters = { status: 'open', query: '', product: null, sort: 'activity' };

  constructor({ files, now, author }: IdeasDeps = {}) {
    this.files = files ?? githubContentFiles;
    this.now = now ?? (() => new Date());
    this.author = author ?? 'human';
  }

  async load(): Promise<void> {
    await this.files.refresh();
    const next = new Map<IdeaSlug, IdeaEntry>();
    await Promise.all(
      this.files.tree().map(async (item) => {
        const slug = ideaSlugOf(item.path);
        if (!slug) return;
        try {
          next.set(slug, this.entry(slug, await this.files.read(item.path)));
        } catch {
          // An unreadable idea is skipped rather than failing the whole list.
        }
      }),
    );
    this.ideas = next;
  }

  setFilters(patch: Partial<IdeaFilters>): void {
    this.filters = { ...this.filters, ...patch };
  }

  /** Applies a `kaihuman://ideas?status=` link; unknown values leave the filter unchanged. */
  applyLinkStatus(status: string | undefined): void {
    if (status && (isIdeaStatus(status) || status === 'open' || status === 'all')) {
      this.setFilters({ status });
    }
  }

  /** Chips for every status, plus `open` and `all`, counted against product and search only. */
  chips(): StatusChip[] {
    const base = this.matching({ ...this.filters, status: 'all' });
    const count = (pred: (e: IdeaEntry) => boolean) => base.filter(pred).length;
    return [
      { status: 'open', count: count((e) => OPEN_IDEA_STATUSES.includes(e.idea.status)) },
      ...(['seed', 'exploring', 'committed', 'shipped', 'parked', 'dropped'] as const).map(
        (status) => ({
          status,
          count: count((e) => e.idea.status === status),
        }),
      ),
      { status: 'all' as const, count: base.length },
    ];
  }

  products(): string[] {
    return [
      ...new Set([...this.ideas.values()].flatMap((e) => (e.idea.product ? [e.idea.product] : []))),
    ].sort();
  }

  view(): IdeaEntry[] {
    const entries = this.matching(this.filters);
    const { sort } = this.filters;
    const time = (e: IdeaEntry) => (e.idea.updated ? Date.parse(e.idea.updated) || 0 : 0);
    return entries.sort((a, b) =>
      sort === 'title'
        ? a.idea.title.localeCompare(b.idea.title)
        : sort === 'updated'
          ? time(b) - time(a)
          : (b.activity.lastAt ?? 0) - (a.activity.lastAt ?? 0) || a.slug.localeCompare(b.slug),
    );
  }

  get(slug: IdeaSlug): IdeaEntry | undefined {
    return this.ideas.get(slug);
  }

  async log(slug: IdeaSlug, message: string): Promise<void> {
    await this.edit(slug, (text, now) => logIdea(text, message, { now, author: this.author }));
  }

  async challenge(slug: IdeaSlug, challenge: string): Promise<void> {
    await this.edit(slug, (text, now) => addIdeaChallenge(text, challenge, { now }));
  }

  async setStatus(slug: IdeaSlug, status: string, reason?: string): Promise<void> {
    if (!isIdeaStatus(status)) throw new Error(`"${status}" is not an idea status.`);
    await this.edit(slug, (text, now) =>
      setIdeaStatus(text, status, { now, author: this.author, reason }),
    );
  }

  /** Creates the idea file (never overwriting) and returns its slug. */
  async create(input: NewIdea): Promise<IdeaSlug> {
    const { slug, path, content } = newIdea(input, { now: this.now(), author: this.author });
    await this.files.create(path, content);
    this.ideas.set(slug, this.entry(slug, content));
    return slug;
  }

  /** Deletes the idea file; the git history keeps it recoverable. */
  async remove(slug: IdeaSlug): Promise<void> {
    await this.files.remove(ideaPath(slug));
    this.ideas.delete(slug);
  }

  private entry(slug: IdeaSlug, text: string): IdeaEntry {
    const idea = parseIdea(text);
    const now = this.now();
    return { slug, idea, activity: ideaActivity(idea, now), strip: activityStrip(idea, now) };
  }

  private async edit(slug: IdeaSlug, change: (text: string, now: Date) => string): Promise<void> {
    const path = ideaPath(slug);
    const next = change(await this.files.read(path), this.now());
    // Optimistic: the list shows the change at once; a failed save puts the old entry back.
    const before = this.ideas.get(slug);
    this.ideas.set(slug, this.entry(slug, next));
    this.changed();
    try {
      await this.files.write(path, next);
    } catch (err) {
      if (before) this.ideas.set(slug, before);
      else this.ideas.delete(slug);
      this.changed();
      throw err;
    }
  }

  /** Called after every optimistic change and rollback; returns unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }

  private matching(filters: IdeaFilters): IdeaEntry[] {
    let entries = [...this.ideas.values()];
    const { status, product, query } = filters;
    if (status === 'open')
      entries = entries.filter((e) => OPEN_IDEA_STATUSES.includes(e.idea.status));
    else if (status !== 'all') entries = entries.filter((e) => e.idea.status === status);
    if (product) entries = entries.filter((e) => e.idea.product === product);
    if (query.trim()) {
      const found = new Set(findIdeas(entries, query).map((r) => r.slug));
      entries = entries.filter((e) => found.has(e.slug));
    }
    return entries;
  }
}
