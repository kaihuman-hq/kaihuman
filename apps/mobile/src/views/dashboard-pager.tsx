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
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { presentTile, type TileView } from '../components/widgets/tile-controllers.js';
import { useEnsureFeeds, useFeedSnapshot } from '../files/use-feeds.js';
import {
  type DashboardPage,
  lastDashboardId,
  rememberDashboard,
  type TileFile,
} from '../screens/dashboards.js';
import { SyncStatusBanner } from '../sync/sync-status-banner.js';
import { useTheme } from '../theme/theme.js';
import {
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
  /** The page on screen; its tiles stagger in when it becomes current. */
  active: boolean;
  defaulted: boolean;
  now: Date;
  loading: boolean;
  refreshing: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onWrite: (path: string, content: string) => void | Promise<void>;
  onNavigate: (href: string) => void;
}

const STAGGER_MS = 30;

/** Page swipe: tiles rise in one after another, 30 ms apart (README animation notes). */
function Stagger({
  index,
  active,
  width,
  children,
}: {
  index: number;
  active: boolean;
  width: number | '100%';
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(active || reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    if (active) {
      progress.set(0);
      progress.set(withDelay(index * STAGGER_MS, withSpring(1, { damping: 18, stiffness: 220 })));
    }
  }, [active, index, progress, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + progress.get() * 0.6,
    transform: [{ translateY: (1 - progress.get()) * 14 }, { scale: 0.96 + progress.get() * 0.04 }],
  }));
  return <Animated.View style={[{ width }, style]}>{children}</Animated.View>;
}

function Page({
  page,
  width,
  active,
  defaulted,
  now,
  loading,
  refreshing,
  error,
  onRefresh,
  onWrite,
  onNavigate,
}: PageProps) {
  const { colors, spacing, metrics } = useTheme();
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
    const glance = glanceOf({ path: item.path, content: item.content, now }, item.tile);
    return glance ? [{ item, glance }] : [];
  });
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
      />
    ) : (
      <UnsupportedTile path={item.path} onOpen={() => onNavigate(`/files/${item.path}`)} />
    );

  return (
    <View style={{ width }} testID={`dashboard-page-${page.id}`}>
      <ScrollView
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
          <Hint>Group tiles into dashboards in the web console; they show up here as pages.</Hint>
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
          {cells.map((cell, i) => (
            <Stagger
              key={cell.item.path}
              index={i}
              active={active}
              width={cell.glance ? side : '100%'}
            >
              <ErrorBoundary what="this tile" resetKey={cell.item.content} onRetry={onRefresh}>
                {renderCell(cell)}
              </ErrorBoundary>
            </Stagger>
          ))}
        </View>
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
  onClose,
}: {
  visible: boolean;
  pages: DashboardPage[];
  index: number;
  onSelect: (i: number) => void;
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
}: DashboardPagerProps) {
  const { colors, spacing, metrics } = useTheme();
  const insets = useInsets();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<DashboardPage>>(null);
  const items = pages.length > 0 ? pages : [PLACEHOLDER];
  const [currentId, setCurrentId] = useState<string | null>(lastDashboardId);
  const [menuOpen, setMenuOpen] = useState(false);
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
        <Text variant="subheadline" tone="secondary">
          {dateLine(now)}
        </Text>
        {items.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose dashboard, current ${current.name}`}
            testID="dashboard-title"
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            style={{
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
            active={i === index}
            defaulted={defaulted}
            now={now}
            loading={loading}
            refreshing={refreshing}
            error={error}
            onRefresh={onRefresh}
            onWrite={onWrite}
            onNavigate={onNavigate}
          />
        )}
      />
      <DashboardMenu
        visible={menuOpen}
        pages={items}
        index={index}
        onSelect={jumpTo}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}
