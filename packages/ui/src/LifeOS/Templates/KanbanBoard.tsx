import { githubFileStore, layoutStore } from '@lifosy/core';
import {
  ArrowLeft,
  BarChart2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Palette,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
  XCircle,
} from 'lucide-preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../Atoms/Typography';
import {
  addMilestone,
  addTodo,
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

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const BADGE_COLORS = [
  '#60a5fa', // blue
  '#4ade80', // green
  '#f59e0b', // amber
  '#f472b6', // pink
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fb923c', // orange
  '#38bdf8', // sky
  '#e879f9', // fuchsia
  '#a3e635', // lime
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFilePath(fp: string): { dir: string; name: string } {
  const parts = fp.split('/');
  const raw = parts.pop() ?? fp;
  const dir = parts.length > 0 ? `${parts.join('/')}/` : '';
  const name = raw.replace(/\.todos\.md$/, '');
  return { dir, name };
}

function filterByAge(items: AggregatedItem[], recentOnly: boolean): AggregatedItem[] {
  if (!recentOnly) return items;
  const cutoff = Date.now() - TWO_WEEKS_MS;
  return items.filter((a) => {
    const ts = a.item.updatedAt ?? (a.item.createdAt ? new Date(a.item.createdAt).getTime() : null);
    if (!ts) return true;
    return ts >= cutoff;
  });
}

// ─── Age buckets ──────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const AGE_BUCKETS = [
  { key: 'new' as const, label: null }, // < 1 day  — no divider
  { key: 'day' as const, label: '> 1 day' }, // 1–3 days
  { key: 'days' as const, label: '> 3 days' }, // 3–7 days
  { key: 'week' as const, label: '> 1 week' }, // ≥ 7 days / undated
];

function getAgeBucket(createdAt: string | undefined): (typeof AGE_BUCKETS)[number]['key'] {
  if (!createdAt) return 'week';
  const age = Date.now() - new Date(createdAt).getTime();
  if (age < ONE_DAY_MS) return 'new';
  if (age < 3 * ONE_DAY_MS) return 'day';
  if (age < 7 * ONE_DAY_MS) return 'days';
  return 'week';
}

// ─── FileSelect ───────────────────────────────────────────────────────────────

const FileSelect = ({
  value,
  options,
  onChange,
  allowEmpty = true,
  triggerClassName,
  dropdownClassName,
}: {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  allowEmpty?: boolean;
  triggerClassName?: string;
  dropdownClassName?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((fp) => fp.toLowerCase().includes(q));
  }, [options, search]);

  const display = value ? formatFilePath(value) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setSearch('');
          setOpen((v) => !v);
        }}
        className={cn(
          'flex items-center gap-1.5 bg-[var(--los-bg)] border border-[var(--los-border)] font-mono outline-none transition-colors hover:border-[var(--los-fg)]',
          triggerClassName ?? 'text-[10px] px-2 py-1 text-[var(--los-muted)]',
        )}
      >
        <span className="flex-1 truncate text-left">
          {display ? (
            <>
              <span className="opacity-60">{display.dir}</span>
              <span className="font-bold text-[var(--los-fg)]">{display.name}</span>
            </>
          ) : (
            <span>All files</span>
          )}
        </span>
        <ChevronDown size={8} className="shrink-0" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full left-0 z-50 mt-0.5 bg-[var(--los-bg)] border border-[var(--los-border)] shadow-lg flex flex-col',
            dropdownClassName ?? 'min-w-[180px] max-w-[320px] max-h-60',
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-[var(--los-border)] px-2 py-1.5 shrink-0">
            <Search size={10} className="text-[var(--los-muted)] shrink-0" />
            <input
              // biome-ignore lint/a11y/noAutofocus: intentional focus on dropdown open
              autoFocus
              type="text"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search lists…"
              className="flex-1 bg-transparent text-[10px] font-mono outline-none text-[var(--los-fg)] placeholder:text-[var(--los-muted)] min-w-0"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {allowEmpty && !search && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left px-3 py-2 text-[10px] font-mono hover:bg-white/5 transition-colors',
                  value === '' ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]',
                )}
              >
                All files
              </button>
            )}
            {filteredOptions.map((fp) => {
              const { dir, name } = formatFilePath(fp);
              return (
                <button
                  key={fp}
                  type="button"
                  onClick={() => {
                    onChange(fp);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-[10px] font-mono hover:bg-white/5 transition-colors leading-snug',
                    value === fp ? 'bg-[var(--los-accent)]/10' : '',
                  )}
                >
                  {dir && (
                    <span className="block text-[var(--los-muted)] opacity-70 text-[9px]">
                      {dir}
                    </span>
                  )}
                  <span
                    className={cn(
                      'font-bold',
                      value === fp ? 'text-[var(--los-accent)]' : 'text-[var(--los-fg)]',
                    )}
                  >
                    {name}
                  </span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-[10px] font-mono text-[var(--los-muted)]">
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── AddTaskModal ─────────────────────────────────────────────────────────────

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(0, idx + 1) : '';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function toFileName(name: string): string {
  const trimmed = name.trim();
  return trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
}

const AddTaskModal = ({
  todoFilePaths,
  parsedFiles,
  initialFilePath,
  onClose,
  onAdd,
  onCreateFile,
  onOpenFile,
}: {
  todoFilePaths: string[];
  parsedFiles: { path: string; data: TodoData }[];
  initialFilePath: string;
  onClose: () => void;
  onAdd: (
    filePath: string,
    text: string,
    tags: string[],
    promptRefFile?: string,
  ) => Promise<void> | void;
  onCreateFile?: (path: string, content: string) => Promise<void>;
  onOpenFile?: (path: string) => void;
}) => {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState(initialFilePath || todoFilePaths[0] || '');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [createPromptFile, setCreatePromptFile] = useState(false);
  const [promptFileName, setPromptFileName] = useState('');
  const [openAfter, setOpenAfter] = useState(false);

  const fileData = useMemo(
    () => parsedFiles.find((f) => f.path === selectedFile)?.data ?? null,
    [parsedFiles, selectedFile],
  );

  const availableTags = useMemo(() => {
    if (!fileData) return [];
    const tags = new Set<string>();
    for (const item of fileData.items) {
      for (const t of item.tags) tags.add(t);
    }
    return Array.from(tags).sort();
  }, [fileData]);

  const addNewTag = () => {
    const t = newTag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t || selectedTags.includes(t)) return;
    setSelectedTags((prev) => [...prev, t]);
    setNewTag('');
  };

  const handleAdd = async () => {
    if (!text.trim() || !selectedFile) return;
    let promptRefFile: string | undefined;
    if (createPromptFile && promptFileName.trim() && onCreateFile) {
      const fileName = toFileName(promptFileName);
      promptRefFile = `${dirOf(selectedFile)}${fileName}`;
    }
    // Await the task save before creating the prompt file to avoid concurrent
    // GitHub API pushes that cause 409 Conflict errors.
    await onAdd(selectedFile, text.trim(), selectedTags, promptRefFile);
    if (promptRefFile && onCreateFile) {
      await onCreateFile(promptRefFile, '');
      if (openAfter && onOpenFile) onOpenFile(promptRefFile);
    }
    onClose();
  };

  const showFileDropdown = !initialFilePath && todoFilePaths.length > 1;
  const basePath = dirOf(selectedFile);

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
          <MonoHeader>ADD TASK</MonoHeader>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-[var(--los-accent)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {showFileDropdown && (
          <div className="mb-4">
            <MonoLabel className="mb-1 block">FILE</MonoLabel>
            <FileSelect
              value={selectedFile}
              options={todoFilePaths}
              onChange={(fp) => {
                setSelectedFile(fp);
                setSelectedTags([]);
              }}
              allowEmpty={false}
              triggerClassName="w-full text-sm px-3 py-2 text-[var(--los-fg)] justify-between"
              dropdownClassName="w-full max-h-60"
            />
          </div>
        )}

        <input
          // biome-ignore lint/a11y/noAutofocus: intentional modal focus
          autoFocus
          type="text"
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          placeholder="Task description"
          className="w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-3 py-2 text-sm font-mono outline-none transition-colors mb-4"
        />

        <div className="mb-4">
          <MonoLabel className="mb-2 block">TAGS</MonoLabel>
          {availableTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                    )
                  }
                  className={cn(
                    'text-[10px] font-mono px-2 py-0.5 border transition-colors',
                    selectedTags.includes(tag)
                      ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/10'
                      : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)]',
                  )}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onInput={(e) => setNewTag(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNewTag();
                }
              }}
              className="flex-1 bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-3 py-1.5 text-sm font-mono outline-none transition-colors"
              placeholder="new-tag"
            />
            <button
              type="button"
              onClick={addNewTag}
              disabled={!newTag.trim()}
              className="px-3 border border-[var(--los-border)] text-xs font-mono hover:bg-white/5 disabled:opacity-40 transition-colors"
            >
              ADD
            </button>
          </div>
          {selectedTags.length > 0 && (
            <MonoText className="text-[10px] text-[var(--los-muted)] mt-1">
              Selected: {selectedTags.map((t) => `#${t}`).join(' ')}
            </MonoText>
          )}
        </div>

        {/* Prompt file */}
        <div className="flex flex-col gap-4 border-t border-[var(--los-border)] pt-5">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createPromptFile}
              onChange={(e) => {
                const v = e.currentTarget.checked;
                if (v && !promptFileName) setPromptFileName(slugify(text) || 'prompt');
                setCreatePromptFile(v);
              }}
              className="accent-[var(--los-accent)] w-4 h-4 shrink-0"
            />
            <MonoLabel className="cursor-pointer">CREATE PROMPT FILE</MonoLabel>
          </label>

          {createPromptFile && (
            <div className="flex flex-col gap-4 pl-4 border-l-2 border-[var(--los-accent)]/30">
              <div className="flex flex-col gap-2">
                <MonoLabel>FILENAME</MonoLabel>
                <div className="flex items-center gap-2">
                  {basePath && (
                    <span className="text-[10px] font-mono text-[var(--los-muted)] shrink-0">
                      {basePath}
                    </span>
                  )}
                  <input
                    type="text"
                    value={promptFileName}
                    onInput={(e) => setPromptFileName(e.currentTarget.value)}
                    placeholder="prompt.md"
                    className="flex-1 bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-2 py-1 text-xs font-mono outline-none transition-colors"
                  />
                </div>
                <span className="text-[9px] font-mono text-[var(--los-muted)]">
                  {basePath}
                  {toFileName(promptFileName || 'prompt')}
                </span>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={openAfter}
                  onChange={(e) => setOpenAfter(e.currentTarget.checked)}
                  className="accent-[var(--los-accent)] w-4 h-4 shrink-0"
                />
                <MonoLabel className="cursor-pointer text-[10px]">
                  OPEN IN FOCUS MODE AFTERWARDS
                </MonoLabel>
              </label>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!text.trim() || !selectedFile}
          className="w-full mt-5 py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          ADD TASK
        </button>
      </div>
    </div>
  );
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
  onOpenFile,
  borderColor,
}: {
  agg: AggregatedItem;
  onStatusChange: (filePath: string, itemIndex: number, newStatus: TodoStatus) => void;
  onOpenFile?: (path: string) => void;
  borderColor?: string;
}) => {
  const { item, filePath } = agg;
  const { name: fileName } = formatFilePath(filePath);
  const promptRefFile = item.prompt?.refFile;

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
      style={borderColor ? { borderColor } : undefined}
      className="border border-[var(--los-border)] bg-[var(--los-bg)] p-3 space-y-2 hover:opacity-90 transition-colors group cursor-grab active:cursor-grabbing active:opacity-50"
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
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {promptRefFile && onOpenFile && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile(promptRefFile);
              }}
              title={`Open prompt: ${promptRefFile}`}
              className="text-[9px] font-mono text-[var(--los-muted)] hover:text-[var(--los-accent)] border border-[var(--los-border)] px-1.5 py-0.5 transition-colors flex items-center gap-1"
            >
              <Pencil size={9} />
              PROMPT
            </button>
          )}
          <button
            type="button"
            onClick={() => onStatusChange(filePath, agg.itemIndex, NEXT_STATUS[item.status])}
            className="text-[9px] font-mono text-[var(--los-muted)] hover:text-[var(--los-accent)] border border-[var(--los-border)] px-1.5 py-0.5 transition-colors"
          >
            → {STATUS_LABELS[NEXT_STATUS[item.status]]}
          </button>
        </div>
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

  const { name: fileName } = formatFilePath(filePath);
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
  onCreateFile?: (path: string, content: string) => Promise<void>;
  onOpenFile?: (path: string) => void;
}

