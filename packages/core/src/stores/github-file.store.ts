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

    // Use current value to allow "refresh" without clearing everything if same repo
    // If we are switching repos, we should clear.
    // But implementation simple: assume if we are calling this, we want to refresh.
    // If we clear `tree`, the UI flashes. Let's NOT clear tree if it has values? 
    // Ideally we want optimistic UI: show old, replace with new.

    // this.tree.value = []; // Don't clear tree to prevent flash
    this.isLoading.value = true;
    this.error.value = null;

    // Only clear openFiles if we are changing context? 
    // For now, let's keep openFiles as is. Clearing it forces everything to re-fetch/re-read from cache.
    // this.openFiles.value = {}; 
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
            console.log(`[GithubFileStore] Preserving local file not (yet) in remote: ${item.path}`);
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
      console.error('Failed to load tree', err);
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
}

export const githubFileStore = new GithubFileStore();
