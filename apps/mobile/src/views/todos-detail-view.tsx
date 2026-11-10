import { localDate } from '@kaihuman/formats';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import {
  setTodoStatusAt,
  type TodoRow,
  todosView,
  toggleTodo,
} from '../components/widgets/todos-tile.js';
import { deleteTodoAt, type TodoSegment, todoSegments } from '../screens/todo-segments.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  Button,
  Divider,
  FadeInView,
  haptics,
  Icon,
  ScreenTitle,
  SegmentedControl,
  SwipeReveal,
  Text,
} from '../ui/index.js';
import { tileTitle } from './tiles/glance/name.js';
import { CheckCircle, EmptyLine } from './tiles/parts.js';

/** How long a checked row stays (struck through) before it is written as done; tapping again undoes. */
export const UNDO_MS = 600;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon" within the coming week, "Nov 20" beyond; fixed English names so it never depends on locale data. */
const dueChip = (date: string, now: Date): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const day = new Date(y, m - 1, d);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - start.getTime()) / 86_400_000);
  return days >= 0 && days < 7 ? (WEEKDAYS[day.getDay()] as string) : `${MONTHS[m - 1]} ${d}`;
};

export interface TodosDetailViewProps {
  path: string;
  content: string;
  now: Date;
  onWrite: (path: string, content: string) => void | Promise<void>;
  onAdd: () => void;
  onOpenTodo?: (index: number) => void;
}

function SectionHeader({ children }: { children: string }) {
  const { spacing } = useTheme();
  return (
    <Text
      variant="footnote"
      tone="secondary"
      weight="600"
      accessibilityRole="header"
      style={{ paddingTop: spacing.md, paddingBottom: spacing.xs, letterSpacing: 0.5 }}
    >
      {children}
    </Text>
  );
}

interface RowProps {
  row: TodoRow;
  now: Date;
  pending: boolean;
  onCheck: () => void;
  onStart: () => void;
  onDelete: () => void;
  onOpen?: () => void;
}

function TodoItemRow({ row, now, pending, onCheck, onStart, onDelete, onOpen }: RowProps) {
  const { colors, spacing, metrics } = useTheme();
  const finished = row.status === 'done' || row.status === 'rejected';
  const struck = finished || pending;
  const overdue = !finished && row.dueDate !== undefined && dueOverdue(row.dueDate, now);
  const tag = row.tags[0];
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${struck ? 'Undo' : 'Complete'} ${row.text}`}
        aria-checked={struck}
        hitSlop={8}
        onPress={onCheck}
        testID={`todo-check-${row.index}`}
        style={{ minHeight: metrics.hitTarget, justifyContent: 'center' }}
      >
        <CheckCircle on={struck} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={row.text}
        accessibilityHint="Long press to start"
        onPress={onOpen}
        onLongPress={row.status === 'backlog' ? onStart : undefined}
        testID={`todo-${row.index}`}
        style={{
          flex: 1,
          minHeight: metrics.hitTarget,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
        }}
      >
        <Text
          variant="body"
          tone={struck ? 'secondary' : 'primary'}
          style={[{ flex: 1 }, struck ? { textDecorationLine: 'line-through' } : null]}
        >
          {row.text}
        </Text>
        {row.status === 'in-progress' ? (
          <Icon name="flag" size={14} color={colors.accent} accessibilityLabel="In progress" />
        ) : null}
        {row.repeat ? (
          <Icon
            name="repeat"
            size={14}
            color={colors.secondaryLabel}
            accessibilityLabel="Repeats"
          />
        ) : null}
        {row.dueDate ? (
          <Badge tone={overdue ? 'warning' : 'neutral'} label={dueChip(row.dueDate, now)} />
        ) : tag ? (
          <Badge tone="neutral" label={`#${tag}`} />
        ) : null}
      </Pressable>
    </View>
  );
  // Swipe is native only; the web preview has no delete gesture.
  if (Platform.OS === 'web') return body;
  return (
    <SwipeReveal
      actions={[{ label: 'Delete', icon: 'trash', destructive: true, onPress: onDelete }]}
    >
      {body}
    </SwipeReveal>
  );
}

