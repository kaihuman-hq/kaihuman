import { randomUUID } from 'expo-crypto';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  addRssFeedUrl,
  addTravelTrip,
  type BoardOverviewView,
  boardOverviewView,
  markRssRead,
  type PaletteEntryRow,
  type PaletteSettingsView,
  type RssView,
  removeRssFeedById,
  rssView,
  type TravelView,
  type TripRow,
} from '../../components/widgets/tile-controllers.js';
import { useEnsureFeeds, useFeedSnapshot } from '../../files/use-feeds.js';
import { type ContentFiles, githubContentFiles } from '../../screens/file-editor-screen.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, haptics, Icon, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, ItemRow, QuickAdd, Rows, useDisclosure } from './parts.js';

const DAY = 86_400_000;

/** "5m ago", "3h ago", "2d ago"; older than a month falls back to the date. */
export function relativeDate(iso: string | null, now: Date): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = now.getTime() - t;
  if (diff < 0) return iso.slice(0, 10);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return iso.slice(0, 10);
}

export function Rss({ view: initial, ctx }: { view: RssView; ctx: Ctx }) {
  const { colors, spacing } = useTheme();
  const snapshot = useFeedSnapshot();
  const [url, setUrl] = useState('');
  // The tile's own view has no fetched items yet; recompute with the live snapshot.
  const view: RssView = useMemo(
    () => rssView(ctx.content, snapshot, ctx.now),
    [ctx.content, snapshot, ctx.now],
  );
  useEnsureFeeds(initial.feeds.map((f) => f.url));

  const add = () => {
    if (ctx.apply(addRssFeedUrl(ctx.content, url, randomUUID().slice(0, 8)))) {
      haptics.success();
      setUrl('');
    } else haptics.error();
  };
  const open = (feedId: string, key: string, link: string) => {
    ctx.apply(markRssRead(ctx.content, feedId, key));
    if (link) void openBrowserAsync(link).catch(() => {});
  };
  const loading = view.feeds.some((f) => f.status === 'loading');
  const failed = view.feeds.filter((f) => f.status === 'error');
  return (
    <>
      <Text variant="footnote" tone="secondary">
        {`${view.unreadCount} unread in ${view.feeds.length} ${view.feeds.length === 1 ? 'feed' : 'feeds'}`}
      </Text>
      {loading ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Loading feeds"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <ActivityIndicator color={colors.secondaryLabel} />
          <Text variant="footnote" tone="secondary">
            Loading feeds
          </Text>
        </View>
      ) : null}
      {failed.map((f) => (
        <View
          key={f.id}
          accessibilityRole="alert"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Icon name="warning" size={17} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text variant="footnote" tone="danger">
              {`${f.title}: ${f.error ?? 'could not load'}`}
            </Text>
          </View>
        </View>
      ))}
      {view.items.length === 0 ? (
        <EmptyLine>
          {view.feeds.length === 0 ? 'No feeds yet. Add one below.' : 'No items to show.'}
        </EmptyLine>
      ) : (
        <Rows>
          {view.items.slice(0, 30).map((i) => (
            <ItemRow
              key={`${i.feedId}-${i.key}`}
              testID={`rss-${i.key}`}
              role="link"
              title={i.title}
              label={i.title}
              subtitle={[i.source, relativeDate(i.date, ctx.now)].filter(Boolean).join(' · ')}
              leading={
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: i.unread ? colors.accent : 'transparent',
                  }}
                />
              }
              onPress={() => open(i.feedId, i.key, i.link)}
            />
          ))}
        </Rows>
      )}
      {view.feeds.length > 0 ? (
        <Rows>
          {view.feeds.map((f) => (
            <ItemRow
              key={f.id}
              testID={`feed-${f.id}`}
              title={f.title}
              subtitle={`${f.unread} unread of ${f.total}`}
              actions={[
                {
                  label: 'Remove feed',
                  destructive: true,
                  onPress: () => {
                    ctx.apply(removeRssFeedById(ctx.content, f.id));
                  },
                },
              ]}
            />
          ))}
        </Rows>
      ) : null}
      <QuickAdd
        label="Feed URL"
        value={url}
        onChangeText={setUrl}
        onSubmit={add}
        addLabel="Add feed"
        placeholder="https://example.com/feed.xml"
        keyboardType="url"
      />
    </>
  );
}

