import {
  getUpcomingMilestone,
  type Milestone,
  parseTodos,
  serializeTodos,
  type TodoData,
  type TodoPriority,
  type TodoStatus,
} from '@kaihuman/formats';

/** Bump only for breaking changes; v2 is purely additive over v1. */
export const WIDGET_SCHEMA_VERSION = 2 as const;

export interface WidgetTodoItem {
  id: string;
  filePath: string;
  indexInFile: number;
  text: string;
  status: TodoStatus;
  tags: string[];
  milestoneId?: string;
  milestoneName?: string;
  milestoneDueDate?: string;
  updatedAt?: number;
  priority?: TodoPriority;
  /** Never set here: the native widget marks toggles it could not commit yet. */
  pending?: boolean;
}

export interface WidgetMilestoneSummary {
  id: string;
  name: string;
  dueDate?: string;
  open: number;
  done: number;
}

export interface WidgetSnapshotOptions {
  /** IANA zone used for "today" and week boundaries. Defaults to the device zone. */
  timeZone?: string;
  lockScreenText?: boolean;
  knowledgeInbox?: number;
  weeklyGoal?: number;
}

export interface WidgetTodoSnapshot {
  schemaVersion: typeof WIDGET_SCHEMA_VERSION;
  updatedAt: number;
  repoFullName: string;
  branch: string;
  appFolder: '.kh' | '.lifeos';
  upcomingMilestone?: { id: string; name: string; dueDate?: string };
  counts: {
    inbox: number;
    inProgress: number;
    backlog: number;
    doneToday: number;
    knowledgeInbox: number;
    doneThisWeek: number;
  };
  stats: {
    /** Mon..Sun of the current local week. */
    doneByDay: number[];
    streakDays: number;
    weeklyGoal?: number;
  };
  milestones: WidgetMilestoneSummary[];
  /** Sorted unique tags of open items. */
  tags: string[];
  privacy: { lockScreenText: boolean };
  timeZone: string;
  items: WidgetTodoItem[];
  files: Record<string, { sha: string; content: string }>;
}

type WidgetFiles = WidgetTodoSnapshot['files'];

const TODOS_SUFFIX = '.todos.md';

const widgetItemId = (filePath: string, indexInFile: number): string =>
  `${filePath}#${indexInFile}`;

const resolveAppFolder = (files: WidgetFiles): WidgetTodoSnapshot['appFolder'] =>
  !Object.keys(files).some((p) => p.startsWith('.kh/')) &&
  Object.keys(files).some((p) => p.startsWith('.lifeos/'))
    ? '.lifeos'
    : '.kh';

