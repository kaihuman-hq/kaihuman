import {
  applyWidgetCapture,
  applyWidgetTodoMove,
  buildWidgetExtras,
  buildWidgetTodoSnapshot,
  githubFileStore,
  githubProfileStore,
  type PendingWidgetMutation,
} from '@kaihuman/core';
import {
  checkIn,
  IDEAS_FOLDER,
  localDate,
  parseTimeTracking,
  serializeTimeTracking,
  toggleStartStop,
} from '@kaihuman/formats';
import { effect } from '@preact/signals';
import { githubRepoFiles } from '../screens/quick-capture.js';
import { repoReady } from '../sync/repo-ready.js';
import { focusFilter, refreshFocusFilter } from './focus-filter.js';

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

/** Files buildWidgetExtras reads for the habit, timer and idea widgets. */
const isExtraPath = (path: string): boolean =>
  (/^\.(kh|lifeos)\//.test(path) &&
    (path.endsWith('.habit.csv') || path.endsWith('.timetracking.csv'))) ||
  (path.startsWith(`${IDEAS_FOLDER}/`) && path.endsWith('.md'));

export const currentSnapshot = (filter = focusFilter.peek()) => {
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
    ...(filter && { filter }),
    lockScreenText: true, // no privacy setting exists yet; v2 reserves the flag for it
  });
};

/** True when the tree is known and every todo file it lists is open. */
export const snapshotComplete = (): boolean => {
  // A tree that is only a capture's optimistic file (loadTree not run yet) is not the repo.
  if (!repoReady()) return false;
  const tree = githubFileStore.tree.peek();
  const open = githubFileStore.openFiles.peek();
  return tree.every((t) => t.type !== 'blob' || !isTodoPath(t.path) || t.path in open);
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
    case 'timer-stop':
      return str('path');
    case 'digest':
      return str('text') && str('date');
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

  /**
   * Opens every todo file the tree lists, so the snapshot covers all of them and not only the
   * ones a screen opened. Cache-first: a file costs a request only when its blob moved. Without
   * this a background launch (no screen mounted) wrote an empty widget.
   */
  async load(): Promise<void> {
    // Habits, timers and ideas first: the widget extras are built from open files only, so a
    // headless run that opened just the todos wrote a snapshot without them (empty Habits and
    // Timer widgets). Before the todos, so the first complete snapshot already has them.
    const extras = githubFileStore.tree
      .peek()
      .filter((t) => t.type === 'blob' && isExtraPath(t.path))
      .map((t) => t.path);
    for (const path of [...extras, ...githubRepoFiles.todoPaths().filter(isTodoPath)]) {
      try {
        await githubRepoFiles.read(path);
      } catch {
        // One unreadable file must not keep the others from the widget; the snapshot waits for it.
      }
    }
  }

  /** Writes the snapshot when it changed; resolves once the write (and reload) finished. */
  sync(): Promise<void> {
    const run = this.queue.then(() => this.writeSnapshot());
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async writeSnapshot(): Promise<void> {
    // A partial snapshot would replace the widget's last good one with missing or no todos.
    if (!snapshotComplete()) return;
    // The Focus filter intent changes the file while the app sleeps; a sync folds it in.
    const snapshot = currentSnapshot(await refreshFocusFilter(this.container));
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
    // Replaying before the repo and every todo file are loaded found no item (dropped toggles)
    // or wrote a capture into an empty inbox that the first loadTree then discarded. The queue
    // stays put; the sync run calls this again once load() has opened the files.
    if (!snapshotComplete()) return 0;
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
    const failed: PendingWidgetMutation[] = [];
    for (const mutation of pending) {
      try {
        if (await this.replay(mutation)) applied++;
      } catch {
        // One failed write must not drop the rest of the queue, nor itself: it is retried.
        failed.push(mutation);
      }
    }
    if (failed.length > 0) await this.requeue(failed);
    if (applied > 0) await this.sync();
    return applied;
  }

  /** Puts failed mutations back ahead of any the widget queued meanwhile. */
  private async requeue(failed: PendingWidgetMutation[]): Promise<void> {
    let queued: unknown;
    try {
      queued = JSON.parse((await this.container.read(PENDING_WIDGET_MUTATIONS_FILE)) ?? '[]');
    } catch {
      queued = [];
    }
    const rest = (Array.isArray(queued) ? queued : []).filter(isMutation);
    await this.container.write(PENDING_WIDGET_MUTATIONS_FILE, JSON.stringify([...failed, ...rest]));
  }

  private async replay(m: PendingWidgetMutation): Promise<boolean> {
    if (m.kind === 'timer-stop') {
      const content = await githubRepoFiles.read(m.path);
      if (content === null) return false;
      // Stop at the tap, not at replay time; a timer already stopped (or restarted on another
      // day) is left alone.
      const at = new Date(m.timestamp);
      const data = parseTimeTracking(content);
      const entry = data.entries.find((e) => e.date === localDate(at));
      const last = entry?.intervals[entry.intervals.length - 1];
      if (!last || last.end !== undefined) return false;
      await githubRepoFiles.write(m.path, serializeTimeTracking(toggleStartStop(data, at)));
      return true;
    }
    if (m.kind === 'digest') {
      // One file per day: a second digest the same day is appended, not lost.
      const path = `logs/digest-${m.date}.md`;
      const existing = (await githubRepoFiles.read(path)) ?? '';
      await githubRepoFiles.write(
        path,
        existing === ''
          ? `# Digest ${m.date}\n\n${m.text}\n`
          : `${existing.trimEnd()}\n\n${m.text}\n`,
      );
      return true;
    }
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
