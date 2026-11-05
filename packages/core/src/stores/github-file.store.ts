import { computed, signal } from '@preact/signals';
import { openDB } from 'idb';
import { demoMode } from '../demo-mode.js';
import { Logger } from '../logger.js';
import { githubService } from '../services/github.service.js';
import { mergeFile } from '../sync/merge.js';
import { githubProfileStore } from './github-profile.store.js';

const logger = new Logger('GithubFileStore');

// In demo mode the in-memory service is the single source of truth, so the
// IndexedDB cache is bypassed entirely: writes (put/delete) become no-ops and
// reads (get/getKey) return undefined. This keeps demo edits temporary and
// in-memory without branching at every cache call site.
const NEUTERED_IN_DEMO = new Set(['put', 'delete', 'get', 'getKey']);
const dbPromise = openDB('life-os-db', 1).then(
  (db) =>
    new Proxy(db, {
      get(target, prop) {
        if (demoMode.value && typeof prop === 'string' && NEUTERED_IN_DEMO.has(prop)) {
          return async () => undefined;
        }
        // Access via the real db so idb's own proxy resolves the method, then
        // bind it back to the db so `this` is correct after our wrapper.
        const value = (target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    }),
);

export interface TreeItem {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

export interface FileContent {
  content: string;
  sha: string;
  /** Content at `sha`: the base for a three-way merge with the remote. Unknown when absent. */
  base?: string;
}

/** Outcome of {@link GithubFileStore.reconcile}. */
export type ReconcileResult = 'unchanged' | 'updated' | 'merged' | 'conflict';

type FileRecord = {
  path: string;
  content: string;
  sha: string;
  timestamp: number;
  dirty?: boolean;
  baseContent?: string;
};

export class GithubFileStore {
  // State
  tree = signal<TreeItem[]>([]);
  openFiles = signal<Record<string, FileContent>>({});
  // Paths deleted by applyCommit. GitHub's API can keep listing them for a while, so loadTree
  // drops them from the remote tree until the remote stops listing them.
  // Maps `repo:path` to the deleted blob's sha ('' when unknown).
  private deletedPaths = new Map<string, string>();
  // Binary files committed by applyCommit, `repo:path` to sha. They have no `files` (text) entry, so
  // loadTree's merge needs this to keep them while GitHub's listing lags; cleared once it lists them.
  private pendingBinary = new Map<string, string>();
  private idbWriteTimers = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; run: () => Promise<void> }
  >();
  // Bumped when a save of a path starts and ends, so a read begun before it can be recognised as stale.
  private saveGen = new Map<string, number>();
  activeFile = signal<string | null>(null);
  dirtyFiles = signal<Set<string>>(new Set());
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  lastSavedFile = signal<string | null>(null);
  loadedRepo = signal<string | null>(null);

  // Track conflicts: path -> { localContent, remoteContent, remoteSha }
  fileConflicts = signal<
    Record<string, { localContent: string; remoteContent: string; remoteSha: string }>
  >({});

  // Computed: currently open file content
  currentContent = computed(() => {
    const path = this.activeFile.value;
    if (!path) return null;
    return this.openFiles.value[path]?.content || '';
  });

  // Computed: resolved app folder — '.kh' if present, falls back to '.lifeos' for backwards compatibility
  appFolder = computed(() => {
    const tree = this.tree.value;
    if (tree.some((t) => t.path.startsWith('.kh/'))) return '.kh';
    if (tree.some((t) => t.path.startsWith('.lifeos/'))) return '.lifeos';
    return '.kh';
  });

  private clearTombstone(path: string) {
    const repo = githubProfileStore.currentRepo.peek();
    if (repo) this.deletedPaths.delete(`${repo.full_name}:${path}`);
  }

  private setOpenFile(path: string, file: FileContent) {
    this.openFiles.value = { ...this.openFiles.peek(), [path]: file };
  }

  private setDirty(path: string, dirty: boolean) {
    const current = this.dirtyFiles.peek();
    if (current.has(path) === dirty) return;
    const next = new Set(current);
    if (dirty) next.add(path);
    else next.delete(path);
    this.dirtyFiles.value = next;
  }

  private clearConflict(path: string) {
    if (!(path in this.fileConflicts.peek())) return;
    const next = { ...this.fileConflicts.peek() };
    delete next[path];
    this.fileConflicts.value = next;
  }

  private bumpSaveGen(path: string) {
    this.saveGen.set(path, (this.saveGen.get(path) ?? 0) + 1);
  }

  /**
   * Writes the in-memory working copy of `path`, with its dirty flag and base, to IndexedDB, under
   * `repoName` (the current repo by default; a debounced write passes the repo it was made in).
   */
  private async persistFile(
    path: string,
    repoName = githubProfileStore.currentRepo.peek()?.full_name,
  ) {
    const file = this.openFiles.peek()[path];
    if (!repoName || !file) return;
    const record: FileRecord = {
      path: `${repoName}:${path}`,
      content: file.content,
      sha: file.sha,
      timestamp: Date.now(),
      dirty: this.dirtyFiles.peek().has(path),
    };
    if (file.base !== undefined) record.baseContent = file.base;
    try {
      const db = await dbPromise;
      await db.put('files', record);
    } catch (e) {
      logger.error(`Failed to persist ${path} to cache`, e);
    }
  }

  /** Runs the debounced IndexedDB writes now, so unsaved edits survive a reload or suspension. */
  async flushPendingWrites(): Promise<void> {
    const pending = [...this.idbWriteTimers.values()];
    this.idbWriteTimers.clear();
    for (const p of pending) clearTimeout(p.timer);
    await Promise.all(pending.map((p) => p.run()));
  }

  /**
   * Forgets every local trace of `path`: the open copy, its dirty flag and conflict, a pending
   * cache write and the IndexedDB record. For undoing an optimistic create that never reached
   * GitHub; without the record gone, loadTree's merge would bring the path back.
   */
  async discardLocal(path: string): Promise<void> {
    const repo = githubProfileStore.currentRepo.peek();
    if (repo) {
      const key = `${repo.full_name}:${path}`;
      clearTimeout(this.idbWriteTimers.get(key)?.timer);
      this.idbWriteTimers.delete(key);
    }
    if (this.openFiles.peek()[path]) {
      const open = { ...this.openFiles.peek() };
      delete open[path];
      this.openFiles.value = open;
    }
    this.setDirty(path, false);
    this.clearConflict(path);
    if (this.activeFile.peek() === path) this.activeFile.value = null;
    if (!repo) return;
    try {
      const db = await dbPromise;
      await db.delete('files', `${repo.full_name}:${path}`);
    } catch (e) {
      logger.error(`Failed to drop ${path} from cache`, e);
    }
  }

  /**
   * Brings the working copy of `path` in line with the remote copy, which is read (no-store) when
   * not passed; `null` means the file is gone remotely. A clean copy takes the remote. A dirty copy
   * is three-way merged against its base: a clean merge becomes the new working copy (still dirty,
   * now based on the remote sha), otherwise `fileConflicts[path]` is filled and nothing is lost.
   * The single entry point for every path that reconciles with the remote.
   */
  async reconcile(
    path: string,
    remote?: { content: string; sha: string } | null,
  ): Promise<ReconcileResult> {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return 'unchanged';
    if (!this.openFiles.peek()[path]) await this.restoreFromCache(path);
    if (!this.openFiles.peek()[path]) return 'unchanged';

    let theirs = remote;
    if (theirs === undefined) {
      try {
        theirs = await githubService.getFileContent(repo.owner.login, repo.name, path);
      } catch (e) {
        if ((e as { status?: number }).status !== 404) throw e;
        theirs = null;
      }
    }

    // Re-read after every await: the user may have typed meanwhile.
    const cur = this.openFiles.peek()[path];
    if (!cur) return 'unchanged';
    const dirty = this.dirtyFiles.peek().has(path);

    if (theirs === null) {
      // A local file that was never pushed is expected to be missing remotely.
      if (!dirty || cur.sha === '') return 'unchanged';
      return this.recordConflict(path, cur.content, { content: '', sha: '' });
    }

    if (!dirty) {
      if (theirs.sha === cur.sha && theirs.content === cur.content) return 'unchanged';
      this.setOpenFile(path, { content: theirs.content, sha: theirs.sha, base: theirs.content });
      this.clearConflict(path);
      await this.persistFile(path);
      return 'updated';
    }

    if (theirs.sha === cur.sha) return 'unchanged';

    let base = cur.base;
    if (base === undefined && cur.sha) {
      try {
        const bytes = await githubService.getBlobBytes(repo.owner.login, repo.name, cur.sha);
        base = new TextDecoder().decode(bytes);
      } catch (e) {
        logger.warn(`Could not read the base of ${path}; treating it as a conflict`, e);
      }
    }
    const latest = this.openFiles.peek()[path];
    if (!latest) return 'unchanged';
    // A save finished while the base was read: start over from the new base.
    if (latest.sha !== cur.sha) return this.reconcile(path, theirs);
    if (base === undefined && cur.sha) return this.recordConflict(path, latest.content, theirs);

    const result = mergeFile(path, base ?? '', latest.content, theirs.content);
    if (!result.clean) return this.recordConflict(path, latest.content, theirs);

    this.setOpenFile(path, { content: result.content, sha: theirs.sha, base: theirs.content });
    // Nothing left to push when the merge equals the remote (our edit was already there).
    this.setDirty(path, result.content !== theirs.content);
    this.clearConflict(path);
    await this.persistFile(path);
    return 'merged';
  }

  private async recordConflict(
    path: string,
    localContent: string,
    remote: { content: string; sha: string },
  ): Promise<'conflict'> {
    logger.warn(`Conflict detected for ${path}.`);
    this.fileConflicts.value = {
      ...this.fileConflicts.peek(),
      [path]: { localContent, remoteContent: remote.content, remoteSha: remote.sha },
    };
    await this.persistFile(path);
    return 'conflict';
  }

  /** Loads the IndexedDB copy of `path` into memory, with its dirty flag. False when none. */
  private async restoreFromCache(path: string): Promise<boolean> {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return false;
    const db = await dbPromise;
    const cached = (await db.get('files', `${repo.full_name}:${path}`)) as FileRecord | undefined;
    if (!cached) return false;
    // Opened elsewhere while IndexedDB was read: memory is newer.
    if (this.openFiles.peek()[path]) return true;
    const dirty = cached.dirty === true;
    // A clean record holds the content at its sha, so it is its own base.
    const base = dirty ? cached.baseContent : (cached.baseContent ?? cached.content);
    this.setOpenFile(path, {
      content: cached.content,
      sha: cached.sha,
      ...(base !== undefined ? { base } : {}),
    });
    if (dirty) this.setDirty(path, true);
    return true;
  }

  async loadTree() {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    // Use current value to allow "refresh" without clearing everything if same repo
    // But if we are switching repos, we MUST clear to prevent showing wrong files.

    if (this.loadedRepo.value !== repo.full_name) {
      logger.info(
        `Switching repo from ${this.loadedRepo.value} to ${repo.full_name}. Clearing tree.`,
      );
      // Pending cache writes belong to the old repo's files: write them before those are cleared.
      await this.flushPendingWrites();
      this.tree.value = [];
      this.activeFile.value = null;
      this.openFiles.value = {}; // Clear open files too? Yes, safer.
      this.dirtyFiles.value = new Set();
      this.fileConflicts.value = {};
      this.loadedRepo.value = repo.full_name;
    }

    this.isLoading.value = true;
    this.error.value = null;
    this.activeFile.value = null;

    try {
      const db = await dbPromise;
      let cachedTree: TreeItem[] = [];

      // 1. Try to load from DB first
      const dbTree = await db.get('trees', `tree:${repo.full_name} `);
      if (dbTree) {
        cachedTree = dbTree;
        // If we have no in-memory tree, use cache immediately
        if (this.tree.value.length === 0) {
          this.tree.value = cachedTree;
        }
      }

      // 2. Fetch fresh from network
      const fetchedTree = (await githubService.fetchRepoTree(
        repo.owner.login,
        repo.name,
      )) as TreeItem[];
      const fetchedBySha = new Map(fetchedTree.map((t) => [t.path, t.sha]));
      const prefix = `${repo.full_name}:`;
      for (const [key, deletedSha] of this.deletedPaths) {
        if (!key.startsWith(prefix)) continue;
        const remoteSha = fetchedBySha.get(key.slice(prefix.length));
        // Gone, or re-created elsewhere with different content: stop hiding it.
        if (remoteSha === undefined || (deletedSha !== '' && remoteSha !== deletedSha)) {
          this.deletedPaths.delete(key);
        }
      }
      for (const key of this.pendingBinary.keys()) {
        if (key.startsWith(prefix) && fetchedBySha.has(key.slice(prefix.length))) {
          this.pendingBinary.delete(key);
        }
      }
      const remoteTree = fetchedTree.filter(
        (t) => !this.deletedPaths.has(`${repo.full_name}:${t.path}`),
      );

      // 3. Smart Merge: Keep items from Cache that are NOT in Remote but have Local Content
      // This handles the "Eventual Consistency" of GitHub API after creation
      const mergedTree = [...remoteTree];
      const remotePaths = new Set(remoteTree.map((t) => t.path));

      // Check for missing items
      for (const item of cachedTree) {
        if (!remotePaths.has(item.path)) {
          // This item is in Cache but not Remote.
          // Check if we have content for it in 'files' store.
          // Logic: If we have content, it's likely a local file we care about (newly created or working on).
          // If we don't, it might be a deleted file we should drop.

          const cacheKey = `${repo.full_name}:${item.path}`;
          const hasFile = await db.getKey('files', cacheKey);

          if (hasFile || this.pendingBinary.has(cacheKey)) {
            logger.debug(`Preserving local file not(yet) in remote: ${item.path} `);
            mergedTree.push(item);
          }
        }
      }

      // Sort
      mergedTree.sort((a, b) => {
        if (a.type === 'tree' && b.type !== 'tree') return -1;
        if (a.type !== 'tree' && b.type === 'tree') return 1;
        return a.path.localeCompare(b.path);
      });

      this.tree.value = mergedTree;

      // 4. Update DB
      await db.put('trees', mergedTree, `tree:${repo.full_name} `);
    } catch (err: any) {
      logger.error('Failed to load tree', err);
      // Fallback to cache if request fails
      if (this.tree.value.length === 0) {
        this.error.value = err.message;
      }
    } finally {
      this.isLoading.value = false;
    }
  }

  pendingFiles = signal(new Set<string>()); // Track in-flight requests

  async openFile(path: string) {
    // If pending, just wait (or ignore, assuming previous call handles it)
    if (this.pendingFiles.value.has(path)) {
      logger.warn(`File ${path} is already loading. Ignoring duplicate request.`);
      return;
    }

    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    const newPending = new Set(this.pendingFiles.value);
    newPending.add(path);
    this.pendingFiles.value = newPending;

    try {
      // Find in tree to make sure it's a file
      const treeItem = this.tree.value.find((t) => t.path === path);
      if (!treeItem) {
        logger.warn(`File ${path} not found in tree, attempting to fetch anyway.`);
      }

      // 1. Show the cached copy first (with its dirty flag); memory wins when already open.
      const hadLocal = await this.restoreFromCache(path);

      this.activeFile.value = path;

      // Always revalidate from network. A dirty copy is never replaced: reconcile merges it.
      try {
        const gen = this.saveGen.get(path) ?? 0;
        const fileData = await githubService.getFileContent(repo.owner.login, repo.name, path);
        const raced = (this.saveGen.get(path) ?? 0) !== gen || this.savingFiles.peek().has(path);
        if (raced && this.openFiles.peek()[path]) {
          // A save ran during the read, so the read may predate it: the saved copy is newer.
          logger.debug(`Dropping a read of ${path} that raced a save.`);
        } else if (this.openFiles.peek()[path]) {
          await this.reconcile(path, fileData);
        } else {
          this.setOpenFile(path, {
            content: fileData.content,
            sha: fileData.sha,
            base: fileData.content,
          });
          this.setDirty(path, false);
          await this.persistFile(path);
        }
      } catch (netErr: any) {
        logger.warn('Background fetch failed', netErr);
        // If we didn't have cached data, this is a real error for the user
        if (!this.openFiles.peek()[path] && !hadLocal) {
          throw netErr;
        }
      }
    } catch (err: any) {
      logger.error('Failed to open file', err);
      this.error.value = err.message;
    } finally {
      const newPending = new Set(this.pendingFiles.value);
      newPending.delete(path);
      this.pendingFiles.value = newPending;
    }
  }

  updateFileContent(path: string, newContent: string) {
    logger.info(`updateFileContent called for ${path}`);
    const file = this.openFiles.value[path];
    if (!file) {
      logger.error(`updateFileContent failed: file ${path} not found in openFiles`);
    } else if (file.content === newContent) {
      logger.info(`updateFileContent skipped: content unchanged for ${path}`);
    }
    if (file && file.content !== newContent) {
      logger.info(`updateFileContent updating ${path}`);
      this.openFiles.value = {
        ...this.openFiles.value,
        [path]: { ...file, content: newContent },
      };
    }

    // ALWAYS mark dirty if updateFileContent is explicitly called as it implies user intent to save
    if (file) {
      const dirty = new Set(this.dirtyFiles.value);
      dirty.add(path);
      this.dirtyFiles.value = dirty;

      // Persist edit to IDB so content survives a browser suspend/crash before
      // the next explicit save reaches GitHub. Debounced to avoid hammering IDB
      // on every keystroke — 500 ms of idle after the last change flushes.
      const repo = githubProfileStore.currentRepo.value;
      if (repo) {
        const cacheKey = `${repo.full_name}:${path}`;
        clearTimeout(this.idbWriteTimers.get(cacheKey)?.timer);
        // Persists whatever is in memory when it runs, so a save that finished first is not undone.
        const run = () => this.persistFile(path, repo.full_name);
        this.idbWriteTimers.set(cacheKey, {
          run,
          timer: setTimeout(() => {
            this.idbWriteTimers.delete(cacheKey);
            void run();
          }, 500),
        });
      }
    }
  }

  resolveConflict(path: string, resolution: 'keep_local' | 'use_remote') {
    const conflict = this.fileConflicts.value[path];
    if (!conflict) return;

    const current = this.openFiles.peek()[path];
    if (resolution === 'keep_local') {
      // Rebase the local copy onto the remote version the user saw. The next save is checked
      // against that sha, so a newer remote change is merged (or conflicts) instead of lost.
      if (current) {
        this.setOpenFile(path, {
          ...current,
          sha: conflict.remoteSha,
          base: conflict.remoteContent,
        });
        this.setDirty(path, true);
      }
    } else if (conflict.remoteSha === '') {
      // The remote deleted the file: accept that and drop the local copy.
      const open = { ...this.openFiles.peek() };
      delete open[path];
      this.openFiles.value = open;
      this.setDirty(path, false);
      if (this.activeFile.peek() === path) this.activeFile.value = null;
      const repo = githubProfileStore.currentRepo.peek();
      if (repo) {
        dbPromise
          .then((db) => db.delete('files', `${repo.full_name}:${path}`))
          .catch((e) => logger.error(`Failed to drop ${path} from cache`, e));
      }
    } else {
      this.setOpenFile(path, {
        content: conflict.remoteContent,
        sha: conflict.remoteSha,
        base: conflict.remoteContent,
      });
      this.setDirty(path, false);
    }
    if (current && this.openFiles.peek()[path]) void this.persistFile(path);

    // Remove from active conflicts
    const newConflicts = { ...this.fileConflicts.value };
    delete newConflicts[path];
    this.fileConflicts.value = newConflicts;
  }

  savingFiles = signal<Set<string>>(new Set());

  async saveFile(path: string) {
    this.clearTombstone(path);
    const repo = githubProfileStore.currentRepo.value;
    // We get file from latest state
    let file = this.openFiles.value[path];
    if (!repo || !file) return;

    if (!this.dirtyFiles.value.has(path)) return; // Nothing to save

    // CONCURRENCY HANDLING:
    // If already saving this file, we don't need to spawn another saver.
    // The existing saver will loop around and pick up the new changes because we left it 'dirty'.
    if (this.savingFiles.value.has(path)) {
      logger.debug(`Save already in progress for ${path}, queuing update.`);
      return;
    }

    // Mark as saving
    const newSaving = new Set(this.savingFiles.value);
    newSaving.add(path);
    this.savingFiles.value = newSaving;
    this.bumpSaveGen(path);

    try {
      let attempts = 0;
      const MAX_ATTEMPTS = 3;
      let conflicted = false;

      // LOOP: Keep saving as long as it's dirty (changes happened while saving).
      // The loop can exit either because the file is clean (success) or because
      // MAX_ATTEMPTS was reached without an exception (all attempts silently skipped
      // or the content kept changing). We detect the latter case after the loop.
      while (this.dirtyFiles.value.has(path) && attempts < MAX_ATTEMPTS) {
        attempts++;

        // 1. Capture content at start of iteration
        // Refresh file ref to get latest content
        file = this.openFiles.value[path];

        if (!file) {
          logger.error('File closed during save:', path);
          break;
        }

        const contentToSave = file.content;
        const shaUsed = file.sha;

        logger.debug(`Saving ${path} (Attempt ${attempts})...`);

        try {
          const res = await githubService.saveFile(
            repo.owner.login,
            repo.name,
            path,
            contentToSave,
            `Update ${path} via Console`,
            shaUsed,
          );

          // 2. Update SHA from response; the saved content is the new base. A reconcile that ran
          // during the PUT already moved the copy to a newer remote: its sha and base win.
          const serverSha = res.content?.sha;
          const currentFileState = this.openFiles.value[path];
          const reconciled = !!currentFileState && currentFileState.sha !== shaUsed;
          if (serverSha && currentFileState && !reconciled) {
            this.setOpenFile(path, { ...currentFileState, sha: serverSha, base: contentToSave });
          }

          // 3. Mark as NOT dirty (for THIS content version)
          // We only remove dirty flag if content matches what we just saved (or, after a
          // reconcile, the base it was moved onto).
          const currentFile = this.openFiles.value[path];
          const clean = reconciled
            ? currentFile?.content === currentFile?.base
            : currentFile?.content === contentToSave;
          if (reconciled && !clean) this.setDirty(path, true);
          if (currentFile && clean) {
            const dirty = new Set(this.dirtyFiles.value);
            dirty.delete(path);
            this.dirtyFiles.value = dirty;
            logger.debug(`Saved ${path} successfully.Clean.`);
            this.lastSavedFile.value = path;
          } else {
            logger.warn(`Saved ${path}, but content changed during save.Retrying...`);
          }
          // Persist new SHA (and dirty state) so a reload after save uses the correct base.
          if (serverSha) await this.persistFile(path);
        } catch (e: any) {
          // 409: our sha is stale. 422: the file exists but we had no sha (created elsewhere).
          // Never push the local text as is: merge it with the latest remote first.
          if (e.status === 409 || e.status === 422) {
            logger.warn(`Save of ${path} refused (${e.status}). Reconciling with the remote...`);
            const outcome = await this.reconcile(path);
            if (outcome === 'conflict') {
              conflicted = true;
              break; // ConflictModal takes it from here.
            }
            continue;
          }

          throw e; // Re-throw other errors to exit
        }
      }

      // If the loop exited because max attempts were exhausted (not because the
      // file became clean), inform the user so they know the save did not complete.
      if (this.dirtyFiles.value.has(path) && !conflicted) {
        const msg = `Could not save ${path} after ${MAX_ATTEMPTS} attempts. Your changes are preserved locally — please try again.`;
        logger.error(msg);
        this.error.value = msg;
      }
    } catch (err: any) {
      logger.error('Failed to save', err);
      this.error.value = err.message;
    } finally {
      const doneSaving = new Set(this.savingFiles.value);
      doneSaving.delete(path);
      this.savingFiles.value = doneSaving;
      this.bumpSaveGen(path);
    }
  }

  async createFile(path: string, content: string) {
    this.clearTombstone(path);
    if (this.openFiles.value[path]) {
      throw new Error(`File already exists: ${path} `);
    }

    // 1. Update Open Files (Optimistic)
    this.openFiles.value = {
      ...this.openFiles.value,
      [path]: { content, sha: '', base: '' },
    };

    // 2. Update Tree (Optimistic) - CRITICAL for File Explorer to show it immediately
    const newItem: TreeItem = {
      path,
      mode: '100644',
      type: 'blob',
      sha: '', // No SHA yet
      url: '',
      size: content.length,
    };

    // Create new tree array with optimistic item
    const newTree = [...this.tree.value, newItem].sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.path.localeCompare(b.path);
    });
    this.tree.value = newTree;

    // 3. Mark dirty
    const dirty = new Set(this.dirtyFiles.value);
    dirty.add(path);
    this.dirtyFiles.value = dirty;

    // 4. Persist both the file content and the updated tree to IDB *before* the
    //    network save.  This ensures the smart-merge in loadTree() can recover the
    //    new file if the browser closes while the GitHub request is in flight.
    const repo = githubProfileStore.currentRepo.value;
    if (repo) {
      try {
        const db = await dbPromise;
        const cacheKey = `${repo.full_name}:${path}`;
        await db.put('files', {
          path: cacheKey,
          content,
          sha: '',
          timestamp: Date.now(),
          dirty: true,
          baseContent: '',
        });
        await db.put('trees', newTree, `tree:${repo.full_name} `);
      } catch (e) {
        logger.error('Failed to persist new file to cache before save', e);
      }
    }

    await this.saveFile(path);
  }

  async renameFolder(oldPrefix: string, newPrefix: string) {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return;

    const tree = this.tree.peek();
    // Pass only blobs to the Git Trees API (subtrees are implicit in blob paths)
    const blobItems = tree.filter((t) => t.path.startsWith(`${oldPrefix}/`) && t.type === 'blob');

    this.isLoading.value = true;
    try {
      await githubService.renameFolder(
        repo.owner.login,
        repo.name,
        repo.default_branch,
        oldPrefix,
        newPrefix,
        blobItems,
      );

      // Optimistically rewrite the tree in-memory immediately.
      // We cannot rely on a follow-up loadTree() call because GitHub's REST API
      // can return stale ref/tree data for a short window after a commit.
      const oldPrefixSlash = `${oldPrefix}/`;
      const updatedTree = tree
        .filter((t) => t.path !== oldPrefix && !t.path.startsWith(oldPrefixSlash))
        .concat(
          tree
            .filter((t) => t.path === oldPrefix || t.path.startsWith(oldPrefixSlash))
            .map((t) => ({ ...t, path: newPrefix + t.path.slice(oldPrefix.length) })),
        )
        .sort((a, b) => {
          if (a.type === 'tree' && b.type !== 'tree') return -1;
          if (a.type !== 'tree' && b.type === 'tree') return 1;
          return a.path.localeCompare(b.path);
        });

      this.tree.value = updatedTree;

      // Persist updated tree + clean up old file entries in IDB
      const db = await dbPromise;
      await db.put('trees', updatedTree, `tree:${repo.full_name} `);
      for (const item of blobItems) {
        await db.delete('files', `${repo.full_name}:${item.path}`);
        await db.delete('files', `${repo.full_name}:${item.path} `);
      }

      // Clear stale entries from openFiles
      const newOpenFiles = { ...this.openFiles.peek() };
      for (const key of Object.keys(newOpenFiles)) {
        if (key.startsWith(oldPrefixSlash)) {
          delete newOpenFiles[key];
        }
      }
      this.openFiles.value = newOpenFiles;
    } finally {
      this.isLoading.value = false;
    }
  }

  async migrateAppFolder() {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return;

    const tree = this.tree.peek();
    const hasKh = tree.some((t) => t.path.startsWith('.kh/'));
    const hasLifeos = tree.some((t) => t.path.startsWith('.lifeos/'));

    // Nothing to do: already on .kh or no .lifeos folder present
    if (hasKh || !hasLifeos) return;

    // Guard against concurrent tabs running migration simultaneously
    const flagKey = `kh_migration_done:${repo.full_name}`;
    if (localStorage.getItem(flagKey) === 'done') return;

    logger.info('[Migration] Starting .lifeos → .kh migration...');

    const lifeosItems = tree.filter((t) => t.path.startsWith('.lifeos/') && t.type === 'blob');

    await githubService.renameFolder(
      repo.owner.login,
      repo.name,
      repo.default_branch,
      '.lifeos',
      '.kh',
      lifeosItems,
    );

    localStorage.setItem(flagKey, 'done');
    logger.info('[Migration] .lifeos → .kh migration complete. Cleaning up IDB...');

    // Clean up stale IDB cache entries BEFORE reloading tree (so smart merge doesn't re-add them)
    const db = await dbPromise;
    for (const item of lifeosItems) {
      // Delete both key variants (openFile stores without space, saveFile stored with space)
      await db.delete('files', `${repo.full_name}:${item.path}`);
      await db.delete('files', `${repo.full_name}:${item.path} `);
    }

    // Clear stale .lifeos/ entries from in-memory openFiles
    const newOpenFiles = { ...this.openFiles.peek() };
    for (const key of Object.keys(newOpenFiles)) {
      if (key.startsWith('.lifeos/')) {
        delete newOpenFiles[key];
      }
    }
    this.openFiles.value = newOpenFiles;

    logger.info('[Migration] IDB cleaned. Reloading tree...');
    // Reload tree so appFolder recomputes to '.kh'
    await this.loadTree();
  }

  /**
   * Mirrors a multi-file commit (`githubService.commitFiles`) into local state: tree, open files
   * and the IndexedDB cache. Trusts the commit instead of reloading, because GitHub's API can
   * return the old tree for a while. Deleted paths are removed from the cached `files` entries
   * and the cached tree, otherwise `loadTree`'s merge would bring them back.
   */
  async applyCommit(
    changes: Record<string, string | Uint8Array | null>,
    blobShas: Record<string, string>,
  ) {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return;

    const paths = new Set(Object.keys(changes));
    for (const [path, content] of Object.entries(changes)) {
      const key = `${repo.full_name}:${path}`;
      if (typeof content === 'string' || content === null) this.pendingBinary.delete(key);
      else this.pendingBinary.set(key, blobShas[path] ?? '');
      if (content === null) {
        const item = this.tree.peek().find((t) => t.path === path && t.type === 'blob');
        this.deletedPaths.set(key, this.openFiles.peek()[path]?.sha || item?.sha || '');
      } else this.deletedPaths.delete(key);
    }
    const written = Object.entries(changes).filter(([, content]) => content !== null);
    const known = new Map(this.tree.peek().map((t) => [t.path, t]));
    for (const [path] of written) {
      known.set(path, {
        ...known.get(path),
        path,
        mode: '100644',
        type: 'blob',
        sha: blobShas[path] ?? '',
        url: known.get(path)?.url ?? '',
      });
    }
    const newTree = [...known.values()]
      .filter((t) => !(t.type === 'blob' && changes[t.path] === null))
      .sort((a, b) => {
        if (a.type === 'tree' && b.type !== 'tree') return -1;
        if (a.type !== 'tree' && b.type === 'tree') return 1;
        return a.path.localeCompare(b.path);
      });
    this.tree.value = newTree;

    const open = { ...this.openFiles.peek() };
    for (const [path, content] of Object.entries(changes)) {
      // Binary has no text form: drop the open copy so it is read from the repo, not shown stale.
      if (content === null || typeof content !== 'string') delete open[path];
      else if (path in open) open[path] = { content, sha: blobShas[path] ?? '', base: content };
    }
    this.openFiles.value = open;

    const active = this.activeFile.peek();
    if (active && changes[active] === null) this.activeFile.value = null;

    if (this.dirtyFiles.peek().size > 0) {
      const dirty = new Set(this.dirtyFiles.peek());
      for (const p of paths) dirty.delete(p);
      this.dirtyFiles.value = dirty;
    }

    // Awaited: a stale `files` entry would let loadTree's merge resurrect a deleted path.
    try {
      const db = await dbPromise;
      for (const [path, content] of Object.entries(changes)) {
        const cacheKey = `${repo.full_name}:${path}`;
        if (content === null || typeof content !== 'string') {
          await db.delete('files', cacheKey);
          await db.delete('files', `${cacheKey} `);
        } else {
          await db.put('files', {
            path: cacheKey,
            content,
            sha: blobShas[path] ?? '',
            timestamp: Date.now(),
            dirty: false,
            baseContent: content,
          });
        }
      }
      await db.put('trees', newTree, `tree:${repo.full_name} `);
    } catch (e) {
      logger.error('Failed to update IDB cache after commit', e);
    }
  }

  async deleteFile(path: string) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    // 1. Get SHA (from open files or tree)
    let sha = this.openFiles.value[path]?.sha;
    if (!sha) {
      const item = this.tree.value.find((t) => t.path === path);
      sha = item?.sha || '';
    }

    // If still no SHA, we might need to fetch it, or it's a new unsaved file
    if (!sha) {
      logger.warn(`No SHA found for ${path}, attempting to fetch...`);
      try {
        const { sha: serverSha } = await githubService.getFileContent(
          repo.owner.login,
          repo.name,
          path,
        );
        sha = serverSha;
      } catch (_e) {
        logger.error(`Could not find SHA for ${path}, cannot delete.`);
        // If it doesn't exist on server, just clean up local state
      }
    }

    // 2. Delete from Server
    if (sha) {
      this.isLoading.value = true;
      try {
        await githubService.deleteFile(repo.owner.login, repo.name, path, `Delete ${path} `, sha);
      } catch (e) {
        logger.error(`Failed to delete ${path} `, e);
        throw e;
      } finally {
        this.isLoading.value = false;
      }
    }

    // 3. Update Local State (Tree, OpenFiles, DB)

    // Remove from Tree
    this.tree.value = this.tree.value.filter((t) => t.path !== path);
    // Remove from OpenFiles
    const newOpenFiles = { ...this.openFiles.value };
    delete newOpenFiles[path];
    this.openFiles.value = newOpenFiles;

    // Clear Active if it was this one
    if (this.activeFile.value === path) {
      this.activeFile.value = null;
    }

    // Await IDB cleanup: if we leave a stale file entry behind, loadTree's smart
    // merge will see content in the cache and resurrect the deleted file in the tree.
    const cacheKey = `${repo.full_name}:${path}`;
    try {
      const db = await dbPromise;
      await db.delete('files', cacheKey);
      await db.put('trees', this.tree.value, `tree:${repo.full_name} `);
    } catch (e) {
      logger.error(`Failed to clean up IDB cache after deleting ${path}`, e);
    }
  }

  async renameFile(oldPath: string, newPath: string) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    if (this.openFiles.value[newPath] || this.tree.value.find((t) => t.path === newPath)) {
      throw new Error(`Destination ${newPath} already exists`);
    }

    this.isLoading.value = true;

    try {
      // 1. Get Content
      // Try open files first
      let content = this.openFiles.value[oldPath]?.content;

      // If not open, try to load it
      if (content === undefined) {
        await this.openFile(oldPath);
        content = this.openFiles.value[oldPath]?.content;
      }

      if (content === undefined) {
        throw new Error(`Could not load content for ${oldPath}`);
      }

      // 2. Create new file
      // 2. Create new file

      // Actually we can use our existing methods but we need to be careful with atomicity manually
      // Use direct service calls to avoid UI flicker or state updates mid-flight?
      // No, strictly: Create New -> Delete Old.

      await this.saveFileDirectly(newPath, content); // We need a direct save that accepts content, not just from state

      // 3. Delete old file
      await this.deleteFile(oldPath);

      // 4. Update Open Files to point to new path if it was open
      // deleteFile handled removal.
      // We should open the new file.
      await this.openFile(newPath);
    } catch (e) {
      logger.error(`Rename failed`, e);
      throw e;
    } finally {
      this.isLoading.value = false;
    }
  }

  // Helper for rename to avoid complex state juggling
  async saveFileDirectly(path: string, content: string) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    const res = await githubService.saveFile(
      repo.owner.login,
      repo.name,
      path,
      content,
      `Create ${path} (Rename)`,
      undefined, // No SHA = Create
    );

    // Optimistically update our tree
    const newItem: TreeItem = {
      path,
      mode: '100644',
      type: 'blob',
      sha: res.content?.sha || '',
      url: '',
      size: content.length,
    };
    this.tree.value = [...this.tree.value, newItem].sort((a, b) => a.path.localeCompare(b.path));

    // Update DB tree
    dbPromise.then((db) => {
      db.put('trees', this.tree.value, `tree:${repo.full_name} `);
    });
  }
}

export const githubFileStore = new GithubFileStore();
