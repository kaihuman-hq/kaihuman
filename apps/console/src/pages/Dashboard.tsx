import { githubProfileStore } from '@lifosy/core';
import { Panel } from '@lifosy/ui';

export const Dashboard = () => {
  const repo = githubProfileStore.currentRepo.value;
  return (
    <div class="space-y-4">
      <h2 class="text-3xl font-bold bg-gradient-to-r from-nexus-primary to-nexus-secondary bg-clip-text text-transparent">
        Dashboard
      </h2>
      <p class="text-nexus-muted">
        {repo
          ? `Connected to ${repo.full_name}`
          : 'Please select a repository from the sidebar to get started.'}
      </p>

      {/* Metrics placeholders */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Panel variant="default" class="p-6">
          <h3 class="text-xs uppercase font-bold text-nexus-muted mb-2">Total Files</h3>
          <p class="text-2xl font-mono text-nexus-text">--</p>
        </Panel>
        <Panel variant="default" class="p-6">
          <h3 class="text-xs uppercase font-bold text-nexus-muted mb-2">Habit Streak</h3>
          <p class="text-2xl font-mono text-nexus-primary">--</p>
        </Panel>
        <Panel variant="default" class="p-6">
          <h3 class="text-xs uppercase font-bold text-nexus-muted mb-2">Open Tasks</h3>
          <p class="text-2xl font-mono text-nexus-secondary">--</p>
        </Panel>
      </div>
    </div>
  );
};
