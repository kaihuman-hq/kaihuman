import {
  addMilestone,
  addTodoEntry,
  type Milestone,
  parseTodos,
  removeMilestone,
  serializeTodos,
  setMilestone,
  setStatus,
  type TodoData,
  type TodoItem,
  type TodoStatus,
  updateMilestone,
  updateTodoText,
} from '@kaihuman/formats';
import { githubRepoFiles, type RepoFiles } from './quick-capture.js';

export const TODO_STATUSES = [
  'backlog',
  'in-progress',
  'done',
  'rejected',
] as const satisfies readonly TodoStatus[];

/** One card. `itemIndex` addresses the item inside its file; it is only valid until the next write. */
export interface BoardItem {
  item: TodoItem;
  itemIndex: number;
  filePath: string;
}

export type BoardColumns = Record<TodoStatus, BoardItem[]>;

export interface BoardFilter {
  search?: string;
  tag?: string;
  milestoneId?: string;
  /** Restrict to these files; empty or absent means all. */
  files?: readonly string[];
}

export type BoardResult = { ok: true } | { ok: false; error: string };

/** `.todos.md` files to aggregate: all in the tree, plus the inbox even before it exists. */
export const todoFilePaths = (files: RepoFiles): string[] => {
  const inbox = `${files.appFolder()}/inbox.todos.md`;
  const paths = files.todoPaths();
  return paths.includes(inbox) ? paths : [inbox, ...paths];
};

export interface LoadedTodoFile {
  path: string;
  data: TodoData;
}

export const loadTodoFiles = async (files: RepoFiles): Promise<LoadedTodoFile[]> => {
  const loaded: LoadedTodoFile[] = [];
  for (const path of todoFilePaths(files)) {
    const content = await files.read(path);
    if (content !== null) loaded.push({ path, data: parseTodos(content) });
  }
  return loaded;
};

/** Milestones are repo-wide: the first definition of an id wins, ordered by due date. */
export const mergeMilestones = (loaded: readonly LoadedTodoFile[]): Milestone[] => {
  const seen = new Map<string, Milestone>();
  for (const { data } of loaded)
    for (const m of data.milestones) if (!seen.has(m.id)) seen.set(m.id, m);
  return [...seen.values()].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
};

const fail = (err: unknown): BoardResult => ({
  ok: false,
  error: err instanceof Error ? err.message : String(err),
});

const slugify = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '-');

export class KanbanBoardController {
  private loaded: LoadedTodoFile[] = [];
  private filter: BoardFilter = {};

  constructor(private readonly files: RepoFiles = githubRepoFiles) {}

  async load(): Promise<void> {
    this.loaded = await loadTodoFiles(this.files);
  }

  setFilter(filter: BoardFilter): void {
    this.filter = filter;
  }

  get paths(): string[] {
    return this.loaded.map((f) => f.path);
  }

  get milestones(): Milestone[] {
    return mergeMilestones(this.loaded);
  }

  /** Every tag in use, for the filter chips. */
  get tags(): string[] {
    const tags = new Set<string>();
    for (const { data } of this.loaded)
      for (const item of data.items) for (const t of item.tags) tags.add(t);
    return [...tags].sort();
  }

  columns(): BoardColumns {
    const columns: BoardColumns = { backlog: [], 'in-progress': [], done: [], rejected: [] };
    const { search, tag, milestoneId, files } = this.filter;
    const q = search?.trim().toLowerCase();
    const wantedTag = tag?.toLowerCase();
    for (const { path, data } of this.loaded) {
      if (files?.length && !files.includes(path)) continue;
      data.items.forEach((item, itemIndex) => {
        if (milestoneId && item.milestoneId !== milestoneId) return;
        if (wantedTag && !item.tags.some((t) => t.toLowerCase() === wantedTag)) return;
        if (
          q &&
          !item.text.toLowerCase().includes(q) &&
          !item.tags.some((t) => t.toLowerCase().includes(q)) &&
          !item.milestoneId?.toLowerCase().includes(q)
        ) {
          return;
        }
        columns[item.status].push({ item, itemIndex, filePath: path });
      });
    }
    return columns;
  }

