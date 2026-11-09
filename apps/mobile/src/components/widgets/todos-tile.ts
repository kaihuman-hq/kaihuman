/**
 * Pure logic behind the `.todos.md` tile: the view (rows, tags, milestones) and the mutators for
 * the web TodoWidget's features: add with tags, milestone, due and repeat; status; milestones;
 * AI prompts. Parsing and serialising stay in `@kaihuman/formats`.
 */
import {
  addMilestone,
  addTodo,
  localDate,
  type Milestone,
  migrateLegacyFormat,
  parseTodos,
  removeMilestone,
  serializeTodos,
  setMilestone,
  setPrompt,
  setStatus,
  type TodoData,
  type TodoDue,
  type TodoPrompt,
  type TodoRepeat,
  type TodoStatus,
  updateMilestone,
} from '@kaihuman/formats';
import { setDueOnData, setRepeatOnData } from '../../screens/todo-due.js';
import type { TileResult } from './tile-controllers.js';

const ok = (content: string): TileResult => ({ ok: true, content });
const fail = (error: string): TileResult => ({ ok: false, error });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isOpen = (s: TodoStatus): boolean => s === 'backlog' || s === 'in-progress';

export interface TodoRow {
  /** Position in the file; the stable handle for every mutator. */
  index: number;
  id: string;
  text: string;
  status: TodoStatus;
  tags: string[];
  /** Milestone name; `milestoneId` is the handle. */
  milestone?: string;
  milestoneId?: string;
  dueDate?: string;
  dueTime?: string;
  repeat?: TodoRepeat;
  prompt?: TodoPrompt;
}

export interface TodosView {
  rows: TodoRow[];
  openCount: number;
  upcomingMilestone?: Milestone;
  /** Every tag used in the file, sorted. */
  tags: string[];
  milestones: Milestone[];
  /** Done or rejected todos hidden because they are older than the cut-off. */
  hiddenCount: number;
  /** The file predates the current `.todos.md` format and can be migrated. */
  legacy: boolean;
}

/** Done and rejected todos fade off the tile an hour after their last change (`Infinity`: never). */
export const todosView = (content: string, now: Date, hideOlderThanMs = 3_600_000): TodosView => {
  const data = parseTodos(content);
  const names = new Map(data.milestones.map((m) => [m.id, m.name]));
  const rows: TodoRow[] = [];
  let hiddenCount = 0;
  data.items.forEach((item, index) => {
    if (
      !isOpen(item.status) &&
      item.updatedAt &&
      now.getTime() - item.updatedAt >= hideOlderThanMs
    ) {
      hiddenCount++;
      return;
    }
    rows.push({
      index,
      id: item.id,
      text: item.text,
      status: item.status,
      tags: item.tags,
      milestone: item.milestoneId ? names.get(item.milestoneId) : undefined,
      ...(item.milestoneId && { milestoneId: item.milestoneId }),
      ...(item.dueDate && { dueDate: item.dueDate }),
      ...(item.dueTime && { dueTime: item.dueTime }),
      ...(item.repeat && { repeat: item.repeat }),
      ...(item.prompt && { prompt: item.prompt }),
    });
  });
  const today = localDate(now);
  const upcomingMilestone = data.milestones
    .filter((m) => m.dueDate && m.dueDate >= today)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0];
  return {
    rows,
    openCount: rows.filter((r) => isOpen(r.status)).length,
    upcomingMilestone,
    tags: [...new Set(data.items.flatMap((i) => i.tags))].sort(),
    milestones: data.milestones,
    hiddenCount,
    legacy: data.isLegacyFormat,
  };
};

/** Rows carrying `tag`; every row when no tag is chosen. */
export const filterByTag = (rows: readonly TodoRow[], tag: string | null): TodoRow[] =>
  tag ? rows.filter((r) => r.tags.includes(tag)) : [...rows];

/** Tag as typed to the stored form: lower case, no `#`, words joined by `-` (as the web form does). */
export const normalizeTag = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const touch = (data: TodoData, index: number, now: Date): TodoData => ({
  ...data,
  items: data.items.map((it, i) => (i === index ? { ...it, updatedAt: now.getTime() } : it)),
});

/** Open todos (backlog or in progress) become done; done or rejected ones reopen. */
export const toggleTodo = (content: string, index: number, now: Date): string => {
  const data = parseTodos(content);
  const item = data.items[index];
  if (!item) return content;
  const next: TodoStatus = isOpen(item.status) ? 'done' : 'backlog';
  return serializeTodos(touch(setStatus(data, index, next), index, now));
};

/** Sets the status directly (the web status picker). A recurring todo set to done advances instead. */
export const setTodoStatusAt = (
  content: string,
  index: number,
  status: TodoStatus,
  now: Date,
): TileResult => {
  const data = parseTodos(content);
  if (!data.items[index]) return fail('Task not found');
  return ok(serializeTodos(touch(setStatus(data, index, status), index, now)));
};

