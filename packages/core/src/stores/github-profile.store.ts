import { effect, signal } from '@preact/signals';
import { demoMode } from '../demo-mode.js';
import { Logger } from '../logger.js';
import { githubService } from '../services/github.service.js';
import { getCoreStorage } from '../storage/adapter.js';
import { authStore } from './auth.store.js';

const logger = new Logger('GithubProfileStore');

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

  constructor() {
    this.init();
  }

  private init() {
    // 1. Try localStorage first (sync, fast)
    const saved = getCoreStorage().getItem('lifeos_current_repo');
    if (saved) {
      try {
        const repo = JSON.parse(saved);
        this.currentRepo.value = repo;
      } catch (e) {
        logger.error('Failed to parse saved repo', e);
      }
    }

    // 2. Persist to localStorage on change
    effect(() => {
      const repo = this.currentRepo.value;
      // Demo sessions are ephemeral — never persist the fake repo selection.
      if (demoMode.value) return;
      if (repo) {
        getCoreStorage().setItem('lifeos_current_repo', JSON.stringify(repo));
      } else {
        getCoreStorage().removeItem('lifeos_current_repo');
      }
    });
  }

  async fetchRepos() {
    if (!authStore.isAuthenticated.value) return;

    this.isLoading.value = true;
    this.error.value = null;

    try {
      const repos = await githubService.listRepos();
      this.repos.value = repos as any;
    } catch (err: any) {
      logger.error('Failed to fetch repos:', err);
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