  /** Writes one file and only then adopts it, so a failed save leaves the board matching the repo. */
  private async commit(path: string, data: TodoData): Promise<void> {
    await this.files.write(path, serializeTodos(data));
    const entry = this.loaded.find((f) => f.path === path);
    if (entry) entry.data = data;
    else this.loaded.push({ path, data });
  }

  private data(path: string): TodoData | undefined {
    return this.loaded.find((f) => f.path === path)?.data;
  }

  private async edit(path: string, change: (data: TodoData) => TodoData): Promise<BoardResult> {
    const data = this.data(path);
    if (!data) return { ok: false, error: `${path} is not loaded` };
    try {
      await this.commit(path, change(data));
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  }

  setStatus(path: string, index: number, status: TodoStatus): Promise<BoardResult> {
    return this.edit(path, (d) => {
      if (!d.items[index]) throw new Error('Todo not found');
      return setStatus(d, index, status);
    });
  }

  remove(path: string, index: number): Promise<BoardResult> {
    return this.edit(path, (d) => {
      if (!d.items[index]) throw new Error('Todo not found');
      return { ...d, items: d.items.filter((_, i) => i !== index) };
    });
  }

  editText(path: string, index: number, text: string): Promise<BoardResult> {
    return this.edit(path, (d) => {
      if (!d.items[index]) throw new Error('Todo not found');
      if (!text.trim()) throw new Error('Nothing to add');
      return updateTodoText(d, index, text.trim());
    });
  }

  assignMilestone(
    path: string,
    index: number,
    milestoneId: string | undefined,
  ): Promise<BoardResult> {
    return this.edit(path, (d) => {
      if (!d.items[index]) throw new Error('Todo not found');
      return setMilestone(d, index, milestoneId);
    });
  }

  addTodo(
    path: string,
    text: string,
    tags: string[] = [],
    milestoneId?: string,
  ): Promise<BoardResult> {
    // Goes through the shared entry writer so `#tag` in the text and tag de-duplication match the console.
    return this.edit(path, (d) =>
      parseTodos(addTodoEntry(serializeTodos(d), { text, tags, milestoneId })),
    );
  }

  /** Moves a todo to another file. The target is written first: a failure then duplicates rather than loses it. */
  async moveTodo(fromPath: string, index: number, toPath: string): Promise<BoardResult> {
    if (fromPath === toPath) return { ok: true };
    const source = this.data(fromPath);
    const item = source?.items[index];
    if (!source || !item) return { ok: false, error: 'Todo not found' };
    const target = this.data(toPath) ?? { milestones: [], items: [], isLegacyFormat: false };
    try {
      await this.commit(toPath, { ...target, items: [...target.items, item] });
      await this.commit(fromPath, { ...source, items: source.items.filter((_, i) => i !== index) });
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  }

  async addMilestone(name: string, dueDate?: string, path?: string): Promise<BoardResult> {
    const id = slugify(name);
    if (!id) return { ok: false, error: 'A milestone needs a name' };
    if (this.milestones.some((m) => m.id === id))
      return { ok: false, error: `Milestone ${id} already exists` };
    const target = path ?? this.loaded[0]?.path ?? `${this.files.appFolder()}/inbox.todos.md`;
    const data = this.data(target) ?? { milestones: [], items: [], isLegacyFormat: false };
    try {
      await this.commit(
        target,
        addMilestone(data, { id, name: name.trim(), ...(dueDate ? { dueDate } : {}) }),
      );
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  }

  async updateMilestone(id: string, update: Partial<Omit<Milestone, 'id'>>): Promise<BoardResult> {
    const owners = this.loaded.filter((f) => f.data.milestones.some((m) => m.id === id));
    if (owners.length === 0) return { ok: false, error: `Milestone ${id} not found` };
    try {
      for (const { path, data } of owners)
        await this.commit(path, updateMilestone(data, id, update));
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  }

  /** Deletes the milestone and unassigns its todos, in every file that defines or references it. */
  async removeMilestone(id: string): Promise<BoardResult> {
    const affected = this.loaded.filter(
      (f) =>
        f.data.milestones.some((m) => m.id === id) ||
        f.data.items.some((i) => i.milestoneId === id),
    );
    if (affected.length === 0) return { ok: false, error: `Milestone ${id} not found` };
    try {
      for (const { path, data } of affected) await this.commit(path, removeMilestone(data, id));
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  }
}
