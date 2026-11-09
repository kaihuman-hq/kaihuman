/**
 * Logic for the Todo Widget (.todos.md)
 *
 * Format v2 (flat list with inline metadata):
 *   ---
 *   color: sky            (optional file color, one of TODO_COLORS)
 *   milestones:
 *     - id: v1.0
 *       name: Version 1.0
 *       dueDate: 2026-04-15
 *   ---
 *
 *   - [ ] backlog task #tag1 #tag2
 *   - [>] in-progress task #tag !milestone-id ^super-high
 *   - [x] done task #tag
 *   - [-] rejected task
 *     > Prompt text line 1
 *     > Prompt line 2
 *     > ref:path/to/prompts.md
 *
 * Priority token (optional, after tags/milestone): ^high, ^super-high, ^ultra-high.
 * Unknown ^words stay in the text.
 *
 * Metadata line (optional, right after a task): `::updated:: <ms> ::created:: <iso> ::due:: <due>`.
 * `<due>` is a local date `YYYY-MM-DD` or date-time `YYYY-MM-DDTHH:MM`; any part may be absent.
 * `::due::` goes after them so parsers that only know `::updated::`/`::created::` still read the line.
 * Recurring todos add `::repeat:: <rule>` (see todo-repeat.ts, e.g. `weekly:mon,thu`) and
 * `::done:: <date>,<date>` (completion log, newest last, capped at DONE_LOG_LIMIT) after `::due::`.
 * Completing a recurring todo moves `::due::` to the next occurrence instead of marking it done.
 *
 * Status markers:
 *   [ ] = backlog, [>] = in-progress, [x] = done, [-] = rejected
 *
 * Legacy format (v1): # Group headers with - [ ] tasks.
 * Legacy files are auto-detected; groups become hashtags on migration.
 */

import {
  anchorRepeat,
  formatRepeat,
  nextOccurrenceDate,
  parseRepeat,
  type TodoRepeat,
} from './todo-repeat.js';

export type TodoStatus = 'backlog' | 'in-progress' | 'done' | 'rejected';

export const TODO_COLORS = [
  'red',
  'orange',
  'amber',
  'lime',
  'emerald',
  'teal',
  'sky',
  'indigo',
  'violet',
  'pink',
] as const;
export type TodoColor = (typeof TODO_COLORS)[number];

export const TODO_COLOR_HEX: Record<TodoColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  lime: '#84cc16',
  emerald: '#10b981',
  teal: '#14b8a6',
  sky: '#0ea5e9',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  pink: '#ec4899',
};

export type TodoPriority = 'high' | 'super-high' | 'ultra-high';

export const PRIORITY_RANK: Record<TodoPriority, number> = {
  high: 1,
  'super-high': 2,
  'ultra-high': 3,
};

export const PRIORITY_LABELS: Record<TodoPriority, string> = {
  high: 'High',
  'super-high': 'Super high',
  'ultra-high': 'Ultra high',
};

const PRIORITY_ORDER: TodoPriority[] = ['high', 'super-high', 'ultra-high'];

export interface Milestone {
  id: string;
  name: string;
  dueDate?: string; // YYYY-MM-DD
}

export interface TodoPrompt {
  lines: string[];
  refFile?: string; // path from "ref:..."
}

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
  tags: string[];
  milestoneId?: string;
  priority?: TodoPriority;
  prompt?: TodoPrompt;
  createdAt?: string; // ISO 8601
  updatedAt?: number; // Unix ms
  dueDate?: string; // YYYY-MM-DD, local
  /** HH:MM, local; only set together with dueDate. */
  dueTime?: string;
  /** Recurrence rule; completing the todo advances the due date instead of finishing it. */
  repeat?: TodoRepeat;
  /** Local dates (YYYY-MM-DD) a recurring todo was completed on, oldest first. */
  doneLog?: string[];
}

