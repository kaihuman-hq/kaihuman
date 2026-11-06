import {
  applyWidgetCapture,
  applyWidgetTodoMove,
  buildWidgetExtras,
  buildWidgetTodoSnapshot,
  githubFileStore,
  githubProfileStore,
  type PendingWidgetMutation,
} from '@kaihuman/core';
import { checkIn } from '@kaihuman/formats';
import { effect } from '@preact/signals';
import { githubRepoFiles } from '../screens/quick-capture.js';

export type { PendingWidgetMutation };

export const WIDGET_TODOS_FILE = 'widget-todos.json';
export const PENDING_WIDGET_MUTATIONS_FILE = 'pending-widget-mutations.json';

/** Shared native container: iOS App Group `group.com.kaihuman.app` or Android SharedPreferences. */
export interface SharedContainer {
  read(name: string): Promise<string | null>;
  write(name: string, content: string): Promise<void>;
  /** `WidgetCenter.shared.reloadAllTimelines()` / Glance `updateAll`. */
  reloadAllTimelines(): Promise<void>;
}

export class InMemorySharedContainer implements SharedContainer {
  readonly files = new Map<string, string>();
  reloads = 0;
  async read(name: string): Promise<string | null> {
    return this.files.get(name) ?? null;
  }
  async write(name: string, content: string): Promise<void> {
    this.files.set(name, content);
  }
  async reloadAllTimelines(): Promise<void> {
    this.reloads++;
  }
}

const isTodoPath = (path: string): boolean =>
  /^\.(kh|lifeos)\//.test(path) && path.endsWith('.todos.md');

const currentSnapshot = () => {
  const repo = githubProfileStore.currentRepo.value;
  if (!repo) return null;
  const open = githubFileStore.openFiles.value;
  const files: Record<string, { sha: string; content: string }> = {};
  for (const [path, file] of Object.entries(open)) {
    if (isTodoPath(path)) files[path] = { sha: file.sha, content: file.content };
  }
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Extras only see what the app has loaded: unopened raw captures, wiki pages etc. are not counted.
  return buildWidgetTodoSnapshot(files, repo.full_name, repo.default_branch, now, {
    timeZone,
    ...buildWidgetExtras(open, now, timeZone),
    lockScreenText: true, // no privacy setting exists yet; v2 reserves the flag for it
  });
};

const isMutation = (m: unknown): m is PendingWidgetMutation => {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  if (typeof o.timestamp !== 'number') return false;
  const str = (k: string) => typeof o[k] === 'string' && o[k] !== '';
  switch (o.kind) {
    case undefined:
    case 'toggle':
      return str('itemId');
    case 'move':
      return str('itemId') && (o.status === 'backlog' || o.status === 'in-progress');
    case 'capture':
      return str('text');
    case 'habit':
      return str('path') && str('date');
    default:
      return false;
  }
};

/** Keeps `widget-todos.json` current and replays mutations the widgets queued while the app slept. */
export class WidgetBridge {
  private lastWritten = '';
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly container: SharedContainer) {}

  /** Subscribe to file/repo changes. Returns an unsubscribe function. */
  start(): () => void {
    return effect(() => {
      // Read the signals here so the effect tracks them; sync() reads the same values.
      githubFileStore.openFiles.value;
      githubProfileStore.currentRepo.value;
      void this.sync();
    });
  }

  /** Writes the snapshot when it changed; resolves once the write (and reload) finished. */
  sync(): Promise<void> {
    const run = this.queue.then(() => this.writeSnapshot());
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async writeSnapshot(): Promise<void> {
    const snapshot = currentSnapshot();
    if (!snapshot) return;
    // updatedAt would make every sync look different.
    const json = JSON.stringify({ ...snapshot, updatedAt: 0 });
    if (json === this.lastWritten) return;
    this.lastWritten = json;
    await this.container.write(WIDGET_TODOS_FILE, JSON.stringify(snapshot));
    await this.container.reloadAllTimelines();
  }

  /**
   * Replays queued widget mutations through `githubFileStore`, oldest first. Each one is
   * re-applied to the current content (not the widget's copy) so a stale SHA cannot overwrite
   * newer edits. Returns the number applied.
   */
  async reconcile(): Promise<number> {
    const raw = await this.container.read(PENDING_WIDGET_MUTATIONS_FILE);
    if (!raw) return 0;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }
    const pending = (Array.isArray(parsed) ? parsed : [])
      .filter(isMutation)
      .sort((a, b) => a.timestamp - b.timestamp);
    await this.container.write(PENDING_WIDGET_MUTATIONS_FILE, '[]');

    let applied = 0;
    for (const mutation of pending) {
      try {
        if (await this.replay(mutation)) applied++;
      } catch {
        // One failed write must not drop the rest of the queue.
      }
    }
    if (applied > 0) await this.sync();
    return applied;
  }

  private async replay(m: PendingWidgetMutation): Promise<boolean> {
    if (m.kind === 'habit') {
      const content = await githubRepoFiles.read(m.path);
      if (content === null) return false;
      const next = checkIn(content, m.date);
      if (next === content) return false;
      await githubRepoFiles.write(m.path, next);
      return true;
    }
    if (m.kind === 'capture') {
      // The inbox may not be loaded (or exist) yet; read() opens it when it is in the repo tree.
      await githubRepoFiles.read(`${githubRepoFiles.appFolder()}/inbox.todos.md`);
    }
    const snapshot = currentSnapshot();
    if (!snapshot) return false;
    // A failed capture push leaves the line in the widget's cached inbox, so a later widget push
    // may already have committed it: replaying would duplicate the todo.
    if (
      m.kind === 'capture' &&
      snapshot.items.some(
        (i) => i.filePath === `${snapshot.appFolder}/inbox.todos.md` && i.text === m.text,
      )
    ) {
      return false;
    }
    const result =
      m.kind === 'capture'
        ? applyWidgetCapture(snapshot, m.text)
        : applyWidgetTodoMove(snapshot, m.itemId, m.kind === 'move' ? m.status : 'done');
    if (!result) return false; // already done or gone: replaying would be a no-op
    await githubRepoFiles.write(result.updatedFilePath, result.updatedContent);
    return true;
  }
}
