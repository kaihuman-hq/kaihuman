import type { TodoStatus } from '@kaihuman/formats';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import type { KanbanBoardController } from '../screens/kanban-board.js';
import { TODO_STATUSES } from '../screens/kanban-board.js';
import { useTheme } from '../theme/theme.js';
import {
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
} from '../ui/index.js';

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
}

export function KanbanView({ controller, onAddTodo }: KanbanViewProps) {
  const { colors, spacing, metrics } = useTheme();
  // The controller is mutable, not signal-based: bump to re-read after load/moves.
  const [, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<TodoStatus>('backlog');
  const [tag, setTag] = useState<string | undefined>();

  const reload = useCallback(async () => {
    try {
      await controller.load();
      setLoadError(null);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
    setVersion((v) => v + 1);
  }, [controller]);

  useEffect(() => {
    let live = true;
    reload().finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [reload]);

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const pickTag = (next: string | undefined) => {
    setTag(next);
    controller.setFilter({ tag: next });
    setVersion((v) => v + 1);
  };

  const move = async (path: string, index: number, to: TodoStatus) => {
    const res = await controller.setStatus(path, index, to);
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

  const columns = controller.columns();
  const tags = controller.tags;
  const cards = columns[status];
  const options = TODO_STATUSES.map((s) => ({
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
        action={{ label: 'Try again', onPress: () => void refresh() }}
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
        {cards.map(({ item, itemIndex, filePath }) => {
          // Done sits on the leading edge so the common "finish it" swipe mirrors Mail's read/unread;
          // Delete is the red, outermost trailing action.
          const actions: SwipeAction[] = [
            ...TODO_STATUSES.filter((s) => s !== status).map(
              (s): SwipeAction => ({
                label: ACTION_LABEL[s],
                icon: ACTION_ICON[s],
                side: s === 'done' ? 'leading' : 'trailing',
                onPress: () => void move(filePath, itemIndex, s),
              }),
            ),
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
              accessory={
                <Pressable
                  testID={`move-${itemIndex}-${advance.to}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${advance.label}: ${item.text}`}
                  hitSlop={8}
                  onPress={() => void move(filePath, itemIndex, advance.to)}
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
              }
            />
          );
        })}
      </Section>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Board" refreshing={refreshing} onRefresh={() => void refresh()}>
        <SegmentedControl
          testID="board-status"
          options={options}
          value={status}
          onChange={setStatus}
        />
        {tags.length > 0 ? (
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
        {body}
      </Screen>
      {onAddTodo ? (
        <Fab icon="add" label="Add todo" accessibilityLabel="Add todo" onPress={onAddTodo} />
      ) : null}
    </View>
  );
}
