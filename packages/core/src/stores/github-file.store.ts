import { computed, effect, signal } from '@preact/signals';
import { githubService } from '../services/github.service.js';
import { githubProfileStore } from './github-profile.store.js';
import { dbPromise } from '../db.js';
import { Logger } from '../logger.js';

const logger = new Logger('GithubFileStore');

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
  activeFile = signal<string | null>(null);
  dirtyFiles = signal<Set<string>>(new Set());
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  lastSavedFile = signal<string | null>(null);
  loadedRepo = signal<string | null>(null);

  // Computed: currently open file content
  currentContent = computed(() => {
    const path = this.activeFile.value;
    if (!path) return null;
    return this.openFiles.value[path]?.content || '';
  });

  async loadTree() {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    // Use current value to allow "refresh" without clearing everything if same repo
    // But if we are switching repos, we MUST clear to prevent showing wrong files.

    if (this.loadedRepo.value !== repo.full_name) {
      logger.info(`Switching repo from ${this.loadedRepo.value} to ${repo.full_name}. Clearing tree.`);
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
      const dbTree = await db.get('trees', `tree:${repo.full_name}`);
      if (dbTree) {
        cachedTree = dbTree;
        // If we have no in-memory tree, use cache immediately
        if (this.tree.value.length === 0) {
          this.tree.value = cachedTree;
        }
      }

      // 2. Fetch fresh from network
      const remoteTree = await githubService.fetchRepoTree(repo.owner.login, repo.name) as TreeItem[];

      // 3. Smart Merge: Keep items from Cache that are NOT in Remote but have Local Content
      // This handles the "Eventual Consistency" of GitHub API after creation
      const mergedTree = [...remoteTree];
      const remotePaths = new Set(remoteTree.map(t => t.path));

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
            logger.debug(`Preserving local file not (yet) in remote: ${item.path}`);
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
      await db.put('trees', mergedTree, `tree:${repo.full_name}`);

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

  pendingFiles = new Set<string>(); // Track in-flight requests

  async openFile(path: string) {
    // If already open, just set active
    if (this.openFiles.value[path]) {
      this.activeFile.value = path;
      return;
    }

    // If pending, just wait (or ignore, assuming previous call handles it)
    if (this.pendingFiles.has(path)) {
      logger.warn(`File ${path} is already loading. Ignoring duplicate request.`);
      return;
    }

    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    this.pendingFiles.add(path);

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

      if (cachedData) {
        this.openFiles.value = {
          ...this.openFiles.value,
          [path]: { content: cachedData.content, sha: cachedData.sha },
        };
        this.activeFile.value = path;
      }

      // Always revalidate from network
      try {
        const fileData = await githubService.getFileContent(repo.owner.login, repo.name, path);

        // Only update if content changed or if we didn't have cache
        if (!cachedData || fileData.sha !== cachedData.sha || fileData.content !== cachedData.content) {
          this.openFiles.value = {
            ...this.openFiles.value,
            [path]: { content: fileData.content, sha: fileData.sha },
          };

          // If we didn't have cache, we need to set active file (in case we didn't enter the if block above)
          if (!cachedData) {
            this.activeFile.value = path;
          }

          // Update Cache
          await db.put('files', {
            path: cacheKey,
            content: fileData.content,
            sha: fileData.sha,
            timestamp: Date.now()
          });
        }
      } catch (netErr: any) {
        logger.warn('Background fetch failed', netErr);
        // If we didn't have cached data, this is a real error for the user
        if (!cachedData) {
          throw netErr;
        }
      }

    } catch (err: any) {
      logger.error('Failed to open file', err);
      this.error.value = err.message;
    } finally {
      this.pendingFiles.delete(path);
    }
  }

  updateFileContent(path: string, newContent: string) {
    const file = this.openFiles.value[path];
    if (file && file.content !== newContent) {
      this.openFiles.value = {
        ...this.openFiles.value,
        [path]: { ...file, content: newContent },
      };

      // Mark dirty
      const dirty = new Set(this.dirtyFiles.value);
      dirty.add(path);
      this.dirtyFiles.value = dirty;

      // Update DB immediately
      const repo = githubProfileStore.currentRepo.value;
      if (repo) {
        const cacheKey = `${repo.full_name}:${path}`;
        dbPromise.then(db => {
          // NO extra key arg
          db.put('files', {
            path: cacheKey,
            content: newContent,
            sha: file.sha,
            timestamp: Date.now()
          });
        });
      }
    }
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
      // LOOP: Keep saving as long as it's dirty (changes happened while saving)
      while (this.dirtyFiles.value.has(path)) {
        // 1. Capture content at start of iteration
        // Refresh file ref to get latest content
        file = this.openFiles.value[path];

        if (!file) {
          logger.error('File closed during save:', path);
          break;
        }

        const contentToSave = file.content;

        logger.debug(`Saving ${path}...`);

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
          // Note: We must read 'this.openFiles' again to ensure we don't overwrite concurrent content updates 
          // (though content updates shouldn't change SHA, but good practice)
          const currentFileState = this.openFiles.value[path];
          if (currentFileState) {
            this.openFiles.value = {
              ...this.openFiles.value,
              [path]: { ...currentFileState, sha: serverSha },
            };
          }

          // Update DB with new SHA
          const cacheKey = `${repo.full_name}:${path}`;
          dbPromise.then(db => {
            db.put('files', {
              path: cacheKey,
              content: contentToSave, // Use the content we actually saved
              sha: serverSha,
              timestamp: Date.now()
            });
          });
        }

        // 3. Status Check
        // If content hasn't changed since we started this save, we are clean.
        // If content changed (currentFileState.content !== contentToSave), 
        // then dirty property remains true (we never cleared it), so loop continues.
        const freshFileState = this.openFiles.value[path];
        if (freshFileState && freshFileState.content === contentToSave) {
          const dirty = new Set(this.dirtyFiles.value);
          dirty.delete(path);
          this.dirtyFiles.value = dirty;
          logger.debug(`Saved ${path} successfully. Clean.`);
          this.lastSavedFile.value = path;
        } else {
          logger.warn(`Saved ${path}, but content changed during save. Retrying...`);
        }
      }
    } catch (err: any) {
      logger.error('Failed to save', err);
      this.error.value = err.message;
      // Note: We leave it in 'dirty' state so user can try again or auto-retry later?
      // Or should we throw to alert caller?
      // For now, silent fail in store, UI shows error via 'error' signal.
    } finally {
      const doneSaving = new Set(this.savingFiles.value);
      doneSaving.delete(path);
      this.savingFiles.value = doneSaving;
    }
  }

  async createFile(path: string, content: string) {
    if (this.openFiles.value[path]) {
      throw new Error(`File already exists: ${path}`);
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
      size: content.length
    };

    // Create new tree array with optimistic item
    const newTree = [...this.tree.value, newItem].sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.path.localeCompare(b.path);
    });
    this.tree.value = newTree;

    // 3. Mark dirty and Save
    const dirty = new Set(this.dirtyFiles.value);
    dirty.add(path);
    this.dirtyFiles.value = dirty;

    // 4. Persist Tree to DB immediately (so reload works)
    const repo = githubProfileStore.currentRepo.value;
    if (repo) {
      dbPromise.then(db => {
        db.put('trees', newTree, `tree:${repo.full_name}`);
      });
    }

    await this.saveFile(path);
  }

  async deleteFile(path: string) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    // 1. Get SHA (from open files or tree)
    let sha = this.openFiles.value[path]?.sha;
    if (!sha) {
      const item = this.tree.value.find(t => t.path === path);
      sha = item?.sha || '';
    }

    // If still no SHA, we might need to fetch it, or it's a new unsaved file
    if (!sha) {
      logger.warn(`No SHA found for ${path}, attempting to fetch...`);
      try {
        const { sha: serverSha } = await githubService.getFileContent(repo.owner.login, repo.name, path);
        sha = serverSha;
      } catch (e) {
        logger.error(`Could not find SHA for ${path}, cannot delete.`);
        // If it doesn't exist on server, just clean up local state
      }
    }

    // 2. Delete from Server
    if (sha) {
      this.isLoading.value = true;
      try {
        await githubService.deleteFile(repo.owner.login, repo.name, path, `Delete ${path}`, sha);
      } catch (e) {
        logger.error(`Failed to delete ${path}`, e);
        throw e;
      } finally {
        this.isLoading.value = false;
      }
    }

    // 3. Update Local State (Tree, OpenFiles, DB)

    // Remove from Tree
    this.tree.value = this.tree.value.filter(t => t.path !== path);
    // Remove from OpenFiles
    const newOpenFiles = { ...this.openFiles.value };
    delete newOpenFiles[path];
    this.openFiles.value = newOpenFiles;

    // Clear Active if it was this one
    if (this.activeFile.value === path) {
      this.activeFile.value = null;
    }

    // Update DB
    const cacheKey = `${repo.full_name}:${path}`;
    dbPromise.then(async db => {
      await db.delete('files', cacheKey);
      await db.put('trees', this.tree.value, `tree:${repo.full_name}`);
    });
  }

  async renameFile(oldPath: string, newPath: string) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    if (this.openFiles.value[newPath] || this.tree.value.find(t => t.path === newPath)) {
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
      undefined // No SHA = Create
    );

    // Optimistically update our tree
    const newItem: TreeItem = {
      path,
      mode: '100644',
      type: 'blob',
      sha: res.content?.sha || '',
      url: '',
      size: content.length
    };
    this.tree.value = [...this.tree.value, newItem].sort((a, b) => a.path.localeCompare(b.path));

    // Update DB tree
    dbPromise.then(db => {
      db.put('trees', this.tree.value, `tree:${repo.full_name}`);
    });
  }
}

export const githubFileStore = new GithubFileStore();