export interface NewTodoDetails {
  milestoneId?: string;
  due?: TodoDue;
  repeat?: TodoRepeat;
}

export const addTodoTask = (
  content: string,
  text: string,
  now: Date,
  tags: string[] = [],
  details: NewTodoDetails = {},
): TileResult => {
  const clean = text.trim();
  if (!clean) return fail('Enter a task');
  const data = parseTodos(content);
  if (details.milestoneId && !data.milestones.some((m) => m.id === details.milestoneId)) {
    return fail('Unknown milestone');
  }
  const cleanTags = [...new Set(tags.map(normalizeTag).filter(Boolean))];
  let next = addTodo(data, clean, cleanTags, details.milestoneId, undefined, now);
  const index = next.items.length - 1;
  try {
    if (details.due) next = setDueOnData(next, index, details.due);
    if (details.due && details.repeat) next = setRepeatOnData(next, index, details.repeat);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Invalid due date');
  }
  return ok(serializeTodos(next));
};

/** Sets or clears a task's due date; `repeat` replaces the rule (`null` clears it), as `DueSheet` reports. */
export const setTodoDueAt = (
  content: string,
  index: number,
  due: TodoDue | undefined,
  repeat?: TodoRepeat | null,
): TileResult => {
  try {
    const dated = setDueOnData(parseTodos(content), index, due);
    const done =
      due && repeat !== undefined ? setRepeatOnData(dated, index, repeat ?? undefined) : dated;
    return ok(serializeTodos(done));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Invalid due date');
  }
};

export const setTodoMilestoneAt = (
  content: string,
  index: number,
  milestoneId: string | undefined,
): TileResult => {
  const data = parseTodos(content);
  if (!data.items[index]) return fail('Task not found');
  if (milestoneId && !data.milestones.some((m) => m.id === milestoneId)) {
    return fail('Unknown milestone');
  }
  return ok(serializeTodos(setMilestone(data, index, milestoneId)));
};

// ─── Milestones ──────────────────────────────────────────────────────────────

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);

const validDate = (date: string | undefined): boolean => !date || ISO_DATE.test(date);

export const addMilestoneTo = (
  content: string,
  name: string,
  dueDate: string | undefined,
  now: Date,
): TileResult => {
  const clean = name.trim();
  if (!clean) return fail('Enter a milestone name');
  if (!validDate(dueDate)) return fail('Use a date like 2026-12-31');
  const data = parseTodos(content);
  const base = `${slug(clean) || 'ms'}-${now.getTime().toString(36).slice(-4)}`;
  let id = base;
  for (let n = 2; data.milestones.some((m) => m.id === id); n++) id = `${base}-${n}`;
  return ok(serializeTodos(addMilestone(data, { id, name: clean, ...(dueDate && { dueDate }) })));
};

/** Renames a milestone and/or moves its date (`null` clears it). */
export const editMilestone = (
  content: string,
  id: string,
  change: { name?: string; dueDate?: string | null },
): TileResult => {
  const data = parseTodos(content);
  if (!data.milestones.some((m) => m.id === id)) return fail('Milestone not found');
  const update: Partial<Omit<Milestone, 'id'>> = {};
  if (change.name !== undefined) {
    const clean = change.name.trim();
    if (!clean) return fail('Enter a milestone name');
    update.name = clean;
  }
  if (change.dueDate !== undefined) {
    if (change.dueDate !== null && !ISO_DATE.test(change.dueDate)) {
      return fail('Use a date like 2026-12-31');
    }
    update.dueDate = change.dueDate ?? undefined;
  }
  return ok(serializeTodos(updateMilestone(data, id, update)));
};

/** Deleting a milestone also unassigns it from its tasks. */
export const deleteMilestone = (content: string, id: string): TileResult => {
  const data = parseTodos(content);
  if (!data.milestones.some((m) => m.id === id)) return fail('Milestone not found');
  return ok(serializeTodos(removeMilestone(data, id)));
};

// ─── AI prompts ──────────────────────────────────────────────────────────────

/** The prompt as the web widget copies it: its lines, then `ref: <file>`. */
export const promptText = (prompt: TodoPrompt | undefined): string =>
  [...(prompt?.lines ?? []), prompt?.refFile ? `ref: ${prompt.refFile}` : '']
    .filter(Boolean)
    .join('\n');

/** Saves a task's prompt from the editor's text; blank text and no ref remove it. */
export const setTodoPromptAt = (
  content: string,
  index: number,
  text: string,
  refFile: string,
): TileResult => {
  const data = parseTodos(content);
  if (!data.items[index]) return fail('Task not found');
  const lines = text.split('\n').filter((l) => l.trim());
  const ref = refFile.trim();
  const prompt = lines.length > 0 || ref ? { lines, ...(ref && { refFile: ref }) } : undefined;
  return ok(serializeTodos(setPrompt(data, index, prompt)));
};

/** Rewrites a file in the old checkbox format into the current one. */
export const migrateTodos = (content: string): string => migrateLegacyFormat(content);
