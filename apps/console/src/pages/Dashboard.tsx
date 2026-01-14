import { githubProfileStore } from '@lifosy/core';

export const Dashboard = () => {
  const repo = githubProfileStore.currentRepo.value;
  return (
    <div class="space-y-4">
      <h2 class="text-3xl font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
        Dashboard
      </h2>
      <p class="text-slate-400">
        {repo
          ? `Connected to ${repo.full_name}`
          : 'Please select a repository from the sidebar to get started.'}
      </p>

      {/* Metrics placeholders */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div class="p-6 bg-slate-800 rounded-lg border border-slate-700">
          <h3 class="text-xs uppercase font-bold text-slate-500 mb-2">Total Files</h3>
          <p class="text-2xl font-mono text-white">--</p>
        </div>
        <div class="p-6 bg-slate-800 rounded-lg border border-slate-700">
          <h3 class="text-xs uppercase font-bold text-slate-500 mb-2">Habit Streak</h3>
          <p class="text-2xl font-mono text-green-400">--</p>
        </div>
        <div class="p-6 bg-slate-800 rounded-lg border border-slate-700">
          <h3 class="text-xs uppercase font-bold text-slate-500 mb-2">Open Tasks</h3>
          <p class="text-2xl font-mono text-blue-400">--</p>
        </div>
      </div>
    </div>
  );
};
