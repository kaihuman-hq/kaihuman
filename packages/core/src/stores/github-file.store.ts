import { computed, signal } from '@preact/signals';
import { demoMode } from '../demo-mode.js';
import { Logger } from '../logger.js';
import { ConflictError } from '../services/conflict.js';
import { githubService } from '../services/github.service.js';
import { type CachedFileRecord, getCoreStorage, type PendingMutation } from '../storage/adapter.js';
import { mergeFile } from '../sync/merge.js';
import { type GithubRepo, githubProfileStore } from './github-profile.store.js';

const logger = new Logger('GithubFileStore');

// In demo mode the in-memory service is the single source of truth, so the
// IndexedDB cache is bypassed entirely: writes (put/delete) become no-ops and
// reads (get/getKey) return undefined. This keeps demo edits temporary and
// in-memory without branching at every cache call site.
const storage = () => getCoreStorage();
const dbPromise = Promise.resolve({
  get: async (store: 'trees' | 'files', key: string): Promise<any> =>
    demoMode.value ? undefined : storage().getRecord(store, key),
  getAll: async (store: 'files'): Promise<any[]> =>
    demoMode.value ? [] : storage().listRecords(store),
  // `files` records carry their own key (`path`), mirroring the old keyPath store.
  put: async (store: 'trees' | 'files', value: any, key?: string): Promise<void> => {
    if (demoMode.value) return;
    await storage().putRecord(store, store === 'files' ? value.path : (key as string), value);
  },
  delete: async (store: 'trees' | 'files', key: string): Promise<void> => {
    if (demoMode.value) return;
    await storage().deleteRecord(store, key);
  },
});

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

/** Outcome of {@link GithubFileStore.syncNow}. */
export type SyncOutcome = 'skipped' | 'unchanged' | 'synced';

type Db = Awaited<typeof dbPromise>;

const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 5 * 60_000;

/** Outcome of {@link GithubFileStore.reconcile}. */
export type ReconcileResult = 'unchanged' | 'updated' | 'merged' | 'conflict';

type FileRecord = CachedFileRecord;

