import { computed, signal } from '@preact/signals';
import { openDB } from 'idb';
import { Logger } from '../logger.js';
import { githubService } from '../services/github.service.js';
import { githubProfileStore } from './github-profile.store.js';

const logger = new Logger('GithubFileStore');
const dbPromise = openDB('life-os-db', 1);

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
}

export class GithubFileStore {
  // State
  tree = signal<TreeItem[]>([]);
  openFiles = signal<Record<string, FileContent>>({});
  private idbWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();
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

  async loadTree() {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    // Use current value to allow "refresh" without clearing everything if same repo
    // But if we are switching repos, we MUST clear to prevent showing wrong files.

    if (this.loadedRepo.value !== repo.full_name) {
      logger.info(
        `Switching repo from ${this.loadedRepo.value} to ${repo.full_name}. Clearing tree.`,
      );
      this.tree.value = [];
      this.activeFile.value = null;
      this.openFiles.value = {}; // Clear open files too? Yes, safer.
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
      const remoteTree = (await githubService.fetchRepoTree(
        repo.owner.login,
        repo.name,
      )) as TreeItem[];

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

          if (hasFile) {
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

      // 1. Try Cache
      const db = await dbPromise;
      // Use composite key
      const cacheKey = `${repo.full_name}:${path}`;
      const cachedData = await db.get('files', cacheKey);

      const isCurrentlyOpen = !!this.openFiles.value[path];

      if (cachedData && !isCurrentlyOpen) {
        this.openFiles.value = {
          ...this.openFiles.value,
          [path]: { content: cachedData.content, sha: cachedData.sha },
        };
      }

      this.activeFile.value = path;

      // Always revalidate from network
      try {
        const fileData = await githubService.getFileContent(repo.owner.login, repo.name, path);
        const currentOpenData = this.openFiles.value[path];

        // Conflict Detection:
        // If we had local data (cached or already open),
        // AND the remote SHA is different,
        // AND the file is marked as locally dirty,
        // AND the content actually differs:
        if (
          currentOpenData &&
          fileData.sha !== currentOpenData.sha &&
          this.dirtyFiles.value.has(path) &&
          fileData.content !== currentOpenData.content
        ) {
          logger.warn(`Conflict detected for ${path} upon open.`);
          this.fileConflicts.value = {
            ...this.fileConflicts.value,
            [path]: {
              localContent: currentOpenData.content,
              remoteContent: fileData.content,
              remoteSha: fileData.sha,
            },
          };
        }
        // Only update if content changed or if we didn't have cache/open file
        // AND there is no active conflict (either no conflict, or it's resolved/not dirty)
        else if (
          !currentOpenData ||
          fileData.sha !== currentOpenData.sha ||
          fileData.content !== currentOpenData.content
        ) {
          this.openFiles.value = {
            ...this.openFiles.value,
            [path]: { content: fileData.content, sha: fileData.sha },
          };

          // Clear dirty flag if we are overriding cleanly (not user modified)
          const dirty = new Set(this.dirtyFiles.value);
          if (dirty.has(path)) {
            dirty.delete(path);
            this.dirtyFiles.value = dirty;
          }

          // Update Cache
          await db.put('files', {
            path: cacheKey,
            content: fileData.content,
            sha: fileData.sha,
            timestamp: Date.now(),
          });
        }
      } catch (netErr: any) {
        logger.warn('Background fetch failed', netErr);
        // If we didn't have cached data, this is a real error for the user
        const isCurrentlyOpen = !!this.openFiles.value[path];
        if (!isCurrentlyOpen && !cachedData) {
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
        clearTimeout(this.idbWriteTimers.get(cacheKey));
        this.idbWriteTimers.set(
          cacheKey,
          setTimeout(() => {
            this.idbWriteTimers.delete(cacheKey);
            const latestFile = this.openFiles.peek()[path];
            dbPromise
              .then((db) =>
                db.put('files', {
                  path: cacheKey,
                  content: latestFile?.content ?? newContent,
                  sha: latestFile?.sha ?? file.sha,
                  timestamp: Date.now(),
                }),
              )
              .catch((e) => logger.error(`Failed to persist edit for ${path} to cache`, e));
          }, 500),
        );
      }
    }
  }

  resolveConflict(path: string, resolution: 'keep_local' | 'use_remote') {
    const conflict = this.fileConflicts.value[path];
    if (!conflict) return;

    if (resolution === 'keep_local') {
      // Update local SHA to match remote, so our next save overwrites it
      const current = this.openFiles.value[path];
      if (current) {
        this.openFiles.value = {
          ...this.openFiles.value,
          [path]: { ...current, sha: conflict.remoteSha },
        };
      }
    } else if (resolution === 'use_remote') {
      // Overwrite local content with remote
      this.openFiles.value = {
        ...this.openFiles.value,
        [path]: { content: conflict.remoteContent, sha: conflict.remoteSha },
      };

      // Clear dirty flag as we are fully synchronized with remote
      const dirty = new Set(this.dirtyFiles.value);
      dirty.delete(path);
      this.dirtyFiles.value = dirty;

      // Persist resolution to cache so it survives a tab close
      const repo = githubProfileStore.currentRepo.value;
      if (repo) {
        const cacheKey = `${repo.full_name}:${path}`;
        dbPromise
          .then((db) =>
            db.put('files', {
              path: cacheKey,
              content: conflict.remoteContent,
              sha: conflict.remoteSha,
              timestamp: Date.now(),
            }),
          )
          .catch((e) => logger.error(`Failed to persist conflict resolution for ${path}`, e));
      }
    }

    // Remove from active conflicts
    const newConflicts = { ...this.fileConflicts.value };
    delete newConflicts[path];
    this.fileConflicts.value = newConflicts;
  }

  savingFiles = signal<Set<string>>(new Set());

  async saveFile(path: string) {
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

    try {
      let attempts = 0;
      const MAX_ATTEMPTS = 3;

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

        logger.debug(`Saving ${path} (Attempt ${attempts})...`);

        try {
          const res = await githubService.saveFile(
            repo.owner.login,
            repo.name,
            path,
            contentToSave,
            `Update ${path} via Console`,
            file.sha,
          );

          // 2. Update SHA from response
          const serverSha = res.content?.sha;
          if (serverSha) {
            // Update local state with new SHA
            const currentFileState = this.openFiles.value[path];
            if (currentFileState) {
              this.openFiles.value = {
                ...this.openFiles.value,
                [path]: { ...currentFileState, sha: serverSha },
              };
            }

            // Persist new SHA to cache so a reload after save uses the correct SHA
            const cacheKey = `${repo.full_name}:${path}`;
            try {
              const db = await dbPromise;
              await db.put('files', {
                path: cacheKey,
                content: contentToSave,
                sha: serverSha,
                timestamp: Date.now(),
              });
            } catch (e) {
              logger.error(`Failed to update cache SHA after saving ${path}`, e);
            }
          }

          // 3. Mark as NOT dirty (for THIS content version)
          // We only remove dirty flag if content matches what we just saved.
          const currentFile = this.openFiles.value[path];
          if (currentFile && currentFile.content === contentToSave) {
            const dirty = new Set(this.dirtyFiles.value);
            dirty.delete(path);
            this.dirtyFiles.value = dirty;
            logger.debug(`Saved ${path} successfully.Clean.`);
            this.lastSavedFile.value = path;
          } else {
            logger.warn(`Saved ${path}, but content changed during save.Retrying...`);
          }
        } catch (e: any) {
          // HANDLE 409 CONFLICT
          if (e.status === 409) {
            logger.warn(`Conflict(409) detected for ${path}.Fetching latest SHA and retrying...`);

            // Fetch latest file metadata to get fresh SHA
            try {
              const latest = await githubService.getFileContent(repo.owner.login, repo.name, path);

              // Update our local SHA but KEEP our content (User Wins)
              const current = this.openFiles.value[path];
              if (current) {
                this.openFiles.value = {
                  ...this.openFiles.value,
                  [path]: { ...current, sha: latest.sha },
                };
                // Loop will continue and try saving again with new SHA
              } else {
                break; // File closed
              }
              continue; // Force next iteration immediately
            } catch (fetchErr) {
              logger.error(`Failed to resolve conflict for ${path}`, fetchErr);
              throw e; // Abort if we can't even fetch
            }
          }

          throw e; // Re-throw other errors to exit
        }
      }

      // If the loop exited because max attempts were exhausted (not because the
      // file became clean), inform the user so they know the save did not complete.
      if (this.dirtyFiles.value.has(path)) {
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
    }
  }

  async createFile(path: string, content: string) {
    if (this.openFiles.value[path]) {
      throw new Error(`File already exists: ${path} `);
    }

    // 1. Update Open Files (Optimistic)
    this.openFiles.value = {
      ...this.openFiles.value,
      [path]: { content, sha: '' },
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
        await db.put('files', { path: cacheKey, content, sha: '', timestamp: Date.now() });
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
