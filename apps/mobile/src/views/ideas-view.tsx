import type { IdeaSlug, IdeaStatus } from '@kaihuman/formats';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { IdeaStatusFilter, IdeasScreenController } from '../screens/ideas-screen.js';
import { useFocusRefresh, useRefresh, useSyncRevision } from '../sync/hooks.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  type BadgeTone,
  Button,
  Chip,
  EmptyState,
  Fab,
  haptics,
  Icon,
  ListRow,
  Screen,
  Section,
  type SwipeAction,
  Text,
  TextField,
} from '../ui/index.js';

const STATUSES: readonly IdeaStatus[] = [
  'seed',
  'exploring',
  'committed',
  'shipped',
  'parked',
  'dropped',
];

const STATUS_TONE: Record<IdeaStatus, BadgeTone> = {
  seed: 'neutral',
  exploring: 'accent',
  committed: 'warning',
  shipped: 'success',
  parked: 'neutral',
  dropped: 'danger',
};

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Controller calls can reject (offline, conflicts); surface that instead of dropping input. */
function useRunner() {
  const [, setRev] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rerender = useCallback(() => setRev((n) => n + 1), []);
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    try {
      setError(null);
      await action();
      haptics.success();
      rerender();
      return true;
    } catch (e) {
      setError(message(e));
      haptics.error();
      rerender();
      return false;
    }
  };
  return { error, setError, rerender, run };
}

function ErrorBanner({ error }: { error: string | null }) {
  const { colors, spacing, shape } = useTheme();
  if (!error) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'flex-start',
        padding: spacing.md,
        borderRadius: shape.md,
        backgroundColor: `${colors.danger}1F`,
      }}
    >
      <Icon name="warning" size={17} color={colors.danger} />
      <View style={{ flex: 1 }}>
        <Text variant="subheadline" tone="danger">
          {error}
        </Text>
      </View>
    </View>
  );
}

const ideaHref = (slug: IdeaSlug) => `/ideas/${slug}` as const;