const TRIP_TONE: Record<TripRow['status'], 'success' | 'accent' | 'neutral'> = {
  current: 'success',
  upcoming: 'accent',
  past: 'neutral',
};

export function Travel({ view, ctx }: { view: TravelView; ctx: Ctx }) {
  const { colors, spacing, shape } = useTheme();
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const form = useDisclosure();
  const save = () => {
    if (ctx.apply(addTravelTrip(ctx.content, { name, start, end }, randomUUID().slice(0, 8)))) {
      haptics.success();
      setName('');
      setStart('');
      setEnd('');
      form.hide();
    } else haptics.error();
  };
  return (
    <>
      {view.next ? (
        <View
          accessibilityLabel={`Next trip, ${view.next.name}, ${view.next.daysUntil} days`}
          accessible
          style={{
            backgroundColor: colors.accentSoft,
            borderRadius: shape.md,
            padding: spacing.md,
            gap: spacing.xxs,
          }}
        >
          <Text variant="caption2" weight="600" style={{ textTransform: 'uppercase' }}>
            Next trip
          </Text>
          <Text variant="title3">{view.next.name}</Text>
          <Text variant="subheadline" tone="secondary">
            {view.next.daysUntil === 0
              ? 'Starts today'
              : `In ${view.next.daysUntil} ${view.next.daysUntil === 1 ? 'day' : 'days'}`}
          </Text>
        </View>
      ) : null}
      {view.trips.length === 0 ? (
        <EmptyLine>No trips planned.</EmptyLine>
      ) : (
        <Rows>
          {view.trips.map((t) => (
            <ItemRow
              key={t.id}
              testID={`trip-${t.id}`}
              title={t.name}
              subtitle={`${t.dateRange} · ${t.steps} ${t.steps === 1 ? 'step' : 'steps'}`}
              trailing={
                <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
                  <Text variant="subheadline" mono>
                    {t.costLabel}
                  </Text>
                  <Badge tone={TRIP_TONE[t.status]} label={t.status} />
                </View>
              }
            />
          ))}
        </Rows>
      )}
      {view.trips.length > 0 ? (
        <Text variant="footnote" tone="secondary">
          {`Total ${view.totalLabel}`}
        </Text>
      ) : null}
      {form.open ? (
        <>
          <TextField label="Trip name" value={name} onChangeText={setName} returnKeyType="next" />
          <TextField
            label="Start (YYYY-MM-DD)"
            value={start}
            onChangeText={setStart}
            placeholder="2026-12-24"
            keyboardType="numbers-and-punctuation"
            returnKeyType="next"
          />
          <TextField
            label="End (YYYY-MM-DD)"
            value={end}
            onChangeText={setEnd}
            placeholder="2026-12-31"
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Save trip" size="medium" onPress={save} />
            <Button label="Cancel" size="medium" variant="plain" onPress={form.hide} />
          </View>
        </>
      ) : (
        <Button label="Add trip" icon="add" size="medium" variant="tinted" onPress={form.show} />
      )}
    </>
  );
}

const TODO_FILE = /\.todos\.md$/i;

/** Reads every `.todos.md` in the repository; null while loading. */
function useTodoFiles(files: ContentFiles): { path: string; content: string }[] | null {
  const [loaded, setLoaded] = useState<{ path: string; content: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    const paths = files
      .tree()
      .filter((t) => t.type !== 'tree' && TODO_FILE.test(t.path))
      .map((t) => t.path);
    void Promise.all(
      paths.map((path) =>
        files.read(path).then(
          (content) => ({ path, content }),
          () => null,
        ),
      ),
    ).then((rows) => {
      if (live) setLoaded(rows.filter((r): r is { path: string; content: string } => r !== null));
    });
    return () => {
      live = false;
    };
  }, [files]);
  return loaded;
}

