import { authStore, type GithubRepo, githubProfileStore } from '@kaihuman/core';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { filterRepos, pickPreselect, sortByRecentPush } from '../navigation/start-route.js';
import type { RepoSelectorController } from '../screens/repo-selector-screen.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
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

const SEARCH_THRESHOLD = 8;
const isAuthError = (message: string) => /\b(401|bad credentials|unauthori[sz]ed)\b/i.test(message);

/** First-run step after sign-in: pick the repository that holds the knowledge base. */
export function OnboardingView({
  controller,
  onDone,
  onSignOut,
}: {
  controller: RepoSelectorController;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const { spacing } = useTheme();
  const repos = useSignalValue(githubProfileStore.repos);
  const loading = useSignalValue(githubProfileStore.isLoading);
  const error = useSignalValue(githubProfileStore.error);
  const token = useSignalValue(authStore.token);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Retry is also the load: the list is fetched on entry, not only on pull-to-refresh.
  useEffect(() => {
    if (token) void controller.refresh();
  }, [controller, token]);

  const sorted = useMemo(() => sortByRecentPush(repos), [repos]);
  const suggested = useMemo(() => pickPreselect(sorted), [sorted]);
  const selectedName = touched ? picked : (picked ?? suggested?.full_name ?? null);
  const selected = sorted.find((r) => r.full_name === selectedName) ?? null;
  const visible = filterRepos(sorted, query);
  const refresh = () => void controller.refresh();

  const confirm = (repo: GithubRepo) => {
    if (controller.select(repo.full_name)) {
      haptics.success();
      onDone();
    }
  };
  const pick = (repo: GithubRepo) => {
    haptics.selection();
    setTouched(true);
    setPicked(repo.full_name);
  };

  return (
    <Screen title="Choose a repository" scroll refreshing={loading} onRefresh={refresh} keyboard>
      <Text variant="callout" tone="secondary">
        kaihuman reads and saves your todos, notes and ideas as plain files in one GitHub
        repository. Pick the one to use. You can change it later in More.
      </Text>

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
              testID="onboarding-retry"
              onPress={refresh}
            />
            {isAuthError(error) ? (
              <Button
                label="Sign in again"
                variant="plain"
                size="medium"
                testID="onboarding-reauth"
                onPress={() => {
                  authStore.logout();
                  onSignOut();
                }}
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      {selected ? (
        <Card>
          <View style={{ gap: spacing.md }} testID="onboarding-confirm">
            <Text variant="footnote" tone="secondary">
              {suggested?.full_name === selected.full_name && !touched
                ? 'Looks like your kaihuman repository'
                : 'Selected repository'}
            </Text>
            <Text weight="600">{selected.full_name}</Text>
            <Button
              label="Use this repository"
              fullWidth
              testID="onboarding-continue"
              onPress={() => confirm(selected)}
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
          testID="onboarding-search"
        />
      ) : null}

      {repos.length === 0 && !error ? (
        loading ? (
          <EmptyState icon="repos" title="Loading repositories" message="Fetching from GitHub." />
        ) : (
          <EmptyState
            icon="repos"
            title="No repositories yet"
            message="Create a private repository on GitHub, then add your first todo or note to it from kaihuman. Pull down to refresh once it exists."
            action={{ label: 'Refresh', onPress: refresh }}
          />
        )
      ) : null}

      {repos.length > 0 && visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matches"
          message={`Nothing matches "${query.trim()}". Not here? Create a repository on GitHub and refresh.`}
        />
      ) : null}

      {visible.length > 0 ? (
        <Section
          header={query.trim() ? `${visible.length} of ${repos.length}` : 'Recently pushed'}
          footer="Any repository works; kaihuman creates its folders on first save."
        >
          {visible.map((repo) => (
            <ListRow
              key={repo.full_name}
              icon={repo.private ? 'repos' : 'files'}
              title={repo.full_name}
              subtitle={repo.default_branch}
              accessory={
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                  accessible={repo.full_name === selectedName}
                  accessibilityLabel={repo.full_name === selectedName ? 'Selected' : undefined}
                >
                  <Badge
                    label={repo.private ? 'Private' : 'Public'}
                    tone={repo.private ? 'accent' : 'neutral'}
                  />
                  {repo.full_name === selectedName ? (
                    <Icon name="check" size={18} weight="semibold" />
                  ) : null}
                </View>
              }
              testID={`repo-${repo.full_name}`}
              onPress={() => pick(repo)}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
