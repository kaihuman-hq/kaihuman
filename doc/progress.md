# Progress

## 2026-04-21 — Knowledge Base navigation, 404 fix, and KB commands modal

- **`/knowledge` in command palette**: added "Open Knowledge Base" command (`SearchModal.tsx`); dispatched via `onOpenKnowledge` callback chain → `MainApp` → `Dashboard` → `route('/knowledge')`
- **`/knowledge` in magic menu**: added "Knowledge Base" item to `StatusBar` menu in `MainApp.tsx`; follows the same conditional-prop pattern as Board / Action Log / Shortcuts
- **Scaffold 404 fix** (`github-kb.ts`): `scaffoldKB` now calls `githubService.saveFile` directly (no SHA) instead of `upsertRepoFile`; eliminates 11 pre-check GET requests that all 404'd on first-time setup since none of the files exist yet
- **KB commands modal** (`KBCommandsModal.tsx`): new modal in `apps/console` showing the general flow and all four KB slash commands (`/kb-ingest`, `/kb-lint`, `/kb-ask`, `/kb-session`) with descriptions; triggered from command palette via "Knowledge Base Commands" entry

## 2026-04-11 — Quick Dump view modes (JSON, JSONL, CSV)

- **`DumpView` component** (`packages/ui/src/LifeOS/Organisms/DumpView.tsx`): replaces the plain editor in Quick Dump (`/new`) with auto-detecting view modes
- **Format detection**: detects `json_array`, `jsonl`, `csv`, or `raw` from pasted content; auto-switches to TABLE on first structured detection
- **TABLE mode**: per-column live filters, sortable columns, pagination (50 rows/page); reuses `CsvTableView` for CSV; converts JSON/JSONL objects to rows
- **LOG mode** (JSONL only): global search bar, reverse-chron order, level coloring (error/warn/info/debug), timestamp column first
- **`CsvTableView`**: extended with optional `data` prop for pre-parsed input
- **`LogView` component** (`packages/ui/src/LifeOS/Organisms/LogView.tsx`): standalone log table for JSONL entries

## 2026-04-02 — Board card inline editing + URL rendering

- **KanbanBoard / KanbanCard**: added EDIT button (pencil icon) on each card; clicking it opens an inline textarea pre-filled with the todo's current text; SAVE commits the change, CANCEL discards it; drag-and-drop is disabled while editing
- **TodoLogic**: added `updateTodoText` helper (same pattern as `setStatus`)
- **KanbanBoard**: todo card text now detects URLs (`http://`/`https://`) and renders them as clickable links that open in a new tab

- **KanbanBoard**: todo card text now detects URLs (`http://`/`https://`) and renders them as clickable anchor tags opening in a new tab

## 2026-03-28 — Action Log view, inbox, quick-log route

- **`ActionLogView` template** (`packages/ui`): single-column combined view of all `.actionlog.md` files from dashboard config; always includes `inbox.actionlog.md` if it exists; search input; clickable tag cloud (frequency-sorted); date separators (sticky, formatted); entry rows show file source + MOVE dropdown on hover; add-entry panel (collapsible) with file selector, description textarea, tags — creates inbox on first use; footer stats
- **Move between files**: removes from source, inserts into target maintaining chronological order; saves sequentially
- **`/action-log` route** + `ActionLogViewPage.tsx` wrapper
- **`inbox.actionlog.md`**: lives in `.kh/`, always surfaced on the view if it exists in the tree; add panel always offers it even if not yet created
- **`/quick-log` route** + `QuickLogPage.tsx`: focused quick capture to inbox; same pattern as quick-todo/quick-note
- **Shortcuts page**: added "Quick Log" (`/quick-log`) entry
- **Android manifest**: added "Quick Log" shortcut
- **Magic menu**: "Action Log" item wired via `onActionLogClick` prop
- **Command palette**: "Open Action Log" command added

## 2026-03-28 — Shortcuts in magic menu + command palette, /new route added

- **Magic menu**: added "Shortcuts" item (between Search and Board); routes to `/shortcuts`; conditional on `onShortcutsClick` prop being provided
- **Command palette** (`Ctrl+K`): added "Open Shortcuts" command to static commands list
- **`/new` added to shortcuts page** as "New File" entry with suggested name "KH New"
- Wired `onShortcutsClick` and `onOpenShortcuts` through `MainApp` → `SearchModal` → `Dashboard`

## 2026-03-28 — Shortcuts page, quick-note route, Android manifest shortcuts

- **`/quick-note` route**: new page for fast note capture to `.kh/dump.md`; prepends dated entries (`- YYYY-MM-DD text`) to the top of the file, auto-creates on first use
- **`/shortcuts` page**: platform-aware guide listing all quick-capture routes; auto-detects iOS/Android/desktop; shows step-by-step instructions per route and per platform; platform can be toggled manually; explains iOS icon limitation; notes Android long-press shortcut
- **Android manifest shortcuts**: `shortcuts` array added to `vite.config.ts` manifest so Android users get long-press shortcuts on the installed app icon without needing extra home screen icons
- `QUICK_ROUTES` registry in `ShortcutsPage.tsx` — single place to add future quick routes

## 2026-03-28 — Inbox todos, quick-todo route, move between files

- **`/quick-todo` route** (`apps/console`): new focused page for fast todo capture into `.kh/inbox.todos.md`; auto-focuses input, parses tags from space/comma-separated input, creates the inbox file if it doesn't exist yet
- **Inbox always on board** (`KanbanBoard`): `.kh/inbox.todos.md` is always included in the board's file pool if it exists in the repo tree, regardless of dashboard config entries
- **Move todo between files** (`KanbanBoard`): each card shows a "MOVE" dropdown on hover (only when ≥2 todo files exist); selecting a target file removes the item from the source and appends it to the target, preserving all fields (tags, timestamps, milestone, prompt)
- **`TodoLogic` exported** from `@lifosy/ui` so console app pages can use `parseTodos` / `addTodo` / `serializeTodos` directly

## 2026-03-19 — Setup64: CLI enhancements

- Added `git.rs`: clone / pull active repo into `~/.config/com/lifosy/cli/repos/` before any file action
- Added `files.rs`: recent-files list (`recent_files.json`), `dashboard.config.json` parser, flat repo file listing
- Extended `auth.rs`: exposed `config_dir()` helper
- New TUI screens in `app.rs` / `ui.rs`:
  - **AI Prompt** (`a`) — pipe a multi-line prompt to Claude, Copilot, or Gemini CLI via `-p`; Tab cycles provider; Ctrl+Enter submits
  - **AI Response** — scrollable response view; Esc/Enter returns to prompt
  - **File Browser** (`f`) — syncs repo, lists files with recently-used files (★) at top; Enter opens nano-like editor
  - **File Editor** — full `tui-textarea` editor; Ctrl+S saves to disk; Esc closes
  - **Dashboard View** (`d`) — syncs repo, parses `dashboard.config.json`, shows workspaces + primary files; Enter opens any file in editor
- Main screen shortcut bar updated to reflect new keys
