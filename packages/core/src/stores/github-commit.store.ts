import { signal } from '@preact/signals';
import { Logger } from '../logger.js';
import { githubService } from '../services/github.service.js';
import { githubProfileStore } from './github-profile.store.js';

const logger = new Logger('GithubCommitStore');

export interface CommitData {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  html_url: string;
}

export class GithubCommitStore {
  // State
  repoCommits = signal<CommitData[]>([]);
  fileCommits = signal<Record<string, CommitData[]>>({}); // Path -> Commits

  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  async loadRepoCommits(page = 1) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    this.isLoading.value = true;
    this.error.value = null;

    try {
      const data = await githubService.listCommits(repo.owner.login, repo.name, undefined, page);
      this.repoCommits.value = data.map((item: any) => ({
        sha: item.sha,
        commit: {
          message: item.commit.message,
          author: {
            name: item.commit.author.name,
            email: item.commit.author.email,
            date: item.commit.author.date,
          },
        },
        html_url: item.html_url,
      }));
    } catch (err: any) {
      logger.error('Failed to load repo commits', err);
      this.error.value = err.message;
    } finally {
      this.isLoading.value = false;
    }
  }

  async loadFileCommits(path: string) {
    const repo = githubProfileStore.currentRepo.value;
    if (!repo) return;

    // Check if we already have it? (Optional caching)
    // For now always fetch to be fresh

    this.isLoading.value = true;
    this.error.value = null;

    try {
      const data = await githubService.listCommits(repo.owner.login, repo.name, path);

      const parsed = data.map((item: any) => ({
        sha: item.sha,
        commit: {
          message: item.commit.message,
          author: {
            name: item.commit.author.name,
            email: item.commit.author.email,
            date: item.commit.author.date,
          },
        },
        html_url: item.html_url,
      }));

      this.fileCommits.value = {
        ...this.fileCommits.value,
        [path]: parsed,
      };
    } catch (err: any) {
      logger.error(`Failed to load commits for ${path}`, err);
      this.error.value = err.message;
    } finally {
      this.isLoading.value = false;
    }
  }
}

export const githubCommitStore = new GithubCommitStore();
