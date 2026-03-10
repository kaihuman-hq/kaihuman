import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  FileText,
  PlayCircle,
  Plus,
  XCircle,
} from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CompactList, CompactWidgetLayout } from './CompactWidgetLayout';
import {
  getVisibleTodos,
  type Milestone,
  migrateLegacyFormat,
  NEXT_STATUS,
  parseTodos,
  STATUS_LABELS,
  serializeTodos,
  setMilestone,
  setPrompt,
  setStatus,
  type TodoData,
  type TodoItem,
  type TodoStatus,
} from './TodoLogic';

export interface TodoWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  className?: string;
  onChange?: (newContent: string) => void;
  onOpenAdd?: () => void;
}

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

// ─── Main Widget ──────────────────────────────────────────────────────────────

export const TodoWidget = ({ content, mode, className, onChange, onOpenAdd }: TodoWidgetProps) => {
  const data: TodoData = useMemo(() => parseTodos(content), [content]);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const displayData = useMemo(() => {
    const base =
      mode === 'SMALL' || mode === 'MOBILE_EXPANDED' || mode === 'MOBILE_COLLAPSED'
        ? getVisibleTodos(data)
        : data;
    if (!activeTag) return base;
    return { ...base, items: base.items.filter((it) => it.tags.includes(activeTag)) };
  }, [data, mode, activeTag]);

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
    const newData = setStatus(data, index, NEXT_STATUS[item.status]);
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

  const handleMigrate = () => {
    onChange?.(migrateLegacyFormat(content));
  };

  const activeCount = data.items.filter(
    (it) => it.status === 'backlog' || it.status === 'in-progress',
  ).length;

  // ── MOBILE_COLLAPSED ──────────────────────────────────────────────────────
  if (mode === 'MOBILE_COLLAPSED') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center h-full w-full p-2 gap-1',
          className,
        )}
      >
        <MonoHeader className="text-4xl font-bold leading-none">{activeCount}</MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-wider">
          OPEN TASKS
        </MonoText>
        {onOpenAdd && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAdd();
            }}
            className="mt-4 flex items-center gap-1 px-3 py-1.5 border border-[var(--los-border)] text-[10px] uppercase text-[var(--los-muted)] hover:text-[var(--los-fg)] hover:border-[var(--los-accent)] transition-colors"
          >
            <Plus size={12} /> NEW TASK
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
  const hiddenCount = data.items.length - displayData.items.length;

  // ── SMALL / FOCUS ─────────────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col w-full', isFocus ? 'min-h-full' : 'h-full', className)}>
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
          <MonoText className="text-[10px] text-[var(--los-muted)]">{activeCount} ACTIVE</MonoText>
        </div>
      </div>

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
        {displayData.items.map((item) => {
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
                    <StatusBadge
                      status={item.status}
                      compact
                      onCycle={() => handleCycleStatus(idx)}
                    />
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
        })}

        {/* Hidden items notice (small mode) */}
        {!isFocus && hiddenCount > 0 && (
          <div className="text-center py-2">
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              + {hiddenCount} completed older than 1h
            </MonoText>
          </div>
        )}
      </div>
    </div>
  );
};
