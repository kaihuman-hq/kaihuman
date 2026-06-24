# Progress

## 2026-06-24 — Cascivo Phase 4 blocked (editor publish) + charts feedback

- **Phase 4 (editor swap) blocked**: `@cascivo/editor@0.1.1` ships no `dist/`
  (the published tarball contains only package.json/README/LICENSE despite
  `files: ["dist"]`), and the registry's `editor/code-editor` has `files: []` —
  so neither the npm package nor the copy-paste source is importable. The Preact
  bridge + migration target are ready; the swap can land once the package ships
  its build. Wrote `doc/cascivo-editor-package-feedback.md` with the root cause
  and fix.
- **Charts feedback**: wrote `doc/cascivo-charts-feedback.md` — a per-chart gap
  analysis (DonutChart→PieChart, StackedBarChart→BarChart) listing exactly what
  Cascivo's chart components need for a zero-downside swap. Headline blocker:
  per-datum/per-series `color` overrides (both charts encode meaning in color);
  plus donut center label/value, thickness, and tooltip/empty-state parity.
- No app code changed this round (investigation + docs only).

## 2026-06-23 — Cascivo migration Phase 3: remove unused Panel/Sidebar/SplitView/FileTree

- Confirmed `Panel`, `Sidebar`, `SplitView` (ResizablePanelGroup/Panel/Handle),
  and `FileTree` are unused exports (0 references anywhere). Removed the four
  component files + their `index.ts` exports, consistent with the earlier
  Dialog/DropdownMenu decision.
- Dropped the now-orphaned `react-resizable-panels` (SplitView's only dependency).
  `@dnd-kit` kept — still used by `MainApp`.
- Remaining Phase 3 item: the charts (DonutChart/StackedBarChart), the only
  *used* primitives, deferred for careful visual migration.
- *Verified*: console build green; `tsc` clean; spike (2/2) + console suite
  (28/28) green; Biome clean.

## 2026-06-23 — Cascivo migration Phase 3: remove unused Radix Dialog/DropdownMenu

- `@lifosy/ui`'s `Dialog` and `DropdownMenu` were full Radix-based compound
  components (10–12 sub-exports each) with **no consumers** anywhere in the repo.
  Rather than speculatively re-wrap 24 unused sub-components over Cascivo, they
  were removed: deleted `components/Dialog.tsx` + `components/DropdownMenu.tsx`,
  dropped their `index.ts` exports, and removed `@radix-ui/react-dialog` +
  `@radix-ui/react-dropdown-menu` (−39 packages) and the Radix `external` entry
  from the lib build. A Cascivo-backed Modal/Dropdown can be added when a real
  consumer needs one.
- *Verified*: console build green; `tsc` clean; spike (2/2) + console suite
  (28/28) green; Biome clean; 0 Radix references remain.

## 2026-06-23 — Cascivo migration Phase 3 (start): Button + Input primitives

- **Button** (`packages/ui/src/components/Button.tsx`): re-implemented as a thin
  wrapper over Cascivo's `Button`, preserving the existing `@lifosy/ui` API —
  `variant` (`outline`→ghost, `danger`→destructive), `size` (`icon`→md), and the
  `label` convenience. Console call sites (e.g. `AuthCli.tsx`) unchanged.
- **Input** (`packages/ui/src/components/Input.tsx`): wraps Cascivo's `Input`;
  `error` widened to `boolean | string` (the string form supplies Cascivo's
  message). Drops the bespoke Tailwind input styling.
- **Build wiring**: `@lifosy/ui` lib build now externalizes `@cascivo/*` and
  `@preact/signals-react[/runtime]`; the console app build aliases
  `@preact/signals-react → @preact/signals` and the `/runtime` `useSignals` to a
  no-op shim, so Cascivo runs under Preact in the real app (not just the spike).
  React-typed Cascivo components are bridged with an
  `as unknown as (props) => h.JSX.Element` cast (same pattern as the Radix
  wrappers).
- Fixed a latent type error in the Phase 2 `CascivoBridge` story (same cast).
- *Verified*: console production build green; `tsc` clean (no new errors beyond
  the pre-existing `packages/core` baseline); spike (2/2) + console suite (28/28)
  green; Biome clean.

## 2026-06-23 — Cascivo migration Phase 2: theme/token bridge

- **Bridge stylesheet** (`packages/ui/src/cascivo.css`, exported as
  `@lifosy/ui/cascivo.css`): remaps Cascivo's semantic color/font tokens
  (`--cascivo-color-*`, `--cascivo-font-*`) onto the live LifeOS palette
  (`--los-*`), so Cascivo components automatically follow the active LifeOS
  theme (nexus / light / amethyst). Declared unlayered to win over Cascivo's
  layered theme values.
- **data-theme**: LifeOS themes live on `<html>`; Cascivo's `dark.css` keys off
  `[data-theme='dark']`. Set `data-theme="dark"` on the inner `.life-os-root`
  (`apps/console/src/App.tsx`) so Cascivo's structural tokens (radius, shadow,
  ring, status, chart, fonts) apply without colliding with LifeOS switching.
