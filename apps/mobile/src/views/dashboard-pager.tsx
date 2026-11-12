import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { focusFilter } from '../adapters/focus-filter.js';
import { presentTile, type TileView } from '../components/widgets/tile-controllers.js';
import { useEnsureFeeds, useFeedSnapshot } from '../files/use-feeds.js';
import {
  type DashboardPage,
  lastDashboardId,
  rememberDashboard,
  type TileFile,
} from '../screens/dashboards.js';
import { SyncIndicator } from '../sync/sync-indicator.js';
import { SyncStatusBanner } from '../sync/sync-status-banner.js';
import { useTheme } from '../theme/theme.js';
import {
  Button,
  EmptyState,
  ErrorBoundary,
  errorMessage,
  haptics,
  Icon,
  InlineError,
  Text,
} from '../ui/index.js';
import { useInsets } from '../ui/insets.js';
import { Animated } from '../ui/motion.js';
import { type DashboardEditor, DashboardsSheet, EditTiles } from './dashboard-editor.js';
import { Skeleton } from './dashboard-view.js';
import { type Glance, glanceOf } from './tiles/glance/index.js';
import { SquareTile, TILE_GAP, tileSide } from './tiles/square/square-tile.js';
import { tileRoute, UnsupportedTile } from './tiles/summary-tile.js';

export { DASHBOARD_LINKS } from './dashboard-view.js';

const dateLine = (now: Date) =>
  now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

const PLACEHOLDER: DashboardPage = { id: 'today', name: 'Today', files: [] };

type Shown = TileFile & { tile?: TileView; failed?: string };

function Hint({ children }: { children: ReactNode }) {
  const { colors, spacing, shape } = useTheme();
  return (
    <View
      testID="dashboard-hint"
      style={{
        backgroundColor: colors.accentSoft,
        borderRadius: shape.lg,
        padding: spacing.md,
      }}
    >
      <Text variant="footnote" color={colors.onAccentSoft}>
        {children}
      </Text>
    </View>
  );
}

interface PageProps {
  page: DashboardPage;
  width: number;
  defaulted: boolean;
  now: Date;
  loading: boolean;
  refreshing: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onWrite: (path: string, content: string) => void | Promise<void>;
  onNavigate: (href: string) => void;
  /** Set on the current page while editing: its tiles show as an editable list. */
  edit?: { pages: readonly DashboardPage[]; editor: DashboardEditor };
  onStartEdit?: () => void;
}