export interface TodoData {
  milestones: Milestone[];
  items: TodoItem[];
  isLegacyFormat: boolean;
  color?: TodoColor;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MARKER_TO_STATUS: Record<string, TodoStatus> = {
  ' ': 'backlog',
  '>': 'in-progress',
  x: 'done',
  X: 'done',
  '-': 'rejected',
};

export const STATUS_TO_MARKER: Record<TodoStatus, string> = {
  backlog: '[ ]',
  'in-progress': '[>]',
  done: '[x]',
  rejected: '[-]',
};

export const STATUS_LABELS: Record<TodoStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'In Progress',
  done: 'Done',
  rejected: 'Rejected',
};

export const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  backlog: 'in-progress',
  'in-progress': 'done',
  done: 'backlog',
  rejected: 'backlog',
};

// ─── Frontmatter Parsing ─────────────────────────────────────────────────────

function parseMilestonesYaml(yaml: string): Milestone[] {
  const milestones: Milestone[] = [];
  if (!yaml.includes('milestones:')) return milestones;

  const lines = yaml.split('\n');
  let inBlock = false;
  let current: Partial<Milestone> | null = null;

  for (const line of lines) {
    if (line.trim() === 'milestones:') {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;

    // Start of a new milestone item
    const itemStart = line.match(/^\s{2}-\s+id:\s*(.+)/);
    if (itemStart) {
      if (current?.id && current?.name) milestones.push(current as Milestone);
      current = { id: itemStart[1]?.trim() };
      continue;
    }
    const nameMatch = line.match(/^\s{4}name:\s*(.+)/);
    if (nameMatch && current) {
      current.name = nameMatch[1]?.trim();
      continue;
    }
    const dateMatch = line.match(/^\s{4}dueDate:\s*(.+)/);
    if (dateMatch && current) {
      current.dueDate = dateMatch[1]?.trim();
      continue;
    }
    // Non-indented non-empty line ends the block
    if (line && !/^\s/.test(line) && line.trim() !== 'milestones:') inBlock = false;
  }
  if (current?.id && current?.name) milestones.push(current as Milestone);
  return milestones;
}

function parseColor(yaml: string): TodoColor | undefined {
  const value = yaml.match(/^color:\s*(\S+)\s*$/m)?.[1];
  return TODO_COLORS.find((c) => c === value);
}

function parseFrontmatter(content: string): {
  milestones: Milestone[];
  color?: TodoColor;
  remaining: string;
} {
  if (!content.startsWith('---')) return { milestones: [], remaining: content };
  const afterOpen = content.slice(3);
  const closeIdx = afterOpen.indexOf('\n---');
  if (closeIdx === -1) return { milestones: [], remaining: content };
  const yamlBlock = afterOpen.slice(0, closeIdx);
  const remaining = afterOpen.slice(closeIdx + 4).replace(/^\n/, '');
  return { milestones: parseMilestonesYaml(yamlBlock), color: parseColor(yamlBlock), remaining };
}

function serializeFrontmatter(milestones: Milestone[], color?: TodoColor): string {
  if (milestones.length === 0 && !color) return '';
  let result = '---\n';
  if (color) result += `color: ${color}\n`;
  if (milestones.length > 0) result += 'milestones:\n';
  for (const m of milestones) {
    result += `  - id: ${m.id}\n`;
    result += `    name: ${m.name}\n`;
    if (m.dueDate) result += `    dueDate: ${m.dueDate}\n`;
  }
  result += '---\n\n';
  return result;
}

// ─── Due dates ───────────────────────────────────────────────────────────────

export interface TodoDue {
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
}

export type DueStatus = 'overdue' | 'today' | 'upcoming';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Parse `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`; anything else (including impossible dates) is undefined. */
export const parseDue = (value: string): TodoDue | undefined => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return undefined;
  }
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] === undefined) return { date };
  if (Number(m[4]) > 23 || Number(m[5]) > 59) return undefined;
  return { date, time: `${m[4]}:${m[5]}` };
};

/** The stored `::due::` value, or undefined when the item has no due date. */
export const formatDue = (item: Pick<TodoItem, 'dueDate' | 'dueTime'>): string | undefined =>
  item.dueDate ? (item.dueTime ? `${item.dueDate}T${item.dueTime}` : item.dueDate) : undefined;

