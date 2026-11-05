import {
  getUpcomingMilestone,
  type Milestone,
  parseTodos,
  serializeTodos,
  type TodoData,
  type TodoStatus,
} from '@kaihuman/formats';

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
}

export interface WidgetTodoSnapshot {
  updatedAt: number;
  repoFullName: string;
  branch: string;
  appFolder: '.kh' | '.lifeos';
  upcomingMilestone?: { id: string; name: string; dueDate?: string };
  counts: { inbox: number; inProgress: number; backlog: number; doneToday: number };
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

const sameUtcDay = (ms: number, now: Date): boolean =>
  new Date(ms).toISOString().slice(0, 10) === now.toISOString().slice(0, 10);

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
): WidgetTodoSnapshot => {
  const appFolder = resolveAppFolder(files);
  const inboxPath = `${appFolder}/inbox${TODOS_SUFFIX}`;
  const todoPaths = Object.keys(files)
    .filter((p) => p.startsWith(`${appFolder}/`) && p.endsWith(TODOS_SUFFIX))
    .sort();

  const milestones: Milestone[] = [];
  const all: WidgetTodoItem[] = [];
  const counts = { inbox: 0, inProgress: 0, backlog: 0, doneToday: 0 };

  for (const filePath of todoPaths) {
    const data = parseTodos(files[filePath]?.content ?? '');
    milestones.push(...data.milestones);
    data.items.forEach((item, indexInFile) => {
      if (item.status === 'done') {
        if (item.updatedAt !== undefined && sameUtcDay(item.updatedAt, now)) counts.doneToday++;
        return;
      }
      if (item.status === 'rejected') return;
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
      });
    });
  }

  const upcoming = getUpcomingMilestone(milestones);
  // Stable sort keeps file order within a rank.
  const items = all
    .map((item) => ({ item, r: rank(item, inboxPath, upcoming?.id) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.item);

  return {
    updatedAt: now.getTime(),
    repoFullName,
    branch,
    appFolder,
    ...(upcoming && {
      upcomingMilestone: { id: upcoming.id, name: upcoming.name, dueDate: upcoming.dueDate },
    }),
    counts,
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
  );
  return { snapshot: next, updatedFilePath: target.filePath, updatedContent, baseSha: file.sha };
};
