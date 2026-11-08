import {
  addTodoEntry,
  getUpcomingMilestone,
  IDEAS_FOLDER,
  type IdeaActivityLevel,
  ideaActivity,
  ideaSlugOf,
  type Milestone,
  OPEN_IDEA_STATUSES,
  parseHabitData,
  parseIdea,
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
  /** The item's own due date (YYYY-MM-DD, local); additive in v2. */
  dueDate?: string;
  /** HH:MM, local; only with dueDate. */
  dueTime?: string;
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

/** v2 extras: derived, trimmed data only — never raw wiki, idea or habit files (doc §5.4). */
export interface WidgetIdeaSummary {
  /** Count per idea status (`seed`, `exploring`, ...), open and closed. */
  byStatus: Record<string, number>;
  /** Up to 3 open ideas, most recently active first. */
  hot: { slug: string; title: string; level: IdeaActivityLevel }[];
}

export interface WidgetKnowledgeCard {
  /** Repo path of the wiki page, e.g. `.kh/wiki/foo.md`. */
  path: string;
  title: string;
  /** Plain text, at most 280 characters. */
  excerpt: string;
  tags: string[];
}

export interface WidgetHabit {
  /** Repo path of the `.habit.csv` file. */
  path: string;
  name: string;
  doneToday: boolean;
  streakDays: number;
  /** Never set here: the native widget marks check-ins it queued for the app. */
  pending?: boolean;
}

export interface WidgetExtras {
  knowledgeInbox: number;
  ideas?: WidgetIdeaSummary;
  cards?: WidgetKnowledgeCard[];
  habits?: WidgetHabit[];
}

export interface WidgetSnapshotOptions {
  /** IANA zone used for "today" and week boundaries. Defaults to the device zone. */
  timeZone?: string;
  lockScreenText?: boolean;
  knowledgeInbox?: number;
  weeklyGoal?: number;
  ideas?: WidgetIdeaSummary;
  cards?: WidgetKnowledgeCard[];
  habits?: WidgetHabit[];
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
  // v2 widget set (optional: absent when the app has none of that data loaded)
  ideas?: WidgetIdeaSummary;
  cards?: WidgetKnowledgeCard[];
  habits?: WidgetHabit[];
}

/**
 * Something a widget or intent did that the app must commit (offline, stale SHA, or no direct
 * write path). `kind` is absent in v1 files, which only ever held toggles.
 */
export type PendingWidgetMutation =
  | { kind?: 'toggle'; itemId: string; timestamp: number }
  | { kind: 'move'; itemId: string; status: 'backlog' | 'in-progress'; timestamp: number }
  | { kind: 'capture'; text: string; timestamp: number }
  | { kind: 'habit'; path: string; date: string; timestamp: number };

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
        ...(item.dueDate && { dueDate: item.dueDate }),
        ...(item.dueTime && { dueTime: item.dueTime }),
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
    ...(options.ideas && { ideas: options.ideas }),
    ...(options.cards && { cards: options.cards }),
    ...(options.habits && { habits: options.habits }),
  };
};

type WidgetMutationResult = {
  snapshot: WidgetTodoSnapshot;
  updatedFilePath: string;
  updatedContent: string;
  baseSha: string;
} | null;

/** Every option a rebuild must carry forward, or a widget tap would silently drop extras. */
const optionsOf = (snapshot: WidgetTodoSnapshot): WidgetSnapshotOptions => ({
  timeZone: snapshot.timeZone,
  lockScreenText: snapshot.privacy.lockScreenText,
  knowledgeInbox: snapshot.counts.knowledgeInbox,
  weeklyGoal: snapshot.stats.weeklyGoal,
  ideas: snapshot.ideas,
  cards: snapshot.cards,
  habits: snapshot.habits,
});

const rebuild = (
  snapshot: WidgetTodoSnapshot,
  path: string,
  sha: string,
  content: string,
  now: Date,
): WidgetTodoSnapshot =>
  buildWidgetTodoSnapshot(
    { ...snapshot.files, [path]: { sha, content } },
    snapshot.repoFullName,
    snapshot.branch,
    now,
    optionsOf(snapshot),
  );

/**
 * Moves an open item to `status`. Returns null for unknown, closed or drifted items and for a
 * move to the status the item already has, so a stale widget tap is a no-op.
 */
export const applyWidgetTodoMove = (
  snapshot: WidgetTodoSnapshot,
  itemId: string,
  status: 'done' | 'in-progress' | 'backlog',
  now = new Date(),
): WidgetMutationResult => {
  const target = snapshot.items.find((i) => i.id === itemId);
  const file = target && snapshot.files[target.filePath];
  if (!target || !file) return null;
  if (target.status !== 'backlog' && target.status !== 'in-progress') return null;
  if (target.status === status) return null;

  const data: TodoData = parseTodos(file.content);
  const current = data.items[target.indexInFile];
  if (!current || current.text !== target.text) return null;

  const items = [...data.items];
  items[target.indexInFile] = { ...current, status, updatedAt: now.getTime() };
  const updatedContent = serializeTodos({ ...data, items });
  return {
    snapshot: rebuild(snapshot, target.filePath, file.sha, updatedContent, now),
    updatedFilePath: target.filePath,
    updatedContent,
    baseSha: file.sha,
  };
};

/** Marks an open item done (see `applyWidgetTodoMove`). */
export const applyWidgetTodoToggle = (
  snapshot: WidgetTodoSnapshot,
  itemId: string,
  now = new Date(),
): WidgetMutationResult => applyWidgetTodoMove(snapshot, itemId, 'done', now);