/** Local calendar date of `ms` as YYYY-MM-DD. */
export const localDateString = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Due state of an open item at `now` (local time); done/rejected/undated items have none. */
export const dueStatus = (item: TodoItem, now = Date.now()): DueStatus | undefined => {
  if (!item.dueDate || item.status === 'done' || item.status === 'rejected') return undefined;
  const today = localDateString(now);
  if (item.dueDate < today) return 'overdue';
  if (item.dueDate > today) return 'upcoming';
  if (item.dueTime) {
    const d = new Date(now);
    if (item.dueTime <= `${pad2(d.getHours())}:${pad2(d.getMinutes())}`) return 'overdue';
  }
  return 'today';
};

/** Sort comparator: earlier due first, timed before all-day on the same date, undated last. */
export const compareDue = (
  a: Pick<TodoItem, 'dueDate' | 'dueTime'>,
  b: Pick<TodoItem, 'dueDate' | 'dueTime'>,
): number => {
  if (!a.dueDate || !b.dueDate) return a.dueDate ? -1 : b.dueDate ? 1 : 0;
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  const [ta, tb] = [a.dueTime ?? '99:99', b.dueTime ?? '99:99'];
  return ta < tb ? -1 : ta > tb ? 1 : 0;
};

/** The value after `::name::` on a metadata line, up to the next `::` field; '' when absent. */
const metaField = (line: string, name: string): string =>
  line.match(new RegExp(`::${name}::\\s*(.*?)\\s*(?=::|$)`))?.[1] ?? '';

// ─── Parse ───────────────────────────────────────────────────────────────────

