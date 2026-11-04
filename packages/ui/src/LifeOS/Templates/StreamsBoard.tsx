import type { TodoData, TodoItem, TodoStatus } from '@kaihuman/formats';
import { CheckCircle2, Circle, PlayCircle, XCircle } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoText } from '../Atoms/Typography';
import { fileLabel } from '../scope-files';

export type StreamMode = 'active' | 'closed';
export type StreamSort = 'count' | 'newest';

export interface StreamFile {
  path: string;
  data: TodoData;
}

const ACTIVE: ReadonlySet<TodoStatus> = new Set(['backlog', 'in-progress']);

/** Items shown in a tile; `index` is the position in `data.items` that the callbacks need. */
export const streamItems = (
  data: TodoData,
  mode: StreamMode,
  query: string,
): { item: TodoItem; index: number }[] => {
  const q = query.trim().toLowerCase();
  const rows: { item: TodoItem; index: number }[] = [];
  data.items.forEach((item, index) => {
    if (ACTIVE.has(item.status) !== (mode === 'active')) return;
    if (
      q &&
      !item.text.toLowerCase().includes(q) &&
      !item.tags.some((t) => t.toLowerCase().includes(q))
    )
      return;
    rows.push({ item, index });
  });
  return rows;
};

export const sortStreams = <F extends StreamFile>(
  files: readonly F[],
  sort: StreamSort,
  mode: StreamMode,
  query = '',
): F[] => {
  const key = (f: F) => {
    const rows = streamItems(f.data, mode, query);
    return sort === 'count'
      ? rows.length
      : rows.reduce(
          (m, r) => (r.item.createdAt && r.item.createdAt > m ? r.item.createdAt : m),
          '',
        );
  };
  return files
    .map((f) => ({ f, k: key(f) }))
    .sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : a.f.path.localeCompare(b.f.path)))
    .map((x) => x.f);
};

const ALL_STATUSES: TodoStatus[] = ['backlog', 'in-progress', 'done', 'rejected'];
export const actionsFor = (status: TodoStatus): TodoStatus[] =>
  ALL_STATUSES.filter((s) => s !== status);

const STATUS_UI: Record<
  TodoStatus,
  { icon: typeof Circle; text: string; border: string; tint: string; title: string }
> = {
  backlog: {
    icon: Circle,
    text: 'text-[var(--los-muted)]',
    border: 'border-l-[var(--los-muted)]/50',
    tint: '',
    title: 'Backlog',
  },
  'in-progress': {
    icon: PlayCircle,
    text: 'text-yellow-400',
    border: 'border-l-yellow-400',
    tint: 'bg-yellow-400/5',
    title: 'In progress',
  },
  done: {
    icon: CheckCircle2,
    text: 'text-[var(--los-accent)]',
    border: 'border-l-[var(--los-accent)]',
    tint: '',
    title: 'Done',
  },
  rejected: {
    icon: XCircle,
    text: 'text-red-500',
    border: 'border-l-red-500',
    tint: '',
    title: 'Rejected',
  },
};

export interface StreamsBoardProps {
  files: StreamFile[];
  searchQuery: string;
  mode?: StreamMode;
  sort?: StreamSort;
  onStatusChange: (path: string, index: number, status: TodoStatus) => void;
  onAddItem: (path: string, text: string) => void;
  onMoveItem: (path: string, from: number, to: number) => void;
  onOpenFile?: (path: string) => void;
}

const StreamTile = ({
  file,
  mode,
  searchQuery,
  onStatusChange,
  onAddItem,
  onMoveItem,
  onOpenFile,
}: Omit<StreamsBoardProps, 'files' | 'sort'> & { file: StreamFile; mode: StreamMode }) => {
  const [draft, setDraft] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const rows = streamItems(file.data, mode, searchQuery);

  const endDrag = () => {
    setDragFrom(null);
    setOverIndex(null);
  };

  return (
    <section className="h-[40vh] min-h-[260px] flex flex-col border border-[var(--los-border)] min-w-0">
      <header className="h-9 flex items-center justify-between gap-2 px-3 border-b border-[var(--los-border)] shrink-0">
        <button
          type="button"
          onClick={() => onOpenFile?.(file.path)}
          disabled={!onOpenFile}
          title={file.path}
          className="min-w-0 truncate text-left text-[11px] font-mono font-bold hover:text-[var(--los-accent)] transition-colors"
        >
          {fileLabel(file.path)}
        </button>
        <MonoText className="text-[10px] text-[var(--los-muted)] shrink-0">{rows.length}</MonoText>
      </header>
      {mode === 'active' && (
        <input
          type="text"
          value={draft}
          placeholder="Add item…"
          aria-label={`Add item to ${fileLabel(file.path)}`}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            const text = draft.trim();
            if (!text) return;
            onAddItem(file.path, text);
            setDraft('');
          }}
          className="shrink-0 bg-transparent border-b border-[var(--los-border)] px-3 py-1.5 text-xs font-mono outline-none focus:border-[var(--los-accent)] placeholder:text-[var(--los-muted)]"
        />
      )}
      <ul className="flex-1 overflow-y-auto min-h-0">
        {rows.map(({ item, index }) => {
          const ui = STATUS_UI[item.status];
          const Icon = ui.icon;
          const showLine = dragFrom !== null && overIndex === index && dragFrom !== index;
          return (
            <li
              key={index}
              draggable
              onDragStart={(e) => {
                setDragFrom(index);
                e.dataTransfer?.setData('text/plain', `stream:${file.path}:${index}`);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                // Only this tile's own drag may land here.
                if (dragFrom === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== index) onMoveItem(file.path, dragFrom, index);
                endDrag();
              }}
              onDragEnd={endDrag}
              className={cn(
                'group relative flex items-start gap-2 px-3 py-1.5 border-l-2 cursor-grab',
                ui.border,
                ui.tint,
                showLine &&
                  (dragFrom !== null && dragFrom < index
                    ? 'border-b-2 border-b-[var(--los-accent)]'
                    : 'border-t-2 border-t-[var(--los-accent)]'),
              )}
            >
              <Icon size={11} className={cn('mt-0.5 shrink-0', ui.text)} aria-label={ui.title} />
              <MonoText className="flex-1 min-w-0 text-xs break-words">{item.text}</MonoText>
              <div className="hidden group-hover:flex group-focus-within:flex items-center gap-1 shrink-0">
                {actionsFor(item.status).map((s) => {
                  const A = STATUS_UI[s];
                  const ActionIcon = A.icon;
                  return (
                    <button
                      key={s}
                      type="button"
                      title={`Mark ${A.title.toLowerCase()}`}
                      aria-label={`Mark ${A.title.toLowerCase()}`}
                      onClick={() => onStatusChange(file.path, index, s)}
                      className={cn('opacity-70 hover:opacity-100 transition-opacity', A.text)}
                    >
                      <ActionIcon size={13} />
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-3 py-3 text-[10px] font-mono text-[var(--los-muted)]">Nothing here</li>
        )}
      </ul>
    </section>
  );
};

export const StreamsBoard = ({
  files,
  mode = 'active',
  sort = 'count',
  searchQuery,
  ...handlers
}: StreamsBoardProps) => (
  <div className="flex-1 overflow-y-auto p-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {sortStreams(files, sort, mode, searchQuery).map((file) => (
        <StreamTile
          key={file.path}
          file={file}
          mode={mode}
          searchQuery={searchQuery}
          {...handlers}
        />
      ))}
    </div>
  </div>
);
