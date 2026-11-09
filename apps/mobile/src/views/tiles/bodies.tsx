import { useState } from 'react';
import { Linking, View } from 'react-native';
import {
  type ActionLogView,
  addBookmarkEntry,
  addCommandEntry,
  addEvent,
  addPromptEntry,
  addReadLaterUrl,
  addTodoTask,
  type BookmarksView,
  type BudgetView,
  bookmarksView,
  type ConsumptionMeter,
  clearReadLater,
  clockIn,
  clockOut,
  type DataCollectionView,
  deleteBookmarkEntry,
  type EventRow,
  formatElapsed,
  type HabitView,
  interpolateTemplate,
  logAction,
  markReadLaterRead,
  missingParameters,
  type ReadLaterView,
  type TemplateRow,
  type TemplatesView,
  type TileResult,
  type TimerView,
  type TodosView,
  toggleHabitToday,
  toggleTodo,
  type WorldClock,
} from '../../components/widgets/tile-controllers.js';
import { dueBadge } from '../../screens/todo-due.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, haptics, Icon, Text, TextField } from '../../ui/index.js';
import {
  CheckCircle,
  EmptyLine,
  ItemRow,
  Meter,
  QuickAdd,
  Rows,
  Stat,
  StatRow,
  useDisclosure,
} from './parts.js';

export interface Ctx {
  content: string;
  now: Date;
  /** Writes a mutator's result and shows its error, if it was rejected. */
  apply: (result: string | TileResult) => boolean;
  error: string | null;
}