export const parseTodos = (md: string): TodoData => {
  if (!md) return { milestones: [], items: [], isLegacyFormat: false };

  const { milestones, color, remaining } = parseFrontmatter(md);
  const lines = remaining.split(/\r?\n/);
  const isLegacyFormat = lines.some((l) => /^#\s+/.test(l));

  const items: TodoItem[] = [];
  let currentLegacyGroup = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line) {
      i++;
      continue;
    }

    // Legacy group header
    if (isLegacyFormat && /^#\s+/.test(line)) {
      currentLegacyGroup = line.replace(/^#\s+/, '').trim().toLowerCase().replace(/\s+/g, '-');
      i++;
      continue;
    }

    const todoMatch = line.match(/^(\s*)([-*])\s+\[([^\]]*)\]\s+(.*)/);
    if (!todoMatch) {
      i++;
      continue;
    }

    const markerChar = todoMatch[3] ?? ' ';
    const status: TodoStatus = MARKER_TO_STATUS[markerChar] ?? 'backlog';
    let rawText = (todoMatch[4] ?? '').trim();

    // Legacy ISO timestamp prefix
    let createdAt: string | undefined;
    const isoMatch = rawText.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)/);
    if (isoMatch) {
      createdAt = isoMatch[1];
      rawText = (isoMatch[2] ?? '').trim();
    }

    // Extract hashtag groups
    const tags: string[] = [];
    rawText = rawText
      .replace(/#([\w-]+)/g, (_, tag: string) => {
        tags.push(tag);
        return '';
      })
      .trim();

    // Propagate legacy group as tag
    if (isLegacyFormat && currentLegacyGroup && !tags.includes(currentLegacyGroup)) {
      tags.push(currentLegacyGroup);
    }

    // Extract milestone reference
    let milestoneId: string | undefined;
    rawText = rawText
      .replace(/!([\w-]+)/g, (_, mid: string) => {
        milestoneId = mid;
        return '';
      })
      .trim();

    // Priority token: ^high | ^super-high | ^ultra-high (unknown ^words stay in text)
    let priority: TodoPriority | undefined;
    rawText = rawText
      .replace(/(^|\s)\^(super-high|ultra-high|high)(?=\s|$)/g, (_, lead: string, p: string) => {
        priority = p as TodoPriority;
        return lead;
      })
      .trim();

    // Metadata line: ::updated:: <ms> ::created:: <iso>  (either or both may be present)
    let updatedAt: number | undefined;
    let due: TodoDue | undefined;
    const metaLine = (lines[i + 1] ?? '').trim();
    let repeat: TodoRepeat | undefined;
    let doneLog: string[] | undefined;
    if (/^::(updated|created|due|repeat|done)::/.test(metaLine)) {
      due = parseDue(metaField(metaLine, 'due'));
      repeat = parseRepeat(metaField(metaLine, 'repeat'));
      const log = metaField(metaLine, 'done')
        .split(',')
        .filter((d) => parseDue(d.trim()) && !d.includes('T'))
        .map((d) => d.trim());
      if (log.length > 0) doneLog = log;
      const updatedMatch = metaLine.match(/::updated::\s*(\d+)/);
      if (updatedMatch?.[1]) updatedAt = parseInt(updatedMatch[1], 10);
      const createdMatch = metaLine.match(/::created::\s*(\S+)/);
      // Only use ::created:: if no inline ISO prefix was already found
      if (createdMatch && !createdAt) createdAt = createdMatch[1];
      i++;
    }

    // Prompt lines: indented with 2+ spaces followed by '> '
    const promptLines: string[] = [];
    let promptRefFile: string | undefined;
    while ((lines[i + 1] ?? '').match(/^\s{2,}>\s/)) {
      i++;
      const promptContent = (lines[i] ?? '').replace(/^\s{2,}>\s/, '').trim();
      if (promptContent.startsWith('ref:')) {
        promptRefFile = promptContent.slice(4).trim();
      } else {
        promptLines.push(promptContent);
      }
    }

    const prompt =
      promptLines.length > 0 || promptRefFile
        ? { lines: promptLines, refFile: promptRefFile }
        : undefined;

    items.push({
      id: `item-${items.length}`,
      text: rawText,
      status,
      tags,
      milestoneId,
      priority,
      prompt,
      createdAt,
      updatedAt,
      ...(due && { dueDate: due.date }),
      ...(due?.time && { dueTime: due.time }),
      ...(repeat && { repeat }),
      ...(doneLog && { doneLog }),
    });
    i++;
  }

  return color
    ? { milestones, items, isLegacyFormat, color }
    : { milestones, items, isLegacyFormat };
};

// ─── Serialize ───────────────────────────────────────────────────────────────

export const serializeTodos = (data: TodoData): string => {
  let result = serializeFrontmatter(data.milestones, data.color);

  for (const item of data.items) {
    const marker = STATUS_TO_MARKER[item.status];
    const tagStr = item.tags.map((t) => `#${t}`).join(' ');
    const milestoneStr = item.milestoneId ? `!${item.milestoneId}` : '';
    const priorityStr = item.priority ? `^${item.priority}` : '';
    const suffix = [tagStr, milestoneStr, priorityStr].filter(Boolean).join(' ');
    result += `- ${marker} ${item.text}${suffix ? ` ${suffix}` : ''}\n`;

    const due = formatDue(item);
    const doneLog = item.doneLog?.length ? item.doneLog.join(',') : undefined;
    if (item.updatedAt || item.createdAt || due || item.repeat || doneLog) {
      const metaParts: string[] = [];
      if (item.updatedAt) metaParts.push(`::updated:: ${item.updatedAt}`);
      if (item.createdAt) metaParts.push(`::created:: ${item.createdAt}`);
      if (due) metaParts.push(`::due:: ${due}`);
      if (item.repeat) metaParts.push(`::repeat:: ${formatRepeat(item.repeat)}`);
      if (doneLog) metaParts.push(`::done:: ${doneLog}`);
      result += `${metaParts.join(' ')}\n`;
    }

    if (item.prompt) {
      for (const pLine of item.prompt.lines) result += `  > ${pLine}\n`;
      if (item.prompt.refFile) result += `  > ref:${item.prompt.refFile}\n`;
    }
  }

  return result;
};

