import type { TodoDue, TodoItem, TodoRepeat, TodoStatus } from '@kaihuman/formats';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import {
  type FocusSessionController,
  NOTIFICATIONS_DENIED_MESSAGE,
} from '../screens/focus-session.js';
import type { BoardItem, KanbanBoardController } from '../screens/kanban-board.js';
import { describeBoardFiles, TODO_STATUSES } from '../screens/kanban-board.js';
import { completionNotice, dueBadge } from '../screens/todo-due.js';
import { useFocusRefresh, useRefresh, useSyncRevision } from '../sync/hooks.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  Chip,
  EmptyState,
  Fab,
  haptics,
  Icon,
  type IconName,
  ListRow,
  Screen,
  Section,
  SegmentedControl,
  type SwipeAction,
  Text,
  TextField,
} from '../ui/index.js';
import { DueSheet } from './due-sheet.js';
import {
  activeOptionCount,
  type BoardOptions,
  type BoardView,
  DEFAULT_OPTIONS,
  KanbanFilterSheet,
  toBoardFilter,
} from './kanban-filter-sheet.js';
import { StreamsList } from './kanban-streams.js';

const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'streams', label: 'Streams' },
] as const satisfies readonly { value: BoardView; label: string }[];

const LABEL: Record<TodoStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'In progress',
  done: 'Done',
  rejected: 'Rejected',
};

/** Short forms keep four segments readable at 393pt. */
const SEGMENT: Record<TodoStatus, string> = {
  backlog: 'Todo',
  'in-progress': 'Active',
  done: 'Done',
  rejected: 'Rejected',
};

const EMPTY: Record<TodoStatus, { icon: IconName; title: string; message: string }> = {
  backlog: {
    icon: 'empty',
    title: 'Backlog is clear',
    message: 'Capture a todo and it lands here.',
  },
  'in-progress': {
    icon: 'todo',
    title: 'Nothing in progress',
    message: 'Start a backlog item to see it here.',
  },
  done: { icon: 'check', title: 'Nothing done yet', message: 'Finished todos collect here.' },
  rejected: { icon: 'close', title: 'Nothing rejected', message: 'Dropped todos collect here.' },
};

/** The one-tap forward move for a card: start it, finish it, or reopen it. */
const ADVANCE: Record<TodoStatus, { to: TodoStatus; label: string; icon: IconName }> = {
  backlog: { to: 'in-progress', label: 'Start', icon: 'chevronRight' },
  'in-progress': { to: 'done', label: 'Mark done', icon: 'check' },
  done: { to: 'backlog', label: 'Reopen', icon: 'refresh' },
  rejected: { to: 'backlog', label: 'Reopen', icon: 'refresh' },
};

/** Short, verb-first labels: swipe buttons are ~80pt wide. */
const ACTION_LABEL: Record<TodoStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'Start',
  done: 'Done',
  rejected: 'Reject',
};

const ACTION_ICON: Record<TodoStatus, IconName> = {
  backlog: 'refresh',
  'in-progress': 'chevronRight',
  done: 'check',
  rejected: 'close',
};

export interface KanbanViewProps {
  controller: KanbanBoardController;
  /** Opens the add-todo sheet; enables the Android FAB. */
  onAddTodo?: () => void;
  /** iOS only: adds a "Start focus" swipe action to open cards. */
  focus?: FocusSessionController;
  /** Opens the detail screen for a card, addressed `<path>#<index>`. */
  onOpenTodo?: (id: string) => void;
}

