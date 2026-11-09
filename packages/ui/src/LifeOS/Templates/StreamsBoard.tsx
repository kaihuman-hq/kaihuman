import {
  actionsFor,
  type StreamFile,
  type StreamMode,
  type StreamSort,
  sortStreams,
  streamItems,
  type TodoColor,
  type TodoStatus,
} from '@kaihuman/formats';
import { CheckCircle2, Circle, PlayCircle, XCircle } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoText } from '../Atoms/Typography';
import { fileLabel } from '../scope-files';
import { FileColorPicker, fileColorHex, PriorityBadge } from './TodoMarks';

export {
  actionsFor,
  type StreamFile,
  type StreamMode,
  type StreamSort,
  sortStreams,
  streamItems,
} from '@kaihuman/formats';

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
  onCyclePriority: (path: string, index: number) => void;
  onColorChange: (path: string, color?: TodoColor) => void;
  onOpenFile?: (path: string) => void;
}

const StreamTile = ({
  file,
  mode,
  searchQuery,
  onStatusChange,
  onAddItem,
  onMoveItem,
  onCyclePriority,
  onColorChange,
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
    <section
      style={fileColorHex(file.data) ? { borderColor: fileColorHex(file.data) } : undefined}
      className="h-[40vh] min-h-[260px] flex flex-col border border-[var(--los-border)] min-w-0"
    >
      <header className="h-9 flex items-center justify-between gap-2 px-3 border-b border-[var(--los-border)] shrink-0">
        <FileColorPicker
          color={file.data.color}
          label={fileLabel(file.path)}
          onChange={(c) => onColorChange(file.path, c)}
        />
        <button
          type="button"
          onClick={() => onOpenFile?.(file.path)}
          disabled={!onOpenFile}
          title={file.path}
          className="flex-1 min-w-0 truncate text-left text-[11px] font-mono font-bold hover:text-[var(--los-accent)] transition-colors"
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
              <PriorityBadge
                priority={item.priority}
                onCycle={() => onCyclePriority(file.path, index)}
              />
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
