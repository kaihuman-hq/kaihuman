# Dump View Modes — Design Spec

**Date:** 2026-04-11  
**Route:** `/new` (Quick Dump overlay in MainApp)  
**Status:** Approved

---

## Problem

The Quick Dump overlay (`/new`) shows a plain text editor. When structured data (JSON, JSONL, CSV) is pasted, there is no way to inspect it as a table or log view.

---

## Solution

Add a `DumpView` component that wraps the editor and provides view-mode switching based on auto-detected content format.

---

## Architecture

`DumpView` replaces `RealEditor` in the `showDumpMode` block inside `MainApp.tsx`. It owns format detection, mode state, and renders the appropriate view. `MainApp.tsx` changes by 1 line in the content area.

```
DumpView
├── detectFormat(content) → 'raw' | 'csv' | 'json_array' | 'jsonl'
├── mode state: 'RAW' | 'TABLE' | 'LOG'
├── mode switcher bar (only renders tabs valid for detected format)
└── view area
    ├── RAW  → existing Editor component (unchanged)
    ├── TABLE → CsvTableView with pre-parsed data prop
    └── LOG   → LogView (new, JSONL-only)
```

---

## Format Detection

`detectFormat(content: string)` runs as a `useMemo`. Evaluated in order:

1. **`json_array`** — `JSON.parse` succeeds, result is `Array`, `result[0]` is a plain object
2. **`jsonl`** — split by `\n`, filter non-empty lines, ≥80% parse as objects
3. **`csv`** — first non-empty line has ≥2 tokens when split by `,` or `;`
4. **`raw`** — everything else (including empty content)

**Auto-switch:** When content transitions from `raw` to a structured format for the first time (tracked by a ref), the mode auto-switches to `TABLE`. Subsequent edits do not forcibly change the mode. If content becomes `raw` again (e.g. cleared), mode resets to `RAW`.

---

## Mode Switcher Bar

Rendered inside `DumpView`, above the view area. Only shows tabs applicable to the detected format:

| Detected format | Available modes |
|---|---|
| `raw` | RAW only (bar hidden) |
| `csv` | RAW, TABLE |
| `json_array` | RAW, TABLE |
| `jsonl` | RAW, TABLE, LOG |

Tabs styled consistent with the existing dump mode header (mono font, accent color for active).

---

## Views

### RAW
The existing `Editor` component, unchanged. Always available regardless of format.

### TABLE
Reuses `CsvTableView`. To avoid a serialize→parse round-trip for JSON/JSONL data, `CsvTableView` gains an optional `data` prop:

```ts
interface CsvTableViewProps {
  content?: string;          // existing — CSV string
  data?: { headers: string[]; rows: string[][] };  // new — pre-parsed
}
```

When `data` is provided it takes precedence over `content`. The filter/sort/pagination logic is unchanged.

For `json_array` and `jsonl`: all object keys are collected and sorted. Each object is mapped to a row, with `undefined` values rendered as empty string.

### LOG
A new `LogView` component, shown for `jsonl` format only.

- Rows displayed in **reverse order** (last line of the JSONL = top row)
- **Single global search input** at the top — live-filters across all field values (case-insensitive substring)
- **Level coloring** — if a field named `level` or `severity` exists, apply badge colors:
  - `error` / `fatal` → red
  - `warn` / `warning` → yellow
  - `info` → green (accent)
  - `debug` / `trace` → muted
- **Timestamp first** — if a field named `timestamp`, `time`, `ts`, or `date` exists, it appears as the first column
- Remaining columns in sorted key order
- Pagination: same PAGE_SIZE=50 as CsvTableView

---

## Files

### New
- `packages/ui/src/LifeOS/Organisms/DumpView.tsx` — main component
- `packages/ui/src/LifeOS/Organisms/LogView.tsx` — log view for JSONL

### Modified
- `packages/ui/src/LifeOS/Organisms/Widgets/CsvTableView.tsx` — add optional `data` prop
- `packages/ui/src/LifeOS/Layouts/MainApp.tsx` — swap `RealEditor` → `DumpView` in dump mode

---

## Out of Scope

- Saving in a structured format (always saves raw content, no transformation)
- Editing cells in TABLE or LOG view
- YAML / TOML detection
- Column visibility toggles
