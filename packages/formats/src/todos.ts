/**
 * Logic for the Todo Widget (.todos.md)
 *
 * Format v2 (flat list with inline metadata):
 *   ---
 *   milestones:
 *     - id: v1.0
 *       name: Version 1.0
 *       dueDate: 2026-04-15
 *   ---
 *
 *   - [ ] backlog task #tag1 #tag2
 *   - [>] in-progress task #tag !milestone-id
 *   - [x] done task #tag
 *   - [-] rejected task
 *     > Prompt text line 1
 *     > Prompt line 2
 *     > ref:path/to/prompts.md
 *
 * Status markers:
 *   [ ] = backlog, [>] = in-progress, [x] = done, [-] = rejected
 *
 * Legacy format (v1): # Group headers with - [ ] tasks.
 * Legacy files are auto-detected; groups become hashtags on migration.
 */

export type TodoStatus = 'backlog' | 'in-progress' | 'done' | 'rejected';

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
  prompt?: TodoPrompt;
  createdAt?: string; // ISO 8601
  updatedAt?: number; // Unix ms
}

export interface TodoData {
  milestones: Milestone[];
  items: TodoItem[];
  isLegacyFormat: boolean;
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

function parseFrontmatter(content: string): { milestones: Milestone[]; remaining: string } {
  if (!content.startsWith('---')) return { milestones: [], remaining: content };
  const afterOpen = content.slice(3);
  const closeIdx = afterOpen.indexOf('\n---');
  if (closeIdx === -1) return { milestones: [], remaining: content };
  const yamlBlock = afterOpen.slice(0, closeIdx);
  const remaining = afterOpen.slice(closeIdx + 4).replace(/^\n/, '');
  return { milestones: parseMilestonesYaml(yamlBlock), remaining };
}

function serializeMilestones(milestones: Milestone[]): string {
  if (milestones.length === 0) return '';
  let result = '---\nmilestones:\n';
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

  const { milestones, remaining } = parseFrontmatter(md);
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
      prompt,
      createdAt,
      updatedAt,
    });
    i++;
  }

  return { milestones, items, isLegacyFormat };
};

// ─── Serialize ───────────────────────────────────────────────────────────────

export const serializeTodos = (data: TodoData): string => {
  let result = serializeMilestones(data.milestones);

  for (const item of data.items) {
    const marker = STATUS_TO_MARKER[item.status];
    const tagStr = item.tags.map((t) => `#${t}`).join(' ');
    const milestoneStr = item.milestoneId ? `!${item.milestoneId}` : '';
    const suffix = [tagStr, milestoneStr].filter(Boolean).join(' ');
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
