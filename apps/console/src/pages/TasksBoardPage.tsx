import { githubFileStore } from '@kaihuman/core';
import {
  addTodoEntry,
  completeTodo,
  dueStatus,
  inboxPathFor,
  parseTodos,
  RESCHEDULE_OPTIONS,
  rescheduleDate,
  serializeTodos,
  setStatus,
  setTodoDue,
  sortTaskRows,
  TASK_SMART_LABELS,
  type TaskBoardView,
  type TaskList,
  type TaskSmartView,
  type TaskSort,
  TODO_COLOR_HEX,
  TODO_COLORS,
  taskBoardCounts,
  taskDueLabel,
  taskListName,
  taskRows,
  withDate,
} from '@kaihuman/formats';
import { StatusBar } from '@kaihuman/ui';
import {
  ArrowLeft,
  ArrowUpDown,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Clock,
  Hash,
  Inbox,
  List,
  Menu,
  MoreHorizontal,
  Repeat,
  Sun,
} from 'lucide-preact';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';

const URL_RE = /https?:\/\/[^\s]+/g;

const withLinks = (text: string) => {
  const parts: (string | JSX.Element)[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer"
        class="underline text-[var(--los-accent)] break-all"
      >
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

// Tags carry no colour in the file format, so each tag gets a stable one from the todo palette.
const tagColor = (tag: string) => {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TODO_COLOR_HEX[TODO_COLORS[h % TODO_COLORS.length] ?? 'sky'];
};

const sameView = (a: TaskBoardView, b: TaskBoardView) => JSON.stringify(a) === JSON.stringify(b);

const SMART_ICONS: Record<TaskSmartView, typeof Sun> = {
  today: Sun,
  week: CalendarDays,
  inbox: Inbox,
  completed: CheckSquare,
};

const RescheduleMenu = ({
  title,
  now,
  onPick,
}: {
  title: string;
  now: number;
  onPick: (date: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const pick = (date: string) => {
    setOpen(false);
    onPick(date);
  };
  const itemClass = 'block w-full text-left px-3 py-1.5 hover:bg-[var(--los-border)]';
  return (
    <fieldset
      class="relative flex m-0 p-0 border-0 min-w-0"
      onFocusOut={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={`Reschedule ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        class="flex text-[var(--los-muted)] hover:text-[var(--los-fg)]"
      >
        <CalendarClock size={14} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Reschedule"
          class="absolute right-0 top-6 z-30 min-w-44 py-1 rounded border border-[var(--los-border)] bg-[var(--los-bg)] shadow-lg text-sm text-[var(--los-fg)]"
        >
          {RESCHEDULE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              class={itemClass}
              onClick={() => pick(rescheduleDate(o.id, now))}
            >
              {o.label}
            </button>
          ))}
          <label class="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--los-border)]">
            <span class="text-xs text-[var(--los-muted)]">Pick date</span>
            <input
              type="date"
              aria-label="Custom due date"
              class="flex-1 min-w-0 bg-transparent text-xs"
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                if (v) pick(v);
              }}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
};

const NavRow = ({
  active,
  onClick,
  icon,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentChildren;
  label: string;
  count?: number;
  dot?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    class={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left ${
      active
        ? 'bg-[var(--los-border)] text-[var(--los-fg)]'
        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]'
    }`}
  >
    <span class="shrink-0 flex">{icon}</span>
    <span class="flex-1 truncate">{label}</span>
    {dot && <span class="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />}
    {count ? <span class="text-xs opacity-70 tabular-nums">{count}</span> : null}
  </button>
);

const SectionLabel = ({ children }: { children: ComponentChildren }) => (
  <div class="px-3 pt-4 pb-1 text-[10px] font-mono uppercase tracking-wider text-[var(--los-muted)] opacity-70">
    {children}
  </div>
);

export const TasksBoardPage = () => {
  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;
  const inboxPath = inboxPathFor(githubFileStore.appFolder.value);

  const [view, setView] = useState<TaskBoardView>({ kind: 'smart', id: 'today' });
  const [sort, setSort] = useState<TaskSort>('due');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) githubFileStore.loadTree();
  }, []);

  const paths = useMemo(() => {
    const all = tree.filter((t) => t.path.endsWith('.todos.md')).map((t) => t.path);
    return [...all.filter((p) => p === inboxPath), ...all.filter((p) => p !== inboxPath).sort()];
  }, [tree, inboxPath]);

  useEffect(() => {
    for (const p of paths) githubFileStore.ensureFresh(p);
  }, [paths]);

  const lists = useMemo<TaskList[]>(
    () =>
      paths
        .filter((p) => openFiles[p]?.content !== undefined)
        .map((p) => {
          const data = parseTodos(openFiles[p]?.content ?? '');
          return {
            path: p,
            name: taskListName(p, inboxPath),
            color: data.color,
            items: data.items,
          };
        }),
    [paths, openFiles, inboxPath],
  );

  const now = Date.now();
  const counts = taskBoardCounts(lists, inboxPath, now);
  const rows = sortTaskRows(taskRows(lists, view, inboxPath, now), sort);

  const title =
    view.kind === 'smart'
      ? TASK_SMART_LABELS[view.id]
      : view.kind === 'tag'
        ? `#${view.tag}`
        : taskListName(view.path, inboxPath);
  const targetPath = view.kind === 'list' ? view.path : inboxPath;
  const targetName = taskListName(targetPath, inboxPath);

  const select = (next: TaskBoardView) => {
    setView(next);
    setSidebarOpen(false);
  };

  const write = async (path: string, content: string) => {
    if (openFiles[path]) {
      githubFileStore.updateFileContent(path, content);
      await githubFileStore.saveFile(path);
    } else {
      await githubFileStore.createFile(path, content);
    }
  };

  const toggle = (path: string, id: string, done: boolean) => {
    const data = parseTodos(openFiles[path]?.content ?? '');
    const index = data.items.findIndex((it) => it.id === id);
    if (index < 0) return;
    const next = done ? setStatus(data, index, 'backlog') : completeTodo(data, id);
    write(path, serializeTodos(next));
  };

  const reschedule = (path: string, id: string, date: string) => {
    const data = parseTodos(openFiles[path]?.content ?? '');
    const item = data.items.find((it) => it.id === id);
    if (!item) return;
    write(path, serializeTodos(setTodoDue(data, id, withDate(item, date))));
  };

  const add = (e: Event) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const tags = view.kind === 'tag' ? [view.tag] : [];
    write(
      targetPath,
      addTodoEntry(openFiles[targetPath]?.content ?? '', { text, tags, position: 'top' }),
    );
    setDraft('');
  };

  const loading = paths.some((p) => openFiles[p]?.content === undefined);

  const sidebar = (
    <nav class="flex flex-col h-full overflow-y-auto py-2" aria-label="Task lists">
      {(['today', 'week', 'inbox'] as const).map((id) => {
        const Icon = SMART_ICONS[id];
        return (
          <NavRow
            key={id}
            active={sameView(view, { kind: 'smart', id })}
            onClick={() => select({ kind: 'smart', id })}
            icon={<Icon size={14} />}
            label={TASK_SMART_LABELS[id]}
            count={counts.smart[id]}
          />
        );
      })}
      <SectionLabel>Lists</SectionLabel>
      {lists
        .filter((l) => l.path !== inboxPath)
        .map((l) => (
          <NavRow
            key={l.path}
            active={sameView(view, { kind: 'list', path: l.path })}
            onClick={() => select({ kind: 'list', path: l.path })}
            icon={<List size={14} />}
            label={l.name}
            count={counts.lists[l.path]}
            dot={l.color && TODO_COLOR_HEX[l.color]}
          />
        ))}
      {counts.tags.length > 0 && <SectionLabel>Tags</SectionLabel>}
      {counts.tags.map(([tag, n]) => (
        <NavRow
          key={tag}
          active={sameView(view, { kind: 'tag', tag })}
          onClick={() => select({ kind: 'tag', tag })}
          icon={<Hash size={14} />}
          label={tag}
          count={n}
          dot={tagColor(tag)}
        />
      ))}
      <div class="mt-auto pt-4 border-t border-[var(--los-border)]">
        <NavRow
          active={sameView(view, { kind: 'smart', id: 'completed' })}
          onClick={() => select({ kind: 'smart', id: 'completed' })}
          icon={<CheckSquare size={14} />}
          label={TASK_SMART_LABELS.completed}
        />
      </div>
    </nav>
  );

  return (
    <>
      <div class="h-[calc(100vh-3rem)] md:h-[calc(100vh-2rem)] w-screen flex bg-[var(--los-bg)] text-[var(--los-fg)] overflow-hidden relative">
        <aside class="hidden md:block w-[200px] shrink-0 border-r border-[var(--los-border)]">
          {sidebar}
        </aside>
        {sidebarOpen && (
          <div class="md:hidden absolute inset-0 z-20 flex">
            <aside class="w-[220px] bg-[var(--los-bg)] border-r border-[var(--los-border)]">
              {sidebar}
            </aside>
            <button
              type="button"
              aria-label="Close lists"
              class="flex-1 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
          </div>
        )}
        <main class="flex-1 min-w-0 flex flex-col">
          <header class="h-12 shrink-0 flex items-center gap-2 px-3 md:px-5 border-b border-[var(--los-border)]">
            <button
              type="button"
              aria-label="Back"
              onClick={() => route('/')}
              class="hidden md:flex text-[var(--los-muted)] hover:text-[var(--los-fg)]"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Show lists"
              onClick={() => setSidebarOpen(true)}
              class="md:hidden text-[var(--los-muted)] hover:text-[var(--los-fg)]"
            >
              <Menu size={18} />
            </button>
            <h1 class="flex-1 truncate text-lg font-semibold">{title}</h1>
            <button
              type="button"
              onClick={() => setSort(sort === 'due' ? 'list' : 'due')}
              title={sort === 'due' ? 'Sorted by due time' : 'Sorted by list'}
              class="flex items-center gap-1 text-xs text-[var(--los-muted)] hover:text-[var(--los-fg)]"
            >
              <ArrowUpDown size={14} />
              {sort === 'due' ? 'Due' : 'List'}
            </button>
            <div class="relative">
              <button
                type="button"
                aria-label="More"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
                class="flex text-[var(--los-muted)] hover:text-[var(--los-fg)]"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div class="absolute right-0 top-7 z-30 min-w-40 py-1 rounded border border-[var(--los-border)] bg-[var(--los-bg)] shadow-lg text-sm">
                  {view.kind === 'list' && (
                    <button
                      type="button"
                      class="block w-full text-left px-3 py-1.5 hover:bg-[var(--los-border)]"
                      onClick={() => route(`/files/${encodeURIComponent(view.path)}`)}
                    >
                      Open list file
                    </button>
                  )}
                  <button
                    type="button"
                    class="block w-full text-left px-3 py-1.5 hover:bg-[var(--los-border)]"
                    onClick={() => route('/board')}
                  >
                    Kanban board
                  </button>
                  <button
                    type="button"
                    class="block w-full text-left px-3 py-1.5 hover:bg-[var(--los-border)]"
                    onClick={() => route('/stream')}
                  >
                    Stream
                  </button>
                </div>
              )}
            </div>
          </header>
          <div class="flex-1 overflow-y-auto px-3 md:px-5">
            {view.kind !== 'smart' || view.id !== 'completed' ? (
              <form onSubmit={add} class="py-3">
                <input
                  type="text"
                  value={draft}
                  onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
                  placeholder={`Add task to "${targetName}"`}
                  aria-label={`Add task to ${targetName}`}
                  class="w-full rounded bg-[var(--los-border)]/40 px-3 py-2 text-sm placeholder:text-[var(--los-muted)] outline-none focus:ring-1 focus:ring-[var(--los-accent)]"
                />
              </form>
            ) : null}
            {loading && rows.length === 0 && (
              <p class="py-6 text-center text-sm text-[var(--los-muted)]">Loading…</p>
            )}
            {!loading && rows.length === 0 && (
              <p class="py-6 text-center text-sm text-[var(--los-muted)]">No tasks</p>
            )}
            <ul class="divide-y divide-[var(--los-border)]">
              {rows.map(({ item, list }) => {
                const done = item.status === 'done';
                const overdue = dueStatus(item, now) === 'overdue';
                const due = taskDueLabel(item, now);
                return (
                  <li key={`${list.path}:${item.id}`} class="flex items-center gap-3 py-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={done}
                      aria-label={done ? `Reopen ${item.text}` : `Complete ${item.text}`}
                      onChange={() => toggle(list.path, item.id, done)}
                      class="shrink-0 w-4 h-4 accent-[var(--los-accent)] cursor-pointer"
                    />
                    <span
                      class={`flex-1 min-w-0 truncate text-sm ${done ? 'line-through text-[var(--los-muted)]' : ''}`}
                    >
                      {withLinks(item.text)}
                    </span>
                    <span class="shrink-0 flex items-center gap-1.5 text-xs text-[var(--los-muted)]">
                      <span class="max-w-24 truncate">{list.name}</span>
                      {item.repeat && <Repeat size={12} aria-label="Repeats" />}
                      {due && (
                        <>
                          <Clock size={12} class={overdue ? 'text-red-500' : ''} />
                          <span
                            data-overdue={overdue || undefined}
                            class={overdue ? 'text-red-500' : 'text-sky-400'}
                          >
                            {due}
                          </span>
                        </>
                      )}
                    </span>
                    {!done && (
                      <RescheduleMenu
                        title={item.text}
                        now={now}
                        onPick={(date) => reschedule(list.path, item.id, date)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </main>
      </div>
      <StatusBar
        mode="BOARD"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/stream')}
      />
    </>
  );
};