/** Local calendar day (YYYY-MM-DD) of an instant in `timeZone`. */
const localDay = (ms: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const DAY_MS = 86_400_000;
// Calendar arithmetic on YYYY-MM-DD strings goes through UTC midnight, which has no DST jumps.
const shiftDay = (day: string, delta: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
/** 0 = Monday ... 6 = Sunday. */
const weekdayIndex = (day: string): number => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Lower rank sorts first: in-progress, inbox, backlog tied to the upcoming milestone, rest. */
const rank = (item: WidgetTodoItem, inboxPath: string, milestoneId?: string): number => {
  if (item.status === 'in-progress') return 0;
  if (item.filePath === inboxPath) return 1;
  return milestoneId && item.milestoneId === milestoneId ? 2 : 3;
};

export const buildWidgetTodoSnapshot = (
  files: WidgetFiles,
  repoFullName: string,
  branch = 'main',
  now = new Date(),
  options: WidgetSnapshotOptions = {},
): WidgetTodoSnapshot => {
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = localDay(now.getTime(), timeZone);
  const doneDays = new Map<string, number>();
  const milestoneStats = new Map<string, WidgetMilestoneSummary>();
  const tagSet = new Set<string>();
  const appFolder = resolveAppFolder(files);
  const inboxPath = `${appFolder}/inbox${TODOS_SUFFIX}`;
  const todoPaths = Object.keys(files)
    .filter((p) => p.startsWith(`${appFolder}/`) && p.endsWith(TODOS_SUFFIX))
    .sort();

  const milestones: Milestone[] = [];
  const all: WidgetTodoItem[] = [];
  const counts = {
    inbox: 0,
    inProgress: 0,
    backlog: 0,
    doneToday: 0,
    knowledgeInbox: options.knowledgeInbox ?? 0,
    doneThisWeek: 0,
  };

  for (const filePath of todoPaths) {
    const data = parseTodos(files[filePath]?.content ?? '');
    milestones.push(...data.milestones);
    for (const m of data.milestones) {
      if (!milestoneStats.has(m.id)) {
        milestoneStats.set(m.id, {
          id: m.id,
          name: m.name,
          ...(m.dueDate && { dueDate: m.dueDate }),
          open: 0,
          done: 0,
        });
      }
    }
    data.items.forEach((item, indexInFile) => {
      const stat = item.milestoneId ? milestoneStats.get(item.milestoneId) : undefined;
      if (item.status === 'done') {
        if (stat) stat.done++;
        if (item.updatedAt !== undefined) {
          const day = localDay(item.updatedAt, timeZone);
          doneDays.set(day, (doneDays.get(day) ?? 0) + 1);
        }
        return;
      }
      if (item.status === 'rejected') return;
      if (stat) stat.open++;
      for (const tag of item.tags) tagSet.add(tag);
      if (item.status === 'in-progress') counts.inProgress++;
      else if (filePath === inboxPath) counts.inbox++;
      else counts.backlog++;
      const milestone = data.milestones.find((m) => m.id === item.milestoneId);
      all.push({
        id: widgetItemId(filePath, indexInFile),
        filePath,
        indexInFile,
        text: item.text,
        status: item.status,
        tags: item.tags,
        milestoneId: item.milestoneId,
        milestoneName: milestone?.name,
        milestoneDueDate: milestone?.dueDate,
        updatedAt: item.updatedAt,
        ...(item.priority && { priority: item.priority }),
      });
    });
  }

  const upcoming = getUpcomingMilestone(milestones);
  // Stable sort keeps file order within a rank.
  const items = all
    .map((item) => ({ item, r: rank(item, inboxPath, upcoming?.id) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.item);

  counts.doneToday = doneDays.get(today) ?? 0;
  const monday = shiftDay(today, -weekdayIndex(today));
  const doneByDay = Array.from({ length: 7 }, (_, i) => doneDays.get(shiftDay(monday, i)) ?? 0);
  counts.doneThisWeek = doneByDay.reduce((a, b) => a + b, 0);
  // An empty today does not break a streak that is still alive until midnight.
  let streakDays = 0;
  for (
    let day = counts.doneToday > 0 ? today : shiftDay(today, -1);
    doneDays.has(day);
    day = shiftDay(day, -1)
  ) {
    streakDays++;
  }

  return {
    schemaVersion: WIDGET_SCHEMA_VERSION,
    updatedAt: now.getTime(),
    repoFullName,
    branch,
    appFolder,
    ...(upcoming && {
      upcomingMilestone: { id: upcoming.id, name: upcoming.name, dueDate: upcoming.dueDate },
    }),
    counts,
    stats: {
      doneByDay,
      streakDays,
      ...(options.weeklyGoal !== undefined && { weeklyGoal: options.weeklyGoal }),
    },
    milestones: [...milestoneStats.values()],
    tags: [...tagSet].sort(),
    privacy: { lockScreenText: options.lockScreenText ?? true },
    timeZone,
    items,
    files,
  };
};

/**
 * Marks an open item done. Returns null for unknown or already-closed items so callers
 * (JS bridge, native intents) treat a stale widget tap as a no-op.
 */
export const applyWidgetTodoToggle = (
  snapshot: WidgetTodoSnapshot,
  itemId: string,
  now = new Date(),
): {
  snapshot: WidgetTodoSnapshot;
  updatedFilePath: string;
  updatedContent: string;
  baseSha: string;
} | null => {
  const target = snapshot.items.find((i) => i.id === itemId);
  const file = target && snapshot.files[target.filePath];
  if (!target || !file) return null;
  if (target.status !== 'backlog' && target.status !== 'in-progress') return null;

  const data: TodoData = parseTodos(file.content);
  const current = data.items[target.indexInFile];
  if (!current || current.text !== target.text) return null;

  const items = [...data.items];
  items[target.indexInFile] = { ...current, status: 'done', updatedAt: now.getTime() };
  const updatedContent = serializeTodos({ ...data, items });

  const next = buildWidgetTodoSnapshot(
    { ...snapshot.files, [target.filePath]: { sha: file.sha, content: updatedContent } },
    snapshot.repoFullName,
    snapshot.branch,
    now,
    {
      timeZone: snapshot.timeZone,
      lockScreenText: snapshot.privacy.lockScreenText,
      knowledgeInbox: snapshot.counts.knowledgeInbox,
      weeklyGoal: snapshot.stats.weeklyGoal,
    },
  );
  return { snapshot: next, updatedFilePath: target.filePath, updatedContent, baseSha: file.sha };
};