function Page({
  page,
  width,
  defaulted,
  now,
  loading,
  refreshing,
  error,
  onRefresh,
  onWrite,
  onNavigate,
  edit,
  onStartEdit,
}: PageProps) {
  const { colors, spacing, metrics } = useTheme();
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const insets = useInsets();
  // RSS tiles count unread items from fetched feeds, so fetch them here and redraw on arrival.
  useFeedSnapshot();
  const shown: Shown[] = page.files.map((f) => {
    try {
      return { ...f, tile: presentTile(f.path, f.content, now) };
    } catch (e) {
      return { ...f, failed: errorMessage(e) };
    }
  });
  useEnsureFeeds(
    shown.flatMap((f) => (f.tile?.kind === 'rss' ? f.tile.view.feeds.map((x) => x.url) : [])),
  );
  const side = tileSide(width, metrics.screenMargin);
  // Palette settings are not a glance tile (README decision 7): they live in More → Settings.
  const cells = shown.flatMap((item): { item: Shown; glance: Glance | null }[] => {
    if (item.failed !== undefined || !item.tile) return [{ item, glance: null }];
    const glance = glanceOf(
      { path: item.path, content: item.content, now, filter: focusFilter.value },
      item.tile,
    );
    return glance ? [{ item, glance }] : [];
  });
  const startEdit = onStartEdit
    ? () => {
        haptics.medium();
        onStartEdit();
      }
    : undefined;
  const renderCell = ({ item, glance }: (typeof cells)[number]) =>
    item.failed !== undefined ? (
      <InlineError what="this tile" message={item.failed} onRetry={onRefresh} />
    ) : glance ? (
      <SquareTile
        path={item.path}
        glance={glance}
        content={item.content}
        size={side}
        href={tileRoute(item.path)}
        onNavigate={onNavigate}
        onWrite={onWrite}
        {...(startEdit && { onLongPress: startEdit })}
      />
    ) : (
      <UnsupportedTile path={item.path} onOpen={() => onNavigate(`/files/${item.path}`)} />
    );

  return (
    <View style={{ width }} testID={`dashboard-page-${page.id}`}>
      <ScrollView
        scrollEnabled={scrollEnabled}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.secondaryLabel}
            />
          ) : undefined
        }
        contentContainerStyle={{
          paddingHorizontal: metrics.screenMargin,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.md,
        }}
      >
        {edit ? (
          <EditTiles
            page={page}
            pages={edit.pages}
            editor={edit.editor}
            onScrollEnabled={setScrollEnabled}
          />
        ) : (
          <>
            {loading ? <Skeleton /> : null}
            {!loading && error && shown.length === 0 ? (
              <EmptyState
                icon="warning"
                title="Couldn't load your tiles"
                message={error}
                action={onRefresh ? { label: 'Try again', onPress: onRefresh } : undefined}
              />
            ) : null}
            {!loading && !error && defaulted && shown.length > 0 ? (
              <Hint>
                Group tiles into dashboards in the web console; they show up here as pages.
              </Hint>
            ) : null}
            {!loading && !error && shown.length === 0 && defaulted ? (
              <EmptyState
                icon="empty"
                title="No dashboard files in this repository"
                message="Add a todo list, habit or bookmarks file and it shows up here as a tile."
              />
            ) : null}
            {!loading && !error && shown.length === 0 && !defaulted ? (
              <EmptyState
                icon="empty"
                title="No tiles on this dashboard"
                message={`Add files to ${page.name} in the web console.`}
              />
            ) : null}
            <View
              testID="dashboard-grid"
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP }}
            >
              {cells.map((cell) => (
                <View key={cell.item.path} style={{ width: cell.glance ? side : '100%' }}>
                  <ErrorBoundary what="this tile" resetKey={cell.item.content} onRetry={onRefresh}>
                    {renderCell(cell)}
                  </ErrorBoundary>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Dot({ on }: { on: boolean }) {
  const { colors } = useTheme();
  const w = useSharedValue(on ? 18 : 7);
  useEffect(() => {
    w.set(withTiming(on ? 18 : 7, { duration: 220 }));
  }, [on, w]);
  const style = useAnimatedStyle(() => ({ width: w.get() }));
  return (
    <Animated.View
      style={[
        { height: 7, borderRadius: 4, backgroundColor: on ? colors.label : colors.fill },
        style,
      ]}
    />
  );
}

/** Page dots; the current one stretches into a pill. */
function Dots({ count, index }: { count: number; index: number }) {
  const { spacing } = useTheme();
  if (count < 2) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Page ${index + 1} of ${count}`}
      testID="dashboard-dots"
      style={{ flexDirection: 'row', gap: 5, paddingTop: spacing.xs }}
    >
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional
        <Dot key={i} on={i === index} />
      ))}
    </View>
  );
}

function DashboardMenu({
  visible,
  pages,
  index,
  onSelect,
  onEdit,
  onClose,
}: {
  visible: boolean;
  pages: DashboardPage[];
  index: number;
  onSelect: (i: number) => void;
  /** Set when editing is possible; adds the Edit row. */
  onEdit?: () => void;
  onClose: () => void;
}) {
  const { colors, spacing, shape, metrics, platform } = useTheme();
  const insets = useInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dashboard menu"
          testID="dashboard-menu-backdrop"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.shadow,
            opacity: 0.4,
          }}
        />
        <View
          testID="dashboard-menu"
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: shape.lg,
            borderTopRightRadius: shape.lg,
            paddingTop: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.separator,
            }}
          />
          <Text
            variant="headline"
            accessibilityRole="header"
            style={{ paddingVertical: spacing.md }}
          >
            Dashboards
          </Text>
          {pages.map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={p.name}
              accessibilityState={{ selected: i === index }}
              testID={`dashboard-option-${p.id}`}
              onPress={() => onSelect(i)}
              android_ripple={platform === 'ios' ? undefined : { color: colors.pressed }}
              style={({ pressed }) => ({
                minHeight: metrics.rowHeight,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                borderRadius: shape.md,
                backgroundColor: pressed && platform === 'ios' ? colors.fill : 'transparent',
              })}
            >
              <Text variant="body" style={{ flex: 1 }} weight={i === index ? '600' : undefined}>
                {p.name}
              </Text>
              {i === index ? <Icon name="check" size={20} color={colors.accent} /> : null}
            </Pressable>
          ))}
          {onEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit dashboard"
              testID="dashboard-edit"
              onPress={onEdit}
              android_ripple={platform === 'ios' ? undefined : { color: colors.pressed }}
              style={({ pressed }) => ({
                minHeight: metrics.rowHeight,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                borderTopWidth: 1,
                borderTopColor: colors.separator,
                backgroundColor: pressed && platform === 'ios' ? colors.fill : 'transparent',
              })}
            >
              <Icon name="edit" size={20} color={colors.accent} />
              <Text variant="body" color={colors.accent}>
                Edit
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export interface DashboardPagerProps {
  pages: DashboardPage[];
  /** True when no config placed any tile, so `pages` is the single fallback page. */
  defaulted?: boolean;
  now: Date;
  loading?: boolean;
  refreshing?: boolean;
  /** Set when the last load failed; shown with a retry when there is nothing to show. */
  error?: string | null;
  /** Pull-to-refresh hook point for every page. */
  onRefresh?: () => void;
  onWrite: (path: string, content: string) => void | Promise<void>;
  /** Kept for callers; tiles that spawn files do so from their detail screen now. */
  onCreateFile?: (path: string, content: string) => Promise<void>;
  onNavigate: (href: string) => void;
  /** Turns on edit mode (Edit button and long-press on a tile). */
  editor?: DashboardEditor;
}

/** Home screen: one swipeable page per console dashboard under a fixed header. */
export function DashboardPager({
  pages,
  defaulted = false,
  now,
  loading = false,
  refreshing = false,
  error,
  onRefresh,
  onWrite,
  onNavigate,
  editor,
}: DashboardPagerProps) {
  const { colors, spacing, metrics } = useTheme();
  const insets = useInsets();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<DashboardPage>>(null);
  const items = pages.length > 0 ? pages : [PLACEHOLDER];
  const [currentId, setCurrentId] = useState<string | null>(lastDashboardId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dashboardsOpen, setDashboardsOpen] = useState(false);
  const canEdit = editor !== undefined && !loading;
  const found = items.findIndex((p) => p.id === currentId);
  const index = found < 0 ? 0 : found;
  const current = items[index] as DashboardPage;

  const settle = useCallback(
    (i: number) => {
      const page = items[i];
      if (!page || page.id === current.id) return;
      setCurrentId(page.id);
      rememberDashboard(page.id);
      haptics.selection();
    },
    [items, current.id],
  );

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    settle(Math.round(e.nativeEvent.contentOffset.x / width));

  const jumpTo = (i: number) => {
    setMenuOpen(false);
    // Set the page directly too: a programmatic scroll does not always report momentum end.
    settle(i);
    list.current?.scrollToIndex({ index: i, animated: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: metrics.screenMargin, paddingTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="subheadline" tone="secondary" style={{ flex: 1 }}>
            {dateLine(now)}
          </Text>
          <SyncIndicator />
          {editing ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search"
              testID="dashboard-search"
              onPress={() => onNavigate('/search')}
              // The box itself is the 44pt target (no hitSlop): slop would reach into the title row below.
              style={{
                width: metrics.hitTarget,
                height: metrics.hitTarget,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="search" size={22} />
            </Pressable>
          )}
          {canEdit && editing ? (
            <Button
              label="Dashboards"
              variant="plain"
              size="small"
              onPress={() => setDashboardsOpen(true)}
              testID="dashboard-manage"
            />
          ) : null}
          {canEdit && editing ? (
            <Button
              label="Done"
              accessibilityLabel="Done editing"
              variant="filled"
              size="small"
              onPress={() => setEditing(false)}
              testID="dashboard-done"
            />
          ) : null}
        </View>
        {items.length > 1 || canEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose dashboard, current ${current.name}`}
            testID="dashboard-title"
            onPress={() => setMenuOpen(true)}
            // Shrink-wrapped, no hitSlop: the target is the title text and chevron only.
            style={{
              alignSelf: 'flex-start',
              maxWidth: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              minHeight: metrics.hitTarget,
            }}
          >
            <Text variant="title1" numberOfLines={1} style={{ flexShrink: 1 }}>
              {current.name}
            </Text>
            <Icon name="chevronDown" size={20} color={colors.secondaryLabel} />
          </Pressable>
        ) : (
          <Text variant="title1" accessibilityRole="header" numberOfLines={1}>
            {current.name}
          </Text>
        )}
        <Dots count={items.length} index={index} />
        <SyncStatusBanner />
      </View>
      <FlatList
        // Remounting on resize or first real data places the list at the remembered page.
        key={`${width}:${pages.length > 0}`}
        ref={list}
        data={items}
        horizontal
        pagingEnabled
        // Paging off while editing, so dragging a tile cannot swipe to another dashboard.
        scrollEnabled={!editing}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.id}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ flex: 1 }}
        renderItem={({ item, index: i }) => (
          <Page
            page={item}
            width={width}
            defaulted={defaulted}
            now={now}
            loading={loading}
            refreshing={refreshing}
            error={error}
            onRefresh={onRefresh}
            onWrite={onWrite}
            onNavigate={onNavigate}
            {...(editing && editor && i === index && { edit: { pages: items, editor } })}
            {...(canEdit && !editing && { onStartEdit: () => setEditing(true) })}
          />
        )}
      />
      {editor ? (
        <DashboardsSheet
          visible={dashboardsOpen}
          pages={items}
          editor={editor}
          onClose={() => setDashboardsOpen(false)}
        />
      ) : null}
      <DashboardMenu
        visible={menuOpen}
        pages={items}
        index={index}
        onSelect={jumpTo}
        {...(canEdit && {
          onEdit: () => {
            setMenuOpen(false);
            setEditing(true);
          },
        })}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}
