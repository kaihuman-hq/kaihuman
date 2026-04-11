import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
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

  // jsonl: ≥80% of non-empty lines parse as plain objects
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

  // csv: first non-empty line has ≥2 comma/semicolon-separated tokens
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
          return typeof p === 'object' && p !== null && !Array.isArray(p)
            ? [p as Record<string, unknown>]
            : [];
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
        return typeof p === 'object' && p !== null && !Array.isArray(p)
          ? [p as Record<string, unknown>]
          : [];
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

  // Auto-switch to TABLE on first structured detection; reset when content clears
  useEffect(() => {
    if (format !== 'raw' && !hasAutoSwitched.current) {
      hasAutoSwitched.current = true;
      setMode('TABLE');
    }
    if (format === 'raw') {
      hasAutoSwitched.current = false;
      setMode('RAW');
    }
  }, [format]);

  // Fall back to first available mode if current mode becomes unavailable
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
      {format !== 'raw' && (
        <div className="flex items-center gap-1 pb-2 shrink-0">
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

      <div className="flex-1 overflow-hidden">
        {activeMode === 'RAW' && (
          <Editor content={content} onChange={onChange} onSave={onSave} className="h-full w-full" />
        )}
        {activeMode === 'TABLE' && format === 'csv' && <CsvTableView content={content} />}
        {activeMode === 'TABLE' && tableData && <CsvTableView data={tableData} />}
        {activeMode === 'LOG' && logEntries && <LogView entries={logEntries} />}
      </div>
    </div>
  );
};
