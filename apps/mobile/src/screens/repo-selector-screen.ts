import { type GithubRepo, githubProfileStore } from '@kaihuman/core';

export class RepoSelectorController {
  get repos(): GithubRepo[] {
    return githubProfileStore.repos.value;
  }

  get current(): GithubRepo | null {
    return githubProfileStore.currentRepo.value;
  }

  refresh(): Promise<void> {
    return githubProfileStore.fetchRepos();
  }

  /** Switches the active repository; false when the id is not in the loaded list. */
  select(fullName: string): boolean {
    const repo = this.repos.find((r) => r.full_name === fullName);
    if (!repo) return false;
    githubProfileStore.selectRepo(repo);
    return true;
  }
}
