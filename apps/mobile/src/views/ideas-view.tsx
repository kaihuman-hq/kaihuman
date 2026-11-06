import type { IdeaSlug, IdeaStatus } from '@kaihuman/formats';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { IdeaStatusFilter, IdeasScreenController } from '../screens/ideas-screen.js';
import { useTheme } from '../theme/theme.js';
import {
  BackButton,
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

export function IdeasView({ controller }: { controller: IdeasScreenController }) {
  const theme = useTheme();
  const ios = theme.platform === 'ios';
  const { colors, spacing } = theme;
  const pad = ios ? spacing.md : theme.metrics.screenMargin;
  const [, setRev] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IdeaSlug | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const rerender = () => setRev((n) => n + 1);

  const load = useCallback(async () => {
    try {
      setError(null);
      await controller.load();
    } catch (e) {
      setError(message(e));
    } finally {
      setLoaded(true);
      setRev((n) => n + 1);
    }
  }, [controller]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Controller calls can reject (offline, conflicts); show that instead of dropping the input.
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

  const filter = (patch: Parameters<IdeasScreenController['setFilters']>[0]) => {
    controller.setFilters(patch);
    rerender();
  };

  const create = async () => {
    const name = title.trim();
    if (!name) return;
    await run(async () => {
      const slug = await controller.create({ title: name });
      setTitle('');
      setComposing(false);
      setSelected(slug);
    });
  };

  const errorBanner = error ? (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'flex-start',
        padding: spacing.md,
        borderRadius: theme.shape.md,
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
  ) : null;

  const entry = selected ? controller.get(selected) : undefined;

  if (selected && entry) {
    const { idea } = entry;
    const addLog = async () => {
      const note = text.trim();
      if (!note) return;
      if (await run(() => controller.log(selected, note))) setText('');
    };
    return (
      <Screen keyboard refreshing={refreshing} onRefresh={refresh}>
        <BackButton label="Ideas" onPress={() => setSelected(null)} />
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
        {errorBanner}
        <Section header="Status">
          {STATUSES.map((s) => (
            <ListRow
              key={s}
              title={label(s)}
              testID={`status-${s}`}
              accessory={idea.status === s ? 'check' : 'none'}
              onPress={
                idea.status === s
                  ? undefined
                  : () => void run(() => controller.setStatus(selected, s))
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

  const entries = controller.view();
  const chips = controller.chips();
  const filtered = controller.filters.query.trim() !== '' || controller.filters.status !== 'open';

  const actionsFor = (slug: IdeaSlug, current: IdeaStatus): SwipeAction[] => [
    { label: 'Log entry', icon: 'log', onPress: () => setSelected(slug) },
    ...STATUSES.filter((s) => s !== current).map((s) => ({
      label: `Mark ${s}`,
      onPress: () => void run(() => controller.setStatus(slug, s)),
    })),
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
      <Screen title="Ideas" keyboard refreshing={refreshing} onRefresh={refresh}>
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
          <Section>
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
                onPress={() => setSelected(e.slug)}
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
