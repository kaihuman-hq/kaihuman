import { authStore, githubProfileStore } from '@lifosy/core';
import { useSignalEffect } from '@preact/signals';
import type { FunctionComponent } from 'preact';

export const RepoSelector: FunctionComponent = () => {
  // Fetch repos on mount if authenticated and empty
  useSignalEffect(() => {
    if (authStore.isAuthenticated.value && githubProfileStore.repos.value.length === 0) {
      githubProfileStore.fetchRepos();
    }
  });

  const handleSelect = (e: Event) => {
    const select = e.target as HTMLSelectElement;
    const repoId = Number(select.value);
    const repo = githubProfileStore.repos.value.find((r) => r.id === repoId);
    if (repo) {
      githubProfileStore.selectRepo(repo);
    }
  };

  if (githubProfileStore.isLoading.value) {
    return <div class="text-gray-500">Loading repositories...</div>;
  }

  if (githubProfileStore.error.value) {
    return (
      <div class="text-red-500">
        Error: {githubProfileStore.error.value}
        <button
          type="button"
          class="ml-2 underline"
          onClick={() => githubProfileStore.fetchRepos()}
        >
          Retry
        </button>
      </div>
    );
  }

  const currentId = githubProfileStore.currentRepo.value?.id || '';

  return (
    <div class="p-2">
      <label htmlFor="repo-select" class="block text-xs font-semibold text-gray-400 mb-1">
        REPOSITORY
      </label>
      <select
        id="repo-select"
        class="w-full bg-slate-800 text-sm text-white border border-slate-700 rounded p-1"
        value={currentId}
        onChange={handleSelect}
      >
        <option value="" disabled>
          Select a Repository...
        </option>
        {githubProfileStore.repos.value.map((repo) => (
          <option key={repo.id} value={repo.id}>
            {repo.full_name}
          </option>
        ))}
      </select>
    </div>
  );
};
