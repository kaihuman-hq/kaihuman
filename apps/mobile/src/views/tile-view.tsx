import { useState } from 'react';
import { View } from 'react-native';
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
  type StocksView,
  type TemplateRow,
  type TemplatesView,
  type TileView as TileData,
  type TileResult,
  type TimerView,
  type TodosView,
  toggleHabitToday,
  toggleTodo,
  type WorldClock,
} from '../components/widgets/tile-controllers.js';
import { Body, Button, Card, Field, Muted, Row, Title } from './primitives.js';

export interface TileProps {
  path: string;
  tile: TileData;
  /** The file's current text; actions compute the next text from it. */
  content: string;
  now: Date;
  /** Persists the file's new text. */
  onWrite: (path: string, content: string) => void | Promise<void>;
}

type Ctx = Pick<TileProps, 'path' | 'content' | 'now'> & {
  /** Writes a mutator's result and shows its error, if it was rejected. */
  apply: (result: string | TileResult) => void;
  error: string | null;
};

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const num = (n: number, digits = 2) => n.toFixed(digits);

const Err = ({ error }: { error: string | null }) =>
  error ? (
    <View accessibilityRole="alert">
      <Body>{error}</Body>
    </View>
  ) : null;

/** One dashboard tile: a switch over every tile kind, each with its actions. */
export function Tile({ path, tile, content, now, onWrite }: TileProps) {
  const [error, setError] = useState<string | null>(null);
  const apply = (result: string | TileResult) => {
    if (typeof result === 'string') {
      setError(null);
      void onWrite(path, result);
    } else if (result.ok) {
      setError(null);
      void onWrite(path, result.content);
    } else {
      setError(result.error);
    }
  };
  const ctx: Ctx = { path, content, now, apply, error };
  return (
    <Card>
      <View testID={`tile-${tile.kind}`}>
        <Title>{nameOf(path)}</Title>
        <TileBody tile={tile} ctx={ctx} />
        <Err error={error} />
      </View>
    </Card>
  );
}

function TileBody({ tile, ctx }: { tile: TileData; ctx: Ctx }) {
  switch (tile.kind) {
    case 'todos':
      return <Todos view={tile.view} ctx={ctx} />;
    case 'habit':
      return <Habit view={tile.view} ctx={ctx} />;
    case 'timetracking':
      return <Timer view={tile.view} ctx={ctx} />;
    case 'events':
      return <Events rows={tile.view} ctx={ctx} />;
    case 'actionlog':
      return <ActionLog view={tile.view} ctx={ctx} />;
    case 'timezones':
      return <Clocks clocks={tile.view} />;
    case 'readitlater':
      return <ReadLater view={tile.view} ctx={ctx} />;
    case 'bookmarks':
      return <Bookmarks initial={tile.view} ctx={ctx} />;
    case 'budget':
      return <Budget view={tile.view} />;
    case 'stocks':
      return <Stocks view={tile.view} />;
    case 'consumption':
      return <Consumption meters={tile.view} />;
    case 'datacollection':
      return <Collection view={tile.view} />;
    case 'prompts':
      return <Templates view={tile.view} ctx={ctx} kind="prompt" />;
    case 'commands':
      return <Templates view={tile.view} ctx={ctx} kind="command" />;
    default: {
      const unhandled: never = tile;
      return unhandled;
    }
  }
}

function Todos({ view, ctx }: { view: TodosView; ctx: Ctx }) {
  const [text, setText] = useState('');
  return (
    <>
      <Muted>{`${view.openCount} open`}</Muted>
      {view.rows.map((r) => (
        <Button
          key={r.id}
          testID={`todo-${r.index}`}
          label={`${r.status === 'done' || r.status === 'rejected' ? '[x]' : '[ ]'} ${r.text}`}
          onPress={() => ctx.apply(toggleTodo(ctx.content, r.index, ctx.now))}
        />
      ))}
      <Field label="New task" value={text} onChangeText={setText} />
      <Button
        label="Add task"
        onPress={() => {
          ctx.apply(addTodoTask(ctx.content, text, ctx.now));
          setText('');
        }}
      />
    </>
  );
}

function Habit({ view, ctx }: { view: HabitView; ctx: Ctx }) {
  return (
    <>
      <Body>{`Streak ${view.currentStreak} days, ${view.totalCount} total`}</Body>
      <Row>
        {view.strip.map((d) => (
          <Muted key={d.date}>{d.reached ? 'x' : '.'}</Muted>
        ))}
      </Row>
      <Button
        label={view.checkedInToday ? 'Undo check-in' : 'Check in today'}
        onPress={() => ctx.apply(toggleHabitToday(ctx.content, ctx.now))}
      />
    </>
  );
}

function Timer({ view, ctx }: { view: TimerView; ctx: Ctx }) {
  const running = view.state === 'running';
  return (
    <>
      <Body>{running ? `Running ${formatElapsed(view.elapsedSeconds)}` : 'Not running'}</Body>
      <Muted>{`Today ${Math.round(view.todayMinutes)} min`}</Muted>
      <Button
        label={running ? 'Clock out' : 'Clock in'}
        onPress={() =>
          ctx.apply(running ? clockOut(ctx.content, ctx.now) : clockIn(ctx.content, ctx.now))
        }
      />
    </>
  );
}

function Events({ rows, ctx }: { rows: EventRow[]; ctx: Ctx }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  return (
    <>
      {rows.map((r) => (
        <Body key={`${r.date}-${r.name}`}>{`${r.name} - ${r.label}`}</Body>
      ))}
      <Field label="Event name" value={name} onChangeText={setName} />
      <Field label="Event date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <Button
        label="Add event"
        onPress={() => ctx.apply(addEvent(ctx.content, { name, startDate: date }))}
      />
    </>
  );
}

