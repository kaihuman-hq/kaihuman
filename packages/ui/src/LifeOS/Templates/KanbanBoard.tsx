import { githubFileStore } from '@lifosy/core';
import {
  ArrowLeft,
  BarChart2,
  CalendarDays,
  CheckCircle2,
  Circle,
  Pencil,
  PlayCircle,
  Tags,
  Trash2,
  X,
  XCircle,
} from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../Atoms/Typography';
import {
  addMilestone,
  getUpcomingMilestone,
  type Milestone,
  parseTodos,
  removeMilestone,
  STATUS_LABELS,
  serializeTodos,
  setMilestone,
  setStatus,
  type TodoData,
  type TodoItem,
  type TodoStatus,
} from '../Organisms/Widgets/TodoLogic';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AggregatedItem {
  item: TodoItem;
  itemIndex: number;
  filePath: string;
}

const COLUMNS: { status: TodoStatus; label: string; icon: any; colorClass: string }[] = [
  { status: 'backlog', label: 'Backlog', icon: Circle, colorClass: 'text-[var(--los-muted)]' },
  { status: 'in-progress', label: 'In Progress', icon: PlayCircle, colorClass: 'text-yellow-400' },
  { status: 'done', label: 'Done', icon: CheckCircle2, colorClass: 'text-[var(--los-accent)]' },
  { status: 'rejected', label: 'Rejected', icon: XCircle, colorClass: 'text-red-500' },
];

const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  backlog: 'in-progress',
  'in-progress': 'done',
  done: 'backlog',
  rejected: 'backlog',
};

// ─── MilestoneManager ────────────────────────────────────────────────────────

