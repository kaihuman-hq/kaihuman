import type { Milestone, TodoStatus } from '@kaihuman/formats';
import { type LoadedTodoFile, loadTodoFiles, mergeMilestones } from './kanban-board.js';
import { githubRepoFiles, type RepoFiles } from './quick-capture.js';

export type TimeFrame = 'ALL' | '4W' | '13W' | '52W';

const FRAME_DAYS: Record<Exclude<TimeFrame, 'ALL'>, number> = { '4W': 28, '13W': 91, '52W': 365 };
const DAY_MS = 86_400_000;

export interface VelocityPoint {
  /** ISO week such as `2026-W38`. */
  week: string;
  count: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface MilestoneProgress {
  milestone: Milestone;
  byStatus: Record<TodoStatus, number>;
  total: number;
  donePct: number;
}

export interface TodoSummary {
  total: number;
  byStatus: Record<TodoStatus, number>;
  /** done / (done + rejected) in percent; null while nothing is closed. */
  completionRate: number | null;
}

const emptyCounts = (): Record<TodoStatus, number> => ({
  backlog: 0,
  'in-progress': 0,
  done: 0,
  rejected: 0,
});

/** ISO-8601 week label, matching the console's analytics charts. */
export const isoWeekLabel = (d: Date): string => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

export class TodoAnalyticsController {
  private loaded: LoadedTodoFile[] = [];

  constructor(
    private readonly files: RepoFiles = githubRepoFiles,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async load(): Promise<void> {
    this.loaded = await loadTodoFiles(this.files);
  }

  private get items() {
    return this.loaded.flatMap((f) => f.data.items);
  }

  summary(): TodoSummary {
    const byStatus = emptyCounts();
    const items = this.items;
    for (const item of items) byStatus[item.status]++;
    const closed = byStatus.done + byStatus.rejected;
    return {
      total: items.length,
      byStatus,
      completionRate: closed > 0 ? Math.round((byStatus.done / closed) * 100) : null,
    };
  }

  /** Done items per week by last update, with empty weeks between the first and last filled in as zero. */
  velocity(frame: TimeFrame = 'ALL'): VelocityPoint[] {
    const cutoff = frame === 'ALL' ? 0 : this.clock().getTime() - FRAME_DAYS[frame] * DAY_MS;
    const stamps = this.items
      .filter((i) => i.status === 'done' && i.updatedAt !== undefined && i.updatedAt >= cutoff)
      .map((i) => i.updatedAt as number);
    if (stamps.length === 0) return [];
    const counts = new Map<string, number>();
    // Walk week by week from the Monday of the first stamp so gaps appear as zero bars.
    const first = new Date(Math.min(...stamps));
    const cursor = new Date(
      first.getFullYear(),
      first.getMonth(),
      first.getDate() - ((first.getDay() || 7) - 1),
    );
    const last = Math.max(...stamps);
    while (cursor.getTime() <= last) {
      counts.set(isoWeekLabel(cursor), 0);
      cursor.setDate(cursor.getDate() + 7);
    }
    for (const ts of stamps) {
      const week = isoWeekLabel(new Date(ts));
      counts.set(week, (counts.get(week) ?? 0) + 1);
    }
    return [...counts].map(([week, count]) => ({ week, count }));
  }

  tagDistribution(limit = 12): TagCount[] {
    const counts = new Map<string, number>();
    for (const item of this.items)
      for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  }

  milestoneProgress(): MilestoneProgress[] {
    const items = this.items;
    return mergeMilestones(this.loaded).map((milestone) => {
      const byStatus = emptyCounts();
      let total = 0;
      for (const item of items) {
        if (item.milestoneId !== milestone.id) continue;
        byStatus[item.status]++;
        total++;
      }
      return {
        milestone,
        byStatus,
        total,
        donePct: total ? Math.round((byStatus.done / total) * 100) : 0,
      };
    });
  }
}
