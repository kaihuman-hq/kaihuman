import { NEXT_STATUS, STATUS_LABELS, type TodoItem, type TodoStatus } from '@kaihuman/formats';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoLabel, MonoText } from '../Atoms/Typography';

export interface StreamRow {
  item: TodoItem;
  itemIndex: number;
  status: TodoStatus;
}

export interface StreamLane {
  path: string;
  label: string;
  openCount: number;
  inProgressCount: number;
  doneCount: number;
  items: StreamRow[];
}

interface StreamFileInput {
  path: string;
  data: { items: TodoItem[] };
}

/** Rejected items are dropped from the lane like done ones. */
const isFinished = (status: TodoStatus) => status === 'done' || status === 'rejected';

/**
 * One lane per todo file. Counts always cover the filtered items, so the header
 * stays stable while "Show finished" only changes which rows are listed.
 */
export function groupByStream(
  files: readonly StreamFileInput[],
  opts: {
    showFinished: boolean;
    filter?: (item: TodoItem) => boolean;
    label?: (path: string) => string;
  },
): StreamLane[] {
  return files.map(({ path, data }) => {
    const rows: StreamRow[] = [];
    data.items.forEach((item, itemIndex) => {
      if (opts.filter && !opts.filter(item)) return;
      rows.push({ item, itemIndex, status: item.status });
    });
    const inProgress = rows.filter((r) => r.status === 'in-progress');
    const backlog = rows.filter((r) => r.status === 'backlog');
    const finished = rows.filter((r) => isFinished(r.status));
    return {
      path,
      label: opts.label ? opts.label(path) : path,
      openCount: backlog.length,
      inProgressCount: inProgress.length,
      doneCount: finished.length,
      items: [...inProgress, ...backlog, ...(opts.showFinished ? finished : [])],
    };
  });
}

interface StreamViewProps {
  /** Lanes computed with `showFinished: true`; the toggle here hides finished rows. */
  lanes: StreamLane[];
  fileColors: Record<string, string>;
  onStatusChange: (filePath: string, itemIndex: number, newStatus: TodoStatus) => void;
}

const DOT_CLASS: Record<TodoStatus, string> = {
  backlog: 'border-[var(--los-muted)]',
  'in-progress': 'border-yellow-400 bg-yellow-400',
  done: 'border-[var(--los-accent)] bg-[var(--los-accent)]',
  rejected: 'border-red-500 bg-red-500',
};

export const StreamView = ({ lanes, fileColors, onStatusChange }: StreamViewProps) => {
  const [showFinished, setShowFinished] = useState(false);

  return (
    <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">
      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-[var(--los-muted)]">
        <input
          type="checkbox"
          checked={showFinished}
          onChange={(e) => setShowFinished((e.currentTarget as HTMLInputElement).checked)}
        />
        <MonoText className="text-xs">Show finished</MonoText>
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lanes.map((lane) => {
          const rows = lane.items.filter((r) => showFinished || !isFinished(r.status));
          return (
            <section
              key={lane.path}
              aria-label={lane.label}
              className="min-w-0 border border-[var(--los-border)]"
            >
              <header className="flex items-center gap-2 border-b border-[var(--los-border)] px-3 py-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: fileColors[lane.path] }}
                />
                <MonoLabel className="min-w-0 flex-1 truncate">{lane.label}</MonoLabel>
                <MonoText className="shrink-0 text-[10px] text-[var(--los-muted)]">
                  {lane.inProgressCount} active · {lane.openCount} open · {lane.doneCount} done
                </MonoText>
              </header>
              <ul>
                {rows.map(({ item, itemIndex, status }) => (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-start gap-2 border-l-2 px-3 py-1.5',
                      status === 'in-progress' ? 'border-yellow-400' : 'border-transparent',
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`${STATUS_LABELS[status]}. Mark as ${STATUS_LABELS[NEXT_STATUS[status]]}`}
                      onClick={() => onStatusChange(lane.path, itemIndex, NEXT_STATUS[status])}
                      className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center"
                    >
                      <span className={cn('h-2.5 w-2.5 rounded-full border', DOT_CLASS[status])} />
                    </button>
                    <MonoText
                      className={cn(
                        'min-w-0 break-words text-xs',
                        status === 'in-progress' ? 'text-yellow-400' : 'text-[var(--los-muted)]',
                      )}
                    >
                      {item.text}
                    </MonoText>
                  </li>
                ))}
                {rows.length === 0 && (
                  <li className="px-3 py-2">
                    <MonoText className="text-xs text-[var(--los-muted)]">Nothing open</MonoText>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
};