// ─── Migration ────────────────────────────────────────────────────────────────

/** Convert legacy (# Group header) format to new flat format. */
export const migrateLegacyFormat = (md: string): string => {
  const data = parseTodos(md);
  if (!data.isLegacyFormat) return md;
  return serializeTodos({ ...data, isLegacyFormat: false });
};

// ─── Mutations ───────────────────────────────────────────────────────────────

export const setStatus = (data: TodoData, index: number, status: TodoStatus): TodoData => {
  const items = [...data.items];
  if (!items[index]) return data;
  if (status === 'done' && items[index]?.repeat) {
    return completeTodo(data, (items[index] as TodoItem).id);
  }
  items[index] = { ...(items[index] as TodoItem), status, updatedAt: Date.now() };
  return { ...data, items };
};

export const updateTodoText = (data: TodoData, index: number, text: string): TodoData => {
  const items = [...data.items];
  if (!items[index]) return data;
  items[index] = { ...(items[index] as TodoItem), text, updatedAt: Date.now() };
  return { ...data, items };
};

export const addTodo = (
  data: TodoData,
  text: string,
  tags: string[] = [],
  milestoneId?: string,
  prompt?: TodoPrompt,
  now = new Date(),
): TodoData => {
  const item: TodoItem = {
    id: `item-${data.items.length}`,
    text,
    status: 'backlog',
    tags,
    milestoneId,
    prompt,
    createdAt: now.toISOString(),
    updatedAt: now.getTime(),
  };
  return { ...data, items: [...data.items, item] };
};

/** Move the item at `from` to index `to`; out-of-range indexes leave data unchanged. */
export const moveTodo = (data: TodoData, from: number, to: number): TodoData => {
  const n = data.items.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return data;
  const items = [...data.items];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item as TodoItem);
  return { ...data, items };
};

export const setMilestone = (
  data: TodoData,
  index: number,
  milestoneId: string | undefined,
): TodoData => {
  const items = [...data.items];
  if (!items[index]) return data;
  items[index] = { ...(items[index] as TodoItem), milestoneId, updatedAt: Date.now() };
  return { ...data, items };
};

export const setPrompt = (
  data: TodoData,
  index: number,
  prompt: TodoPrompt | undefined,
): TodoData => {
  const items = [...data.items];
  if (!items[index]) return data;
  items[index] = { ...(items[index] as TodoItem), prompt };
  return { ...data, items };
};

export const setTodoColor = (data: TodoData, color?: TodoColor): TodoData => {
  const { color: _old, ...rest } = data;
  return color ? { ...rest, color } : rest;
};

export const setTodoPriority = (data: TodoData, id: string, priority?: TodoPriority): TodoData => {
  const index = data.items.findIndex((item) => item.id === id);
  if (index < 0) return data;
  const items = [...data.items];
  items[index] = { ...(items[index] as TodoItem), priority, updatedAt: Date.now() };
  return { ...data, items };
};

/** Set or clear (`undefined`) an item's due date; invalid values leave data unchanged. */
export const setTodoDue = (data: TodoData, id: string, due?: TodoDue): TodoData => {
  const index = data.items.findIndex((item) => item.id === id);
  if (index < 0) return data;
  const valid = due && parseDue(due.time ? `${due.date}T${due.time}` : due.date);
  if (due && !valid) return data;
  const { dueDate: _d, dueTime: _t, ...rest } = data.items[index] as TodoItem;
  const items = [...data.items];
  items[index] = {
    ...rest,
    ...(valid && { dueDate: valid.date }),
    ...(valid?.time && { dueTime: valid.time }),
    updatedAt: Date.now(),
  };
  return { ...data, items };
};

/** Most completions kept in `::done::`, so a daily todo's line stays short. */
export const DONE_LOG_LIMIT = 30;