function BoardFile({ paths }: { paths: readonly string[] }) {
  const { spacing, colors } = useTheme();
  const { label, detail } = describeBoardFiles(paths);
  return (
    <View testID="board-file" accessible accessibilityLabel={`Board file: ${label}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Icon name="note" size={14} color={colors.secondaryLabel} />
        <Text variant="footnote" mono tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>
      {detail ? (
        <Text variant="caption2" tone="secondary" numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export function KanbanView({ controller, onAddTodo, focus, onOpenTodo }: KanbanViewProps) {
  const { colors, spacing, metrics } = useTheme();
  // The controller is mutable, not signal-based: bump to re-read after load/moves.
  const [, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [focusNotice, setFocusNotice] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { refreshing, onRefresh } = useRefresh();
  const rev = useSyncRevision();
  useFocusRefresh();
  const [status, setStatus] = useState<TodoStatus>('backlog');
  const [tag, setTag] = useState<string | undefined>();
  const [view, setView] = useState<BoardView>('board');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<BoardOptions>(DEFAULT_OPTIONS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dueFor, setDueFor] = useState<BoardItem | null>(null);

  const reload = useCallback(async () => {
    try {
      await controller.load();
      setLoadError(null);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
    setVersion((v) => v + 1);
  }, [controller]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
  useEffect(() => {
    let live = true;
    reload().finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [reload, rev]);

  // The view owns the filter state; the controller only ever sees the combined result.
  const applyFilter = (next: {
    tag?: string | undefined;
    search?: string;
    options?: BoardOptions;
  }) => {
    const nextTag = 'tag' in next ? next.tag : tag;
    const nextSearch = next.search ?? search;
    const nextOptions = next.options ?? options;
    setTag(nextTag);
    setSearch(nextSearch);
    setOptions(nextOptions);
    controller.setFilter(toBoardFilter(nextOptions, nextSearch, nextTag));
    setVersion((v) => v + 1);
  };
  const pickTag = (next: string | undefined) => applyFilter({ tag: next });

  const streamStatus = async (path: string, index: number, to: TodoStatus) => {
    const res = await controller.setStatus(path, index, to);
    setError(res.ok ? null : res.error);
    if (res.ok) haptics.success();
    else haptics.error();
    setVersion((v) => v + 1);
  };
  const streamPriority = async (path: string, index: number) => {
    const res = await controller.cyclePriority(path, index);
    setError(res.ok ? null : res.error);
    if (!res.ok) haptics.error();
    setVersion((v) => v + 1);
  };
  const streamAdd = async (path: string, text: string) => {
    const res = await controller.addTodo(path, text);
    setError(res.ok ? null : res.error);
    if (res.ok) haptics.success();
    else haptics.error();
    setVersion((v) => v + 1);
  };

  const move = async (path: string, index: number, to: TodoStatus, item?: TodoItem) => {
    // A recurring todo is not finished by Done: it moves to its next occurrence, so say where.
    const next = to === 'done' && item ? completionNotice(item, new Date()) : undefined;
    const res = await controller.setStatus(path, index, to);
    setError(res.ok ? null : res.error);
    setNotice(res.ok && next ? next : null);
    if (res.ok) haptics.success();
    else haptics.error();
    setVersion((v) => v + 1);
  };

  const setDue = async (
    path: string,
    index: number,
    due: TodoDue | undefined,
    repeat?: TodoRepeat | null,
  ) => {
    setDueFor(null);
    const res = await controller.setDue(path, index, due, repeat);
    setError(res.ok ? null : res.error);
    if (res.ok) haptics.success();
    else haptics.error();
    setVersion((v) => v + 1);
  };

  const remove = async (path: string, index: number) => {
    const res = await controller.remove(path, index);
    setError(res.ok ? null : res.error);
    if (!res.ok) haptics.error();
    setVersion((v) => v + 1);
  };

  const startFocus = async (id: string, text: string) => {
    if (!focus) return;
    const res = await focus.start(id, text);
    setFocusNotice(
      !res.started && res.reason === 'notifications-denied' ? NOTIFICATIONS_DENIED_MESSAGE : null,
    );
    if (res.started) haptics.success();
    else haptics.error();
  };

  const columns = controller.columns();
  const tags = controller.tags;
  const cards = columns[status];
  const filterCount = activeOptionCount(options, view, tag);
  const statusOptions = TODO_STATUSES.map((s) => ({
    value: s,
    label: `${SEGMENT[s]} ${columns[s].length}`,
  }));

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.secondaryLabel} accessibilityLabel="Loading board" />
      </View>
    );
  } else if (loadError) {
    body = (
      <EmptyState
        icon="warning"
        title="Couldn't load the board"
        message={loadError}
        action={{ label: 'Try again', onPress: () => void reload() }}
      />
    );
  } else if (view === 'streams') {
    body = (
      <StreamsList
        streams={controller.streams(options.streamMode, options.streamSort)}
        mode={options.streamMode}
        onStatus={(p, i, s) => void streamStatus(p, i, s)}
        onCyclePriority={(p, i) => void streamPriority(p, i)}
        onAdd={(p, t) => void streamAdd(p, t)}
        onOpenTodo={onOpenTodo}
      />
    );
  } else if (cards.length === 0) {
    body = (
      <EmptyState
        {...EMPTY[status]}
        action={
          status === 'backlog' && onAddTodo ? { label: 'Add todo', onPress: onAddTodo } : undefined
        }
      />
    );
  } else {
    const advance = ADVANCE[status];
    body = (
      <Section header={`${LABEL[status]} · ${cards.length}`}>
        {cards.map((card) => {
          const { item, itemIndex, filePath } = card;
          const badge = dueBadge(item, new Date());
          // Done sits on the leading edge so the common "finish it" swipe mirrors Mail's read/unread;
          // Delete is the red, outermost trailing action.
          const actions: SwipeAction[] = [
            ...TODO_STATUSES.filter((s) => s !== status).map(
              (s): SwipeAction => ({
                label: ACTION_LABEL[s],
                icon: ACTION_ICON[s],
                side: s === 'done' ? 'leading' : 'trailing',
                onPress: () => void move(filePath, itemIndex, s, item),
              }),
            ),
            ...(focus?.available && (status === 'backlog' || status === 'in-progress')
              ? [
                  {
                    label: 'Start focus',
                    icon: 'timer',
                    side: 'leading',
                    onPress: () => void startFocus(`${filePath}#${itemIndex}`, item.text),
                  } satisfies SwipeAction,
                ]
              : []),
            {
              label: 'Due',
              icon: 'calendar',
              side: 'leading',
              onPress: () => setDueFor(card),
            },
            {
              label: 'Delete',
              icon: 'trash',
              destructive: true,
              onPress: () => void remove(filePath, itemIndex),
            },
          ];
          return (
            <ListRow
              key={`${filePath}:${itemIndex}`}
              testID={`card-${itemIndex}`}
              title={item.text}
              subtitle={item.tags.length ? item.tags.map((t) => `#${t}`).join(' ') : undefined}
              swipeActions={actions}
              onPress={onOpenTodo ? () => onOpenTodo(`${filePath}#${itemIndex}`) : undefined}
              accessory={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  {badge?.repeat ? (
                    <Icon
                      name="repeat"
                      size={14}
                      color={colors.secondaryLabel}
                      accessibilityLabel={`Repeats ${badge.repeat}`}
                    />
                  ) : null}
                  {badge ? <Badge tone={badge.tone} label={badge.label} /> : null}
                  <Pressable
                    testID={`move-${itemIndex}-${advance.to}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${advance.label}: ${item.text}`}
                    hitSlop={8}
                    onPress={() => void move(filePath, itemIndex, advance.to, item)}
                    android_ripple={{ color: colors.pressed, borderless: true, radius: 24 }}
                    style={({ pressed }) => ({
                      width: metrics.hitTarget,
                      height: metrics.hitTarget,
                      marginRight: -spacing.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.5 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.accentSoft,
                      }}
                    >
                      <Icon
                        name={advance.icon}
                        size={17}
                        color={colors.onAccentSoft}
                        weight="semibold"
                      />
                    </View>
                  </Pressable>
                </View>
              }
            />
          );
        })}
      </Section>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Board" refreshing={refreshing} onRefresh={onRefresh}>
        {loading || loadError ? null : <BoardFile paths={controller.paths} />}
        <SegmentedControl testID="board-view" options={VIEWS} value={view} onChange={setView} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Search todos"
              testID="board-search"
              placeholder="Text, tag or milestone"
              value={search}
              onChangeText={(text) => applyFilter({ search: text })}
              returnKeyType="search"
            />
          </View>
          <Pressable
            testID="board-filter"
            accessibilityRole="button"
            accessibilityLabel={
              filterCount > 0 ? `Sort and filter, ${filterCount} active` : 'Sort and filter'
            }
            onPress={() => setFilterOpen(true)}
            android_ripple={{ color: colors.pressed, borderless: true, radius: 24 }}
            style={({ pressed }) => ({
              width: metrics.hitTarget,
              height: metrics.hitTarget,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Icon name="filter" size={22} color={filterCount > 0 ? colors.accent : colors.label} />
            {filterCount > 0 ? <Badge tone="accent" count={filterCount} /> : null}
          </Pressable>
        </View>
        {view === 'board' ? (
          <SegmentedControl
            testID="board-status"
            options={statusOptions}
            value={status}
            onChange={setStatus}
          />
        ) : null}
        {view === 'board' && tags.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginHorizontal: -metrics.screenMargin }}
            contentContainerStyle={{ paddingHorizontal: metrics.screenMargin, gap: spacing.sm }}
          >
            <Chip label="All" selected={tag === undefined} onPress={() => pickTag(undefined)} />
            {tags.map((t) => (
              <Chip
                key={t}
                label={`#${t}`}
                selected={tag === t}
                onPress={() => pickTag(tag === t ? undefined : t)}
              />
            ))}
          </ScrollView>
        ) : null}
        {error ? (
          <Text variant="footnote" tone="danger" accessibilityRole="summary">
            {`Couldn't move the todo: ${error}`}
          </Text>
        ) : null}
        {notice ? (
          <View accessibilityLiveRegion="polite">
            <Text variant="footnote" tone="secondary" testID="board-notice">
              {notice}
            </Text>
          </View>
        ) : null}
        {focusNotice ? (
          <Text variant="footnote" tone="danger" accessibilityRole="summary">
            {focusNotice}
          </Text>
        ) : null}
        {body}
      </Screen>
      {filterOpen ? (
        <KanbanFilterSheet
          view={view}
          options={options}
          onChange={(next) => applyFilter({ options: next })}
          milestones={controller.milestones}
          upcoming={controller.upcomingMilestone}
          paths={controller.paths}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}
      {dueFor ? (
        <DueSheet
          title={dueFor.item.text}
          current={
            dueFor.item.dueDate
              ? {
                  date: dueFor.item.dueDate,
                  ...(dueFor.item.dueTime && { time: dueFor.item.dueTime }),
                }
              : undefined
          }
          {...(dueFor.item.repeat && { currentRepeat: dueFor.item.repeat })}
          onSelect={(due, repeat) => void setDue(dueFor.filePath, dueFor.itemIndex, due, repeat)}
          onClose={() => setDueFor(null)}
        />
      ) : null}
      {onAddTodo ? (
        <Fab icon="add" label="Add todo" accessibilityLabel="Add todo" onPress={onAddTodo} />
      ) : null}
    </View>
  );
}
