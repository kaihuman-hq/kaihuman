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

  async openFile(path: string) {
    // If already open, just set active
    if (this.openFiles.value[path]) {
      this.activeFile.value = path;
      return;
    }

    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    try {
      // Find in tree to make sure it's a file
      const treeItem = this.tree.value.find((t) => t.path === path);
      if (!treeItem) {
        console.warn(`File ${path} not found in tree, attempting to fetch anyway.`);
      }

      // 1. Try Cache
      const db = await dbPromise;
      const cachedFile = await db.get('files', path);
      // Verify cache belongs to current repo? ideally keys should include repo info if paths overlap.
      // But path in tree is checking relative to repo. 
      // Ideally we store with key `repo.full_name/path`.
      // Let's assume path is unique enough or we clear cache on repo switch (not good).
      // Let's prefix path with repo id or fullname in DB.
      const cacheKey = `${repo.full_name}:${path}`;
      const cachedData = await db.get('files', cacheKey);

      if (cachedData) {
        this.openFiles.value = {
          ...this.openFiles.value,
          [path]: { content: cachedData.content, sha: cachedData.sha },
        };
        this.activeFile.value = path;

        // Background revalidate? Optional. For "super fast" and "local first" we trust local unless explicit refresh.
        // But we might want to check for updates if valid internet.
        // For now, let's just serve cache. 
        // If no cache, fetch.
      } else {
        const fileData = await githubService.getFileContent(repo.owner.login, repo.name, path);

        this.openFiles.value = {
          ...this.openFiles.value,
          [path]: { content: fileData.content, sha: fileData.sha },
        };
        this.activeFile.value = path;

        // Cache it
        await db.put('files', {
          path: cacheKey, // Use composite key
          content: fileData.content,
          sha: fileData.sha,
          timestamp: Date.now()
        }, cacheKey);
      }

    } catch (err: any) {
      console.error('Failed to open file', err);
      this.error.value = err.message;
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

      // Update DB immediately for offline support (draft state)
      // We might want a separate 'drafts' store or just update 'files' with a dirty flag?
      // For simplicity, let's update 'files' but keep in mind SHA mismatches if we don't sync.
      // Actually, updating 'files' in IDB means next load gets this dirty version. That is DESIRED for local-first.
      // We assume IDB is the source of truth for THIS client.
      const repo = githubProfileStore.currentRepo.value;
      if (repo) {
        const cacheKey = `${repo.full_name}:${path}`;
        dbPromise.then(db => {
          db.put('files', {
            path: cacheKey,
            content: newContent,
            sha: file.sha,
            timestamp: Date.now()
          }, cacheKey);
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

        // Update DB with new SHA
        const cacheKey = `${repo.full_name}:${path}`;
        const db = await dbPromise;
        await db.put('files', {
          path: cacheKey,
          content: file.content,
          sha: serverSha,
          timestamp: Date.now()
        }, cacheKey);
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