/** The due that follows `item`'s current one, or undefined for a todo that does not repeat. */
export const nextDue = (
  item: Pick<TodoItem, 'dueDate' | 'dueTime' | 'repeat'>,
  now = Date.now(),
): TodoDue | undefined => {
  if (!item.repeat) return undefined;
  const today = localDateString(now);
  const date = nextOccurrenceDate(item.dueDate ?? today, item.repeat, today);
  return item.dueTime ? { date, time: item.dueTime } : { date };
};

/**
 * Completes a todo. A recurring one is not finished: its due date moves to the first occurrence
 * after both the current due date and today, the completion goes into `doneLog`, and it returns
 * to the backlog. A plain todo is marked done.
 */
export const completeTodo = (data: TodoData, id: string, now = Date.now()): TodoData => {
  const index = data.items.findIndex((item) => item.id === id);
  const item = data.items[index];
  if (!item) return data;
  const items = [...data.items];
  if (!item.repeat) {
    items[index] = { ...item, status: 'done', updatedAt: now };
    return { ...data, items };
  }
  const today = localDateString(now);
  const repeat = anchorRepeat(item.repeat, item.dueDate ?? today);
  const next = nextDue({ ...item, repeat }, now) as TodoDue;
  items[index] = {
    ...item,
    status: 'backlog',
    repeat,
    dueDate: next.date,
    doneLog: [...(item.doneLog ?? []), today].slice(-DONE_LOG_LIMIT),
    updatedAt: now,
  };
  return { ...data, items };
};

/** Set or clear (`undefined`) an item's recurrence. */
export const setTodoRepeat = (data: TodoData, id: string, repeat?: TodoRepeat): TodoData => {
  const index = data.items.findIndex((item) => item.id === id);
  if (index < 0) return data;
  const { repeat: _r, ...rest } = data.items[index] as TodoItem;
  const items = [...data.items];
  items[index] = { ...rest, ...(repeat && { repeat }), updatedAt: Date.now() };
  return { ...data, items };
};

/** none -> high -> super-high -> ultra-high -> none */
export const cyclePriority = (p?: TodoPriority): TodoPriority | undefined =>
  p ? PRIORITY_ORDER[PRIORITY_ORDER.indexOf(p) + 1] : PRIORITY_ORDER[0];

/** Highest priority rank among backlog / in-progress items; 0 if none. */
export const maxPriorityRank = (items: TodoItem[]): number =>
  items.reduce(
    (max, i) =>
      i.priority && (i.status === 'backlog' || i.status === 'in-progress')
        ? Math.max(max, PRIORITY_RANK[i.priority])
        : max,
    0,
  );

export const addMilestone = (data: TodoData, milestone: Milestone): TodoData => ({
  ...data,
  milestones: [...data.milestones, milestone],
});

export const updateMilestone = (
  data: TodoData,
  id: string,
  update: Partial<Omit<Milestone, 'id'>>,
): TodoData => ({
  ...data,
  milestones: data.milestones.map((m) => (m.id === id ? { ...m, ...update } : m)),
});

export const removeMilestone = (data: TodoData, id: string): TodoData => ({
  ...data,
  milestones: data.milestones.filter((m) => m.id !== id),
  items: data.items.map((item) =>
    item.milestoneId === id ? { ...item, milestoneId: undefined } : item,
  ),
});

// ─── View Helpers ─────────────────────────────────────────────────────────────

/** Filter for small/dashboard view: hide done/rejected older than 1h. */
export const getVisibleTodos = (data: TodoData, hideOlderThanMs = 3600000): TodoData => {
  const now = Date.now();
  return {
    ...data,
    items: data.items.filter((item) => {
      if (item.status === 'backlog' || item.status === 'in-progress') return true;
      if (!item.updatedAt) return true;
      return now - item.updatedAt < hideOlderThanMs;
    }),
  };
};

/** Get the upcoming milestone (nearest future due date). */
export const getUpcomingMilestone = (milestones: Milestone[]): Milestone | undefined => {
  const today = new Date().toISOString().slice(0, 10);
  return milestones
    .filter((m) => m.dueDate && m.dueDate >= today)
    .sort((a, b) => ((a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1))[0];
};
