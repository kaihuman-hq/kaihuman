import {
  actionsFor,
  PRIORITY_LABELS,
  type StreamMode,
  TODO_COLOR_HEX,
  TODO_COLORS,
  type TodoColor,
  type TodoPriority,
  type TodoStatus,
} from '@kaihuman/formats';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import type { Stream } from '../screens/kanban-board.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  type IconName,
  ListRow,
  Section,
  type SwipeAction,
  Text,
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
  onColor,
  onMove,
  onOpenTodo,
}: {
  streams: readonly Stream[];
  mode: StreamMode;
  onStatus: (path: string, index: number, status: TodoStatus) => void;
  onCyclePriority: (path: string, index: number) => void;
  onAdd: (path: string, text: string) => void;
  onColor: (path: string, color?: TodoColor) => void;
  /** `to` is a position in the file. */
  onMove: (path: string, from: number, to: number) => void;
  onOpenTodo?: (id: string) => void;
}) {
  const { spacing, colors } = useTheme();
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ path: string; pos: number } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (streams.length === 0) {
    return <EmptyState icon="empty" title="No streams" message="Todo files appear here." />;
  }
  return (
    <View style={{ gap: spacing.lg }}>
      {streams.map(({ path, rows, data }) => {
        const name = streamName(path);
        const submit = () => {
          const text = drafts[path]?.trim();
          if (!text) return;
          onAdd(path, text);
          setDrafts((d) => ({ ...d, [path]: '' }));
        };
        return (
          <Section key={path} header={`${name} · ${rows.length}`}>
            <ListRow
              testID={`stream-color-${name}`}
              title="List colour"
              value={data.color ?? 'None'}
              icon="flag"
              onPress={() => setColorFor(path)}
              accessory={
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: data.color ? TODO_COLOR_HEX[data.color] : colors.fill,
                  }}
                />
              }
            />
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
              rows.map(({ item, index }, pos) => {
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
                    onLongPress={() => setMenu({ path, pos })}
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
      {colorFor ? (
        <Sheet title="List colour" onClose={() => setColorFor(null)}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {TODO_COLORS.map((c) => (
              <Pressable
                key={c}
                testID={`color-${c}`}
                accessibilityRole="button"
                accessibilityLabel={c}
                onPress={() => {
                  onColor(colorFor, c);
                  setColorFor(null);
                }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: TODO_COLOR_HEX[c],
                  borderWidth: streams.find((x) => x.path === colorFor)?.data.color === c ? 3 : 0,
                  borderColor: colors.label,
                }}
              />
            ))}
          </View>
          <Button
            label="No colour"
            testID="color-none"
            variant="tinted"
            fullWidth
            onPress={() => {
              onColor(colorFor, undefined);
              setColorFor(null);
            }}
          />
        </Sheet>
      ) : null}
      {menu ? (
        <MoveSheet streams={streams} menu={menu} onMove={onMove} onClose={() => setMenu(null)} />
      ) : null}
    </View>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors, spacing, shape } = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}
      >
        <Pressable
          accessible={false}
          style={{
            backgroundColor: colors.surface,
            padding: spacing.lg,
            gap: spacing.md,
            borderTopLeftRadius: shape.lg,
            borderTopRightRadius: shape.lg,
          }}
        >
          <Text variant="headline" numberOfLines={2}>
            {title}
          </Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Long-press menu: moves a row among the rows its stream currently shows. */
function MoveSheet({
  streams,
  menu,
  onMove,
  onClose,
}: {
  streams: readonly Stream[];
  menu: { path: string; pos: number };
  onMove: (path: string, from: number, to: number) => void;
  onClose: () => void;
}) {
  const rows = streams.find((s) => s.path === menu.path)?.rows ?? [];
  const row = rows[menu.pos];
  if (!row) return null;
  const go = (target: number | undefined) => {
    const to = target === undefined ? undefined : rows[target]?.index;
    if (to !== undefined) onMove(menu.path, row.index, to);
    onClose();
  };
  return (
    <Sheet title={row.item.text} onClose={onClose}>
      <Button
        label="Move to top"
        testID="move-top"
        variant="tinted"
        fullWidth
        disabled={menu.pos === 0}
        onPress={() => go(0)}
      />
      <Button
        label="Move up"
        testID="move-up"
        variant="tinted"
        fullWidth
        disabled={menu.pos === 0}
        onPress={() => go(menu.pos - 1)}
      />
      <Button
        label="Move down"
        testID="move-down"
        variant="tinted"
        fullWidth
        disabled={menu.pos >= rows.length - 1}
        onPress={() => go(menu.pos + 1)}
      />
    </Sheet>
  );
}
