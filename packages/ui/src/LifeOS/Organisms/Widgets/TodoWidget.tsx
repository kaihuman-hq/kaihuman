import {
  getVisibleTodos,
  isTodoView,
  type Milestone,
  migrateLegacyFormat,
  NEXT_STATUS,
  parseTodos,
  STATUS_LABELS,
  serializeTodos,
  setMilestone,
  setPrompt,
  setStatus,
  setTodoDue,
  TODO_VIEW_LABELS,
  TODO_VIEWS,
  type TodoData,
  type TodoItem,
  type TodoStatus,
  type TodoView,
  todoViewCounts,
  todoViewSections,
} from '@kaihuman/formats';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Edit2,
  Eye,
  FileText,
  PlayCircle,
  Plus,
  Trash2,
  X,
  XCircle,
} from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { dueBadge } from '../../Templates/dueView';
import { CompactList, CompactWidgetLayout } from './CompactWidgetLayout';
import { DuePicker } from './DuePicker';
import { RepeatIcon } from './RepeatFields';

export interface TodoWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  className?: string;
  onChange?: (newContent: string) => void;
  onOpenAdd?: () => void;
  /** Opens the full Tasks board; renders a small "Board" link in the header when set. */
  onOpenBoard?: () => void;
  /** Remembers the chosen Today / Tomorrow / Next 7 days / All view per list (e.g. its path). */
  storageKey?: string;
}

const VIEW_STORAGE_PREFIX = 'kh.todo-view.';

const readView = (key?: string): TodoView => {
  if (!key) return 'all';
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_PREFIX + key);
    return isTodoView(stored) ? stored : 'all';
  } catch {
    return 'all';
  }
};

const writeView = (key: string | undefined, view: TodoView) => {
  if (!key) return;
  try {
    localStorage.setItem(VIEW_STORAGE_PREFIX + key, view);
  } catch {
    // Storage can be unavailable (private mode); the view then resets on reload.
  }
};

const EMPTY_VIEW: Record<TodoView, string> = {
  today: 'Nothing due today.',
  tomorrow: 'Nothing due tomorrow.',
  week: 'Nothing due in the next 7 days.',
  all: 'No tasks.',
};

// ─── Status Icons ─────────────────────────────────────────────────────────────

const STATUS_ICON: Record<TodoStatus, { icon: any; className: string }> = {
  backlog: { icon: Circle, className: 'text-[var(--los-muted)]' },
  'in-progress': { icon: PlayCircle, className: 'text-yellow-400' },
  done: { icon: CheckCircle2, className: 'text-[var(--los-accent)]' },
  rejected: { icon: XCircle, className: 'text-red-500' },
};

const ALL_STATUSES: TodoStatus[] = ['backlog', 'in-progress', 'done', 'rejected'];

// ─── StatusBadge ──────────────────────────────────────────────────────────────