export const KanbanBoard = ({
  onNavigateBack,
  onAnalyticsClick,
  onCreateFile,
  onOpenFile,
}: KanbanBoardProps) => {
  const openFiles = githubFileStore.openFiles.value;
  const tree = githubFileStore.tree.value;
  const remoteConfig = layoutStore.remoteConfig.value;

  // When navigating directly to /board, the tree may not be loaded yet.
  // The dashboard normally triggers loadTree(), so we do it here if needed.
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) {
      githubFileStore.loadTree();
    }
  }, []);

  // When navigating directly to /board, the dashboard config may not be loaded yet.
  // Load it from the tree if available and not already in the store.
  useEffect(() => {
    if (!tree || tree.length === 0) return;
    if (layoutStore.remoteConfig.peek()) return; // already loaded by Dashboard

    const CONFIG_PATH = '.lifeos/.dashboard.config.json';
    const configItem = tree.find((t) => t.path === CONFIG_PATH);

    const loadConfig = async () => {
      if (configItem) {
        try {
          let content = githubFileStore.openFiles.peek()[CONFIG_PATH]?.content;
          if (!content) {
            await githubFileStore.openFile(CONFIG_PATH);
            content = githubFileStore.openFiles.peek()[CONFIG_PATH]?.content;
          }
          if (content) {
            layoutStore.remoteConfig.value = JSON.parse(content);
            return;
          }
        } catch {
          // fall through to default
        }
      }
      layoutStore.remoteConfig.value = {
        version: 1,
        dashboards: [{ id: 'default', name: 'Main' }],
        entries: [],
        files: { recentlyOpened: [] },
      };
    };

    loadConfig();
  }, [tree]);

  const [milestoneFilter, setMilestoneFilter] = useState<string>('');
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [showMilestoneManager, setShowMilestoneManager] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState<TodoStatus | null>(null);
  const [focusedFile, setFocusedFile] = useState<string>('');
  const [assignMode, setAssignMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRecentOnly, setShowRecentOnly] = useState<Record<TodoStatus, boolean>>({
    backlog: false,
    'in-progress': false,
    done: true,
    rejected: true,
  });
  const [colorMode, setColorMode] = useState(false);

  // Find .todos.md files assigned to any workspace in the dashboard config.
  // Falls back to scanning the full tree only when no config is available.
  const todoFilePaths = useMemo(() => {
    if (remoteConfig) {
      const paths = remoteConfig.entries
        .filter((e) => e.path.endsWith('.todos.md'))
        .map((e) => e.path);
      // Deduplicate in case the same file appears in multiple workspaces
      return [...new Set(paths)];
    }
    return (tree ?? []).filter((t) => t.path.endsWith('.todos.md')).map((t) => t.path);
  }, [remoteConfig, tree]);

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
    const q = searchQuery.trim().toLowerCase();
    const result: AggregatedItem[] = [];
    for (const { path, data } of parsedFiles) {
      if (focusedFile && path !== focusedFile) continue;
      data.items.forEach((item, idx) => {
        if (milestoneFilter && item.milestoneId !== milestoneFilter) return;
        if (showUpcoming && upcomingMilestone && item.milestoneId !== upcomingMilestone.id) return;
        if (q) {
          const matchesText = item.text.toLowerCase().includes(q);
          const matchesTag = item.tags.some((t) => t.toLowerCase().includes(q));
          const matchesMilestone = !!item.milestoneId?.toLowerCase().includes(q);
          if (!matchesText && !matchesTag && !matchesMilestone) return;
        }
        result.push({ item, itemIndex: idx, filePath: path });
      });
    }
    return result;
  }, [parsedFiles, milestoneFilter, showUpcoming, upcomingMilestone, focusedFile, searchQuery]);

  const focusedFileData = useMemo(
    () => parsedFiles.find((f) => f.path === focusedFile)?.data ?? null,
    [parsedFiles, focusedFile],
  );

  // Sort file paths by most recently added item (newest first)
  const sortedFilePaths = useMemo(() => {
    return [...todoFilePaths].sort((a, b) => {
      const latestOf = (fp: string) =>
        parsedFiles
          .find((f) => f.path === fp)
          ?.data.items.map((i) => i.createdAt ?? '')
          .filter(Boolean)
          .sort()
          .at(-1) ?? '';
      return latestOf(b).localeCompare(latestOf(a));
    });
  }, [todoFilePaths, parsedFiles]);

  // Assign a stable color to each file path (based on sorted order)
  const fileColors = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    sortedFilePaths.forEach((fp, i) => {
      map[fp] = BADGE_COLORS[i % BADGE_COLORS.length] ?? '';
    });
    return map;
  }, [sortedFilePaths]);

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

  const handleAddTask = async (
    filePath: string,
    text: string,
    tags: string[],
    promptRefFile?: string,
  ) => {
    const file = openFiles[filePath];
    if (!file) return;
    const data = parseTodos(file.content);
    const prompt = promptRefFile ? { lines: [], refFile: promptRefFile } : undefined;
    const newData = addTodo(data, text, tags, undefined, prompt);
    githubFileStore.updateFileContent(filePath, serializeTodos(newData));
    await githubFileStore.saveFile(filePath);
  };

  const isLoading = todoFilePaths.some((p) => !openFiles[p]);

  return (
    <div className="h-[calc(100vh-3rem)] md:h-[calc(100vh-2rem)] w-screen flex flex-col bg-[var(--los-bg)] text-[var(--los-fg)] overflow-hidden">
      {/* Header */}
      <div className="min-h-14 border-b border-[var(--los-border)] flex flex-wrap items-center gap-4 px-4 md:px-6 py-2 shrink-0">
        <div className="flex items-center gap-4 shrink-0">
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
            <FileSelect
              value={focusedFile}
              options={todoFilePaths}
              onChange={(fp) => {
                setFocusedFile(fp);
                setAssignMode(false);
              }}
            />
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

        {/* Search */}
        <div className="flex-1 flex items-center gap-1.5 border border-[var(--los-border)] px-2 py-1 focus-within:border-[var(--los-accent)] transition-colors min-w-0 max-w-xs">
          <Search size={11} className="text-[var(--los-muted)] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search tasks…"
            className="flex-1 bg-transparent text-[10px] font-mono outline-none text-[var(--los-fg)] placeholder:text-[var(--los-muted)] min-w-0"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors shrink-0"
            >
              <X size={10} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
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
            onClick={() => setColorMode((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 text-[10px] font-mono border px-2 py-1 transition-colors',
              colorMode
                ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)]',
            )}
            title="Toggle list colors"
          >
            <Palette size={10} />
            COLOR
          </button>

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

      {/* List badges row */}
      {todoFilePaths.length > 1 && (
        <div className="border-b border-[var(--los-border)] flex items-center gap-2 px-4 py-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setFocusedFile('')}
            className={cn(
              'text-[10px] font-mono border px-2 py-0.5 shrink-0 transition-colors whitespace-nowrap',
              !focusedFile
                ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
            )}
          >
            ALL
          </button>
          <div className="w-px h-4 bg-[var(--los-border)] shrink-0" />
          {sortedFilePaths.map((fp) => {
            const { name } = formatFilePath(fp);
            const isActive = focusedFile === fp;
            const color = colorMode ? fileColors[fp] : undefined;
            return (
              <button
                key={fp}
                type="button"
                onClick={() => setFocusedFile(isActive ? '' : fp)}
                style={
                  color ? { borderColor: color, color: isActive ? color : undefined } : undefined
                }
                className={cn(
                  'text-[10px] font-mono border px-2 py-0.5 shrink-0 transition-colors whitespace-nowrap',
                  isActive
                    ? colorMode
                      ? 'opacity-100 bg-white/5'
                      : 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                    : colorMode
                      ? 'opacity-50 hover:opacity-100'
                      : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
                )}
                title={fp}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

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
        <div className="flex-1 overflow-x-auto overflow-y-hidden flex">
          {COLUMNS.map((col) => {
            const colItems = allItems.filter((a) => a.item.status === col.status);
            const filteredItems = filterByAge(colItems, showRecentOnly[col.status]).sort((a, b) =>
              (b.item.createdAt ?? '').localeCompare(a.item.createdAt ?? ''),
            );
            const ColIcon = col.icon;
            const isFiltered = showRecentOnly[col.status];
            return (
              <div
                key={col.status}
                className={cn(
                  'flex-1 min-w-[200px] flex flex-col border-r border-[var(--los-border)] last:border-r-0 transition-colors',
                  dragOverStatus === col.status && 'bg-[var(--los-accent)]/5',
                )}
              >
                <div className="h-10 border-b border-[var(--los-border)] flex items-center gap-2 px-4 shrink-0">
                  <ColIcon size={12} className={col.colorClass} />
                  <MonoLabel className="text-xs">{col.label.toUpperCase()}</MonoLabel>
                  <span className="ml-auto text-[10px] font-mono text-[var(--los-muted)]">
                    {isFiltered && filteredItems.length !== colItems.length
                      ? `${filteredItems.length}/${colItems.length}`
                      : colItems.length}
                  </span>
                  {col.status === 'backlog' && (
                    <button
                      type="button"
                      onClick={() => setShowAddTask(true)}
                      className="flex items-center gap-1 text-[9px] font-mono border border-[var(--los-border)] px-1.5 py-0.5 text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)] transition-colors"
                      title="Add new task"
                    >
                      <Plus size={9} />
                      ADD
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setShowRecentOnly((prev) => ({
                        ...prev,
                        [col.status]: !prev[col.status],
                      }))
                    }
                    className={cn(
                      'text-[9px] font-mono border px-1 py-0.5 transition-colors',
                      isFiltered
                        ? 'border-[var(--los-accent)]/60 text-[var(--los-accent)]'
                        : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)]',
                    )}
                    title={
                      isFiltered
                        ? 'Showing last 2 weeks · click to show all'
                        : 'Showing all · click to show last 2 weeks'
                    }
                  >
                    {isFiltered ? '2W' : 'ALL'}
                  </button>
                </div>

                {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target column */}
                <div
                  className="flex-1 overflow-y-auto"
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
                  {filteredItems.length === 0 ? (
                    <div className="flex items-center justify-center h-16 text-[var(--los-muted)] text-[10px] font-mono opacity-40">
                      empty
                    </div>
                  ) : (
                    AGE_BUCKETS.map((bucket) => {
                      const bucketItems = filteredItems.filter(
                        (a) => getAgeBucket(a.item.createdAt) === bucket.key,
                      );
                      if (bucketItems.length === 0) return null;
                      return (
                        <div key={bucket.key}>
                          {bucket.label && (
                            <div className="flex items-center gap-2 px-3 py-2">
                              <div className="h-px flex-1 bg-[var(--los-border)]" />
                              <span className="text-[9px] font-mono text-[var(--los-muted)] uppercase tracking-widest shrink-0 opacity-60">
                                {bucket.label}
                              </span>
                              <div className="h-px flex-1 bg-[var(--los-border)]" />
                            </div>
                          )}
                          <div className="flex flex-col gap-2 p-3 pt-2">
                            {bucketItems.map((agg) => (
                              <KanbanCard
                                key={`${agg.filePath}-${agg.itemIndex}`}
                                agg={agg}
                                onStatusChange={handleStatusChange}
                                onOpenFile={onOpenFile}
                                borderColor={colorMode ? fileColors[agg.filePath] : undefined}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })
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

      {showAddTask && (
        <AddTaskModal
          todoFilePaths={todoFilePaths}
          parsedFiles={parsedFiles}
          initialFilePath={focusedFile}
          onClose={() => setShowAddTask(false)}
          onAdd={handleAddTask}
          onCreateFile={onCreateFile}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  );
};