/** Pushed detail screen of one idea: status, log composer and recent log. */
export function IdeaDetailView({
  controller,
  slug,
  onTitle,
}: {
  controller: IdeasScreenController;
  slug: IdeaSlug;
  /** Reports the idea title so the route can set the native header. */
  onTitle?: (title: string) => void;
}) {
  const theme = useTheme();
  const { spacing } = theme;
  const pad = theme.platform === 'ios' ? spacing.md : theme.metrics.screenMargin;
  const { error, setError, rerender, run } = useRunner();
  const [loaded, setLoaded] = useState(false);
  const { refreshing, onRefresh } = useRefresh();
  const rev = useSyncRevision();
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    try {
      setError(null);
      await controller.load();
    } catch (e) {
      setError(message(e));
    } finally {
      setLoaded(true);
      rerender();
    }
  }, [controller, setError, rerender]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
  useEffect(() => {
    void load();
  }, [load, rev]);

  const entry = controller.get(slug);
  const title = entry?.idea.title;
  useEffect(() => {
    if (title) onTitle?.(title);
  }, [title, onTitle]);

  if (!entry) {
    return (
      <Screen>
        {!loaded ? (
          <View style={{ alignItems: 'center', padding: spacing.xl }}>
            <ActivityIndicator color={theme.colors.secondaryLabel} />
          </View>
        ) : (
          <>
            <ErrorBanner error={error} />
            <EmptyState
              icon="ideas"
              title="Idea not found"
              message="It may have been deleted or renamed."
              action={{ label: 'Try again', onPress: () => void load() }}
            />
          </>
        )}
      </Screen>
    );
  }

  const { idea } = entry;
  const addLog = async () => {
    const note = text.trim();
    if (!note) return;
    if (await run(() => controller.log(slug, note))) setText('');
  };
  return (
    <Screen keyboard refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ gap: spacing.sm, paddingHorizontal: spacing.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {idea.title}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Badge label={label(idea.status)} tone={STATUS_TONE[idea.status]} />
          <Text variant="footnote" tone="secondary">
            {`${label(entry.activity.level)} activity${idea.product ? ` · ${idea.product}` : ''}`}
          </Text>
        </View>
        {idea.summary ? <Text tone="secondary">{idea.summary}</Text> : null}
      </View>
      <ErrorBanner error={error} />
      <Section header="Status">
        {STATUSES.map((s) => (
          <ListRow
            key={s}
            title={label(s)}
            testID={`status-${s}`}
            accessory={idea.status === s ? 'check' : 'none'}
            onPress={
              idea.status === s ? undefined : () => void run(() => controller.setStatus(slug, s))
            }
          />
        ))}
      </Section>
      <Section header="Add to log">
        <View style={{ padding: pad, gap: spacing.md }}>
          <TextField
            label="Log entry"
            value={text}
            onChangeText={setText}
            autoCapitalize="sentences"
            placeholder="What happened?"
            returnKeyType="send"
            onSubmitEditing={() => void addLog()}
          />
          <Button
            label="Add log"
            icon="add"
            variant="tinted"
            size="medium"
            disabled={!text.trim()}
            onPress={() => void addLog()}
          />
        </View>
      </Section>
      {idea.log.length > 0 ? (
        <Section header="Log">
          {idea.log.slice(0, 8).map((l) => (
            <ListRow key={`${l.at}-${l.text}`} title={l.text} subtitle={l.at} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

export function IdeasView({ controller }: { controller: IdeasScreenController }) {
  const theme = useTheme();
  const router = useRouter();
  const ios = theme.platform === 'ios';
  const { colors, spacing } = theme;
  const pad = ios ? spacing.md : theme.metrics.screenMargin;
  const { error, setError, rerender, run } = useRunner();
  const [loaded, setLoaded] = useState(false);
  const { refreshing, onRefresh } = useRefresh();
  const rev = useSyncRevision();
  useFocusRefresh();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');

  const load = useCallback(async () => {
    try {
      setError(null);
      await controller.load();
    } catch (e) {
      setError(message(e));
    } finally {
      setLoaded(true);
      rerender();
    }
  }, [controller, setError, rerender]);

  // Reload on focus so changes made on a pushed detail screen show when returning.
  useFocusEffect(
    // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
    useCallback(() => {
      void load();
    }, [load, rev]),
  );

  const filter = (patch: Parameters<IdeasScreenController['setFilters']>[0]) => {
    controller.setFilters(patch);
    rerender();
  };

  const create = async () => {
    const name = title.trim();
    if (!name) return;
    let created: IdeaSlug | null = null;
    const ok = await run(async () => {
      created = await controller.create({ title: name });
    });
    if (!ok || !created) return;
    setTitle('');
    setComposing(false);
    router.push(ideaHref(created) as never);
  };

  const errorBanner = <ErrorBanner error={error} />;

  const entries = controller.view();
  const chips = controller.chips();
  const filtered = controller.filters.query.trim() !== '' || controller.filters.status !== 'open';

  const actionsFor = (slug: IdeaSlug, current: IdeaStatus): SwipeAction[] => [
    { label: 'Log entry', icon: 'log', onPress: () => router.push(ideaHref(slug) as never) },
    ...STATUSES.filter((s) => s !== current).map((s) => ({
      label: `Mark ${s}`,
      onPress: () => void run(() => controller.setStatus(slug, s)),
    })),
    {
      label: 'Delete',
      icon: 'trash',
      destructive: true,
      onPress: () => void run(() => controller.remove(slug)),
    },
  ];

  const composer = composing ? (
    <Section header="New idea">
      <View style={{ padding: pad, gap: spacing.md }}>
        <TextField
          label="New idea title"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          placeholder="A sentence is enough"
          returnKeyType="done"
          onSubmitEditing={() => void create()}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label="Create idea"
            size="medium"
            disabled={!title.trim()}
            onPress={() => void create()}
          />
          <Button
            label="Cancel"
            variant="plain"
            size="medium"
            onPress={() => {
              setComposing(false);
              setTitle('');
            }}
          />
        </View>
      </View>
    </Section>
  ) : ios ? (
    <Section>
      <ListRow title="New idea" icon="add" iconTone="accent" onPress={() => setComposing(true)} />
    </Section>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Ideas" keyboard refreshing={refreshing} onRefresh={onRefresh}>
        <TextField
          label="Search ideas"
          value={controller.filters.query}
          onChangeText={(query) => filter({ query })}
          placeholder="Title, summary or log"
          returnKeyType="search"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginHorizontal: -theme.metrics.screenMargin }}
          contentContainerStyle={{
            gap: spacing.sm,
            paddingHorizontal: theme.metrics.screenMargin,
            paddingVertical: spacing.xs,
          }}
        >
          {chips.map((c) => (
            <Chip
              key={c.status}
              label={`${label(c.status)} ${c.count}`}
              selected={controller.filters.status === c.status}
              onPress={() => {
                haptics.selection();
                filter({ status: c.status as IdeaStatusFilter });
              }}
            />
          ))}
        </ScrollView>
        {errorBanner}
        {composer}
        {!loaded ? (
          <View style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
            <ActivityIndicator color={colors.secondaryLabel} />
            <Text variant="footnote" tone="secondary">
              Loading ideas
            </Text>
          </View>
        ) : entries.length === 0 ? (
          error ? (
            <EmptyState
              icon="warning"
              title="Couldn't load ideas"
              message="Check your connection and try again."
              action={{ label: 'Try again', onPress: () => void load() }}
            />
          ) : filtered ? (
            <EmptyState
              icon="search"
              title="No matching ideas"
              message="Try another status or search."
              action={{
                label: 'Show open ideas',
                onPress: () => filter({ status: 'open', query: '' }),
              }}
            />
          ) : (
            <EmptyState
              icon="ideas"
              title="No ideas yet"
              message="Capture a spark before it gets away."
              action={{ label: 'New idea', onPress: () => setComposing(true) }}
            />
          )
        ) : (
          <Section animated>
            {entries.map((e) => (
              <ListRow
                key={e.slug}
                title={e.idea.title}
                subtitle={`${label(e.activity.level)} activity${e.idea.product ? ` · ${e.idea.product}` : ''}`}
                icon="ideas"
                iconTone="accent"
                accessory={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Badge label={label(e.idea.status)} tone={STATUS_TONE[e.idea.status]} />
                    <Icon
                      name="chevronRight"
                      size={14}
                      color={colors.tertiaryLabel}
                      weight="semibold"
                    />
                  </View>
                }
                onPress={() => router.push(ideaHref(e.slug) as never)}
                swipeActions={actionsFor(e.slug, e.idea.status)}
              />
            ))}
          </Section>
        )}
      </Screen>
      <Fab
        icon="add"
        label="New idea"
        accessibilityLabel="New idea"
        onPress={() => setComposing(true)}
      />
    </View>
  );
}