const MilestoneManager = ({
  milestones,
  allFilePaths,
  onClose,
}: {
  milestones: Milestone[];
  allFilePaths: string[];
  onClose: () => void;
}) => {
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [targetFile, setTargetFile] = useState(allFilePaths[0] ?? '');

  const handleAdd = () => {
    const id = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id || !targetFile) return;
    const openFiles = githubFileStore.openFiles.peek();
    const file = openFiles[targetFile];
    if (!file) return;
    const data = parseTodos(file.content);
    const newData = addMilestone(data, { id, name: name.trim(), dueDate: dueDate || undefined });
    githubFileStore.updateFileContent(targetFile, serializeTodos(newData));
    githubFileStore.saveFile(targetFile);
    setName('');
    setDueDate('');
  };

  const handleRemove = (ms: Milestone) => {
    const openFiles = githubFileStore.openFiles.peek();
    for (const fp of allFilePaths) {
      const f = openFiles[fp];
      if (!f) continue;
      const d = parseTodos(f.content);
      if (d.milestones.some((m) => m.id === ms.id)) {
        const newData = removeMilestone(d, ms.id);
        githubFileStore.updateFileContent(fp, serializeTodos(newData));
        githubFileStore.saveFile(fp);
        break;
      }
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation */}
      <div
        className="relative bg-[var(--los-bg)] border border-[var(--los-border)] w-full max-w-lg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <MonoHeader>MILESTONES</MonoHeader>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-[var(--los-accent)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Existing milestones */}
        <div className="space-y-2 mb-6">
          {milestones.length === 0 && (
            <MonoText className="text-[var(--los-muted)] text-xs">No milestones yet.</MonoText>
          )}
          {milestones.map((ms) => (
            <div
              key={ms.id}
              className="flex items-center justify-between border border-[var(--los-border)] px-3 py-2"
            >
              <div>
                <MonoText className="text-sm">{ms.name}</MonoText>
                {ms.dueDate && (
                  <MonoText className="text-[10px] text-[var(--los-muted)]">
                    Due: {ms.dueDate}
                  </MonoText>
                )}
                <MonoText className="text-[9px] text-[var(--los-muted)] opacity-60">
                  !{ms.id}
                </MonoText>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(ms)}
                className="text-[var(--los-muted)] hover:text-red-400 transition-colors p-1"
                title="Remove milestone"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Add new milestone */}
        <div className="border-t border-[var(--los-border)] pt-4 space-y-3">
          <MonoLabel>ADD MILESTONE</MonoLabel>
          <input
            type="text"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Milestone name"
            className="w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-3 py-2 text-sm font-mono outline-none transition-colors"
          />
          <input
            type="date"
            value={dueDate}
            onInput={(e) => setDueDate(e.currentTarget.value)}
            className="w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-3 py-2 text-sm font-mono outline-none transition-colors"
          />
          {allFilePaths.length > 1 && (
            <select
              value={targetFile}
              onChange={(e) => setTargetFile(e.currentTarget.value)}
              className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none"
            >
              {allFilePaths.map((fp) => (
                <option key={fp} value={fp}>
                  {fp.split('/').pop()}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            ADD MILESTONE
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── KanbanCard ───────────────────────────────────────────────────────────────

const KanbanCard = ({
  agg,
  onStatusChange,
}: {
  agg: AggregatedItem;
  onStatusChange: (filePath: string, itemIndex: number, newStatus: TodoStatus) => void;
}) => {
  const { item, filePath } = agg;
  const fileName = filePath.split('/').pop() ?? filePath;

  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer?.setData(
      'text/plain',
      JSON.stringify({ filePath: agg.filePath, itemIndex: agg.itemIndex }),
    );
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop source
    <div
      draggable
      onDragStart={handleDragStart}
      className="border border-[var(--los-border)] bg-[var(--los-bg)] p-3 space-y-2 hover:border-[var(--los-accent)]/50 transition-colors group cursor-grab active:cursor-grabbing active:opacity-50"
    >
      <MonoText className="text-xs leading-relaxed break-words">{item.text}</MonoText>

      <div className="flex flex-wrap gap-1">
        {item.tags.map((t) => (
          <span key={t} className="text-[9px] font-mono text-[var(--los-muted)]">
            #{t}
          </span>
        ))}
        {item.milestoneId && (
          <span className="text-[9px] font-mono text-[var(--los-accent)] border border-[var(--los-accent)]/30 px-1">
            !{item.milestoneId}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <MonoText className="text-[9px] text-[var(--los-muted)] opacity-60 truncate max-w-[60%]">
          {fileName}
        </MonoText>
        <button
          type="button"
          onClick={() => onStatusChange(filePath, agg.itemIndex, NEXT_STATUS[item.status])}
          className="text-[9px] font-mono text-[var(--los-muted)] hover:text-[var(--los-accent)] border border-[var(--los-border)] px-1.5 py-0.5 transition-colors opacity-0 group-hover:opacity-100"
        >
          → {STATUS_LABELS[NEXT_STATUS[item.status]]}
        </button>
      </div>
    </div>
  );
};

// ─── AssignMilestonePanel ─────────────────────────────────────────────────────

const AssignMilestonePanel = ({
  filePath,
  data,
  onSave,
  onClose,
}: {
  filePath: string;
  data: TodoData;
  onSave: (itemIndex: number, milestoneId: string | undefined) => void;
  onClose: () => void;
}) => {
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(data.milestones[0]?.id ?? '');

  const activeItems = data.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.status === 'backlog' || item.status === 'in-progress');

  const fileName = filePath.split('/').pop() ?? filePath;
  const selectedMilestone = data.milestones.find((m) => m.id === selectedMilestoneId);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Assign toolbar */}
      <div className="h-12 border-b border-[var(--los-border)] flex items-center gap-4 px-6 shrink-0 bg-[var(--los-accent)]/5">
        <Tags size={14} className="text-[var(--los-accent)] shrink-0" />
        <MonoText className="text-xs text-[var(--los-accent)] font-bold">ASSIGN MILESTONE</MonoText>
        <MonoText className="text-[10px] text-[var(--los-muted)]">{fileName}</MonoText>
        <div className="flex-1" />
        {data.milestones.length > 1 && (
          <select
            value={selectedMilestoneId}
            onChange={(e) => setSelectedMilestoneId(e.currentTarget.value)}
            className="bg-[var(--los-bg)] border border-[var(--los-accent)]/40 text-xs font-mono px-2 py-1 focus:border-[var(--los-accent)] outline-none text-[var(--los-fg)]"
          >
            {data.milestones.map((m) => (
              <option key={m.id} value={m.id}>
                !{m.id}
                {m.dueDate ? ` · ${m.dueDate}` : ''}
              </option>
            ))}
          </select>
        )}
        {data.milestones.length === 1 && selectedMilestone && (
          <div className="flex items-center gap-1.5 border border-[var(--los-accent)]/40 px-2 py-1">
            <MonoText className="text-xs text-[var(--los-accent)]">
              !{selectedMilestone.id}
            </MonoText>
            {selectedMilestone.dueDate && (
              <MonoText className="text-[10px] text-[var(--los-muted)]">
                · {selectedMilestone.dueDate}
              </MonoText>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-[10px] font-mono border border-[var(--los-border)] px-2 py-1 text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)] transition-colors"
        >
          <X size={10} />
          DONE
        </button>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto">
        {activeItems.length === 0 && (
          <div className="flex items-center justify-center h-32 text-[var(--los-muted)]">
            <MonoText className="text-xs">No active todos in this file.</MonoText>
          </div>
        )}
        {activeItems.map(({ item, idx }) => {
          const isAssigned = item.milestoneId === selectedMilestoneId;
          const hasOtherMilestone = item.milestoneId && item.milestoneId !== selectedMilestoneId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSave(idx, isAssigned ? undefined : selectedMilestoneId)}
              className={cn(
                'w-full flex items-center gap-4 px-6 py-3 border-b border-[var(--los-border)] text-left transition-colors hover:bg-white/5',
                isAssigned && 'bg-[var(--los-accent)]/5',
              )}
            >
              {/* Checkbox indicator */}
              <div
                className={cn(
                  'w-4 h-4 shrink-0 border flex items-center justify-center transition-colors',
                  isAssigned
                    ? 'border-[var(--los-accent)] bg-[var(--los-accent)]'
                    : 'border-[var(--los-border)]',
                )}
              >
                {isAssigned && <CheckCircle2 size={10} className="text-black" />}
              </div>

              <MonoText className="flex-1 text-xs break-words">{item.text}</MonoText>

              <div className="flex items-center gap-2 shrink-0">
                {/* Status */}
                <span className="text-[9px] font-mono text-[var(--los-muted)]">
                  {STATUS_LABELS[item.status]}
                </span>
                {/* Current milestone (if different from selected) */}
                {hasOtherMilestone && (
                  <span className="text-[9px] font-mono text-[var(--los-muted)] border border-[var(--los-border)] px-1">
                    !{item.milestoneId}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── KanbanBoard ──────────────────────────────────────────────────────────────

export interface KanbanBoardProps {
  onNavigateBack?: () => void;
  onAnalyticsClick?: () => void;
}

export const KanbanBoard = ({ onNavigateBack, onAnalyticsClick }: KanbanBoardProps) => {
  const openFiles = githubFileStore.openFiles.value;
  const tree = githubFileStore.tree.value;

  // When navigating directly to /board, the tree may not be loaded yet.
  // The dashboard normally triggers loadTree(), so we do it here if needed.
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) {
      githubFileStore.loadTree();
    }
  }, []);

  const [milestoneFilter, setMilestoneFilter] = useState<string>('');
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [showMilestoneManager, setShowMilestoneManager] = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState<TodoStatus | null>(null);
  const [focusedFile, setFocusedFile] = useState<string>('');
  const [assignMode, setAssignMode] = useState(false);

  // Find all .todos.md files in the tree and open them
  const todoFilePaths = useMemo(
    () => (tree ?? []).filter((t) => t.path.endsWith('.todos.md')).map((t) => t.path),
    [tree],
  );

  useEffect(() => {
    for (const path of todoFilePaths) {
      if (!openFiles[path]) {
        githubFileStore.openFile(path);
      }
    }
  }, [todoFilePaths, openFiles]);

  // Parse all open todo files
  const parsedFiles = useMemo<{ path: string; data: TodoData }[]>(() => {
    return todoFilePaths
      .filter((p) => openFiles[p]?.content !== undefined)
      .map((p) => ({ path: p, data: parseTodos(openFiles[p]?.content ?? '') }));
  }, [todoFilePaths, openFiles]);

  // Collect all milestones across all files
  const allMilestones = useMemo<Milestone[]>(() => {
    const seen = new Set<string>();
    const result: Milestone[] = [];
    for (const { data } of parsedFiles) {
      for (const m of data.milestones) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          result.push(m);
        }
      }
    }
    return result.sort((a, b) => ((a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1));
  }, [parsedFiles]);

  const upcomingMilestone = useMemo(() => getUpcomingMilestone(allMilestones), [allMilestones]);

  // Aggregate all items
  const allItems = useMemo<AggregatedItem[]>(() => {
    const result: AggregatedItem[] = [];
    for (const { path, data } of parsedFiles) {
      if (focusedFile && path !== focusedFile) continue;
      data.items.forEach((item, idx) => {
        if (milestoneFilter && item.milestoneId !== milestoneFilter) return;
        if (showUpcoming && upcomingMilestone && item.milestoneId !== upcomingMilestone.id) return;
        result.push({ item, itemIndex: idx, filePath: path });
      });
    }
    return result;
  }, [parsedFiles, milestoneFilter, showUpcoming, upcomingMilestone, focusedFile]);

  const focusedFileData = useMemo(
    () => parsedFiles.find((f) => f.path === focusedFile)?.data ?? null,
    [parsedFiles, focusedFile],
  );

  const handleStatusChange = (filePath: string, itemIndex: number, newStatus: TodoStatus) => {
    const file = openFiles[filePath];
    if (!file) return;
    const data = parseTodos(file.content);
    const newData = setStatus(data, itemIndex, newStatus);
    githubFileStore.updateFileContent(filePath, serializeTodos(newData));
    githubFileStore.saveFile(filePath);
  };

  const handleAssignMilestone = (itemIndex: number, milestoneId: string | undefined) => {
    if (!focusedFile) return;
    const file = openFiles[focusedFile];
    if (!file) return;
    const data = parseTodos(file.content);
    const newData = setMilestone(data, itemIndex, milestoneId);
    githubFileStore.updateFileContent(focusedFile, serializeTodos(newData));
    githubFileStore.saveFile(focusedFile);
  };

  const isLoading = todoFilePaths.some((p) => !openFiles[p]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--los-bg)] text-[var(--los-fg)] overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-[var(--los-border)] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          {onNavigateBack && (
            <button
              type="button"
              onClick={onNavigateBack}
              className="flex items-center gap-1.5 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
            >
              <ArrowLeft size={14} />
              <MonoText className="text-xs">BACK</MonoText>
            </button>
          )}
          <div className="h-4 w-px bg-[var(--los-border)]" />
          <MonoHeader>KANBAN BOARD</MonoHeader>
          {todoFilePaths.length > 1 ? (
            <select
              value={focusedFile}
              onChange={(e) => {
                setFocusedFile(e.currentTarget.value);
                setAssignMode(false);
              }}
              className="bg-[var(--los-bg)] border border-[var(--los-border)] text-[10px] font-mono px-2 py-1 focus:border-[var(--los-accent)] outline-none text-[var(--los-muted)] transition-colors"
            >
              <option value="">All files</option>
              {todoFilePaths.map((fp) => (
                <option key={fp} value={fp}>
                  {fp.split('/').pop()}
                </option>
              ))}
            </select>
          ) : (
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              {todoFilePaths.length} file{todoFilePaths.length !== 1 ? 's' : ''}
            </MonoText>
          )}
          {focusedFile && focusedFileData && focusedFileData.milestones.length > 0 && (
            <button
              type="button"
              onClick={() => setAssignMode((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-mono border px-2 py-1 transition-colors',
                assignMode
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                  : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)]',
              )}
            >
              <Tags size={10} />
              ASSIGN
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {upcomingMilestone && (
            <button
              type="button"
              onClick={() => setShowUpcoming((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-mono border px-2 py-1 transition-colors',
                showUpcoming
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                  : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
              )}
              title={`Next milestone: ${upcomingMilestone.name}${upcomingMilestone.dueDate ? ` (${upcomingMilestone.dueDate})` : ''}`}
            >
              <CalendarDays size={10} />
              UPCOMING
            </button>
          )}

          {allMilestones.length > 0 && (
            <select
              value={milestoneFilter}
              onChange={(e) => {
                setMilestoneFilter(e.currentTarget.value);
                setShowUpcoming(false);
              }}
              className="bg-[var(--los-bg)] border border-[var(--los-border)] text-xs font-mono px-2 py-1 focus:border-[var(--los-accent)] outline-none transition-colors"
            >
              <option value="">All milestones</option>
              {allMilestones.map((m) => (
                <option key={m.id} value={m.id}>
                  !{m.id}
                  {m.dueDate ? ` · ${m.dueDate}` : ''}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setShowMilestoneManager(true)}
            className="flex items-center gap-1.5 text-[10px] font-mono border border-[var(--los-border)] px-2 py-1 text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)] transition-colors"
          >
            <Pencil size={10} />
            MILESTONES
          </button>

          {onAnalyticsClick && (
            <button
              type="button"
              onClick={onAnalyticsClick}
              className="flex items-center gap-1.5 text-[10px] font-mono border border-[var(--los-border)] px-2 py-1 text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)] transition-colors"
              title="Todo Analytics"
            >
              <BarChart2 size={10} />
              ANALYTICS
            </button>
          )}
        </div>
      </div>

      {/* Assign Mode */}
      {assignMode && focusedFile && focusedFileData ? (
        <AssignMilestonePanel
          filePath={focusedFile}
          data={focusedFileData}
          onSave={handleAssignMilestone}
          onClose={() => setAssignMode(false)}
        />
      ) : null}

      {/* Board */}
      {!assignMode && isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--los-muted)]">
          <MonoText>Loading todo files...</MonoText>
        </div>
      ) : !assignMode && todoFilePaths.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[var(--los-muted)]">
          <MonoText>No .todos.md files found in this repository.</MonoText>
        </div>
      ) : !assignMode ? (
        <div className="flex-1 overflow-hidden flex">
          {COLUMNS.map((col) => {
            const colItems = allItems.filter((a) => a.item.status === col.status);
            const ColIcon = col.icon;
            return (
              <div
                key={col.status}
                className={cn(
                  'flex-1 min-w-0 flex flex-col border-r border-[var(--los-border)] last:border-r-0 transition-colors',
                  dragOverStatus === col.status && 'bg-[var(--los-accent)]/5',
                )}
              >
                <div className="h-10 border-b border-[var(--los-border)] flex items-center gap-2 px-4 shrink-0">
                  <ColIcon size={12} className={col.colorClass} />
                  <MonoLabel className="text-xs">{col.label.toUpperCase()}</MonoLabel>
                  <span className="ml-auto text-[10px] font-mono text-[var(--los-muted)]">
                    {colItems.length}
                  </span>
                </div>

                {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target column */}
                <div
                  className="flex-1 overflow-y-auto p-3 space-y-2"
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    setDragOverStatus(col.status);
                  }}
                  onDragLeave={(e) => {
                    // Only clear if leaving the column entirely (not entering a child)
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverStatus(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverStatus(null);
                    try {
                      const { filePath, itemIndex } = JSON.parse(
                        e.dataTransfer?.getData('text/plain') ?? '',
                      );
                      handleStatusChange(filePath, itemIndex, col.status);
                    } catch {
                      // ignore malformed drag data
                    }
                  }}
                >
                  {colItems.length === 0 ? (
                    <div className="flex items-center justify-center h-16 text-[var(--los-muted)] text-[10px] font-mono opacity-40">
                      empty
                    </div>
                  ) : (
                    colItems.map((agg) => (
                      <KanbanCard
                        key={`${agg.filePath}-${agg.itemIndex}`}
                        agg={agg}
                        onStatusChange={handleStatusChange}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {showMilestoneManager && (
        <MilestoneManager
          milestones={allMilestones}
          allFilePaths={todoFilePaths}
          onClose={() => setShowMilestoneManager(false)}
        />
      )}
    </div>
  );
};
