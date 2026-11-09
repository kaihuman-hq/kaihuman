import { githubFileStore } from '@kaihuman/core';
import {
  addActionLogEntry,
  addTodoEntry,
  applyIdeaHandoff,
  asIdeaSlug,
  type IdeaHandoff,
  ideaPath,
  localDate,
  logIdea,
  newIdea,
  parseIdeaHandoffs,
  parseTodos,
  serializeTodos,
  slugifyIdeaTitle,
  type TodoDue,
  type TodoRepeat,
} from '@kaihuman/formats';
import { syncActions } from '../sync/actions.js';
import { canServeFromCache } from '../sync/revalidate.js';
import { setDueOnData, setRepeatOnData } from './todo-due.js';

/**
 * The file access the mobile controllers need. Kept narrow so controllers can be tested without
 * the GitHub store, and so the store's optimistic open/save semantics live in one adapter.
 */
export interface RepoFiles {
  /** `.kh`, or the legacy `.lifeos` when the repo still uses it. */
  appFolder(): string;
  exists(path: string): boolean;
  /** `.todos.md` paths in the repo tree. */
  todoPaths(): string[];
  /** Content of a file, or null when it does not exist. */
  read(path: string): Promise<string | null>;
  /** Creates or overwrites; rejects when the save fails. */
  write(path: string, content: string): Promise<void>;
}

export const githubRepoFiles: RepoFiles = {
  appFolder: () => githubFileStore.appFolder.peek(),
  exists: (path) => githubFileStore.tree.peek().some((t) => t.path === path),
  todoPaths: () =>
    githubFileStore.tree
      .peek()
      .filter((t) => t.type === 'blob' && t.path.endsWith('.todos.md'))
      .map((t) => t.path),
  async read(path) {
    const open = githubFileStore.openFiles.peek()[path];
    const item = githubFileStore.tree.peek().find((t) => t.path === path);
    if (!open || !canServeFromCache(open, item, githubFileStore.dirtyFiles.peek().has(path))) {
      if (!item) return null;
      await githubFileStore.openFile(path);
    }
    return githubFileStore.openFiles.peek()[path]?.content ?? null;
  },
  async write(path, content) {
    if (githubFileStore.openFiles.peek()[path]) {
      // Optimistic: the edit is stored locally and the outbox pushes it, so a slow or missing
      // network never loses or blocks a capture. Conflicts are surfaced by the sync banner.
      githubFileStore.updateFileContent(path, content);
      await githubFileStore.flushPendingWrites();
    } else {
      await githubFileStore.createFile(path, content);
    }
    syncActions().notifyLocalWrite();
  },
};

export type CaptureResult =
  | { ok: true; path: string; message: string }
  | { ok: false; error: string };

export type IdeaAuthor = 'human' | 'claude.ai' | 'gemini';

export type IdeaCaptureResult =
  | { ok: true; results: { kind: 'created' | 'updated'; slug: string; path: string }[] }
  | {
      ok: false;
      error: string;
      /** Blocks applied before the failure: they stay saved. */
      results: { kind: 'created' | 'updated'; slug: string; path: string }[];
    };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const parseTagInput = (tags: string | string[] | undefined) =>
  (Array.isArray(tags) ? tags : (tags ?? '').split(/[\s,]+/))
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);

/** Unified quick-capture entry points; each mirrors the console's quick-* page for the same kind. */
export class QuickCaptureController {
  private busy = false;

