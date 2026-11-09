/**
 * The board overview tile (`.board-overview.json`): the per-column counts, plus the settings the
 * web widget exposes (visible columns, scope, overdue threshold, age filter) as pure edits.
 */
import {
  type BoardOverviewConfig,
  parseBoardOverviewConfig,
  parseTodos,
  serializeBoardOverviewConfig,
} from '@kaihuman/formats';

const DAY_MS = 86_400_000;

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

export type BoardScope = NonNullable<BoardOverviewConfig['scope']>;

export const boardConfig = (content: string): BoardOverviewConfig =>
  parseBoardOverviewConfig(content);

/**
 * Applies a settings change. Day counts are whole numbers: `overdueDays` at least 1 and
 * `minAgeDays` at least 0, as the web inputs enforce; anything else keeps the current value.
 */
export const updateBoardConfig = (content: string, patch: Partial<BoardOverviewConfig>): string => {
  const cfg = parseBoardOverviewConfig(content);
  const next = { ...cfg, ...patch };
  if (!Number.isInteger(next.overdueDays) || next.overdueDays < 1) {
    next.overdueDays = cfg.overdueDays;
  }
  if (!Number.isInteger(next.minAgeDays) || next.minAgeDays < 0) {
    next.minAgeDays = cfg.minAgeDays;
  }
  return serializeBoardOverviewConfig(next);
};

/** The sheet's column toggles, in board order. */
export const BOARD_TOGGLES: readonly {
  key: 'showBacklog' | 'showInProgress' | 'showDone' | 'showRejected' | 'showOverdue';
  label: string;
}[] = [
  { key: 'showBacklog', label: 'Inbox' },
  { key: 'showInProgress', label: 'In Progress' },
  { key: 'showDone', label: 'Done' },
  { key: 'showRejected', label: 'Rejected' },
  { key: 'showOverdue', label: 'Overdue' },
];

export const BOARD_SCOPES: readonly { value: BoardScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
];
