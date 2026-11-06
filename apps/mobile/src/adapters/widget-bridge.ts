import {
  applyWidgetTodoToggle,
  buildWidgetTodoSnapshot,
  githubFileStore,
  githubProfileStore,
} from '@kaihuman/core';
import { effect } from '@preact/signals';

export const WIDGET_TODOS_FILE = 'widget-todos.json';
export const PENDING_WIDGET_MUTATIONS_FILE = 'pending-widget-mutations.json';

/** Shared native container: iOS App Group `group.com.kaihuman.app` or Android SharedPreferences. */
export interface SharedContainer {
  read(name: string): Promise<string | null>;
  write(name: string, content: string): Promise<void>;
  /** `WidgetCenter.shared.reloadAllTimelines()` / Glance `updateAll`. */
  reloadAllTimelines(): Promise<void>;
}

/** A toggle the native widget could not commit (offline or SHA conflict). */
export interface PendingWidgetMutation {
  itemId: string;
  timestamp: number;
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

const isRawPath = (path: string): boolean => /^\.(kh|lifeos)\/raw\//.test(path);

const currentSnapshot = () => {
  const repo = githubProfileStore.currentRepo.value;
  if (!repo) return null;
  const files: Record<string, { sha: string; content: string }> = {};
  for (const [path, file] of Object.entries(githubFileStore.openFiles.value)) {
    if (isTodoPath(path)) files[path] = { sha: file.sha, content: file.content };
  }
  // Only what the app has loaded: raw captures that were never opened are not counted.
  const knowledgeInbox = Object.keys(githubFileStore.openFiles.value).filter(isRawPath).length;
  return buildWidgetTodoSnapshot(files, repo.full_name, repo.default_branch, new Date(), {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    knowledgeInbox,
    lockScreenText: true, // no privacy setting exists yet; v2 reserves the flag for it
  });
};

/** Keeps `widget-todos.json` current and replays toggles the widgets queued while the app slept. */
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
   * Replays queued widget toggles through `githubFileStore`. Toggles are re-applied to the
   * current content (not the widget's copy) so a stale SHA cannot overwrite newer edits.
   * Returns the number of toggles applied.
   */
  async reconcile(): Promise<number> {
    const raw = await this.container.read(PENDING_WIDGET_MUTATIONS_FILE);
    if (!raw) return 0;
    let pending: PendingWidgetMutation[];
    try {
      pending = JSON.parse(raw) as PendingWidgetMutation[];
    } catch {
      pending = [];
    }
    await this.container.write(PENDING_WIDGET_MUTATIONS_FILE, '[]');

    let applied = 0;
    for (const mutation of pending.sort((a, b) => a.timestamp - b.timestamp)) {
      const snapshot = currentSnapshot();
      const result = snapshot && applyWidgetTodoToggle(snapshot, mutation.itemId);
      if (!result) continue; // already done or gone: replaying would be a no-op
      githubFileStore.updateFileContent(result.updatedFilePath, result.updatedContent);
      await githubFileStore.saveFile(result.updatedFilePath);
      applied++;
    }
    if (applied > 0) await this.sync();
    return applied;
  }
}
