import {
  type Milestone,
  parseTodos,
  serializeTodos,
  setMilestone,
  setStatus,
  type TodoData,
  type TodoDue,
  type TodoItem,
  type TodoRepeat,
  type TodoStatus,
  updateTodoText,
} from '@kaihuman/formats';
import { loadTodoFiles, mergeMilestones } from './kanban-board.js';
import { githubRepoFiles, type RepoFiles } from './quick-capture.js';
import { setDueOnData, setRepeatOnData } from './todo-due.js';

/** A todo addressed like the widgets do: `<path>#<index>`. */
export interface TodoRef {
  path: string;
  index: number;
}

export const todoRefId = ({ path, index }: TodoRef): string => `${path}#${index}`;

export const parseTodoRef = (id: string): TodoRef | null => {
  const m = /^(.+\.todos\.md)#(\d+)$/.exec(id);
  return m?.[1] && m[2] ? { path: m[1], index: Number(m[2]) } : null;
};

/** A query param, not a path segment: the id holds `/` and `#`, which segments mangle. */
export const todoDetailHref = (id: string): string => `/board/todo?id=${encodeURIComponent(id)}`;

/** A typed tag as the format's `#tag` token (`[\w-]+`), or undefined when it can't be one. */
export const normalizeTag = (raw: string): string | undefined => {
  const tag = raw.trim().replace(/^#+/, '').trim().replace(/\s+/g, '-');
  return /^[\w-]+$/.test(tag) ? tag : undefined;
};

export type DetailState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | {
      kind: 'ready';
      path: string;
      index: number;
      item: TodoItem;
      milestones: Milestone[];
      /** Tags used elsewhere in the repo and not on this item. */
      tagSuggestions: string[];
    }
  | { kind: 'deleted'; path: string; index: number; item: TodoItem };

export type DetailResult = { ok: true } | { ok: false; error: string };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

class NotFound extends Error {
  constructor() {
    super('Todo not found');
  }
}

/**
 * Edits one todo. Every edit re-reads the file (cache-first) so changes synced in meanwhile are
 * kept, and edits run one at a time so autosaves never write from a stale base.
 */
export class TodoDetailController {
  state: DetailState = { kind: 'loading' };
  private ref: TodoRef | null;
  /** Identifies the item when its index shifts: positional ids change on every delete above it. */
  private fingerprint: { createdAt?: string; text: string } | null = null;
  private allTags: string[] = [];
  private milestones: Milestone[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    id: string,
    private readonly files: RepoFiles = githubRepoFiles,
  ) {
    this.ref = parseTodoRef(id);
  }

  get id(): string | null {
    return this.ref && todoRefId(this.ref);
  }

  async load(): Promise<DetailState> {
    if (!this.ref) return this.setState({ kind: 'not-found' });
    const loaded = await loadTodoFiles(this.files);
    this.milestones = mergeMilestones(loaded);
    const tags = new Set<string>();
    for (const { data } of loaded) for (const i of data.items) for (const t of i.tags) tags.add(t);
    this.allTags = [...tags].sort();
    const file = loaded.find((f) => f.path === this.ref?.path);
    if (!file) return this.setState({ kind: 'not-found' });
    return this.adopt(file.data);
  }

  setTitle(text: string): Promise<DetailResult> {
    const title = text.replace(/\s+/g, ' ').trim();
    if (!title) return Promise.resolve({ ok: false, error: 'A todo needs a title' });
    return this.edit((d, i) => updateTodoText(d, i, title));
  }

  setStatus(status: TodoStatus): Promise<DetailResult> {
    return this.edit((d, i) => setStatus(d, i, status));
  }

  setMilestone(milestoneId: string | undefined): Promise<DetailResult> {
    return this.edit((d, i) => setMilestone(d, i, milestoneId));
  }

  /** Clearing the due also clears the repeat; see `setDueOnData`. */
  setDue(due: TodoDue | undefined): Promise<DetailResult> {
    return this.edit((d, i) => setDueOnData(d, i, due));
  }

  setRepeat(repeat: TodoRepeat | undefined): Promise<DetailResult> {
    return this.edit((d, i) => setRepeatOnData(d, i, repeat));
  }

  addTag(raw: string): Promise<DetailResult> {
    const tag = normalizeTag(raw);
    if (!tag) return Promise.resolve({ ok: false, error: 'Tags use letters, digits and -' });
    return this.edit((d, i, item) =>
      item.tags.includes(tag) ? d : withTags(d, i, [...item.tags, tag]),
    );
  }

  removeTag(tag: string): Promise<DetailResult> {
    return this.edit((d, i, item) =>
      withTags(
        d,
        i,
        item.tags.filter((t) => t !== tag),
      ),
    );
  }

  remove(): Promise<DetailResult> {
    return this.serial(async () => {
      const { path, data, index, item } = await this.locate();
      await this.files.write(
        path,
        serializeTodos({ ...data, items: data.items.filter((_, i) => i !== index) }),
      );
      this.setState({ kind: 'deleted', path, index, item });
    });
  }

  /** Puts a deleted todo back where it was (or at the end, if the file shrank meanwhile). */
  undoRemove(): Promise<DetailResult> {
    return this.serial(async () => {
      const deleted = this.state;
      if (deleted.kind !== 'deleted') throw new Error('Nothing to undo');
      const data = parseTodos((await this.files.read(deleted.path)) ?? '');
      const items = [...data.items];
      const index = Math.min(deleted.index, items.length);
      items.splice(index, 0, deleted.item);
      const restored = parseTodos(serializeTodos({ ...data, items }));
      await this.files.write(deleted.path, serializeTodos(restored));
      this.ref = { path: deleted.path, index };
      this.fingerprint = fingerprintOf(deleted.item);
      this.adopt(restored);
    });
  }

  private setState(state: DetailState): DetailState {
    this.state = state;
    return state;
  }

  private serial(work: () => Promise<void>): Promise<DetailResult> {
    const run = this.queue.then(work).then(
      (): DetailResult => ({ ok: true }),
      (err: unknown): DetailResult => {
        if (err instanceof NotFound) this.setState({ kind: 'not-found' });
        return { ok: false, error: message(err) };
      },
    );
    this.queue = run;
    return run;
  }

  /** Finds the item in the file as it is now, following it if its index moved. */
  private async locate() {
    if (!this.ref) throw new NotFound();
    const { path } = this.ref;
    const content = await this.files.read(path);
    if (content === null) throw new NotFound();
    const data = parseTodos(content);
    const index = this.findIndex(data);
    const item = index === undefined ? undefined : data.items[index];
    if (index === undefined || !item) throw new NotFound();
    return { path, data, index, item };
  }

  private findIndex(data: TodoData): number | undefined {
    const ref = this.ref;
    if (!ref) return undefined;
    const fp = this.fingerprint;
    const matches = (item: TodoItem) =>
      fp?.createdAt ? item.createdAt === fp.createdAt : !fp || item.text === fp.text;
    const atIndex = data.items[ref.index];
    if (atIndex && matches(atIndex)) return ref.index;
    if (!fp) return undefined;
    const found = data.items.map((item, i) => (matches(item) ? i : -1)).filter((i) => i >= 0);
    return found.length === 1 ? found[0] : undefined;
  }

  private edit(change: (data: TodoData, index: number, item: TodoItem) => TodoData) {
    return this.serial(async () => {
      const { path, data, index, item } = await this.locate();
      const next = change(data, index, item);
      if (next === data) return;
      const content = serializeTodos(next);
      await this.files.write(path, content);
      // Adopt the file as it reads back, so `#tag` typed into the title shows up as a tag.
      this.adopt(parseTodos(content), index);
    });
  }

  private adopt(data: TodoData, known?: number): DetailState {
    const index = known ?? this.findIndex(data);
    const item = index === undefined ? undefined : data.items[index];
    if (!this.ref || index === undefined || !item) return this.setState({ kind: 'not-found' });
    this.ref = { path: this.ref.path, index };
    this.fingerprint = fingerprintOf(item);
    for (const t of item.tags) if (!this.allTags.includes(t)) this.allTags.push(t);
    this.allTags.sort();
    return this.setState({
      kind: 'ready',
      path: this.ref.path,
      index,
      item,
      milestones: this.milestones,
      tagSuggestions: this.allTags.filter((t) => !item.tags.includes(t)),
    });
  }
}

const fingerprintOf = (item: TodoItem) => ({
  ...(item.createdAt && { createdAt: item.createdAt }),
  text: item.text,
});

const withTags = (data: TodoData, index: number, tags: string[]): TodoData => ({
  ...data,
  items: data.items.map((item, i) =>
    i === index ? { ...item, tags, updatedAt: Date.now() } : item,
  ),
});
