import type { TodoDue, TodoRepeat } from '@kaihuman/formats';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import type { KanbanBoardController } from '../screens/kanban-board.js';
import { TASK_VIEW_OPTIONS, type TaskEntry, taskSections } from '../screens/tasks.js';
import { completionNotice, dueBadge, rescheduleChoices } from '../screens/todo-due.js';
import { useFocusRefresh, useRefresh, useSyncRevision } from '../sync/hooks.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  EmptyState,
  haptics,
  Icon,
  ListRow,
  Screen,
  Section,
  SegmentedControl,
  Text,
} from '../ui/index.js';
import { DueSheet } from './due-sheet.js';

type TaskView = (typeof TASK_VIEW_OPTIONS)[number]['value'];

/** The console's /tasks view: smart views, tasks grouped by due bucket, one-tap reschedule. */
export function TasksView({ controller }: { controller: KanbanBoardController }) {
  const { colors, spacing, metrics } = useTheme();
  const [, setVersion] = useState(0);
  const [view, setView] = useState<TaskView>('today');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !controller.loadCached());
  const [dueFor, setDueFor] = useState<TaskEntry | null>(null);
  const { refreshing, onRefresh } = useRefresh();
  const rev = useSyncRevision();
  useFocusRefresh();

  const reload = useCallback(async () => {
    try {
      await controller.load();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setVersion((v) => v + 1);
  }, [controller]);

  useEffect(() => controller.subscribe(() => setVersion((v) => v + 1)), [controller]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
  useEffect(() => {
    let live = true;
    reload().finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [reload, rev]);

  const settle = (res: { ok: true } | { ok: false; error: string }) => {
    setError(res.ok ? null : res.error);
    if (res.ok) haptics.success();
    else haptics.error();
    setVersion((v) => v + 1);
  };
  const complete = async (e: TaskEntry) => {
    const next = completionNotice(e.item, new Date());
    const res = await controller.setStatus(e.filePath, e.itemIndex, 'done');
    setNotice(res.ok && next ? next : null);
    settle(res);
  };
  const reschedule = async (e: TaskEntry, due: TodoDue | undefined, repeat?: TodoRepeat | null) => {
    setDueFor(null);
    settle(await controller.setDue(e.filePath, e.itemIndex, due, repeat));
  };

  const now = Date.now();
  const sections = taskSections(controller.taskLists(), view, controller.inboxPath, now);

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Tasks" refreshing={refreshing} onRefresh={onRefresh}>
        <SegmentedControl
          testID="tasks-view"
          options={TASK_VIEW_OPTIONS}
          value={view}
          onChange={setView}
        />
        {error ? (
          <Text variant="footnote" tone="danger" accessibilityRole="summary">
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text variant="footnote" tone="secondary" testID="tasks-notice">
            {notice}
          </Text>
        ) : null}
        {loading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.secondaryLabel} accessibilityLabel="Loading tasks" />
          </View>
        ) : sections.length === 0 ? (
          <EmptyState icon="check" title="No tasks" message="Nothing here." />
        ) : (
          sections.map((s) => (
            <Section key={s.bucket} header={`${s.label} · ${s.entries.length}`}>
              {s.entries.map((e) => {
                const done = e.item.status === 'done';
                const badge = dueBadge(e.item, new Date(now));
                return (
                  <ListRow
                    key={`${e.filePath}:${e.item.id}`}
                    testID={`task-${e.itemIndex}`}
                    title={e.item.text}
                    subtitle={e.listName}
                    // Tapping the row is the shortest path to rescheduling; finished tasks stay put.
                    onPress={done ? undefined : () => setDueFor(e)}
                    meta={badge ? <Badge tone={badge.tone} label={badge.label} /> : undefined}
                    accessory={
                      done ? undefined : (
                        <Pressable
                          testID={`task-done-${e.itemIndex}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Complete: ${e.item.text}`}
                          hitSlop={8}
                          onPress={() => void complete(e)}
                          style={{
                            width: metrics.hitTarget,
                            height: metrics.hitTarget,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon name="check" size={20} color={colors.onAccentSoft} />
                        </Pressable>
                      )
                    }
                  />
                );
              })}
            </Section>
          ))
        )}
      </Screen>
      {dueFor ? (
        <DueSheet
          title={dueFor.item.text}
          presets={rescheduleChoices(dueFor.item.dueTime)}
          current={
            dueFor.item.dueDate
              ? {
                  date: dueFor.item.dueDate,
                  ...(dueFor.item.dueTime && { time: dueFor.item.dueTime }),
                }
              : undefined
          }
          {...(dueFor.item.repeat && { currentRepeat: dueFor.item.repeat })}
          onSelect={(due, repeat) => void reschedule(dueFor, due, repeat)}
          onClose={() => setDueFor(null)}
        />
      ) : null}
    </View>
  );
}