/** Appends a todo to the app inbox, the same line the app's quick-todo writes. */
export const applyWidgetCapture = (
  snapshot: WidgetTodoSnapshot,
  text: string,
  now = new Date(),
): WidgetMutationResult => {
  const path = `${snapshot.appFolder}/inbox${TODOS_SUFFIX}`;
  const file = snapshot.files[path];
  let updatedContent: string;
  try {
    updatedContent = addTodoEntry(file?.content ?? '', { text: text.trim() }, now);
  } catch {
    return null; // empty text, or only #tags
  }
  const baseSha = file?.sha ?? '';
  return {
    snapshot: rebuild(snapshot, path, baseSha, updatedContent, now),
    updatedFilePath: path,
    updatedContent,
    baseSha,
  };
};

// --- v2 extras -------------------------------------------------------------------------------

const MAX_CARDS = 20;
const EXCERPT_MAX = 280;

const splitFrontmatter = (text: string): { front: string[]; body: string } => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) return { front: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
  }
  return { front: [], body: lines.join('\n') };
};

const stripQuotes = (v: string): string => v.trim().replace(/^["']|["']$/g, '');

/** `tags: [a, b]` or a block list of `  - a` lines. */
const frontmatterTags = (front: string[]): string[] => {
  const i = front.findIndex((l) => l.startsWith('tags:'));
  if (i < 0) return [];
  const inline = (front[i] ?? '').slice(5).trim();
  if (inline) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(stripQuotes)
      .filter(Boolean);
  }
  const tags: string[] = [];
  for (const line of front.slice(i + 1)) {
    const m = /^\s+-\s+(.+)$/.exec(line);
    if (!m?.[1]) break;
    tags.push(stripQuotes(m[1]));
  }
  return tags;
};

const toExcerpt = (body: string): string => {
  const plain = body
    .replace(/^#{1,6}\s.*$/gm, ' ') // headings: the title is shown separately
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length <= EXCERPT_MAX ? plain : `${plain.slice(0, EXCERPT_MAX - 1).trimEnd()}…`;
};

const basenameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** Deterministic PRNG so cards rotate per local day but stay put within it. */
const seededRandom = (seed: string): (() => number) => {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const humanise = (name: string): string => {
  const spaced = name.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Streak of consecutive reached days ending today, or yesterday while today is still open. */
const habitStreak = (reached: Set<string>, today: string): number => {
  let streak = 0;
  for (
    let day = reached.has(today) ? today : shiftDay(today, -1);
    reached.has(day);
    day = shiftDay(day, -1)
  ) {
    streak++;
  }
  return streak;
};

/**
 * Derives the v2 widget extras from loaded files. Only trimmed summaries leave this function
 * (doc §5.4); `.enc` files are ciphertext and never count.
 */
export const buildWidgetExtras = (
  files: Record<string, { content: string }>,
  now = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): WidgetExtras => {
  const paths = Object.keys(files)
    .filter((p) => !p.endsWith('.enc'))
    .sort();
  const folder = resolveAppFolder(files as WidgetFiles);
  const today = localDay(now.getTime(), timeZone);
  const content = (p: string) => files[p]?.content ?? '';

  const knowledgeInbox = paths.filter((p) => p.startsWith(`${folder}/raw/`)).length;

  const byStatus: Record<string, number> = {};
  const open: { slug: string; title: string; level: IdeaActivityLevel; at: number }[] = [];
  let ideaCount = 0;
  for (const p of paths) {
    const slug = p.endsWith('.md') && p.startsWith(`${IDEAS_FOLDER}/`) ? ideaSlugOf(p) : null;
    if (!slug) continue;
    const idea = parseIdea(content(p));
    ideaCount++;
    byStatus[idea.status] = (byStatus[idea.status] ?? 0) + 1;
    if (!OPEN_IDEA_STATUSES.includes(idea.status)) continue;
    const activity = ideaActivity(idea, now);
    open.push({ slug, title: idea.title, level: activity.level, at: activity.lastAt ?? -1 });
  }
  const hot = open
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
    .map(({ slug, title, level }) => ({ slug, title, level }));

  const wikiPaths = paths.filter((p) => p.startsWith(`${folder}/wiki/`) && p.endsWith('.md'));
  const random = seededRandom(today);
  const picked = [...wikiPaths];
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [picked[i], picked[j]] = [picked[j] as string, picked[i] as string];
  }
  const cards: WidgetKnowledgeCard[] = picked.slice(0, MAX_CARDS).map((path) => {
    const { front, body } = splitFrontmatter(content(path));
    const heading = /^# +(.+?)\s*#*\s*$/m.exec(body)?.[1];
    return {
      path,
      title: heading ?? basenameOf(path).replace(/\.md$/, ''),
      excerpt: toExcerpt(body),
      tags: frontmatterTags(front),
    };
  });

  const habits: WidgetHabit[] = paths
    .filter((p) => p.startsWith(`${folder}/`) && p.endsWith('.habit.csv'))
    .map((path) => {
      const reached = new Set(
        parseHabitData(content(path))
          .entries.filter((e) => e.reached)
          .map((e) => e.date),
      );
      return {
        path,
        name: humanise(basenameOf(path).replace(/\.habit\.csv$/, '')),
        doneToday: reached.has(today),
        streakDays: habitStreak(reached, today),
      };
    });

  return {
    knowledgeInbox,
    ...(ideaCount > 0 && { ideas: { byStatus, hot } }),
    ...(cards.length > 0 && { cards }),
    ...(habits.length > 0 && { habits }),
  };
};