const num = (n: number, digits = 2) => n.toFixed(digits);
const signed = (n: number, digits = 2) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
const minutes = (m: number) => {
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)}h ${r % 60}m` : `${r} min`;
};
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const dayLetter = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()] ?? '';
};
/** Lists past this length collapse behind a "Show all" button. */
const COLLAPSED = 5;

function Collapsible<T>({
  items,
  noun,
  children,
}: {
  items: readonly T[];
  noun: string;
  children: (shown: readonly T[]) => React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, COLLAPSED);
  return (
    <>
      {children(shown)}
      {items.length > COLLAPSED ? (
        <Button
          variant="plain"
          size="small"
          label={all ? 'Show fewer' : `Show all ${items.length} ${noun}`}
          onPress={() => setAll(!all)}
        />
      ) : null}
    </>
  );
}

export function Todos({ view, ctx }: { view: TodosView; ctx: Ctx }) {
  const { colors, spacing } = useTheme();
  const [text, setText] = useState('');
  const add = () => {
    if (ctx.apply(addTodoTask(ctx.content, text, ctx.now))) {
      haptics.success();
      setText('');
    } else haptics.error();
  };
  return (
    <>
      {view.rows.length === 0 ? (
        <EmptyLine>All clear. Nothing to do.</EmptyLine>
      ) : (
        <Rows>
          {view.rows.map((r) => {
            const done = r.status === 'done' || r.status === 'rejected';
            const due = dueBadge(r, ctx.now);
            return (
              <ItemRow
                key={r.id}
                trailing={
                  due ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      {due.repeat ? (
                        <Icon
                          name="repeat"
                          size={14}
                          color={colors.secondaryLabel}
                          accessibilityLabel={`Repeats ${due.repeat}`}
                        />
                      ) : null}
                      <Badge tone={due.tone} label={due.label} />
                    </View>
                  ) : undefined
                }
                testID={`todo-${r.index}`}
                role="checkbox"
                checked={done}
                title={r.text}
                done={done}
                subtitle={r.milestone}
                leading={<CheckCircle on={done} />}
                onPress={() => {
                  if (ctx.apply(toggleTodo(ctx.content, r.index, ctx.now))) {
                    if (done) haptics.light();
                    else haptics.success();
                  }
                }}
              />
            );
          })}
        </Rows>
      )}
      <QuickAdd
        label="New task"
        placeholder="What needs doing?"
        value={text}
        onChangeText={setText}
        onSubmit={add}
        addLabel="Add task"
      />
    </>
  );
}

export function Habit({ view, ctx }: { view: HabitView; ctx: Ctx }) {
  const { colors, spacing } = useTheme();
  return (
    <>
      <StatRow>
        <Stat label="Streak" value={String(view.currentStreak)} unit="days" />
        <Stat label="Total" value={String(view.totalCount)} unit="check-ins" />
      </StatRow>
      <View
        accessible
        accessibilityLabel={`Last seven days, ${view.strip.filter((d) => d.reached).length} reached`}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: spacing.xs,
        }}
      >
        {view.strip.map((d) => (
          <View key={d.date} style={{ alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: d.reached ? colors.accentFill : colors.fill,
                borderWidth: d.isToday && !d.reached ? 2 : 0,
                borderColor: colors.accent,
              }}
            >
              {d.reached ? (
                <Icon name="check" size={16} color={colors.onAccentFill} weight="bold" />
              ) : null}
            </View>
            <Text
              variant="caption2"
              tone={d.isToday ? 'accent' : 'secondary'}
              weight={d.isToday ? '700' : '500'}
            >
              {dayLetter(d.date)}
            </Text>
          </View>
        ))}
      </View>
      <Button
        fullWidth
        variant={view.checkedInToday ? 'tinted' : 'filled'}
        icon={view.checkedInToday ? undefined : 'check'}
        label={view.checkedInToday ? 'Undo check-in' : 'Check in today'}
        onPress={() => {
          if (ctx.apply(toggleHabitToday(ctx.content, ctx.now))) {
            if (view.checkedInToday) haptics.light();
            else haptics.success();
          }
        }}
      />
    </>
  );
}

export function Timer({ view, ctx }: { view: TimerView; ctx: Ctx }) {
  const running = view.state === 'running';
  return (
    <>
      <View style={{ gap: 2 }}>
        <Text variant="largeTitle" mono style={{ fontVariant: ['tabular-nums'] }}>
          {running ? formatElapsed(view.elapsedSeconds) : '0:00:00'}
        </Text>
        <Text variant="subheadline" tone="secondary">
          {running ? `Running since ${view.since}` : 'Not running'}
        </Text>
      </View>
      <StatRow>
        <Stat label="Today" value={minutes(view.todayMinutes)} />
      </StatRow>
      <Button
        fullWidth
        variant={running ? 'tinted' : 'filled'}
        label={running ? 'Clock out' : 'Clock in'}
        onPress={() => {
          if (ctx.apply(running ? clockOut(ctx.content, ctx.now) : clockIn(ctx.content, ctx.now))) {
            haptics.medium();
          }
        }}
      />
    </>
  );
}

export function Events({ rows, ctx }: { rows: EventRow[]; ctx: Ctx }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const form = useDisclosure();
  const { colors } = useTheme();
  const save = () => {
    if (ctx.apply(addEvent(ctx.content, { name, startDate: date }))) {
      haptics.success();
      setName('');
      setDate('');
      form.hide();
    } else haptics.error();
  };
  return (
    <>
      {rows.length === 0 ? (
        <EmptyLine>No upcoming events.</EmptyLine>
      ) : (
        <Rows>
          {rows.map((r) => (
            <ItemRow
              key={`${r.date}-${r.name}`}
              title={r.name}
              subtitle={r.turns ? `${r.date}, turns ${r.turns}` : r.date}
              leading={
                <Icon
                  name={r.kind === 'birthday' ? 'star' : 'calendar'}
                  size={20}
                  color={colors.accent}
                />
              }
              trailing={
                <Text variant="subheadline" tone="secondary">
                  {r.label}
                </Text>
              }
            />
          ))}
        </Rows>
      )}
      {form.open ? (
        <>
          <TextField
            label="Event name"
            value={name}
            onChangeText={setName}
            autoCapitalize="sentences"
            returnKeyType="next"
          />
          <TextField
            label="Event date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-12-24"
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Save event" size="medium" onPress={save} />
            <Button label="Cancel" size="medium" variant="plain" onPress={form.hide} />
          </View>
        </>
      ) : (
        <Button label="Add event" icon="add" size="medium" variant="tinted" onPress={form.show} />
      )}
    </>
  );
}

export function ActionLog({ view, ctx }: { view: ActionLogView; ctx: Ctx }) {
  const [text, setText] = useState('');
  const { colors } = useTheme();
  const submit = () => {
    if (ctx.apply(logAction(ctx.content, text, ctx.now))) {
      haptics.success();
      setText('');
    } else haptics.error();
  };
  return (
    <>
      {view.entries.length === 0 ? (
        <EmptyLine>Nothing logged yet.</EmptyLine>
      ) : (
        <Rows>
          {view.entries.map((e) => (
            <ItemRow
              key={`${e.timestamp}-${e.description}`}
              title={e.description}
              subtitle={e.timestamp}
              leading={<Icon name="check" size={18} color={colors.success} />}
            />
          ))}
        </Rows>
      )}
      <QuickAdd
        label="What did you do?"
        placeholder="Ran 5k"
        value={text}
        onChangeText={setText}
        onSubmit={submit}
        addLabel="Log action"
      />
    </>
  );
}

export function Clocks({ clocks }: { clocks: WorldClock[] }) {
  if (clocks.length === 0) return <EmptyLine>No time zones configured.</EmptyLine>;
  return (
    <Rows>
      {clocks.map((c) => (
        <ItemRow
          key={c.id}
          title={c.name}
          subtitle={`${c.date}, UTC${c.offset}`}
          trailing={
            <Text variant="title3" mono style={{ fontVariant: ['tabular-nums'] }}>
              {c.time}
            </Text>
          }
        />
      ))}
    </Rows>
  );
}

export function ReadLater({ view, ctx }: { view: ReadLaterView; ctx: Ctx }) {
  const [url, setUrl] = useState('');
  const save = () => {
    if (ctx.apply(addReadLaterUrl(ctx.content, url, ctx.now))) {
      haptics.success();
      setUrl('');
    } else haptics.error();
  };
  return (
    <>
      {view.unread.length === 0 ? (
        <EmptyLine>Nothing waiting to be read.</EmptyLine>
      ) : (
        <Rows>
          {view.unread.map((i) => (
            <ItemRow
              key={i.id}
              testID={`read-${i.id}`}
              title={i.name}
              role="checkbox"
              checked={false}
              label={`Mark ${i.name} as read`}
              leading={<CheckCircle on={false} />}
              onPress={() => {
                if (ctx.apply(markReadLaterRead(ctx.content, i.id, ctx.now))) haptics.success();
              }}
            />
          ))}
        </Rows>
      )}
      {view.read.length > 0 ? (
        <>
          <Text
            variant="footnote"
            tone="secondary"
            weight="600"
            style={{ textTransform: 'uppercase' }}
          >
            {`Read (${view.read.length})`}
          </Text>
          <Rows>
            {view.read.map((i) => (
              <ItemRow key={i.id} title={i.name} done leading={<CheckCircle on />} />
            ))}
          </Rows>
        </>
      ) : null}
      <QuickAdd
        label="Page URL"
        placeholder="https://"
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
        onSubmit={save}
        addLabel="Save page"
      />
      {view.read.length > 0 ? (
        <Button
          label="Clear read"
          size="small"
          variant="plain"
          onPress={() => ctx.apply(clearReadLater(ctx.content))}
        />
      ) : null}
    </>
  );
}

export function Bookmarks({ initial, ctx }: { initial: BookmarksView; ctx: Ctx }) {
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const { colors } = useTheme();
  // The tile's own view is unfiltered; searching re-derives it from the file text.
  const view = query.trim() ? bookmarksView(ctx.content, { text: query }, ctx.now) : initial;
  const save = () => {
    if (ctx.apply(addBookmarkEntry(ctx.content, { url }, ctx.now))) {
      haptics.success();
      setUrl('');
    } else haptics.error();
  };
  return (
    <>
      <TextField
        label="Search bookmarks"
        value={query}
        onChangeText={setQuery}
        placeholder="Title or address"
        returnKeyType="search"
      />
      {view.bookmarks.length === 0 ? (
        <EmptyLine>{query.trim() ? 'No bookmarks match.' : 'No bookmarks yet.'}</EmptyLine>
      ) : (
        <Collapsible items={view.bookmarks} noun="bookmarks">
          {(shown) => (
            <Rows>
              {shown.map((b) => (
                <ItemRow
                  key={b.id}
                  testID={`bookmark-${b.id}`}
                  title={b.title}
                  subtitle={hostOf(b.url)}
                  leading={
                    <Icon name={b.pinned ? 'star' : 'bookmark'} size={20} color={colors.accent} />
                  }
                  trailing={
                    <Icon
                      name="chevronRight"
                      size={14}
                      color={colors.tertiaryLabel}
                      weight="semibold"
                    />
                  }
                  onPress={() => void Linking.openURL(b.url).catch(() => {})}
                  actions={[
                    {
                      label: 'Delete bookmark',
                      destructive: true,
                      onPress: () => {
                        if (ctx.apply(deleteBookmarkEntry(ctx.content, b.id, ctx.now)))
                          haptics.warning();
                      },
                    },
                  ]}
                />
              ))}
            </Rows>
          )}
        </Collapsible>
      )}
      <QuickAdd
        label="Bookmark URL"
        placeholder="https://"
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
        onSubmit={save}
        addLabel="Add bookmark"
      />
    </>
  );
}

export function Budget({ view }: { view: BudgetView }) {
  const top = view.categories.slice(0, 5);
  const max = Math.max(1, ...top.map((c) => c.value));
  return (
    <>
      <StatRow>
        <Stat label="Income" value={num(view.income)} />
        <Stat label="Spending" value={num(view.spending)} />
        <Stat label="Net" value={signed(view.net)} tone={view.net < 0 ? 'danger' : 'success'} />
      </StatRow>
      {top.length > 0 ? (
        <View style={{ gap: 12, paddingTop: 4 }}>
          <Text
            variant="footnote"
            tone="secondary"
            weight="600"
            style={{ textTransform: 'uppercase' }}
          >
            Top spending
          </Text>
          {top.map((c) => (
            <View key={c.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="subheadline">{c.id}</Text>
                </View>
                <Text
                  variant="subheadline"
                  mono
                  tone="secondary"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {num(c.value)}
                </Text>
              </View>
              <Meter value={c.value / max} label={`${c.id} spending`} />
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

export function Consumption({ meters }: { meters: ConsumptionMeter[] }) {
  if (meters.length === 0) return <EmptyLine>No meters yet.</EmptyLine>;
  return (
    <View style={{ gap: 16 }}>
      {meters.map((m) => (
        <View key={m.key} style={{ gap: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="headline">{m.title}</Text>
            </View>
            <Text variant="title3" mono style={{ fontVariant: ['tabular-nums'] }}>
              {`${num(m.latestReading)} ${m.unit}`}
            </Text>
          </View>
          {m.targetProgress !== null ? (
            <>
              <Meter value={m.targetProgress} label={`${m.title} yearly target`} />
              <Text variant="footnote" tone="secondary">
                {`${Math.round(m.targetProgress * 100)}% of yearly target`}
              </Text>
            </>
          ) : m.lastPeriodUse !== null ? (
            <Text variant="footnote" tone="secondary">
              {`${num(m.lastPeriodUse)} ${m.unit} since last reading`}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function Collection({ view }: { view: DataCollectionView }) {
  if (view.series.length === 0) return <EmptyLine>No numeric columns yet.</EmptyLine>;
  return (
    <Rows>
      {view.series.map((s) => (
        <ItemRow
          key={s.column}
          title={s.column}
          subtitle={`${num(s.min)} to ${num(s.max)}, avg ${num(s.average)}`}
          trailing={
            <Text variant="title3" mono style={{ fontVariant: ['tabular-nums'] }}>
              {`${num(s.latest)} ${s.unit}`.trim()}
            </Text>
          }
        />
      ))}
    </Rows>
  );
}

export function Templates({
  view,
  ctx,
  kind,
}: {
  view: TemplatesView;
  ctx: Ctx;
  kind: 'prompt' | 'command';
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const form = useDisclosure();
  const save = () => {
    const result =
      kind === 'prompt'
        ? addPromptEntry(ctx.content, title, body)
        : addCommandEntry(ctx.content, title, body);
    if (ctx.apply(result)) {
      haptics.success();
      setTitle('');
      setBody('');
      form.hide();
    } else haptics.error();
  };
  return (
    <>
      {view.rows.length === 0 ? (
        <EmptyLine>{`No ${kind}s yet.`}</EmptyLine>
      ) : (
        <Rows>
          {view.rows.map((r) => (
            <TemplateItem key={r.title} row={r} />
          ))}
        </Rows>
      )}
      {form.open ? (
        <>
          <TextField
            label={`New ${kind} title`}
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            returnKeyType="next"
          />
          <TextField label={`New ${kind} text`} value={body} onChangeText={setBody} multiline />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={`Save ${kind}`} size="medium" onPress={save} />
            <Button label="Cancel" size="medium" variant="plain" onPress={form.hide} />
          </View>
        </>
      ) : (
        <Button
          label={`Add ${kind}`}
          icon="add"
          size="medium"
          variant="tinted"
          onPress={form.show}
        />
      )}
    </>
  );
}

function TemplateItem({ row }: { row: TemplateRow }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const { colors, spacing, shape } = useTheme();
  const missing = missingParameters(row, values);
  return (
    <View>
      <ItemRow
        title={row.title}
        subtitle={
          row.parameters.length > 0 ? `Needs ${row.parameters.join(', ')}` : 'No parameters'
        }
        expanded={open}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {row.tags.slice(0, 2).map((t) => (
              <Badge key={t} tone="neutral" label={t} />
            ))}
            <Icon
              name={open ? 'chevronDown' : 'chevronRight'}
              size={14}
              color={colors.tertiaryLabel}
              weight="semibold"
            />
          </View>
        }
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <View style={{ gap: spacing.sm, paddingBottom: spacing.md }}>
          {row.parameters.map((p) => (
            <TextField
              key={p}
              label={`${row.title}: ${p}`}
              value={values[p] ?? ''}
              onChangeText={(v) => setValues({ ...values, [p]: v })}
            />
          ))}
          <View
            testID={`preview-${row.title}`}
            style={{ backgroundColor: colors.fill, borderRadius: shape.md, padding: spacing.md }}
          >
            <Text variant="footnote" mono>
              {interpolateTemplate(row.template, values)}
            </Text>
          </View>
          {missing.length > 0 ? (
            <Text variant="footnote" tone="secondary">{`Missing: ${missing.join(', ')}`}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
