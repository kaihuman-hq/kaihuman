import { signal } from '@preact/signals';
import { githubService } from '../services/github.service.js';
import { authStore } from './auth.store.js';

// Basic Repo interface based on what we need
export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
  default_branch: string;
  updated_at: string;
}

export class GithubProfileStore {
  repos = signal<GithubRepo[]>([]);
  currentRepo = signal<GithubRepo | null>(null);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  async fetchRepos() {
    if (!authStore.isAuthenticated.value) return;

    this.isLoading.value = true;
    this.error.value = null;

    try {
      const repos = await githubService.listRepos();
      this.repos.value = repos as any;
    } catch (err: any) {
      console.error('Failed to fetch repos:', err);
      this.error.value = err.message;
    } finally {
      this.isLoading.value = false;
    }
  }

  selectRepo(repo: GithubRepo) {
    this.currentRepo.value = repo;
  }

  clear() {
    this.repos.value = [];
    this.currentRepo.value = null;
    this.error.value = null;
  }
}

export const githubProfileStore = new GithubProfileStore();