export class GithubFileStore {
  // State
  tree = signal<TreeItem[]>([]);
  openFiles = signal<Record<string, FileContent>>({});
  // Paths deleted by applyCommit. GitHub's API can keep listing them for a while, so loadTree
  // drops them from the remote tree until the remote stops listing them.
  // Maps `repo:path` to the deleted blob's sha ('' when unknown).
  private deletedPaths = new Map<string, string>();
  // Files written by applyCommit, `repo:path` to sha. The merge keeps them while GitHub's listing
  // lags (the sync merge no longer trusts cached entries with a real sha); cleared once it lists them.
  private pendingCommit = new Map<string, string>();
  private idbWriteTimers = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; run: () => Promise<void> }
  >();
  // Bumped when a save of a path starts and ends, so a read begun before it can be recognised as stale.
  private saveGen = new Map<string, number>();
  // Branch head the tree was last loaded or synced at; syncNow skips the tree fetch while it holds.
  private lastHead: { repo: string; sha: string } | null = null;
  private syncInFlight: Promise<SyncOutcome> | null = null;
  // path -> tree sha ensureFresh already reconciled against, so a view effect that re-runs on
  // every openFiles change cannot loop or spam the network.
  private freshChecked = new Map<string, string>();
  private outboxInFlight: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
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

  /** Files with edits not yet on GitHub (the outbox: dirty IndexedDB records survive a reload). */
  unsyncedCount = computed(() => this.dirtyFiles.value.size);

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

  /**
   * Loads the cached copy of `path` into memory without touching the network, so a screen can show
   * it at once and revalidate behind it. True when a copy is (now) in memory.
   */
  restoreCached(path: string): Promise<boolean> {
    return this.restoreFromCache(path);
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

  /**
   * Applies a freshly listed remote tree: drops tombstoned paths, settles the pending-binary and
   * deletion bookkeeping, and keeps only cached entries that exist locally and nowhere remote yet.
   */
  private async mergeRemoteTree(
    repo: { full_name: string },
    fetchedTree: TreeItem[],
    cachedTree: TreeItem[],
    db: Db,
    savedShas: ReadonlyMap<string, string> = new Map(),
  ): Promise<TreeItem[]> {
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
    for (const key of this.pendingCommit.keys()) {
      if (key.startsWith(prefix) && fetchedBySha.has(key.slice(prefix.length))) {
        this.pendingCommit.delete(key);
      }
    }
    // A save that finished while this listing was fetched set a newer tree sha than the listing
    // holds; keeping the listing's would make the open copy look behind and get reverted.
    const remoteTree = fetchedTree
      .filter((t) => !this.deletedPaths.has(`${repo.full_name}:${t.path}`))
      .map((t) => (savedShas.has(t.path) ? { ...t, sha: savedShas.get(t.path) as string } : t));

    // Keep a cached entry the remote lacks only when it was created here and is not listed yet
    // (sha '') or was just committed and GitHub has not listed it. Anything else with a real sha was
    // deleted or renamed elsewhere; keeping it would bring a deleted file back.
    const mergedTree = [...remoteTree];
    const remotePaths = new Set(remoteTree.map((t) => t.path));
    for (const item of cachedTree) {
      if (remotePaths.has(item.path)) continue;
      if (item.sha === '' || this.pendingCommit.has(`${repo.full_name}:${item.path}`)) {
        logger.debug(`Preserving local file not(yet) in remote: ${item.path} `);
        mergedTree.push(item);
      }
    }

    mergedTree.sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.path.localeCompare(b.path);
    });
    this.tree.value = mergedTree;
    await db.put('trees', mergedTree, `tree:${repo.full_name} `);
    return mergedTree;
  }

  private async readBlobText(
    repo: { owner: { login: string }; name: string },
    sha: string,
  ): Promise<string> {
    const bytes = await githubService.getBlobBytes(repo.owner.login, repo.name, sha);
    return new TextDecoder().decode(bytes);
  }

  /** True when `repo` is no longer the loaded one, or a load is rewriting the tree and open files. */
  private repoMoved(repo: { full_name: string }): boolean {
    return (
      githubProfileStore.currentRepo.peek()?.full_name !== repo.full_name || this.isLoading.peek()
    );
  }

  /**
   * Reconciles `path` with the blob a tree listing names, unless the listing may be older than the
   * open copy: a save of `path` started or finished since `gen` was read (as openFile checks), or
   * the repo changed. The listing and blob are immutable snapshots, so they cannot win over a save.
   */
  private async reconcileFromListing(
    repo: GithubRepo,
    path: string,
    sha: string,
    gen: number,
  ): Promise<ReconcileResult | 'skipped'> {
    const raced = () =>
      (this.saveGen.get(path) ?? 0) !== gen ||
      this.savingFiles.peek().has(path) ||
      this.repoMoved(repo);
    if (raced()) return 'skipped';
    const content = await this.readBlobText(repo, sha);
    if (raced()) return 'skipped';
    return this.reconcile(path, { content, sha });
  }

  /**
   * Pulls remote changes: when the branch head moved, lists its tree, merges it as loadTree does
   * and reconciles every open file whose blob changed or vanished. Calls share one run. Skipped
   * while a load or a save is in progress, since either would race the result.
   */
  syncNow(): Promise<SyncOutcome> {
    if (this.syncInFlight) return this.syncInFlight;
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo || this.isLoading.peek() || this.savingFiles.peek().size > 0) {
      return Promise.resolve('skipped');
    }
    const run = this.runSync(repo).finally(() => {
      this.syncInFlight = null;
    });
    this.syncInFlight = run;
    return run;
  }

  private async runSync(repo: GithubRepo): Promise<SyncOutcome> {
    const gens = new Map(this.saveGen);
    const head = await githubService.getHeadSha(repo.owner.login, repo.name, repo.default_branch);
    if (this.lastHead?.repo === repo.full_name && this.lastHead.sha === head) return 'unchanged';
    const fetched = (await githubService.fetchRepoTree(
      repo.owner.login,
      repo.name,
      repo.default_branch,
      { commitSha: head },
    )) as TreeItem[];
    // Something started while the tree was listed; its result would be newer than this listing.
    if (
      githubProfileStore.currentRepo.peek()?.full_name !== repo.full_name ||
      this.isLoading.peek() ||
      this.savingFiles.peek().size > 0
    ) {
      return 'skipped';
    }
    // Saves since the run began: the listing may predate them.
    const startGens = gens;
    const savedShas = new Map<string, string>();
    for (const [path, open] of Object.entries(this.openFiles.peek())) {
      if ((this.saveGen.get(path) ?? 0) !== (startGens.get(path) ?? 0) && open.sha !== '') {
        savedShas.set(path, open.sha);
      }
    }
    const db = await dbPromise;
    const merged = await this.mergeRemoteTree(repo, fetched, this.tree.peek(), db, savedShas);
    const byPath = new Map(merged.filter((t) => t.type === 'blob').map((t) => [t.path, t]));

    let incomplete = false;
    for (const [path, open] of Object.entries(this.openFiles.peek())) {
      if (this.repoMoved(repo)) return 'skipped';
      if (this.savingFiles.peek().has(path) || path in this.fileConflicts.peek()) continue;
      const gen = startGens.get(path) ?? 0;
      try {
        const item = byPath.get(path);
        if (item) {
          if (item.sha === '' || item.sha === open.sha) continue;
          if ((await this.reconcileFromListing(repo, path, item.sha, gen)) === 'skipped') {
            incomplete = true;
          }
        } else if ((this.saveGen.get(path) ?? 0) !== gen) {
          incomplete = true; // saved during the run: the listing says nothing about it
        } else if (this.dirtyFiles.peek().has(path)) {
          await this.reconcile(path, null);
        } else if (open.sha !== '') {
          await this.discardLocal(path);
        }
      } catch (e) {
        logger.warn(`Could not sync ${path}`, e);
        incomplete = true;
      }
    }
    // Unrecorded after a failure or a skip, so the next run lists the tree again and retries.
    if (!incomplete) this.lastHead = { repo: repo.full_name, sha: head };
    return 'synced';
  }

  /**
   * For views that read a file from the store: opens it, or, when open, clean and behind the
   * tree, refreshes it from the blob the tree lists. Checks each tree sha once per path.
   */
  async ensureFresh(path: string): Promise<void> {
    const open = this.openFiles.peek()[path];
    if (!open) {
      await this.openFile(path);
      return;
    }
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return;
    if (
      this.dirtyFiles.peek().has(path) ||
      this.savingFiles.peek().has(path) ||
      this.pendingFiles.peek().has(path)
    ) {
      return;
    }
    const item = this.tree.peek().find((t) => t.path === path && t.type === 'blob');
    if (!item || item.sha === '' || item.sha === open.sha) return;
    if (this.freshChecked.get(path) === item.sha) return;
    this.freshChecked.set(path, item.sha);
    try {
      const outcome = await this.reconcileFromListing(
        repo,
        path,
        item.sha,
        this.saveGen.get(path) ?? 0,
      );
      if (outcome === 'skipped') this.freshChecked.delete(path);
    } catch (e) {
      this.freshChecked.delete(path);
      logger.warn(`Could not refresh ${path}`, e);
    }
  }

  /**
   * Pushes every unsaved file: restores dirty IndexedDB records of this repo (edits from before a
   * reload or a failed save), then saves each. saveFile is sha-checked, so a remote that moved is
   * merged, never overwritten. A file still dirty without a conflict failed: retry with backoff.
   */
  flushOutbox(): Promise<void> {
    if (this.outboxInFlight) return this.outboxInFlight;
    const run = this.runOutbox().finally(() => {
      this.outboxInFlight = null;
    });
    this.outboxInFlight = run;
    return run;
  }

  private async runOutbox(): Promise<void> {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return;
    const prefix = `${repo.full_name}:`;
    try {
      const db = await dbPromise;
      const records = (await db.getAll('files')) as FileRecord[];
      for (const r of records) {
        if (!r.dirty || !r.path.startsWith(prefix)) continue;
        const path = r.path.slice(prefix.length);
        if (!this.openFiles.peek()[path]) await this.restoreFromCache(path);
      }
    } catch (e) {
      logger.error('Failed to restore unsaved files from cache', e);
    }

    for (const path of [...this.dirtyFiles.peek()]) {
      if (this.savingFiles.peek().has(path) || path in this.fileConflicts.peek()) continue;
      await this.saveFile(path);
    }

    // A dirty path that is no longer open was removed (deleted, moved): nothing to retry.
    const failed = [...this.dirtyFiles.peek()].some(
      (p) => !(p in this.fileConflicts.peek()) && p in this.openFiles.peek(),
    );
    if (!failed) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.retryDelay = RETRY_MIN_MS;
    } else if (!this.retryTimer) {
      const delay = this.retryDelay;
      this.retryDelay = Math.min(delay * 2, RETRY_MAX_MS);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.flushOutbox();
      }, delay);
    }
  }

  /** Sets the working copy of `path` over a committed base and marks it dirty if it differs. */
  private async restoreWorkingCopy(
    path: string,
    content: string,
    committed: { sha: string; base: string },
  ) {
    this.setOpenFile(path, { content, sha: committed.sha, base: committed.base });
    this.setDirty(path, content !== committed.base);
    await this.persistFile(path);
  }

  /**
   * Edits several files in one commit (e.g. moving a todo between boards). Open copies are first
   * reconciled with the head's tree, `transform` maps their contents to the changes (null deletes),
   * and the commit is pinned to that head; a moved branch retries up to three times.
   */
  async commitTransform(
    paths: string[],
    transform: (contents: Record<string, string>) => Record<string, string | null>,
    message: string,
  ): Promise<void> {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; ; attempt++) {
      const gens = new Map(this.saveGen);
      const head = await githubService.getHeadSha(repo.owner.login, repo.name, repo.default_branch);
      const tree = (await githubService.fetchRepoTree(
        repo.owner.login,
        repo.name,
        repo.default_branch,
        { commitSha: head },
      )) as TreeItem[];
      const contents: Record<string, string> = {};
      for (const path of paths) {
        if (!this.openFiles.peek()[path]) await this.openFile(path);
        const item = tree.find((t) => t.path === path && t.type === 'blob');
        const open = this.openFiles.peek()[path];
        if (item && open && item.sha !== '' && item.sha !== open.sha) {
          // 'skipped' (a save raced the listing) keeps the open copy, which is the newer one; the
          // commit is pinned to `head`, so a save that moved the branch retries below.
          const outcome = await this.reconcileFromListing(
            repo,
            path,
            item.sha,
            gens.get(path) ?? 0,
          );
          if (outcome === 'conflict') {
            throw new Error(`${path} has a sync conflict; resolve it first.`);
          }
        }
        const current = this.openFiles.peek()[path];
        if (!current) throw new Error(`Could not load ${path}`);
        contents[path] = current.content;
      }
      if (this.repoMoved(repo)) throw new Error('The repository changed; nothing was committed.');
      const changes = transform(contents);
      // Nothing to change (e.g. the item was moved elsewhere meanwhile): no empty commit.
      if (Object.keys(changes).length === 0) return;
      try {
        const res = await githubService.commitFiles(
          repo.owner.login,
          repo.name,
          repo.default_branch,
          changes,
          message,
          { expectedHeadSha: head },
        );
        // Edits typed while the commit was in flight; applyCommit would overwrite them.
        const typed: Record<string, string> = {};
        for (const path of paths) {
          const open = this.openFiles.peek()[path];
          if (open && open.content !== contents[path]) typed[path] = open.content;
        }
        await this.applyCommit(changes, res.blobShas);
        for (const [path, content] of Object.entries(typed)) {
          const committed = changes[path];
          if (typeof committed !== 'string') continue;
          // Replay the typed edit on top of the commit; on overlap keep the typed text, which the
          // next save merges against the committed base.
          const merged = mergeFile(path, contents[path] ?? '', content, committed);
          await this.restoreWorkingCopy(path, merged.clean ? merged.content : content, {
            sha: res.blobShas[path] ?? '',
            base: committed,
          });
        }
        return;
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw e;
      }
    }
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
      this.lastHead = null;
      this.freshChecked.clear();
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

      // 2. Fetch fresh from network. Reading the head first and listing that exact commit avoids
      // a lagging listing, and records the head so syncNow can tell when nothing changed.
      const head = await githubService.getHeadSha(repo.owner.login, repo.name, repo.default_branch);
      const fetchedTree = (await githubService.fetchRepoTree(
        repo.owner.login,
        repo.name,
        repo.default_branch,
        { commitSha: head },
      )) as TreeItem[];
      await this.mergeRemoteTree(repo, fetchedTree, cachedTree, db);
      this.lastHead = { repo: repo.full_name, sha: head };
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
  private openingFiles = new Map<string, Promise<void>>();

  /**
   * A second caller for a file that is already loading waits for that load. Returning early made
   * it read `openFiles` before the file was there, so a concurrent reader (e.g. two dashboard
   * loads after a sync) saw "not found" and dropped the file.
   */
  openFile(path: string): Promise<void> {
    const inFlight = this.openingFiles.get(path);
    if (inFlight) return inFlight;
    const load = this.loadFile(path).finally(() => this.openingFiles.delete(path));
    this.openingFiles.set(path, load);
    return load;
  }

  private async loadFile(path: string) {
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
          if (serverSha) {
            await this.persistFile(path);
            await this.updateTreeSha(repo.full_name, path, serverSha);
          }
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

  /**
   * Keeps the tree item in step with a saved file so syncNow does not see our own save as a remote
   * change. A sha '' item (created locally) stays '' so loadTree's merge still preserves it.
   */
  private async updateTreeSha(repoName: string, path: string, sha: string) {
    const item = this.tree.peek().find((t) => t.path === path);
    if (!item || item.sha === '' || item.sha === sha) return;
    const next = this.tree.peek().map((t) => (t === item ? { ...t, sha } : t));
    this.tree.value = next;
    try {
      const db = await dbPromise;
      await db.put('trees', next, `tree:${repoName} `);
    } catch (e) {
      logger.error('Failed to persist tree after save', e);
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

      // Drop the old paths' open copies along with their dirty flags and pending cache writes, or
      // the outbox would retry saving files that no longer exist.
      const removed = new Set(blobItems.map((t) => t.path));
      for (const key of Object.keys(this.openFiles.peek())) {
        if (key.startsWith(oldPrefixSlash)) removed.add(key);
      }
      for (const key of removed) await this.discardLocal(key);
    } finally {
      this.isLoading.value = false;
    }
  }

  /**
   * Never throws: a failed migration must not block the app, which keeps reading `.lifeos` (see
   * `appFolder`). The done flag is set only on success, so the next load retries.
   */
  async migrateAppFolder(): Promise<void> {
    try {
      await this.runAppFolderMigration();
    } catch (e) {
      logger.warn('[Migration] .lifeos → .kh migration failed; keeping .lifeos for now', e);
    }
  }

  private async runAppFolderMigration() {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) return;

    const tree = this.tree.peek();
    const hasKh = tree.some((t) => t.path.startsWith('.kh/'));
    const hasLifeos = tree.some((t) => t.path.startsWith('.lifeos/'));

    // Nothing to do: already on .kh or no .lifeos folder present
    if (hasKh || !hasLifeos) return;

    // Guard against concurrent tabs running migration simultaneously
    const flagKey = `kh_migration_done:${repo.full_name}`;
    if (getCoreStorage().getItem(flagKey) === 'done') return;

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

    getCoreStorage().setItem(flagKey, 'done');
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
      if (content === null) this.pendingCommit.delete(key);
      else this.pendingCommit.set(key, blobShas[path] ?? '');
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
    // Open copy, active file, and above all the dirty flag and pending cache write: left behind,
    // they keep the path in the outbox, which would retry a save of a deleted file forever.
    await this.discardLocal(path);

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

  /** Moves a file in one commit, so a failure cannot leave both copies or neither. */
  async renameFile(oldPath: string, newPath: string) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    if (this.openFiles.value[newPath] || this.tree.value.find((t) => t.path === newPath)) {
      throw new Error(`Destination ${newPath} already exists`);
    }

    // Unsaved edits must be in the commit; if they cannot be saved, moving the remote copy would lose them.
    if (this.dirtyFiles.peek().has(oldPath)) {
      await this.saveFile(oldPath);
      if (this.dirtyFiles.peek().has(oldPath)) {
        throw new Error(`Could not save ${oldPath} before renaming it`);
      }
    }

    this.isLoading.value = true;
    try {
      const MAX_ATTEMPTS = 3;
      let carried: { content: string; base: string } | null = null;
      for (let attempt = 1; ; attempt++) {
        const head = await githubService.getHeadSha(
          repo.owner.login,
          repo.name,
          repo.default_branch,
        );
        const { content } = await githubService.getFileContent(
          repo.owner.login,
          repo.name,
          oldPath,
        );
        const openBefore = this.openFiles.peek()[oldPath]?.content;
        const changes = { [newPath]: content, [oldPath]: null };
        try {
          const res = await githubService.commitFiles(
            repo.owner.login,
            repo.name,
            repo.default_branch,
            changes,
            `Rename ${oldPath} to ${newPath}`,
            { expectedHeadSha: head },
          );
          // Typed into the old path while the commit ran: applyCommit drops that copy.
          const openNow = this.openFiles.peek()[oldPath]?.content;
          carried =
            openNow !== undefined && openNow !== openBefore
              ? { content: openNow, base: content }
              : null;
          await this.applyCommit(changes, res.blobShas);
          break;
        } catch (e) {
          if (!(e instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw e;
        }
      }
      await this.openFile(newPath);
      const moved = this.openFiles.peek()[newPath];
      if (carried && moved) {
        await this.restoreWorkingCopy(newPath, carried.content, {
          sha: moved.sha,
          base: carried.base,
        });
      }
    } catch (e) {
      logger.error(`Rename failed`, e);
      throw e;
    } finally {
      this.isLoading.value = false;
    }
  }

  /** Queue an edit for later push (e.g. while offline). Newer edits to a path replace older ones. */
  async enqueueOfflineSave(path: string, content: string, baseSha?: string) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo || demoMode.value) return;
    await storage().putPendingMutation({
      id: `${repo.full_name}:${path}`,
      repoFullName: repo.full_name,
      path,
      content,
      baseSha: baseSha ?? this.openFiles.peek()[path]?.sha,
      timestamp: Date.now(),
    });
  }

  /** Push queued edits for the current repo; failed ones stay queued. Returns the number flushed. */
  async flushOfflineMutations(): Promise<number> {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo || demoMode.value) return 0;
    const pending: PendingMutation[] = (await storage().listPendingMutations()).filter(
      (m) => m.repoFullName === repo.full_name,
    );
    let flushed = 0;
    for (const m of pending) {
      try {
        const res = await githubService.saveFile(
          repo.owner.login,
          repo.name,
          m.path,
          m.content,
          `Update ${m.path} via Console`,
          m.baseSha,
        );
        await storage().deletePendingMutation(m.id);
        const sha = res.content?.sha;
        const open = this.openFiles.peek()[m.path];
        if (sha && open) {
          this.openFiles.value = { ...this.openFiles.peek(), [m.path]: { ...open, sha } };
        }
        flushed++;
      } catch (e) {
        logger.warn(`Offline mutation for ${m.path} failed; keeping it queued`, e);
      }
    }
    return flushed;
  }
}

export const githubFileStore = new GithubFileStore();
