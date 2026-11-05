import { githubFileStore, layoutStore } from '@kaihuman/core';
import {
  type ActionLogEntry,
  type ActionLogFile,
  addActionLogEntry,
  parseActionLog,
  serializeActionLog,
} from '@kaihuman/formats';
import { ArrowLeft, Plus, Search, Tag, X } from 'lucide-preact';
import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import { ScopeToggle } from '../Molecules/ScopeToggle';
import {
  actionLogLabel,
  formatActionLogPath,
  usePersistedScope,
  withBusinessFiles,
} from '../scope-files';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AggregatedEntry {
  entry: ActionLogEntry;
  filePath: string;
  entryIndex: number;
}

export interface ActionLogViewProps {
  onNavigateBack?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── MovePicker ───────────────────────────────────────────────────────────────

const MovePicker = ({
  otherFilePaths,
  onMove,
}: {
  otherFilePaths: string[];
  onMove: (targetPath: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-[9px] font-mono text-[var(--los-muted)] hover:text-[var(--los-accent)] border border-[var(--los-border)] px-1.5 py-0.5 transition-colors"
      >
        MOVE
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 bg-[var(--los-bg)] border border-[var(--los-border)] shadow-lg z-50 min-w-[160px] max-h-48 overflow-y-auto">
          {otherFilePaths.map((fp) => {
            const { dir, name } = formatActionLogPath(fp);
            return (
              <button
                key={fp}
                type="button"
                onClick={() => {
                  onMove(fp);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-[9px] font-mono hover:bg-white/5 transition-colors leading-snug"
              >
                {dir && <span className="block text-[var(--los-muted)] opacity-70">{dir}</span>}
                <span className="font-bold text-[var(--los-fg)]">{name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── EntryRow ─────────────────────────────────────────────────────────────────

const EntryRow = ({
  agg,
  otherFilePaths,
  onMove,
}: {
  agg: AggregatedEntry;
  otherFilePaths: string[];
  onMove?: (targetPath: string) => void;
}) => {
  const fileName = actionLogLabel(agg.filePath);
  const time = agg.entry.timestamp.slice(11, 16); // HH:mm

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-[var(--los-border)]/40 hover:bg-white/2 transition-colors group">
      <span className="shrink-0 text-[10px] font-mono text-[var(--los-muted)] opacity-70 pt-0.5 tabular-nums w-10">
        {time}
      </span>
      <MonoText className="flex-1 text-xs leading-relaxed break-words min-w-0">
        {agg.entry.description}
      </MonoText>
      <div
        className={cn(
          'flex items-center gap-1.5 shrink-0 transition-opacity',
          onMove ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <span className="text-[9px] font-mono text-[var(--los-muted)] opacity-60">{fileName}</span>
        {onMove && otherFilePaths.length > 0 && (
          <MovePicker otherFilePaths={otherFilePaths} onMove={onMove} />
        )}
      </div>
    </div>
  );
};

// ─── AddEntryPanel ────────────────────────────────────────────────────────────

const AddEntryPanel = ({
  filePaths,
  defaultFile,
  onAdd,
  onClose,
}: {
  filePaths: string[];
  defaultFile: string;
  onAdd: (filePath: string, description: string, tags: string[]) => Promise<void>;
  onClose: () => void;
}) => {
  const [selectedFile, setSelectedFile] = useState(defaultFile);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const desc = description.trim();
    if (!desc || saving) return;
    setSaving(true);
    try {
      const parsedTags = tags
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, '').toLowerCase())
        .filter(Boolean);
      await onAdd(selectedFile, desc, parsedTags);
      setDescription('');
      setTags('');
      textareaRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-[var(--los-border)] bg-[var(--los-bg)] px-4 py-4 flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <label
          htmlFor="al-file"
          className="text-[10px] font-mono text-[var(--los-muted)] uppercase tracking-widest shrink-0"
        >
          File
        </label>
        <select
          id="al-file"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.currentTarget.value)}
          className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] text-xs font-mono text-[var(--los-fg)] px-2 py-1 focus:border-[var(--los-accent)] outline-none"
        >
          {filePaths.map((fp) => {
            const { dir, name } = formatActionLogPath(fp);
            return (
              <option key={fp} value={fp}>
                {dir}
                {name}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        id="al-desc"
        value={description}
        onInput={(e) => setDescription(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
        }}
        placeholder="What happened? Use #tags inline or below"
        rows={3}
        className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors resize-none"
      />

      <div className="flex items-center gap-3">
        <input
          id="al-tags"
          type="text"
          value={tags}
          onInput={(e) => setTags(e.currentTarget.value)}
          placeholder="#tag1 #tag2 (optional)"
          className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-1.5 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={!description.trim() || saving}
          className="px-4 py-1.5 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'SAVING...' : 'LOG IT'}
        </button>
      </div>
      <span className="text-[9px] text-[var(--los-muted)] opacity-50">⌘↵ or Ctrl+↵ to save</span>
    </form>
  );
};

// ─── ActionLogView ────────────────────────────────────────────────────────────

export const ActionLogView = ({ onNavigateBack }: ActionLogViewProps) => {
  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;
  const remoteConfig = layoutStore.remoteConfig.value;

  const [search, setSearch] = useState('');
  const [scope, setScope] = usePersistedScope('actionlog');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // ── Load tree on direct navigation ──────────────────────────────────────────
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) {
      githubFileStore.loadTree();
    }
  }, []);

  // ── Load config if navigated here directly ───────────────────────────────────
  useEffect(() => {
    if (!tree || tree.length === 0) return;
    if (layoutStore.remoteConfig.peek()) return;
    const CONFIG_PATH = `${githubFileStore.appFolder.peek()}/.dashboard.config.json`;
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
          /* fall through */
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

  // ── Compute file paths ───────────────────────────────────────────────────────
  const inboxPath = useMemo(() => `${githubFileStore.appFolder.peek()}/inbox.actionlog.md`, []);

  const actionLogFilePaths = useMemo(() => {
    let paths: string[];
    if (remoteConfig) {
      paths = [
        ...new Set(
          remoteConfig.entries.filter((e) => e.path.endsWith('.actionlog.md')).map((e) => e.path),
        ),
      ];
    } else {
      paths = (tree ?? []).filter((t) => t.path.endsWith('.actionlog.md')).map((t) => t.path);
    }
    if ((tree ?? []).some((t) => t.path === inboxPath) && !paths.includes(inboxPath)) {
      paths = [inboxPath, ...paths];
    }
    return withBusinessFiles(paths, tree ?? [], '.actionlog.md', scope);
  }, [remoteConfig, tree, inboxPath, scope]);

  // Files available for the "add" form: all loaded + inbox (even if not yet created)
  const addableFiles = useMemo(() => {
    const paths = [...actionLogFilePaths];
    if (!paths.includes(inboxPath)) paths.unshift(inboxPath);
    return paths;
  }, [actionLogFilePaths, inboxPath]);

  // ── Open files ───────────────────────────────────────────────────────────────
  useEffect(() => {
    for (const path of actionLogFilePaths) {
      githubFileStore.ensureFresh(path);
    }
  }, [actionLogFilePaths]);

  // ── Parse files ──────────────────────────────────────────────────────────────
  const parsedFiles = useMemo(
    () =>
      actionLogFilePaths
        .filter((p) => openFiles[p])
        .map((p) => ({ path: p, data: parseActionLog(openFiles[p]?.content ?? '') })),
    [actionLogFilePaths, openFiles],
  );

  // ── Aggregate + sort entries ─────────────────────────────────────────────────
  const aggregatedEntries = useMemo<AggregatedEntry[]>(
    () =>
      parsedFiles
        .flatMap(({ path, data }) =>
          data.entries.map((entry, idx) => ({ entry, filePath: path, entryIndex: idx })),
        )
        .sort((a, b) => b.entry.timestamp.localeCompare(a.entry.timestamp)),
    [parsedFiles],
  );

  // ── All tags with frequency ──────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const { entry } of aggregatedEntries) {
      for (const tag of entry.tags) {
        freq[tag] = (freq[tag] ?? 0) + 1;
      }
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1]);
  }, [aggregatedEntries]);

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase();
    return aggregatedEntries.filter((agg) => {
      if (activeTag && !agg.entry.tags.includes(activeTag)) return false;
      if (q && !agg.entry.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [aggregatedEntries, activeTag, search]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleAddEntry = async (filePath: string, description: string, tags: string[]) => {
    const existingFile = githubFileStore.openFiles.peek()[filePath];
    const serialized = addActionLogEntry(existingFile?.content ?? '', { description, tags });
    if (existingFile) {
      githubFileStore.updateFileContent(filePath, serialized);
      await githubFileStore.saveFile(filePath);
    } else {
      await githubFileStore.createFile(filePath, serialized);
    }
  };

  const handleMoveEntry = async (
    sourceFilePath: string,
    entryIndex: number,
    targetFilePath: string,
  ) => {
    const sourceFile = githubFileStore.openFiles.peek()[sourceFilePath];
    const targetFile = githubFileStore.openFiles.peek()[targetFilePath];
    if (!sourceFile || !targetFile) return;
    const sourceData = parseActionLog(sourceFile.content);
    const entry = sourceData.entries[entryIndex];
    if (!entry) return;
    const newSourceData: ActionLogFile = {
      ...sourceData,
      entries: sourceData.entries.filter((_, i) => i !== entryIndex),
    };
    const targetData = parseActionLog(targetFile.content);
    // Insert preserving chronological order
    const merged = [...targetData.entries, entry].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    const newTargetData: ActionLogFile = { ...targetData, entries: merged };
    githubFileStore.updateFileContent(sourceFilePath, serializeActionLog(newSourceData));
    await githubFileStore.saveFile(sourceFilePath);
    githubFileStore.updateFileContent(targetFilePath, serializeActionLog(newTargetData));
    await githubFileStore.saveFile(targetFilePath);
  };

  // ── Loading / empty states ───────────────────────────────────────────────────
  const isLoading = actionLogFilePaths.length > 0 && actionLogFilePaths.some((p) => !openFiles[p]);
  const isEmpty = !isLoading && actionLogFilePaths.length === 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-2rem)] w-screen flex flex-col bg-[var(--los-bg)] text-[var(--los-fg)] font-mono overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-[var(--los-border)] flex items-center gap-3 px-4 shrink-0">
        {onNavigateBack && (
          <>
            <button
              type="button"
              onClick={onNavigateBack}
              className="flex items-center gap-1.5 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
            >
              <ArrowLeft size={14} />
              <span className="text-xs font-mono">BACK</span>
            </button>
            <div className="w-px h-4 bg-[var(--los-border)]" />
          </>
        )}
        <MonoHeader className="text-sm tracking-widest text-[var(--los-accent)]">
          ACTION LOG
        </MonoHeader>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 text-[10px] font-mono border px-2.5 py-1 transition-colors',
            showAdd
              ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
              : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)]',
          )}
        >
          <Plus size={11} />
          ADD ENTRY
        </button>
      </div>

      {/* Add entry panel */}
      {showAdd && (
        <AddEntryPanel
          filePaths={addableFiles}
          defaultFile={inboxPath}
          onAdd={handleAddEntry}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Search + tag filter */}
      <div className="border-b border-[var(--los-border)] px-4 py-3 flex flex-col gap-2 shrink-0">
        <ScopeToggle value={scope} onChange={setScope} />
        <div className="flex items-center gap-2 border border-[var(--los-border)] px-3 py-1.5 focus-within:border-[var(--los-accent)] transition-colors">
          <Search size={12} className="text-[var(--los-muted)] shrink-0" />
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="Search entries..."
            className="flex-1 bg-transparent text-xs font-mono outline-none text-[var(--los-fg)] placeholder:text-[var(--los-muted)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-[var(--los-muted)] hover:text-[var(--los-fg)]"
            >
              <X size={11} />
            </button>
          )}
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <Tag size={10} className="text-[var(--los-muted)] opacity-60 shrink-0" />
            {allTags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={cn(
                  'text-[9px] font-mono px-1.5 py-0.5 transition-colors border',
                  activeTag === tag
                    ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/10'
                    : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
                )}
              >
                #{tag}
                <span className="opacity-50 ml-0.5">{count}</span>
              </button>
            ))}
            {activeTag && (
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className="text-[9px] font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)] flex items-center gap-0.5"
              >
                <X size={9} />
                clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <MonoText className="text-xs text-[var(--los-muted)]">Loading action logs...</MonoText>
          </div>
        )}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 px-8 text-center">
            <MonoText className="text-xs text-[var(--los-muted)]">
              No .actionlog.md files found.
            </MonoText>
            <MonoText className="text-[10px] text-[var(--los-muted)] opacity-60">
              Add .actionlog.md files to your dashboard config, or use the + ADD ENTRY button to
              create the inbox.
            </MonoText>
          </div>
        )}
        {!isLoading && !isEmpty && filteredEntries.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <MonoText className="text-xs text-[var(--los-muted)]">
              No entries match your filter.
            </MonoText>
          </div>
        )}
        {!isLoading &&
          filteredEntries.map((agg, i) => {
            const date = agg.entry.timestamp.slice(0, 10);
            const prevDate = i > 0 ? filteredEntries[i - 1]?.entry.timestamp.slice(0, 10) : null;
            const showDateSep = date !== prevDate;
            return (
              <Fragment key={`${agg.filePath}-${agg.entryIndex}`}>
                {showDateSep && (
                  <div className="flex items-center gap-3 px-4 py-2 sticky top-0 bg-[var(--los-bg)]/95 backdrop-blur-sm z-10">
                    <div className="h-px flex-1 bg-[var(--los-border)]" />
                    <span className="text-[9px] font-mono text-[var(--los-muted)] shrink-0">
                      {formatDate(date)}
                    </span>
                    <div className="h-px flex-1 bg-[var(--los-border)]" />
                  </div>
                )}
                <EntryRow
                  agg={agg}
                  otherFilePaths={actionLogFilePaths.filter((fp) => fp !== agg.filePath)}
                  onMove={
                    actionLogFilePaths.length > 1
                      ? (targetPath) => handleMoveEntry(agg.filePath, agg.entryIndex, targetPath)
                      : undefined
                  }
                />
              </Fragment>
            );
          })}
      </div>

      {/* Footer stats */}
      {!isLoading && aggregatedEntries.length > 0 && (
        <div className="border-t border-[var(--los-border)] px-4 py-2 flex items-center gap-4 shrink-0">
          <MonoText className="text-[9px] text-[var(--los-muted)]">
            {filteredEntries.length === aggregatedEntries.length
              ? `${aggregatedEntries.length} entries`
              : `${filteredEntries.length} of ${aggregatedEntries.length} entries`}
          </MonoText>
          <MonoText className="text-[9px] text-[var(--los-muted)] opacity-60">
            {actionLogFilePaths.length} file{actionLogFilePaths.length !== 1 ? 's' : ''}
          </MonoText>
        </div>
      )}
    </div>
  );
};