const dueOverdue = (date: string, now: Date): boolean => date < localDate(now);

export function TodosDetailView({
  path,
  content,
  now,
  onWrite,
  onAdd,
  onOpenTodo,
}: TodosDetailViewProps) {
  const { spacing } = useTheme();
  const [segment, setSegment] = useState<TodoSegment>('today');
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // Timers fire after the render that scheduled them; they must write against the newest file.
  const latest = useRef(content);
  latest.current = content;

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const t of live.values()) clearTimeout(t);
      live.clear();
    };
  }, []);

  const view = useMemo(() => todosView(content, now), [content, now]);
  const segments = useMemo(() => todoSegments(view, now), [view, now]);
  const { counts } = segments;

  const write = (next: string) => void onWrite(path, next);
  const settle = (index: number) => {
    timers.current.delete(index);
    setPending((p) => {
      const next = new Set(p);
      next.delete(index);
      return next;
    });
  };

  const check = (row: TodoRow) => {
    const timer = timers.current.get(row.index);
    if (timer) {
      clearTimeout(timer);
      settle(row.index);
      haptics.light();
      return;
    }
    if (row.status === 'done' || row.status === 'rejected') {
      haptics.light();
      write(toggleTodo(latest.current, row.index, new Date()));
      return;
    }
    haptics.success();
    setPending((p) => new Set(p).add(row.index));
    timers.current.set(
      row.index,
      setTimeout(() => {
        write(toggleTodo(latest.current, row.index, new Date()));
        settle(row.index);
      }, UNDO_MS),
    );
  };
  const start = (row: TodoRow) => {
    const result = setTodoStatusAt(latest.current, row.index, 'in-progress', new Date());
    if (result.ok) {
      haptics.medium();
      write(result.content);
    }
  };

  const renderRow = (row: TodoRow): ReactNode => (
    <View key={row.id}>
      <Divider />
      <TodoItemRow
        row={row}
        now={now}
        pending={pending.has(row.index)}
        onCheck={() => check(row)}
        onStart={() => start(row)}
        onDelete={() => write(deleteTodoAt(latest.current, row.index))}
        onOpen={onOpenTodo ? () => onOpenTodo(row.index) : undefined}
      />
    </View>
  );

  const section = (title: string, rows: TodoRow[]): ReactNode =>
    rows.length > 0 ? (
      <View key={title}>
        <SectionHeader>{title}</SectionHeader>
        {rows.map(renderRow)}
      </View>
    ) : null;

  const { today } = segments;
  const empty = counts[segment] === 0;

  return (
    <View style={{ gap: spacing.md }} testID="todos-detail">
      <ScreenTitle>{tileTitle(path, 'Todos')}</ScreenTitle>
      <SegmentedControl
        testID="todo-segments"
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'today', label: `Today ${counts.today}` },
          { value: 'doing', label: `Doing ${counts.doing}` },
          { value: 'open', label: `Open ${counts.open}` },
          { value: 'done', label: `Done ${counts.done}` },
        ]}
      />
      {/* Keyed so a segment change remounts the list and it fades in. */}
      <FadeInView key={segment}>
        {empty ? (
          <EmptyLine>
            {segment === 'today' ? 'Nothing due today.' : `No ${segment} todos.`}
          </EmptyLine>
        ) : segment === 'today' ? (
          <>
            {section('OVERDUE', today.overdue)}
            {section('TODAY', today.due)}
            {section('IN PROGRESS', today.inProgress)}
          </>
        ) : (
          segments[segment].map(renderRow)
        )}
      </FadeInView>
      <Button label="New todo" icon="add" variant="tinted" fullWidth onPress={onAdd} />
    </View>
  );
}
