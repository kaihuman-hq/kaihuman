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
      } else {
        const fileData = await githubService.getFileContent(repo.owner.login, repo.name, path);

        this.openFiles.value = {
          ...this.openFiles.value,
          [path]: { content: fileData.content, sha: fileData.sha },
        };
        this.activeFile.value = path;

        // Cache it - NO extra key arg since keyPath is 'path'
        await db.put('files', {
          path: cacheKey,
          content: fileData.content,
          sha: fileData.sha,
          timestamp: Date.now()
        });
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

  async saveFile(path: string) {
    const repo = githubProfileStore.currentRepo.value;
    const file = this.openFiles.value[path];
    if (!repo || !file) return;

    if (!this.dirtyFiles.value.has(path)) return; // Nothing to save

    try {
      const res = await githubService.saveFile(
        repo.owner.login,
        repo.name,
        path,
        file.content,
        `Update ${path} via Console`,
        file.sha,
      );

      // Update SHA from response
      const serverSha = res.content?.sha;
      if (serverSha) {
        this.openFiles.value = {
          ...this.openFiles.value,
          [path]: { ...file, sha: serverSha },
        };

        // Update DB with new SHA - NO extra key arg
        const cacheKey = `${repo.full_name}:${path}`;
        const db = await dbPromise;
        await db.put('files', {
          path: cacheKey,
          content: file.content,
          sha: serverSha,
          timestamp: Date.now()
        });
      }

      // Clear dirty
      const dirty = new Set(this.dirtyFiles.value);
      dirty.delete(path);
      this.dirtyFiles.value = dirty;
    } catch (err: any) {
      console.error('Failed to save', err);
      this.error.value = err.message;
    }
  }
}

export const githubFileStore = new GithubFileStore();
