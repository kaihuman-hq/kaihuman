import { type GithubRepo, githubProfileStore } from '@kaihuman/core';
import { useState } from 'react';
import { View } from 'react-native';
import type { RepoSelectorController } from '../screens/repo-selector-screen.js';
import { useTheme } from '../theme/theme.js';
import {
  Button,
  Card,
  EmptyState,
  haptics,
  Icon,
  ListRow,
  Screen,
  Section,
  Text,
  TextField,
} from '../ui/index.js';
import { useSignalValue } from './use-signal.js';

/** Search only earns its space once the list outgrows a screen. */
const SEARCH_THRESHOLD = 8;

export function RepoSelectorView({
  controller,
  onSelected,
}: {
  controller: RepoSelectorController;
  onSelected: () => void;
}) {
  const { spacing } = useTheme();
  // The controller reads these signals; subscribing here makes the view re-render on change.
  useSignalValue(githubProfileStore.repos);
  useSignalValue(githubProfileStore.currentRepo);
  const loading = useSignalValue(githubProfileStore.isLoading);
  const error = useSignalValue(githubProfileStore.error);
  const { repos, current } = controller;
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = q ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : repos;
  const refresh = () => void controller.refresh();

  const choose = (repo: GithubRepo) => {
    if (controller.select(repo.full_name)) {
      haptics.success();
      onSelected();
    }
  };

  return (
    <Screen title="Repositories" scroll refreshing={loading} onRefresh={refresh}>
      {error ? (
        <Card>
          <View style={{ gap: spacing.sm }} accessibilityRole="alert">
            <Text tone="danger" weight="600">
              Couldn't load repositories
            </Text>
            <Text variant="subheadline" tone="secondary">
              {error}
            </Text>
            <Button
              label="Try again"
              variant="tinted"
              size="medium"
              icon="refresh"
              testID="repos-retry"
              onPress={refresh}
            />
          </View>
        </Card>
      ) : null}

      {repos.length > SEARCH_THRESHOLD ? (
        <TextField
          label="Search repositories"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          testID="repos-search"
        />
      ) : null}

      {repos.length === 0 && !error ? (
        loading ? (
          <EmptyState icon="repos" title="Loading repositories" message="Fetching from GitHub." />
        ) : (
          <EmptyState
            icon="repos"
            title="No repositories"
            message="Repositories you can access on GitHub appear here. Pull down to refresh."
            action={{ label: 'Refresh', onPress: refresh }}
          />
        )
      ) : null}

      {repos.length > 0 && visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matches"
          message={`Nothing matches "${query.trim()}".`}
        />
      ) : null}

      {visible.length > 0 ? (
        <Section
          header={q ? `${visible.length} of ${repos.length}` : 'Choose a repository'}
          footer="Your todos, notes and ideas are read from and saved to the selected repository."
        >
          {visible.map((repo) => {
            const selected = repo.full_name === current?.full_name;
            return (
              <ListRow
                key={repo.full_name}
                icon={repo.private ? 'repos' : 'files'}
                title={repo.full_name}
                subtitle={`${repo.private ? 'Private' : 'Public'} · ${repo.default_branch}`}
                accessory={
                  selected ? (
                    <View accessibilityLabel="Selected" accessible>
                      <Icon name="check" size={18} weight="semibold" />
                    </View>
                  ) : (
                    'none'
                  )
                }
                testID={`repo-${repo.full_name}`}
                onPress={() => choose(repo)}
              />
            );
          })}
        </Section>
      ) : null}
    </Screen>
  );
}