function ActionLog({ view, ctx }: { view: ActionLogView; ctx: Ctx }) {
  const [text, setText] = useState('');
  return (
    <>
      {view.entries.map((e) => (
        <Body key={`${e.timestamp}-${e.description}`}>{e.description}</Body>
      ))}
      <Field label="What did you do?" value={text} onChangeText={setText} />
      <Button
        label="Log action"
        onPress={() => {
          ctx.apply(logAction(ctx.content, text, ctx.now));
          setText('');
        }}
      />
    </>
  );
}

function Clocks({ clocks }: { clocks: WorldClock[] }) {
  return (
    <>
      {clocks.map((c) => (
        <Body key={c.id}>{`${c.name} ${c.time} (${c.offset})`}</Body>
      ))}
    </>
  );
}

function ReadLater({ view, ctx }: { view: ReadLaterView; ctx: Ctx }) {
  const [url, setUrl] = useState('');
  return (
    <>
      {view.unread.map((i) => (
        <Row key={i.id}>
          <Body>{i.name}</Body>
          <Button
            label="Mark read"
            testID={`read-${i.id}`}
            onPress={() => ctx.apply(markReadLaterRead(ctx.content, i.id, ctx.now))}
          />
        </Row>
      ))}
      {view.read.map((i) => (
        <Muted key={i.id}>{`${i.name} (read)`}</Muted>
      ))}
      <Field label="Page URL" value={url} onChangeText={setUrl} />
      <Button
        label="Save page"
        onPress={() => {
          ctx.apply(addReadLaterUrl(ctx.content, url, ctx.now));
          setUrl('');
        }}
      />
      <Button label="Clear read" onPress={() => ctx.apply(clearReadLater(ctx.content))} />
    </>
  );
}

function Bookmarks({ initial, ctx }: { initial: BookmarksView; ctx: Ctx }) {
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  // The tile's own view is unfiltered; searching re-derives it from the file text.
  const view = query.trim() ? bookmarksView(ctx.content, { text: query }, ctx.now) : initial;
  return (
    <>
      <Field label="Search bookmarks" value={query} onChangeText={setQuery} />
      {view.bookmarks.map((b) => (
        <Row key={b.id}>
          <Body>{b.title}</Body>
          <Button
            label="Delete"
            testID={`delete-${b.id}`}
            onPress={() => ctx.apply(deleteBookmarkEntry(ctx.content, b.id, ctx.now))}
          />
        </Row>
      ))}
      <Field label="Bookmark URL" value={url} onChangeText={setUrl} />
      <Button
        label="Add bookmark"
        onPress={() => {
          ctx.apply(addBookmarkEntry(ctx.content, { url }, ctx.now));
          setUrl('');
        }}
      />
    </>
  );
}

function Budget({ view }: { view: BudgetView }) {
  return (
    <>
      <Body>{`Income ${num(view.income)}`}</Body>
      <Body>{`Spending ${num(view.spending)}`}</Body>
      <Body>{`Net ${num(view.net)}`}</Body>
      {view.categories.slice(0, 5).map((c) => (
        <Muted key={c.id}>{`${c.id} ${num(c.value)}`}</Muted>
      ))}
    </>
  );
}

function Stocks({ view }: { view: StocksView | null }) {
  if (!view) return <Muted>No stock data</Muted>;
  return (
    <>
      <Body>{`Value ${num(view.latestValue)}`}</Body>
      <Body>{`Invested ${num(view.invested)}`}</Body>
      <Body>{`Profit ${num(view.profit)} (${num(view.profitPct, 1)}%)`}</Body>
    </>
  );
}

function Consumption({ meters }: { meters: ConsumptionMeter[] }) {
  return (
    <>
      {meters.map((m) => (
        <Body key={m.key}>
          {`${m.title}: ${num(m.latestReading)} ${m.unit}${
            m.targetProgress === null ? '' : ` (${Math.round(m.targetProgress * 100)}% of target)`
          }`}
        </Body>
      ))}
    </>
  );
}

function Collection({ view }: { view: DataCollectionView }) {
  return (
    <>
      <Muted>{`${view.rowCount} rows`}</Muted>
      {view.series.map((s) => (
        <Body key={s.column}>{`${s.column}: ${num(s.latest)} ${s.unit}`}</Body>
      ))}
    </>
  );
}

function Templates({
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
  return (
    <>
      {view.rows.map((r) => (
        <TemplateItem key={r.title} row={r} />
      ))}
      <Field label={`New ${kind} title`} value={title} onChangeText={setTitle} />
      <Field label={`New ${kind} text`} value={body} onChangeText={setBody} multiline />
      <Button
        label={`Add ${kind}`}
        onPress={() =>
          ctx.apply(
            kind === 'prompt'
              ? addPromptEntry(ctx.content, title, body)
              : addCommandEntry(ctx.content, title, body),
          )
        }
      />
    </>
  );
}

function TemplateItem({ row }: { row: TemplateRow }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const missing = missingParameters(row, values);
  return (
    <Card>
      <Body>{row.title}</Body>
      {row.parameters.map((p) => (
        <Field
          key={p}
          label={`${row.title}: ${p}`}
          value={values[p] ?? ''}
          onChangeText={(v) => setValues({ ...values, [p]: v })}
        />
      ))}
      <View testID={`preview-${row.title}`}>
        <Body>{interpolateTemplate(row.template, values)}</Body>
      </View>
      {missing.length > 0 && <Muted>{`Missing: ${missing.join(', ')}`}</Muted>}
    </Card>
  );
}
