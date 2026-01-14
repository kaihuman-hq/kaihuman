import { computed, signal } from '@preact/signals';
import { githubService } from '../services/github.service.js';
import { githubProfileStore } from './github-profile.store.js';

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
      const tree = await githubService.fetchRepoTree(repo.owner.login, repo.name);
      // Filter? No, keep all.
      this.tree.value = tree as TreeItem[];
    } catch (err: any) {
      console.error('Failed to load tree', err);
      this.error.value = err.message;
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
        // Could be a new file not yet in tree, but for now let's warn or error if strictly opening existing
        console.warn(`File ${path} not found in tree, attempting to fetch anyway.`);
      }

      const fileData = await githubService.getFileContent(repo.owner.login, repo.name, path);

      this.openFiles.value = {
        ...this.openFiles.value,
        [path]: { content: fileData.content, sha: fileData.sha },
      };
      this.activeFile.value = path;
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