- **CSS import order** (components → tokens+theme → brand overrides): wired in
  `apps/console/src/main.tsx` (+ `index.css` for the brand layer) and
  `packages/ui/.storybook/preview.ts`.
- **Storybook bridge** (`packages/ui/src/CascivoBridge.stories.tsx` +
  signals-react alias/shim in `.storybook/main.ts`): renders raw Cascivo
  Button/Input/Badge/Card under the bridge for visual verification.
- **Deps**: added `@cascivo/react` / `@cascivo/themes` / `@cascivo/tokens` to
  `@lifosy/ui`.
- *Verified*: console production build resolves+bundles the full Cascivo CSS
  chain; spike (2/2) and console suite (28/28) green; Biome clean.

## 2026-06-23 — Cascivo UI migration: plan + Phase 0 integration spike

- **Plan** (`doc/cascivo-migration.md`): full plan to migrate the console's UI
  (which lives in `@lifosy/ui`) onto Cascivo — a CSS-native, signal-driven,
  AI-first React design system. Includes the `@lifosy/ui` → Cascivo component
  mapping derived from the live registry (181 components), a phased rollout, and
  risks. Decisions: own the source (copy-paste model), Tailwind coexistence,
  editor migrated to `@cascivo/editor`.
- **AI tooling wired** (`.mcp.json`): added the Cascivo MCP server
  (`npx -y @cascivo/mcp`) so the migration is driven by `list_components` /
  `select_component` / `get_component` / `add_to_project`.
- **Phase 0 integration spike (green)**: proved Cascivo's React/`signals-react`
  components mount under Preact. Cascivo imports `@preact/signals-react` +
  `@preact/signals-react/runtime`; the bridge aliases `@preact/signals-react →
  @preact/signals` and stubs `useSignals` as a no-op
  (`apps/console/src/shims/signals-react-runtime.ts`). Spike test
  `apps/console/src/spikes/cascivo-preact.spike.test.tsx` (run via
  `vitest.spike.config.ts`) mounts a real Cascivo `<Button>` under Preact and
  confirms signal-driven re-render. Spikes excluded from the default suite.
- **Editor re-validated**: the upgraded `editor/code-editor` manifest now covers
  the previously-missing capabilities (markdown highlighting, find/replace, real
  undo/redo, `applyEdit`/`getSelection` for selection-preserving sync, `onSave`,
  live `theme`). Open item: large-document performance, to be measured before
  retiring CodeMirror.

## 2026-06-22 — Restore habit-tracker streak stats on the dashboard

- **Missing stats row** (`HabitTrackerWidget.tsx`): on the desktop dashboard, `.habit.csv` tiles render in `SMALL` mode, which showed the heat map and a line of muted motivational text but no icon-with-number stats — unlike the mobile views (`MOBILE_COLLAPSED`/`MOBILE_EXPANDED`), which display a `Flame` icon plus streak numbers. The dashboard tile was therefore "missing the icons with numbers below the heat map".
- **Fix**: added a compact stat row directly below the heat map in the shared `SMALL`/`FOCUS` render, showing `Flame` → current daily streak (days), `CalendarCheck` → weekly streak (weeks), and `Trophy` → total completions. Reuses the already-computed `stats` (`currentStreak`, `weekStreak`, `totalCount`) and the existing `--los-accent`/`--los-muted` styling; the motivational `streakText` line is unchanged.

## 2026-06-19 — Wiki previews for JSON, CSV, and plain-text files

