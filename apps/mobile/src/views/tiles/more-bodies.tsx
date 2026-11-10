import { randomUUID } from 'expo-crypto';
import { openBrowserAsync } from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  addRssFeedUrl,
  filterRssItems,
  markRssRead,
  type RssFilter,
  type RssView,
  removeRssFeedById,
  rssView,
} from '../../components/widgets/tile-controllers.js';
import { useEnsureFeeds, useFeedSnapshot } from '../../files/use-feeds.js';
import { useTheme } from '../../theme/theme.js';
import { haptics, Icon, SegmentedControl, Text } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, ItemRow, QuickAdd, Rows } from './parts.js';

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

const RSS_FILTERS = [
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All' },
] as const;

export function Rss({ view: initial, ctx }: { view: RssView; ctx: Ctx }) {
  const { colors, spacing } = useTheme();
  const snapshot = useFeedSnapshot();
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState<RssFilter>('unread');
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
  const shown = filterRssItems(view.items, filter);
  const loading = view.feeds.some((f) => f.status === 'loading');
  const failed = view.feeds.filter((f) => f.status === 'error');
  return (
    <>
      <Text variant="footnote" tone="secondary">
        {`${view.unreadCount} unread in ${view.feeds.length} ${view.feeds.length === 1 ? 'feed' : 'feeds'}`}
      </Text>
      <SegmentedControl
        testID="rss-filter"
        options={RSS_FILTERS}
        value={filter}
        onChange={setFilter}
      />
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
      {shown.length === 0 ? (
        <EmptyLine>
          {view.feeds.length === 0
            ? 'No feeds yet. Add one below.'
            : view.items.length > 0
              ? 'No unread items.'
              : 'No items to show.'}
        </EmptyLine>
      ) : (
        <Rows>
          {shown.slice(0, 30).map((i) => (
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
              swipe
              fullSwipe
              actions={
                i.unread
                  ? [
                      {
                        label: 'Mark read',
                        onPress: () => {
                          ctx.apply(markRssRead(ctx.content, i.feedId, i.key));
                        },
                      },
                    ]
                  : undefined
              }
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

export { BoardOverview } from './board-overview-body.js';
export { PaletteSettings } from './palette-settings-body.js';
export { Travel } from './travel-body.js';
