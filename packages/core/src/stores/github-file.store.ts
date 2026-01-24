import { computed, effect, signal } from '@preact/signals';
import { githubService } from '../services/github.service.js';
import { githubProfileStore } from './github-profile.store.js';
import { dbPromise } from '../db.js';

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

  // Computed: currently open file content
  currentContent = computed(() => {
    const path = this.activeFile.value;
    if (!path) return null;
    return this.openFiles.value[path]?.content || '';
  });

  async loadTree() {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    this.isLoading.value = true;
    this.error.value = null;
    this.tree.value = []; // Clear tree to trigger UI refresh and prevent stale data
    this.openFiles.value = {}; // Clear open files to prevent stale content
    this.activeFile.value = null;

    try {
      // 1. Try to load from DB first
      const db = await dbPromise;
      const cachedTree = await db.get('trees', `tree:${repo.full_name}`);
      if (cachedTree) {
        this.tree.value = cachedTree;
        this.isLoading.value = false; // Show content immediately
      }

      // 2. Fetch fresh from network in background/foreground (revalidate)
      const tree = await githubService.fetchRepoTree(repo.owner.login, repo.name);

      this.tree.value = tree as TreeItem[];

      // 3. Update DB
      await db.put('trees', tree, `tree:${repo.full_name}`);

    } catch (err: any) {
      console.error('Failed to load tree', err);
      // Only set error if we don't have cached data? Or maybe toast it?
      // For now, if cache existed, we just keep showing it but log error.
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
      console.warn(`[GithubFileStore] File ${path} is already loading. Ignoring duplicate request.`);
      return;
    }

    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    this.pendingFiles.add(path);

    try {
      // Find in tree to make sure it's a file
      const treeItem = this.tree.value.find((t) => t.path === path);
      if (!treeItem) {
        console.warn(`File ${path} not found in tree, attempting to fetch anyway.`);
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
        console.warn('Background fetch failed', netErr);
        // If we didn't have cached data, this is a real error for the user
        if (!cachedData) {
          throw netErr;
        }
      }

    } catch (err: any) {
      console.error('Failed to open file', err);
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
      console.log(`[GithubFileStore] Save already in progress for ${path}, queuing update.`);
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
        const contentToSave = file.content;

        console.log(`[GithubFileStore] Saving ${path}...`);

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
          this.openFiles.value = {
            ...this.openFiles.value,
            [path]: { ...currentFileState, sha: serverSha },
          };

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
        if (freshFileState.content === contentToSave) {
          const dirty = new Set(this.dirtyFiles.value);
          dirty.delete(path);
          this.dirtyFiles.value = dirty;
          console.log(`[GithubFileStore] Saved ${path} successfully. Clean.`);
        } else {
          console.log(`[GithubFileStore] Saved ${path}, but content changed during save. Retrying...`);
        }
      }
    } catch (err: any) {
      console.error('Failed to save', err);
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

    this.openFiles.value = {
      ...this.openFiles.value,
      [path]: { content, sha: '' },
    };

    const dirty = new Set(this.dirtyFiles.value);
    dirty.add(path);
    this.dirtyFiles.value = dirty;

    await this.saveFile(path);
  }
}

export const githubFileStore = new GithubFileStore();