export function BoardOverview({
  view: initial,
  ctx,
  files = githubContentFiles,
}: {
  view: BoardOverviewView;
  ctx: Ctx;
  files?: ContentFiles;
}) {
  const { colors, spacing, shape } = useTheme();
  const todoFiles = useTodoFiles(files);
  const view: BoardOverviewView = useMemo(
    () => (todoFiles ? boardOverviewView(ctx.content, todoFiles, ctx.now) : initial),
    [todoFiles, ctx.content, ctx.now, initial],
  );
  if (!todoFiles) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading boards"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <ActivityIndicator color={colors.secondaryLabel} />
        <Text variant="footnote" tone="secondary">
          Loading boards
        </Text>
      </View>
    );
  }
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
          {`${view.files} ${view.files === 1 ? 'todo file' : 'todo files'}`}
        </Text>
        {view.overdueCount > 0 ? (
          <Badge tone="danger" label={`${view.overdueCount} overdue`} />
        ) : null}
      </View>
      {view.columns.map((c) => (
        <View
          key={c.status}
          testID={`board-col-${c.status}`}
          style={{
            backgroundColor: colors.fill,
            borderRadius: shape.md,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="subheadline" weight="600" style={{ flex: 1 }}>
              {c.label}
            </Text>
            <Text variant="subheadline" mono tone="secondary">
              {c.count}
            </Text>
          </View>
          {c.items.slice(0, 3).map((i) => (
            <Text
              key={`${i.file}-${i.text}`}
              variant="footnote"
              tone={i.overdue ? 'danger' : 'secondary'}
              numberOfLines={1}
            >
              {i.text}
            </Text>
          ))}
          {c.count > 3 ? (
            <Text variant="caption2" tone="secondary">
              {`+${c.count - 3} more`}
            </Text>
          ) : null}
        </View>
      ))}
    </>
  );
}

function PaletteSection({ title, rows }: { title: string; rows: PaletteEntryRow[] }) {
  const { colors } = useTheme();
  if (rows.length === 0) return null;
  return (
    <>
      <Text variant="footnote" tone="secondary" weight="600" style={{ textTransform: 'uppercase' }}>
        {title}
      </Text>
      <Rows>
        {rows.map((r) => (
          <ItemRow
            key={`${r.prefix}-${r.name}`}
            title={r.name}
            subtitle={r.problem ?? (r.detail || undefined)}
            leading={
              <Text variant="subheadline" mono color={colors.accent}>
                {r.prefix}
              </Text>
            }
            trailing={
              r.problem ? (
                <Badge tone="danger" label="Problem" />
              ) : (
                <Badge tone={r.enabled ? 'success' : 'neutral'} label={r.enabled ? 'On' : 'Off'} />
              )
            }
          />
        ))}
      </Rows>
    </>
  );
}

export function PaletteSettings({ view }: { view: PaletteSettingsView }) {
  const { colors, spacing } = useTheme();
  return (
    <>
      {view.problems.map((p) => (
        <View
          key={p}
          accessibilityRole="alert"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Icon name="warning" size={17} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text variant="footnote" tone="danger">
              {p}
            </Text>
          </View>
        </View>
      ))}
      <PaletteSection title="Search engines" rows={view.engines} />
      <PaletteSection title="Assistants" rows={view.assistants} />
      <PaletteSection title="Tools" rows={view.tools} />
      {view.engines.length + view.assistants.length + view.tools.length === 0 ? (
        <EmptyLine>Nothing configured.</EmptyLine>
      ) : null}
    </>
  );
}
