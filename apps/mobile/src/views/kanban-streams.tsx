import {
  actionsFor,
  PRIORITY_LABELS,
  type StreamMode,
  type TodoPriority,
  type TodoStatus,
} from '@kaihuman/formats';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Stream } from '../screens/kanban-board.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  type BadgeTone,
  EmptyState,
  type IconName,
  ListRow,
  Section,
  type SwipeAction,
  TextField,
} from '../ui/index.js';

const PRIORITY_TONE: Record<TodoPriority, BadgeTone> = {
  high: 'neutral',
  'super-high': 'warning',
  'ultra-high': 'danger',
};

const STATUS_ICON: Record<TodoStatus, IconName> = {
  backlog: 'todo',
  'in-progress': 'timer',
  done: 'check',
  rejected: 'close',
};

const STATUS_LABEL: Record<TodoStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'Start',
  done: 'Done',
  rejected: 'Reject',
};

export const streamName = (path: string): string =>
  path
    .split('/')
    .pop()
    ?.replace(/\.todos\.md$/, '') ?? path;

/** The Streams view: one section per todo file, with quick-add, priority cycling and status swipes. */
export function StreamsList({
  streams,
  mode,
  onStatus,
  onCyclePriority,
  onAdd,
  onOpenTodo,
}: {
  streams: readonly Stream[];
  mode: StreamMode;
  onStatus: (path: string, index: number, status: TodoStatus) => void;
  onCyclePriority: (path: string, index: number) => void;
  onAdd: (path: string, text: string) => void;
  onOpenTodo?: (id: string) => void;
}) {
  const { spacing } = useTheme();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (streams.length === 0) {
    return <EmptyState icon="empty" title="No streams" message="Todo files appear here." />;
  }
  return (
    <View style={{ gap: spacing.lg }}>
      {streams.map(({ path, rows }) => {
        const name = streamName(path);
        const submit = () => {
          const text = drafts[path]?.trim();
          if (!text) return;
          onAdd(path, text);
          setDrafts((d) => ({ ...d, [path]: '' }));
        };
        return (
          <Section key={path} header={`${name} · ${rows.length}`}>
            {mode === 'active' ? (
              <View style={{ paddingHorizontal: spacing.md }}>
                <TextField
                  label={`Add to ${name}`}
                  testID={`stream-add-${name}`}
                  placeholder="Add item…"
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  value={drafts[path] ?? ''}
                  onChangeText={(text) => setDrafts((d) => ({ ...d, [path]: text }))}
                  onSubmitEditing={submit}
                />
              </View>
            ) : null}
            {rows.length === 0 ? (
              <ListRow title="Nothing here" accessory="none" disabled />
            ) : (
              rows.map(({ item, index }) => {
                const actions: SwipeAction[] = actionsFor(item.status).map((s) => ({
                  label: STATUS_LABEL[s],
                  icon: STATUS_ICON[s],
                  side: s === 'done' ? 'leading' : 'trailing',
                  onPress: () => onStatus(path, index, s),
                }));
                return (
                  <ListRow
                    key={`${path}:${index}`}
                    testID={`stream-card-${name}-${index}`}
                    title={item.text}
                    subtitle={
                      item.tags.length ? item.tags.map((t) => `#${t}`).join(' ') : undefined
                    }
                    icon={STATUS_ICON[item.status]}
                    swipeActions={actions}
                    onPress={onOpenTodo ? () => onOpenTodo(`${path}#${index}`) : undefined}
                    accessory={
                      <Pressable
                        testID={`stream-priority-${name}-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Priority ${item.priority ? PRIORITY_LABELS[item.priority] : 'none'}: ${item.text}`}
                        hitSlop={8}
                        onPress={() => onCyclePriority(path, index)}
                      >
                        <Badge
                          tone={item.priority ? PRIORITY_TONE[item.priority] : 'neutral'}
                          label={item.priority ? PRIORITY_LABELS[item.priority] : 'Priority'}
                        />
                      </Pressable>
                    }
                  />
                );
              })
            )}
          </Section>
        );
      })}
    </View>
  );
}
