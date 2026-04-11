# Dump View Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add format-detecting view modes (RAW / TABLE / LOG) to the Quick Dump overlay at `/new`.

**Architecture:** A new `DumpView` component replaces `RealEditor` in `MainApp.tsx`'s dump mode block. It detects content format (csv / json_array / jsonl / raw), manages mode state, and renders the appropriate view. `CsvTableView` gains an optional `data` prop to accept pre-parsed rows. A new `LogView` component handles JSONL log rendering.

**Tech Stack:** Preact, TypeScript strict, Tailwind CSS with `var(--los-*)` CSS variables, lucide-preact icons, existing `CsvTableView` + `Editor` components from `@lifosy/ui`.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/ui/src/LifeOS/Organisms/Widgets/CsvTableView.tsx` | Add optional `data` prop (pre-parsed headers + rows) |
| Create | `packages/ui/src/LifeOS/Organisms/LogView.tsx` | JSONL log table with global search, reverse order, level coloring |
| Create | `packages/ui/src/LifeOS/Organisms/DumpView.tsx` | Format detection, mode switcher, view routing |
| Modify | `packages/ui/src/LifeOS/Layouts/MainApp.tsx` | Swap `RealEditor` → `DumpView` in dump mode content area |

---

## Task 1: Extend CsvTableView with a `data` prop

**Files:**
- Modify: `packages/ui/src/LifeOS/Organisms/Widgets/CsvTableView.tsx`

- [ ] Open `CsvTableView.tsx`. The current interface is:
  ```ts
  export interface CsvTableViewProps {
    content: string;
  }
  ```
  Change it to:
  ```ts
  export interface CsvTableViewProps {
    content?: string;
    data?: { headers: string[]; rows: string[][] };
  }
  ```

- [ ] The `useMemo` that parses `content` currently always runs. Wrap it so that when `data` is provided, parsing is skipped. Replace the existing `useMemo` block (the one that produces `{ headers, rows }`) with:
  ```ts
  const { headers, rows } = useMemo(() => {
    if (data) return data;
    if (!content) return { headers: [], rows: [] };
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length === 0) return { headers: [], rows: [] };

    const firstLine = lines[0];
    if (!firstLine) return { headers: [], rows: [] };

    const lineForSepDetect = firstLine.replace(/\[[^\]]*\]/g, '');
    const separator = lineForSepDetect.includes(';') ? ';' : ',';

    const headers = firstLine.split(separator).map((h) => {
      const trimmed = h.trim();
      const bracketIdx = trimmed.indexOf('[');
      return bracketIdx > 0 ? trimmed.slice(0, bracketIdx).trim() : trimmed;
    });
    const rows = lines.slice(1).map((line) => line.split(separator).map((c) => c.trim()));
    return { headers, rows };
  }, [content, data]);
  ```

- [ ] Run `pnpm biome check packages/ui/src/LifeOS/Organisms/Widgets/CsvTableView.tsx` — expect no errors.

- [ ] Commit:
  ```bash
  git add packages/ui/src/LifeOS/Organisms/Widgets/CsvTableView.tsx
  git commit -m "feat: add optional pre-parsed data prop to CsvTableView"
  ```

---

## Task 2: Create LogView component

**Files:**
- Create: `packages/ui/src/LifeOS/Organisms/LogView.tsx`

- [ ] Create `packages/ui/src/LifeOS/Organisms/LogView.tsx` with this content:
  ```tsx
  import { ChevronLeft, ChevronRight } from 'lucide-preact';
  import { useMemo, useState } from 'preact/hooks';
  import { MonoLabel, MonoText } from '../Atoms/Typography';
  import { cn } from '../../utils';

  const PAGE_SIZE = 50;

  const TIMESTAMP_KEYS = ['timestamp', 'time', 'ts', 'date'];
  const LEVEL_KEYS = ['level', 'severity'];

  function levelColor(val: string): string {
    const v = val.toLowerCase();
    if (v === 'error' || v === 'fatal') return 'text-red-400';
    if (v === 'warn' || v === 'warning') return 'text-yellow-400';
    if (v === 'info') return 'text-[var(--los-accent)]';
    return 'text-[var(--los-muted)]';
  }

  export interface LogViewProps {
    /** Array of JSONL-parsed objects (already parsed, not raw string) */
    entries: Record<string, unknown>[];
  }

  export const LogView = ({ entries }: LogViewProps) => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);

    // Collect all keys across all entries, put timestamp first, level second
    const columns = useMemo(() => {
      const keySet = new Set<string>();
      for (const e of entries) {
        for (const k of Object.keys(e)) keySet.add(k);
      }
      const tsKey = TIMESTAMP_KEYS.find((k) => keySet.has(k));
      const lvlKey = LEVEL_KEYS.find((k) => keySet.has(k));
      const rest = [...keySet].filter((k) => k !== tsKey && k !== lvlKey).sort();
      return [tsKey, lvlKey, ...rest].filter((k): k is string => k !== undefined);
    }, [entries]);

    // Reverse order: newest (last-parsed) at top
    const reversed = useMemo(() => [...entries].reverse(), [entries]);

    const filtered = useMemo(() => {
      if (!search.trim()) return reversed;
      const q = search.toLowerCase();
      return reversed.filter((row) =>
        Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)),
      );
    }, [reversed, search]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

    const lvlKey = LEVEL_KEYS.find((k) => columns.includes(k));

    return (
      <div className="flex flex-col w-full h-full overflow-hidden bg-[var(--los-bg)]">
        {/* Search bar */}
        <div className="flex items-center gap-3 p-2 border-b border-[var(--los-border)]">
          <input
            type="text"
            placeholder="Search logs..."
            className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-1 text-xs font-mono text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)] placeholder:text-[var(--los-muted)]"
            value={search}
            // biome-ignore lint/a11y/noAutofocus: log search is the primary action in LOG mode
            autoFocus
            onInput={(e) => {
              setSearch(e.currentTarget.value);
              setPage(0);
            }}
          />
          <MonoLabel className="text-xs shrink-0">{filtered.length} entries</MonoLabel>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[var(--los-bg)] z-10">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="p-2 border-b border-[var(--los-border)] whitespace-nowrap"
                  >
                    <MonoLabel className="text-xs font-bold uppercase">{col}</MonoLabel>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: page-relative index is stable within this render
                  key={i}
                  className="border-b border-[var(--los-border)]/50 hover:bg-[var(--los-border)]/10 transition-colors last:border-0"
                >
                  {columns.map((col) => {
                    const val = String(row[col] ?? '');
                    const isLevel = col === lvlKey;
                    return (
                      <td key={col} className="p-2 max-w-[300px]" title={val}>
                        {isLevel ? (
                          <span className={cn('text-xs font-mono font-bold', levelColor(val))}>
                            {val.toUpperCase()}
                          </span>
                        ) : (
                          <MonoText className="text-xs truncate block">{val}</MonoText>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="p-8 text-center">
                    <MonoText className="text-[var(--los-muted)]">No entries match</MonoText>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--los-border)] shrink-0">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              {safePage + 1} / {totalPages} ({filtered.length} entries)
            </MonoText>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    );
  };
  ```

- [ ] Run `pnpm biome check packages/ui/src/LifeOS/Organisms/LogView.tsx` — expect no errors.

- [ ] Commit:
  ```bash
  git add packages/ui/src/LifeOS/Organisms/LogView.tsx
  git commit -m "feat: add LogView component for JSONL log display"
  ```

---

## Task 3: Create DumpView component

**Files:**
- Create: `packages/ui/src/LifeOS/Organisms/DumpView.tsx`

- [ ] Create `packages/ui/src/LifeOS/Organisms/DumpView.tsx`:
  ```tsx
  import { useMemo, useRef, useState } from 'preact/hooks';
  import { Editor } from '../../components/editor/Editor';
  import { LogView } from './LogView';
  import { CsvTableView } from './Widgets/CsvTableView';

  type DetectedFormat = 'raw' | 'csv' | 'json_array' | 'jsonl';
  type ViewMode = 'RAW' | 'TABLE' | 'LOG';

  function detectFormat(content: string): DetectedFormat {
    const trimmed = content.trim();
    if (!trimmed) return 'raw';

    // json_array: valid JSON that is an array of plain objects
    try {
      const parsed = JSON.parse(trimmed);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        typeof parsed[0] === 'object' &&
        parsed[0] !== null &&
        !Array.isArray(parsed[0])
      ) {
        return 'json_array';
      }
    } catch {
      // not JSON
    }

    // jsonl: ≥80% of non-empty lines parse as objects
    const lines = trimmed.split('\n').filter((l) => l.trim());
    if (lines.length > 0) {
      let objectLines = 0;
      for (const line of lines) {
        try {
          const p = JSON.parse(line.trim());
          if (typeof p === 'object' && p !== null && !Array.isArray(p)) objectLines++;
        } catch {
          // not JSON
        }
      }
      if (objectLines / lines.length >= 0.8) return 'jsonl';
    }

    // csv: first non-empty line has ≥2 comma/semicolon tokens
    const firstLine = lines[0] ?? '';
    const sep = firstLine.replace(/\[[^\]]*\]/g, '').includes(';') ? ';' : ',';
    if (firstLine.split(sep).length >= 2) return 'csv';

    return 'raw';
  }

  const AVAILABLE_MODES: Record<DetectedFormat, ViewMode[]> = {
    raw: ['RAW'],
    csv: ['RAW', 'TABLE'],
    json_array: ['RAW', 'TABLE'],
    jsonl: ['RAW', 'TABLE', 'LOG'],
  };

  function jsonToTableData(content: string, format: 'json_array' | 'jsonl') {
    let objects: Record<string, unknown>[] = [];
    if (format === 'json_array') {
      try {
        objects = JSON.parse(content.trim());
      } catch {
        return { headers: [], rows: [] };
      }
    } else {
      objects = content
        .split('\n')
        .filter((l) => l.trim())
        .flatMap((l) => {
          try {
            const p = JSON.parse(l.trim());
            return typeof p === 'object' && p !== null && !Array.isArray(p) ? [p as Record<string, unknown>] : [];
          } catch {
            return [];
          }
        });
    }

    const keySet = new Set<string>();
    for (const obj of objects) {
      for (const k of Object.keys(obj)) keySet.add(k);
    }
    const headers = [...keySet].sort();
    const rows = objects.map((obj) => headers.map((h) => String(obj[h] ?? '')));
    return { headers, rows };
  }

  function jsonToLogEntries(content: string): Record<string, unknown>[] {
    return content
      .split('\n')
      .filter((l) => l.trim())
      .flatMap((l) => {
        try {
          const p = JSON.parse(l.trim());
          return typeof p === 'object' && p !== null && !Array.isArray(p) ? [p as Record<string, unknown>] : [];
        } catch {
          return [];
        }
      });
  }

  export interface DumpViewProps {
    content: string;
    onChange: (content: string) => void;
    onSave: (content: string) => void;
  }

  export const DumpView = ({ content, onChange, onSave }: DumpViewProps) => {
    const [mode, setMode] = useState<ViewMode>('RAW');
    const hasAutoSwitched = useRef(false);

    const format = useMemo(() => detectFormat(content), [content]);
    const availableModes = AVAILABLE_MODES[format];

    // Auto-switch to TABLE on first structured detection
    useMemo(() => {
      if (format !== 'raw' && !hasAutoSwitched.current) {
        hasAutoSwitched.current = true;
        setMode('TABLE');
      }
      if (format === 'raw') {
        hasAutoSwitched.current = false;
        setMode('RAW');
      }
    }, [format]);

    // If current mode is no longer available (e.g. content changed), fall back
    const activeMode = availableModes.includes(mode) ? mode : availableModes[0];

    const tableData = useMemo(() => {
      if (activeMode !== 'TABLE') return null;
      if (format === 'csv') return null; // CsvTableView handles CSV string directly
      if (format === 'json_array' || format === 'jsonl') return jsonToTableData(content, format);
      return null;
    }, [activeMode, format, content]);

    const logEntries = useMemo(() => {
      if (activeMode !== 'LOG' || format !== 'jsonl') return null;
      return jsonToLogEntries(content);
    }, [activeMode, format, content]);

    return (
      <div className="h-full w-full flex flex-col overflow-hidden">
        {/* Mode switcher — only shown when structured format detected */}
        {format !== 'raw' && (
          <div className="flex items-center gap-1 px-1 pb-2 shrink-0">
            {availableModes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`text-[10px] font-mono px-2 py-0.5 border transition-colors ${
                  activeMode === m
                    ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                    : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* View area */}
        <div className="flex-1 overflow-hidden">
          {activeMode === 'RAW' && (
            <Editor
              content={content}
              onChange={onChange}
              onSave={onSave}
              className="h-full w-full"
            />
          )}
          {activeMode === 'TABLE' && format === 'csv' && (
            <CsvTableView content={content} />
          )}
          {activeMode === 'TABLE' && tableData && (
            <CsvTableView data={tableData} />
          )}
          {activeMode === 'LOG' && logEntries && (
            <LogView entries={logEntries} />
          )}
        </div>
      </div>
    );
  };
  ```

- [ ] Run `pnpm biome check packages/ui/src/LifeOS/Organisms/DumpView.tsx` — expect no errors.

- [ ] Commit:
  ```bash
  git add packages/ui/src/LifeOS/Organisms/DumpView.tsx
  git commit -m "feat: add DumpView component with format detection and mode switching"
  ```

---

## Task 4: Wire DumpView into MainApp

**Files:**
- Modify: `packages/ui/src/LifeOS/Layouts/MainApp.tsx`

- [ ] Add the import for `DumpView` near the top of `MainApp.tsx` (alongside existing organism imports):
  ```ts
  import { DumpView } from '../Organisms/DumpView';
  ```

- [ ] Find the dump mode content area (around line 1775):
  ```tsx
  <div className="flex-1 overflow-hidden p-4">
    <RealEditor
      content={dumpContent}
      onChange={setDumpContent}
      onSave={handleDumpSave}
      className="h-full w-full"
    />
  </div>
  ```
  Replace it with:
  ```tsx
  <div className="flex-1 overflow-hidden p-4">
    <DumpView
      content={dumpContent}
      onChange={setDumpContent}
      onSave={handleDumpSave}
    />
  </div>
  ```

- [ ] Run `pnpm biome check packages/ui/src/LifeOS/Layouts/MainApp.tsx` — expect no errors.

- [ ] Run `pnpm turbo build` from repo root — expect clean build with zero errors.

- [ ] Commit:
  ```bash
  git add packages/ui/src/LifeOS/Layouts/MainApp.tsx
  git commit -m "feat: wire DumpView into Quick Dump overlay"
  ```

---

## Task 5: Update progress doc

**Files:**
- Modify: `doc/progress.md`

- [ ] Prepend an entry to `doc/progress.md`:
  ```markdown
  ## 2026-04-11 — Quick Dump view modes (JSON, JSONL, CSV)

  - **`DumpView` component** (`packages/ui/src/LifeOS/Organisms/DumpView.tsx`): replaces the plain editor in Quick Dump (`/new`) with auto-detecting view modes
  - **Format detection**: detects `json_array`, `jsonl`, `csv`, or `raw` from pasted content; auto-switches to TABLE on first structured detection
  - **TABLE mode**: per-column live filters, sortable columns, pagination (50 rows/page); reuses `CsvTableView` for CSV; converts JSON/JSONL objects to rows
  - **LOG mode** (JSONL only): global search bar, reverse-chron order, level coloring (error/warn/info/debug), timestamp column first
  - **`CsvTableView`**: extended with optional `data` prop for pre-parsed input, avoiding serialize→parse round-trip
  - **`LogView` component** (`packages/ui/src/LifeOS/Organisms/LogView.tsx`): standalone log table for JSONL entries
  ```

- [ ] Commit:
  ```bash
  git add doc/progress.md
  git commit -m "docs: update progress log for dump view modes feature"
  ```
