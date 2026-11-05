import { githubProfileStore } from '@kaihuman/core';
import type { RepoSelectorController } from '../screens/repo-selector-screen.js';
import { Body, Button, Card, Muted, Screen, Title } from './primitives.js';
import { useSignalValue } from './use-signal.js';

export function RepoSelectorView({
  controller,
  onSelected,
}: {
  controller: RepoSelectorController;
  onSelected: () => void;
}) {
  // The controller reads these signals; subscribing here makes the view re-render on change.
  useSignalValue(githubProfileStore.repos);
  useSignalValue(githubProfileStore.currentRepo);
  const { repos, current } = controller;

  return (
    <Screen scroll>
      <Title>Repositories</Title>
      <Button label="Refresh" testID="repos-refresh" onPress={() => void controller.refresh()} />
      {repos.length === 0 ? <Muted>No repositories loaded</Muted> : null}
      {repos.map((repo) => (
        <Card key={repo.full_name}>
          <Body>{repo.full_name}</Body>
          <Muted>{repo.private ? 'private' : 'public'}</Muted>
          <Button
            label={
              repo.full_name === current?.full_name
                ? `Selected ${repo.full_name}`
                : `Select ${repo.full_name}`
            }
            testID={`repo-${repo.full_name}`}
            onPress={() => {
              if (controller.select(repo.full_name)) onSelected();
            }}
          />
        </Card>
      ))}
    </Screen>
  );
}