const StatusBadge = ({
  status,
  onCycle,
  onPick,
  compact = false,
}: {
  status: TodoStatus;
  onCycle?: () => void;
  onPick?: (s: TodoStatus) => void;
  compact?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const { icon: Icon, className } = STATUS_ICON[status];

  if (!onPick) {
    // Simple cycle mode (SMALL)
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCycle?.();
        }}
        className={cn('shrink-0 transition-colors hover:opacity-80', className)}
        title={STATUS_LABELS[status]}
      >
        <Icon size={compact ? 12 : 14} />
      </button>
    );
  }

  // Dropdown mode (FOCUS)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn('transition-colors hover:opacity-80', className)}
        title={STATUS_LABELS[status]}
      >
        <Icon size={compact ? 12 : 14} />
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: dropdown dismiss on mouse leave
        <div
          className="absolute left-0 top-full mt-1 z-50 bg-[var(--los-bg)] border border-[var(--los-border)] shadow-xl min-w-[140px] flex flex-col"
          onMouseLeave={() => setOpen(false)}
        >
          {ALL_STATUSES.map((s) => {
            const { icon: SIcon, className: sCls } = STATUS_ICON[s];
            return (
              <button
                key={s}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(s);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-white/5 transition-colors text-left',
                  s === status ? 'text-[var(--los-accent)]' : 'text-[var(--los-fg)]',
                )}
              >
                <SIcon size={12} className={sCls} />
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── AnimatingTodoItem ────────────────────────────────────────────────────────

const AnimatingTodoItem = ({ text, status }: { text: string; status: TodoStatus }) => {
  const [phase, setPhase] = useState<'show' | 'exit'>('show');

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setTimeout(() => setPhase('exit'), 120);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const { icon: Icon, className: iconClass } = STATUS_ICON[status];

  return (
    <div
      className={cn(
        'border-b border-[var(--los-border)] px-1 py-2 transition-all duration-500',
        phase === 'exit' ? 'opacity-0 translate-x-6' : 'opacity-100 translate-x-0',
      )}
    >
      <div className="flex items-start gap-2">
        <Icon size={12} className={cn(iconClass, 'mt-0.5 shrink-0')} />
        <MonoText className="text-xs break-words leading-relaxed opacity-40 line-through">
          {text}
        </MonoText>
      </div>
    </div>
  );
};

// ─── Prompt Accordion ────────────────────────────────────────────────────────

const PromptSection = ({
  item,
  onSave,
}: {
  item: TodoItem;
  onSave: (lines: string[], refFile?: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => (item.prompt?.lines ?? []).join('\n'));
  const [ref, setRef] = useState(item.prompt?.refFile ?? '');
  const [copied, setCopied] = useState(false);

  const hasPrompt = (item.prompt?.lines.length ?? 0) > 0 || !!item.prompt?.refFile;

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    const fullText = [
      ...(item.prompt?.lines ?? []),
      item.prompt?.refFile ? `ref: ${item.prompt.refFile}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = (e: MouseEvent) => {
    e.stopPropagation();
    onSave(
      text.split('\n').filter((l) => l.trim()),
      ref.trim() || undefined,
    );
    setEditing(false);
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'flex items-center gap-1 text-[10px] font-mono transition-colors',
          hasPrompt
            ? 'text-[var(--los-accent)] hover:opacity-80'
            : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
        )}
      >
        <FileText size={10} />
        {hasPrompt ? 'PROMPT' : 'ADD PROMPT'}
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation wrapper
        // biome-ignore lint/a11y/noStaticElementInteractions: stop propagation wrapper
        <div
          className="mt-2 pl-3 border-l border-[var(--los-border)] space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          {editing ? (
            <>
              <textarea
                className="w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] text-xs font-mono p-2 outline-none resize-y min-h-[80px] text-[var(--los-fg)]"
                value={text}
                onInput={(e) => setText(e.currentTarget.value)}
                placeholder="Write the AI prompt here..."
              />
              <input
                type="text"
                className="w-full bg-transparent border-b border-[var(--los-border)] focus:border-[var(--los-accent)] text-[10px] font-mono py-1 outline-none text-[var(--los-muted)]"
                value={ref}
                onInput={(e) => setRef(e.currentTarget.value)}
                placeholder="ref: path/to/prompts.md (optional)"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="text-[10px] font-mono px-2 py-0.5 bg-[var(--los-accent)] text-black hover:opacity-90"
                >
                  SAVE
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(false);
                  }}
                  className="text-[10px] font-mono px-2 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                >
                  CANCEL
                </button>
              </div>
            </>
          ) : (
            <>
              {(item.prompt?.lines ?? []).map((line) => (
                <p key={line} className="text-xs text-[var(--los-fg)] leading-relaxed">
                  {line}
                </p>
              ))}
              {item.prompt?.refFile && (
                <p className="text-[10px] text-[var(--los-muted)]">ref: {item.prompt.refFile}</p>
              )}
              {!hasPrompt && (
                <p className="text-[10px] text-[var(--los-muted)] italic">No prompt yet.</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(true);
                    setText((item.prompt?.lines ?? []).join('\n'));
                    setRef(item.prompt?.refFile ?? '');
                  }}
                  className="text-[10px] font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)] border-b border-transparent hover:border-[var(--los-muted)]"
                >
                  EDIT
                </button>
                {hasPrompt && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[10px] font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                  >
                    {copied ? <Check size={10} /> : <Copy size={10} />}
                    {copied ? 'COPIED' : 'COPY'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── MilestonePicker ─────────────────────────────────────────────────────────

const MilestonePicker = ({
  milestoneId,
  milestones,
  onChange,
}: {
  milestoneId?: string;
  milestones: Milestone[];
  onChange: (id: string | undefined) => void;
}) => {
  const [open, setOpen] = useState(false);
  const current = milestones.find((m) => m.id === milestoneId);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'text-[9px] font-mono border px-1 py-0.5 transition-colors',
          current
            ? 'text-[var(--los-accent)] border-[var(--los-accent)]/30 hover:border-[var(--los-accent)]'
            : 'text-[var(--los-muted)] border-[var(--los-border)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)]',
        )}
        title="Assign milestone"
      >
        {current ? `!${current.id}` : '+ MS'}
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: dropdown dismiss on mouse leave
        <div
          className="absolute right-0 top-full mt-1 z-50 bg-[var(--los-bg)] border border-[var(--los-border)] shadow-xl min-w-[160px] flex flex-col"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            key="__none__"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(undefined);
              setOpen(false);
            }}
            className={cn(
              'flex items-center px-3 py-2 text-xs font-mono hover:bg-white/5 transition-colors text-left',
              !milestoneId ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]',
            )}
          >
            — none —
          </button>
          {milestones.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(m.id);
                setOpen(false);
              }}
              className={cn(
                'flex flex-col px-3 py-2 text-xs font-mono hover:bg-white/5 transition-colors text-left',
                m.id === milestoneId ? 'text-[var(--los-accent)]' : 'text-[var(--los-fg)]',
              )}
            >
              <span>!{m.id}</span>
              {m.dueDate && <span className="text-[9px] text-[var(--los-muted)]">{m.dueDate}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── MilestoneManager ────────────────────────────────────────────────────────

const MilestoneManager = ({
  milestones,
  onChange,
}: {
  milestones: Milestone[];
  onChange: (milestones: Milestone[]) => void;
}) => {
  const [open, setOpen] = useState(milestones.length > 0);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');

  const genId = (name: string) =>
    `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20)}-${Date.now().toString(36).slice(-4)}`;

  const handleAdd = () => {
    if (!newName.trim()) return;
    const ms: Milestone = {
      id: genId(newName),
      name: newName.trim(),
      ...(newDate ? { dueDate: newDate } : {}),
    };
    onChange([...milestones, ms]);
    setNewName('');
    setNewDate('');
  };

  const handleUpdateDate = (id: string) => {
    onChange(milestones.map((m) => (m.id === id ? { ...m, dueDate: editDate || undefined } : m)));
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    onChange(milestones.filter((m) => m.id !== id));
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mb-3 px-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        MILESTONES{milestones.length > 0 ? ` (${milestones.length})` : ''}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 pl-2 border-l border-[var(--los-border)]">
          {milestones.map((m) => {
            const overdue = m.dueDate && m.dueDate < today;
            return (
              <div
                key={m.id}
                className="flex items-center gap-2 py-1 border border-[var(--los-border)] px-2 text-xs font-mono"
              >
                <span className="text-[var(--los-accent)] shrink-0 text-[10px]">!{m.id}</span>
                <span className="flex-1 min-w-0 truncate text-[var(--los-fg)]">{m.name}</span>
                {editingId === m.id ? (
                  <>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.currentTarget.value)}
                      className="bg-transparent border-b border-[var(--los-accent)] text-[10px] outline-none text-[var(--los-fg)] w-28"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateDate(m.id)}
                      className="text-[var(--los-accent)] hover:opacity-80 shrink-0"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-[var(--los-muted)] hover:text-[var(--los-fg)] shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className={cn(
                        'text-[10px] shrink-0',
                        overdue ? 'text-red-400' : 'text-[var(--los-muted)]',
                      )}
                    >
                      {m.dueDate ?? '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditDate(m.dueDate ?? '');
                      }}
                      className="text-[var(--los-muted)] hover:text-[var(--los-fg)] shrink-0"
                      title="Edit due date"
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      className="text-red-500/50 hover:text-red-500 shrink-0"
                      title="Delete milestone"
                    >
                      <Trash2 size={10} />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Add new milestone */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newName}
              onInput={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Name"
              className="flex-1 min-w-0 bg-transparent border-b border-[var(--los-border)] focus:border-[var(--los-accent)] text-[10px] font-mono outline-none text-[var(--los-fg)] placeholder-[var(--los-muted)] py-0.5"
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.currentTarget.value)}
              className="bg-transparent border-b border-[var(--los-border)] focus:border-[var(--los-accent)] text-[10px] font-mono outline-none text-[var(--los-fg)] w-28 py-0.5"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="text-[var(--los-accent)] hover:opacity-80 disabled:opacity-30 shrink-0"
              title="Add milestone"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Widget ──────────────────────────────────────────────────────────────

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ANIM_DURATION_MS = 700;

/** Due/overdue badge plus the recurrence icon of an item; renders nothing without either. */
const DueMarks = ({
  item,
  className,
  onSetDue,
  showAdd = false,
}: {
  item: TodoItem;
  className?: string;
  /** Makes the badge (or an "+ DUE" chip) open the quick picks; `''` clears the date. */
  onSetDue?: (date: string) => void;
  /** Shows the "+ DUE" chip permanently instead of on hover only. */
  showAdd?: boolean;
}) => {
  const badge = dueBadge(item);
  const open = item.status === 'backlog' || item.status === 'in-progress';
  const picker = onSetDue && open;
  if (!badge && !(item.repeat && item.dueDate) && !picker) return null;
  const badgeEl = badge && (
    <span className={cn('text-[9px] font-mono border px-1', badge.className)}>{badge.label}</span>
  );
  return (
    <span className={cn('inline-flex items-center gap-1 shrink-0', className)}>
      {picker ? (
        <DuePicker
          value={item.dueDate ?? ''}
          onChange={onSetDue}
          className={cn(
            !badge && !showAdd && 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          {badgeEl}
        </DuePicker>
      ) : (
        badgeEl
      )}
      {item.repeat && item.dueDate && <RepeatIcon repeat={item.repeat} />}
    </span>
  );
};

export const TodoWidget = ({
  content,
  mode,
  className,
  onChange,
  onOpenAdd,
  onOpenBoard,
  storageKey,
}: TodoWidgetProps) => {
  const data: TodoData = useMemo(() => parseTodos(content), [content]);
  const [view, setViewState] = useState<TodoView>(() => readView(storageKey));
  useEffect(() => setViewState(readView(storageKey)), [storageKey]);
  const setView = (next: TodoView) => {
    setViewState(next);
    writeView(storageKey, next);
  };
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAllInFocus, setShowAllInFocus] = useState(false);
  const [animatingOut, setAnimatingOut] = useState<
    { id: string; text: string; status: TodoStatus }[]
  >([]);

  const displayData = useMemo(() => {
    let base: TodoData;
    if (mode === 'SMALL') {
      // Only backlog/in-progress; done items animate out separately
      base = {
        ...data,
        items: data.items.filter((it) => it.status === 'backlog' || it.status === 'in-progress'),
      };
    } else if (mode === 'MOBILE_EXPANDED' || mode === 'MOBILE_COLLAPSED') {
      base = getVisibleTodos(data);
    } else if (mode === 'FOCUS' && !showAllInFocus) {
      // Show open + done/rejected < 2 hours
      base = getVisibleTodos(data, TWO_HOURS_MS);
    } else {
      base = data;
    }
    if (!activeTag) return base;
    return { ...base, items: base.items.filter((it) => it.tags.includes(activeTag)) };
  }, [data, mode, activeTag, showAllInFocus]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const it of data.items) {
      for (const t of it.tags) tags.add(t);
    }
    return Array.from(tags).sort();
  }, [data]);

  const handleCycleStatus = (index: number) => {
    const item = data.items[index];
    if (!item) return;
    const nextStatus = NEXT_STATUS[item.status];

    // In SMALL mode, animate the item out when it becomes done/rejected
    if (mode === 'SMALL' && (nextStatus === 'done' || nextStatus === 'rejected')) {
      setAnimatingOut((prev) => [...prev, { id: item.id, text: item.text, status: nextStatus }]);
      setTimeout(() => {
        setAnimatingOut((prev) => prev.filter((a) => a.id !== item.id));
      }, ANIM_DURATION_MS);
    }

    const newData = setStatus(data, index, nextStatus);
    onChange?.(serializeTodos(newData));
  };

  const handlePickStatus = (index: number, status: TodoStatus) => {
    const newData = setStatus(data, index, status);
    onChange?.(serializeTodos(newData));
  };

  const handleSetMilestone = (index: number, milestoneId: string | undefined) => {
    const newData = setMilestone(data, index, milestoneId);
    onChange?.(serializeTodos(newData));
  };

  const handleSetPrompt = (index: number, lines: string[], refFile?: string) => {
    const newData = setPrompt(
      data,
      index,
      lines.length > 0 || refFile ? { lines, refFile } : undefined,
    );
    onChange?.(serializeTodos(newData));
  };

  const handleSetDue = (item: TodoItem, date: string) => {
    // A quick pick moves the day and keeps a time already set.
    const due = date ? { date, time: item.dueTime } : undefined;
    onChange?.(serializeTodos(setTodoDue(data, item.id, due)));
  };

  const handleMigrate = () => {
    onChange?.(migrateLegacyFormat(content));
  };

  const handleMilestonesChange = (milestones: Milestone[]) => {
    onChange?.(serializeTodos({ ...data, milestones }));
  };

  const activeCount = data.items.filter(
    (it) => it.status === 'backlog' || it.status === 'in-progress',
  ).length;

  // ── MOBILE_COLLAPSED ──────────────────────────────────────────────────────
  if (mode === 'MOBILE_COLLAPSED') {
    return (
      <div className={cn('flex items-stretch h-full w-full', className)}>
        <div className="flex flex-col items-center justify-center flex-1 p-2 gap-1">
          <MonoHeader className="text-4xl font-bold leading-none">{activeCount}</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-wider">
            OPEN TASKS
          </MonoText>
        </div>
        {onOpenAdd && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAdd();
            }}
            className="flex items-center justify-center w-10 shrink-0 border-l border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] transition-colors font-mono text-lg leading-none"
            title="Add task"
          >
            +
          </button>
        )}
      </div>
    );
  }

  // ── MOBILE_EXPANDED ───────────────────────────────────────────────────────
  if (mode === 'MOBILE_EXPANDED') {
    const topItems = displayData.items
      .filter((it) => it.status === 'backlog' || it.status === 'in-progress')
      .slice(0, 5);
    return (
      <CompactWidgetLayout>
        <div className="flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <MonoHeader className="text-xs text-[var(--los-muted)]">TOP PRIORITIES</MonoHeader>
            {onOpenAdd && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAdd();
                }}
                className="text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-black rounded-sm p-0.5 transition-colors"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
          <MonoText className="text-[10px] text-[var(--los-accent)]">{activeCount} ACTIVE</MonoText>
        </div>
        <CompactList>
          {topItems.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--los-muted)]">
              No active tasks
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {topItems.map((item) => {
                const idx = data.items.indexOf(item);
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 py-2 border-b border-[var(--los-border)] last:border-0 px-1"
                  >
                    <StatusBadge
                      status={item.status}
                      compact
                      onCycle={() => handleCycleStatus(idx)}
                    />
                    <MonoText className="text-xs flex-1 min-w-0 break-words">{item.text}</MonoText>
                    <DueMarks item={item} />
                  </div>
                );
              })}
            </div>
          )}
        </CompactList>
      </CompactWidgetLayout>
    );
  }

  const isEmpty = displayData.items.length === 0 && data.items.length === 0;
  if (isEmpty) {
    return (
      <div
        className={cn(
          'flex flex-col h-full w-full justify-center items-center text-[var(--los-muted)]',
          className,
        )}
      >
        <MonoText>No tasks.</MonoText>
      </div>
    );
  }

  const isFocus = mode === 'FOCUS';
  const hiddenCount = isFocus
    ? showAllInFocus
      ? 0
      : data.items.length - displayData.items.length
    : data.items.filter((it) => it.status !== 'backlog' && it.status !== 'in-progress').length;

  const viewItems = activeTag ? data.items.filter((it) => it.tags.includes(activeTag)) : data.items;
  const sections = todoViewSections(viewItems, view);
  const viewCounts = todoViewCounts(data.items);
  const hasOverdue = todoViewSections(data.items, 'today').some((x) => x.overdue);

  const renderItem = (item: TodoItem) => {
    const idx = data.items.indexOf(item);
    const isDone = item.status === 'done';
    const isRejected = item.status === 'rejected';
    const dimmed = isDone || isRejected;

    return (
      <div
        key={item.id}
        className="group border-b border-[var(--los-border)] last:border-0 px-1 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-start gap-2">
          {isFocus ? (
            <div className="mt-0.5">
              <StatusBadge status={item.status} onPick={(s) => handlePickStatus(idx, s)} />
            </div>
          ) : (
            <div className="mt-0.5">
              <StatusBadge status={item.status} compact onCycle={() => handleCycleStatus(idx)} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <MonoText
                className={cn(
                  'text-xs break-words leading-relaxed',
                  dimmed ? 'opacity-40 line-through' : 'opacity-100',
                )}
              >
                {item.text}
              </MonoText>
              {isFocus && data.milestones.length > 0 ? (
                <MilestonePicker
                  milestoneId={item.milestoneId}
                  milestones={data.milestones}
                  onChange={(id) => handleSetMilestone(idx, id)}
                />
              ) : (
                item.milestoneId && (
                  <span className="shrink-0 text-[9px] font-mono text-[var(--los-accent)] border border-[var(--los-accent)]/30 px-1 py-0.5 rounded-sm opacity-70">
                    !{item.milestoneId}
                  </span>
                )
              )}
            </div>

            <DueMarks
              item={item}
              className="mt-1"
              onSetDue={onChange && ((date) => handleSetDue(item, date))}
              showAdd={isFocus}
            />

            {/* Tags */}
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] font-mono text-[var(--los-muted)] opacity-70"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Prompt — focus mode only */}
            {isFocus && (
              <PromptSection
                item={item}
                onSave={(lines, refFile) => handleSetPrompt(idx, lines, refFile)}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── SMALL / FOCUS ─────────────────────────────────────────────────────────
  return (
    <div className={cn('flex items-stretch w-full', isFocus ? 'min-h-full' : 'h-full', className)}>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center mb-2 shrink-0 px-1">
          <MonoHeader className="text-sm">TASKS</MonoHeader>
          <div className="flex items-center gap-3">
            {data.isLegacyFormat && (
              <button
                type="button"
                onClick={handleMigrate}
                className="flex items-center gap-1 text-[10px] font-mono text-yellow-400 hover:text-yellow-300 border border-yellow-400/30 px-2 py-0.5 hover:bg-yellow-400/10 transition-colors"
                title="This file uses the old format. Click to migrate."
              >
                <AlertTriangle size={10} />
                MIGRATE
              </button>
            )}
            {isFocus && (
              <button
                type="button"
                onClick={() => setShowAllInFocus((v) => !v)}
                className={cn(
                  'flex items-center gap-1 text-[10px] font-mono border px-2 py-0.5 transition-colors',
                  showAllInFocus
                    ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                    : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
                )}
                title={showAllInFocus ? 'Showing all items' : 'Showing open + recent completed'}
              >
                <Eye size={10} />
                {showAllInFocus ? 'ALL' : 'RECENT'}
              </button>
            )}
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              {activeCount} ACTIVE
            </MonoText>
            {onOpenBoard && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenBoard();
                }}
                className="text-[var(--los-muted)] hover:text-[var(--los-accent)] transition-colors"
                title="Open Tasks board"
                aria-label="Open Tasks board"
              >
                <ArrowUpRight size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Date views */}
        <div
          role="tablist"
          aria-label="Todo view"
          className="flex flex-wrap gap-1 mb-2 px-1 shrink-0"
        >
          {TODO_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={(e) => {
                e.stopPropagation();
                setView(v);
              }}
              className={cn(
                'text-[9px] font-mono uppercase px-1.5 py-0.5 border transition-colors',
                view === v
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                  : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
              )}
            >
              {TODO_VIEW_LABELS[v]}
              {v !== 'all' && viewCounts[v] > 0 && (
                <span
                  className={cn(
                    'ml-1',
                    v === 'today' && hasOverdue ? 'text-red-500' : 'opacity-70',
                  )}
                >
                  {viewCounts[v]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Milestone Manager — focus mode only */}
        {isFocus && (
          <MilestoneManager milestones={data.milestones} onChange={handleMilestonesChange} />
        )}

        {/* Tag Filter Chips — focus mode only */}
        {isFocus && allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 px-1">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={cn(
                'text-[10px] font-mono px-2 py-0.5 border transition-colors',
                !activeTag
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                  : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
              )}
            >
              ALL
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={cn(
                  'text-[10px] font-mono px-2 py-0.5 border transition-colors',
                  activeTag === tag
                    ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                    : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Task List */}
        <div
          className={cn(
            'flex-1 min-h-0 border-t border-[var(--los-border)]',
            isFocus ? 'overflow-visible' : 'overflow-y-auto',
          )}
        >
          {view === 'all' ? (
            displayData.items.map(renderItem)
          ) : sections.length === 0 ? (
            <div className="py-6 text-center">
              <MonoText className="text-[10px] text-[var(--los-muted)]">
                {EMPTY_VIEW[view]}
              </MonoText>
            </div>
          ) : (
            sections.map((section) => (
              <section key={section.key} aria-label={section.label}>
                <div
                  className={cn(
                    'flex justify-between px-1 pt-2 pb-1 text-[9px] font-mono uppercase tracking-wider border-b border-[var(--los-border)]',
                    section.overdue ? 'text-red-500' : 'text-[var(--los-muted)]',
                  )}
                >
                  <span>{section.label}</span>
                  <span>{section.items.length}</span>
                </div>
                {section.items.map(renderItem)}
              </section>
            ))
          )}

          {/* Animating-out items (SMALL mode only) */}
          {!isFocus &&
            animatingOut.map((a) => (
              <AnimatingTodoItem key={a.id} text={a.text} status={a.status} />
            ))}

          {/* Hidden items notice */}
          {view === 'all' && !isFocus && hiddenCount > 0 && (
            <div className="text-center py-2">
              <MonoText className="text-[10px] text-[var(--los-muted)]">
                + {hiddenCount} completed
              </MonoText>
            </div>
          )}
          {view === 'all' && isFocus && !showAllInFocus && hiddenCount > 0 && (
            <div className="text-center py-2">
              <MonoText className="text-[10px] text-[var(--los-muted)]">
                + {hiddenCount} older than 2h —{' '}
                <button
                  type="button"
                  onClick={() => setShowAllInFocus(true)}
                  className="underline hover:text-[var(--los-fg)] transition-colors"
                >
                  show all
                </button>
              </MonoText>
            </div>
          )}
        </div>
      </div>
      {!isFocus && onOpenAdd && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAdd();
          }}
          className="flex items-center justify-center w-10 shrink-0 border-l border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] transition-colors font-mono text-lg leading-none"
          title="Add task"
        >
          +
        </button>
      )}
    </div>
  );
};