  constructor(
    private readonly files: RepoFiles = githubRepoFiles,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Captures are serialised: a double tap must not append twice from the same base content. */
  private async run(path: string, work: () => Promise<string>): Promise<CaptureResult> {
    if (this.busy) return { ok: false, error: 'Another capture is still saving' };
    this.busy = true;
    try {
      return { ok: true, path, message: await work() };
    } catch (err) {
      return { ok: false, error: message(err) };
    } finally {
      this.busy = false;
    }
  }

  private async append(
    path: string,
    transform: (current: string) => string,
    done: string,
  ): Promise<CaptureResult> {
    return this.run(path, async () => {
      await this.files.write(path, transform((await this.files.read(path)) ?? ''));
      return done;
    });
  }

  /** `repeat` only applies with a `due`: a rule counts from the due date. */
  quickTodo(
    text: string,
    tags?: string | string[],
    due?: TodoDue,
    repeat?: TodoRepeat,
  ): Promise<CaptureResult> {
    const path = `${this.files.appFolder()}/inbox.todos.md`;
    return this.append(
      path,
      (current) => {
        const next = addTodoEntry(
          current,
          { text: text.trim(), tags: parseTagInput(tags) },
          this.clock(),
        );
        if (!due) return next;
        // The entry is appended last, so its position is the end of the file.
        const data = parseTodos(next);
        const index = data.items.length - 1;
        const dated = setDueOnData(data, index, due);
        return serializeTodos(repeat ? setRepeatOnData(dated, index, repeat) : dated);
      },
      'Todo added',
    );
  }

  /** Newest line first, like the console's dump file, so the latest thought is on top. */
  quickNote(text: string): Promise<CaptureResult> {
    const path = `${this.files.appFolder()}/dump.md`;
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve({ ok: false, error: 'Nothing to add' });
    return this.append(
      path,
      (current) => `- ${this.clock().toISOString().slice(0, 10)} ${trimmed}\n${current}`,
      'Note saved',
    );
  }

  /** Set by `kaihuman://quick-log?idea=<slug>`: log entries then go to that idea's log. */
  targetIdea: string | null = null;

  quickLog(description: string, tags?: string | string[]): Promise<CaptureResult> {
    if (this.targetIdea) return this.logToIdea(this.targetIdea, description);
    const path = `${this.files.appFolder()}/inbox.actionlog.md`;
    return this.append(
      path,
      (current) =>
        addActionLogEntry(current, { description, tags: parseTagInput(tags) }, this.clock()),
      'Log entry added',
    );
  }

  private logToIdea(slugText: string, description: string): Promise<CaptureResult> {
    const text = description.trim();
    if (!text) return Promise.resolve({ ok: false, error: 'Nothing to add' });
    const slug = asIdeaSlug(slugText);
    if (!slug) return Promise.resolve({ ok: false, error: `"${slugText}" is not an idea slug` });
    const path = ideaPath(slug);
    return this.run(path, async () => {
      if (!this.files.exists(path)) throw new Error(`No idea "${slugText}"`);
      const current = (await this.files.read(path)) ?? '';
      await this.files.write(path, logIdea(current, text, { now: this.clock(), author: 'human' }));
      return `Logged to ${slugText}`;
    });
  }

  /**
   * Plain text becomes a new idea (first line = title, rest = braindump); text containing
   * `kh-idea` blocks is applied block by block as a hand-off from a chat app.
   */
  async quickIdea(
    text: string,
    options: { author?: IdeaAuthor; slug?: string } = {},
  ): Promise<IdeaCaptureResult> {
    const results: { kind: 'created' | 'updated'; slug: string; path: string }[] = [];
    const fail = (error: string): IdeaCaptureResult => ({ ok: false, error, results });
    if (this.busy) return fail('Another capture is still saving');
    this.busy = true;
    try {
      let handoffs: IdeaHandoff[];
      try {
        handoffs = parseIdeaHandoffs(text);
      } catch (err) {
        return fail(message(err));
      }
      const edit = { author: options.author ?? 'human', now: this.clock() };
      if (handoffs.length === 0) {
        const [titleLine = '', ...rest] = text.trim().split('\n');
        if (!titleLine.trim()) return fail('Nothing to add');
        const slug = options.slug?.trim() || undefined;
        const idea = newIdea(
          { title: titleLine, ...(slug ? { slug } : {}), braindump: rest.join('\n') },
          edit,
        );
        // Never overwrite: the slug is the idea's identity.
        if (this.files.exists(idea.path)) {
          return fail(`An idea with the slug "${idea.slug}" already exists. Pick another slug.`);
        }
        await this.files.write(idea.path, idea.content);
        return { ok: true, results: [{ kind: 'created', slug: idea.slug, path: idea.path }] };
      }
      for (const handoff of handoffs) {
        try {
          const slug = handoff.slug === undefined ? null : asIdeaSlug(handoff.slug);
          const existing =
            slug && this.files.exists(ideaPath(slug))
              ? await this.files.read(ideaPath(slug))
              : null;
          const applied = applyIdeaHandoff(existing, handoff, edit);
          await this.files.write(applied.path, applied.content);
          results.push({
            kind: existing === null ? 'created' : 'updated',
            slug: applied.slug,
            path: applied.path,
          });
        } catch (err) {
          return fail(`${handoff.slug ?? handoff.title ?? 'block'}: ${message(err)}`);
        }
      }
      return { ok: true, results };
    } catch (err) {
      return fail(message(err));
    } finally {
      this.busy = false;
    }
  }

  /** Drops a raw source into `.kh/raw/` for the knowledge-base ingest skill to process. */
  quickKnowledge(text: string, title?: string): Promise<CaptureResult> {
    const body = text.trim();
    if (!body) return Promise.resolve({ ok: false, error: 'Nothing to add' });
    const now = this.clock();
    const heading = title?.trim() || body.split('\n')[0]?.trim() || 'note';
    const base = `${this.files.appFolder()}/raw/${localDate(now)}-${slugifyIdeaTitle(heading)}`;
    let path = `${base}.md`;
    for (let n = 2; this.files.exists(path); n++) path = `${base}-${n}.md`;
    const content = `---\ntitle: ${JSON.stringify(heading)}\ncaptured: ${now.toISOString()}\nsource: mobile\nprocessed: false\n---\n\n${body}\n`;
    return this.run(path, async () => {
      await this.files.write(path, content);
      return 'Saved to knowledge inbox';
    });
  }
}
