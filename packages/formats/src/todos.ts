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
 * Status markers:
 *   [ ] = backlog, [>] = in-progress, [x] = done, [-] = rejected
 *
 * Legacy format (v1): # Group headers with - [ ] tasks.
 * Legacy files are auto-detected; groups become hashtags on migration.
 */

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
    const metaLine = (lines[i + 1] ?? '').trim();
    if (metaLine.startsWith('::updated::') || metaLine.startsWith('::created::')) {
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

    if (item.updatedAt || item.createdAt) {
      const metaParts: string[] = [];
      if (item.updatedAt) metaParts.push(`::updated:: ${item.updatedAt}`);
      if (item.createdAt) metaParts.push(`::created:: ${item.createdAt}`);
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