- **JSON preview** (`WikiView.tsx`): `.json` files render syntax-highlighted via `highlight.js` (imported as `highlight.js/lib/core` + the `json` language only, to avoid pulling the full bundle). Falls back to raw text if highlighting throws.
- **CSV preview** (`WikiView.tsx`): `.csv` files render as a table. Added a minimal RFC-4180-style `parseCsv` (handles quoted fields with embedded commas, escaped `""` quotes, and CRLF/LF) instead of reusing the heavier `CsvTableView` widget, which carries sort/filter/pagination and the app's `--los-*` theme rather than the wiki's GitHub-dark palette.
- **Plain-text fallback**: all other non-binary files render their content as-is in a `<pre>`. Binary files (detected via NUL bytes or a high ratio of U+FFFD replacement characters) keep the "no preview / open in editor" message.
- The Markdown branch is unchanged; preview selection now keys off `isLoaded` (file present in `openFiles`) so empty files no longer show a perpetual "Loading…".

## 2026-06-19 — Wiki collapsed-by-default tree and edit-navigation fix

- **Lazy sidebar tree** (`WikiView.tsx`): `WikiTreeItem` now defaults `expanded` to `false` instead of `true`. The sidebar renders only the root folders/files on load; expanding a folder reveals just its direct children (each still collapsed), instead of rendering the entire repo tree fully expanded.
- **Edit navigation fix** (`WikiPage.tsx`): clicking "Edit" called `layoutStore.navigate(path)` then `route('/')`. Routing to `/` remounts `MainApp`, whose URL→State resolver reads pathname `/` and resets `activeTileId` to `null`, discarding the focus — so the editor never opened. Now routes to `/files/<encoded path>` so the resolver detects the file and opens it in the editor. Removed the now-unused `layoutStore` import.

## 2026-06-19 — Wiki magic menu link and empty-view fix

- **Wiki in magic menu** (`MainApp.tsx`): added an `onWikiClick` prop and a "Wiki" item to the `StatusBar` menu, following the same conditional-prop pattern as Knowledge Base / Board. Wired from `Dashboard.tsx` as `onWikiClick={() => route('/wiki')}`. The `/wiki` route existed but was unreachable from the app UI.
- **Empty Wiki view fix** (`WikiPage.tsx`): `WikiView` renders from `githubFileStore.tree`, which was only populated by the Dashboard. Direct navigation to `/wiki` left the tree empty, so no files rendered. Added a mount effect that calls `githubFileStore.loadTree()` when the tree is empty — the same pattern used by `QuickNotePage`/`QuickLogPage`/`QuickTodoPage`.

## 2026-06-14 — Fix editor cursor jumping to the top

- **Root cause** (`apps/console/src/components/editor/CodeMirrorEditor.tsx`): the store-sync paths replaced the whole document (`{ from: 0, to: doc.length, insert: content }`) whenever store content differed from the editor. Because `githubFileStore.openFiles` is mutated by background work (`openFile` network revalidation, `saveFile`), the store-connected `useSignalEffect` re-ran mid-edit and the full-document replace collapsed the caret to position 0 — the cursor "jumping to the top" on desktop and mobile.
- **`docSync.ts`** (new): `computeMinimalChange(current, next)` derives the smallest replacement by preserving the shared prefix/suffix, and `syncDocPreservingSelection(view, content)` dispatches only that minimal change so CodeMirror maps the existing cursor/selection through a localized edit instead of resetting it.
- **`CodeMirrorEditor`**: the late-`initialContent` sync and the same-path external-update sync now call `syncDocPreservingSelection`. The path-change branch keeps a full replace (a new file should reset the caret to the top).
- **`docSync.test.ts`** (new): regression tests for the minimal-diff logic and, via `EditorState` selection mapping, that an external content update keeps the caret in place rather than collapsing it to 0.

## 2026-05-05 — Board Overview dashboard widget

- **`BoardOverviewWidget`** (`packages/ui/src/LifeOS/Organisms/Widgets/BoardOverviewWidget.tsx`): new widget that reads all `.todos.md` files from `githubFileStore` and `layoutStore` (same file resolution as `KanbanBoard`) and displays three stats: inbox (backlog count), in-progress count, and overdue count (in-progress items with `updatedAt`/`createdAt` older than 7 days). Clicking any part of the widget calls `onNavigate` to jump to the Board view.
- **`MainApp` wired** (`renderRawTileContent`): added `.board-overview.json` extension case; passes `onBoardClick` through as `onNavigate`.
- **`Dashboard` wired** (`renderFile` isWidget check): `.board-overview.json` treated as a widget so it renders via `FileViewer` rather than the plain editor.
- **`NewFileWizard` template**: added "Board Overview" entry with `Kanban` icon and `.board-overview.json` extension; default content `{}`.

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
