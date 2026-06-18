# Wiki Page Design

**Date:** 2026-06-18  
**Status:** Approved

## Goal

Replace GitBook as the knowledge wiki. Serve all markdown files from the user's GitHub repo in-app with a file tree + rendered preview. Edit by opening in the existing dashboard editor.

## Route

`/wiki` — new `ProtectedRoute` added to `apps/console/src/App.tsx`.

## Architecture

### Data sources

- **File tree:** `githubFileStore.tree.value` — flat `TreeItem[]` already in memory after dashboard loads. `type === 'tree'` = folder, `type === 'blob'` = file.
- **File content:** `githubFileStore.openFile(path)` fetches and caches into `githubFileStore.openFiles`. WikiPage reads from there after calling openFile on selection.
- **Edit navigation:** `layoutStore.navigate(path)` opens the file as a dashboard tile, then `route('/')` sends the user to the dashboard.

### State

Local `useState` in `WikiPage`:
- `selectedPath: string | null` — currently selected file path
- No Zustand store needed — selection is ephemeral UI state

## Layout

Two-panel split using `react-resizable-panels` (already in `packages/ui`):

```
┌──────────────┬──────────────────────────────────────┐
│ File Tree    │ Preview                              │
│ (~240px)     │                                      │
│              │  # Page Title                       │
│ ▶ .kh/       │                                      │
│   ▼ wiki/    │  Body rendered as markdown...       │
│     page.md  │                                      │
│   README.md  │  ```js                              │
│ ▶ docs/      │  syntax-highlighted code            │
│              │  ```                                 │
│              │                        [Edit ↗]     │
└──────────────┴──────────────────────────────────────┘
```

- Left panel: min 160px, default ~240px, resizable
- Right panel: fills remaining width

## Components

### `apps/console/src/pages/WikiPage.tsx`

Top-level page. Renders `StatusBar` (mode `"WIKI"`), `PanelGroup`, left `FileTreePanel`, right `PreviewPanel`.

Contains a local recursive `FileTreeNode` component — no need to extract since it's only used here.

**File tree behavior:**
- Folders collapsible; all collapsed by default except path to selected file
- `.md` files: full brightness (`var(--los-fg)`)
- Other file types: dimmed (`var(--los-fg-dim)`)
- Selected file: highlighted with `var(--los-accent)`
- Clicking a file: sets `selectedPath`, calls `githubFileStore.openFile(path)`
- Clicking a non-md file: sets `selectedPath` (shows "no preview" in right panel, still offers Edit)

### `packages/ui/src/components/MarkdownPreview.tsx`

Props: `content: string`. Renders via `react-markdown` + `remark-gfm` + `rehype-highlight`.

Preprocessing: strip leading YAML frontmatter (`---…---`) before passing to react-markdown — the `.kh/` files use frontmatter and it must not render as raw text.

Styling: scoped `.wiki-prose` CSS class using `--los-*` CSS variables:
- `h1–h4`: `var(--los-fg)`, progressively smaller
- `p`, `li`: `var(--los-fg-dim)`, readable line-height
- `code` inline: `var(--los-accent-dim)` background
- `pre`: dark background, `rehype-highlight` handles syntax colors
- `a`: `var(--los-accent)`, underline on hover
- `table`: bordered, `var(--los-bg-hover)` zebra rows
- `blockquote`: `var(--los-border)` left border, italic, dimmed
- Wide tables/code: horizontal scroll, no clip

Exported from `packages/ui/src/index.ts`.

### StatusBar

Add `onWikiClick?: () => void` to `StatusBarProps` in `packages/ui/src/LifeOS/Organisms/StatusBar.tsx`. Render a "Wiki" nav button alongside the existing `onBoardClick`, `onShortcutsClick` etc. buttons — only renders when the prop is provided (optional). Pass `onWikiClick={() => route('/wiki')}` on `KnowledgeBasePage` and `WikiPage`. Other pages do not need to change.

## Edge Cases

| Situation | Behavior |
|-----------|----------|
| File not yet loaded | "Loading…" pulse animation |
| Non-md file selected | "No preview for this file type" + Edit button |
| Empty file | "Empty file" placeholder |
| No file selected | "Select a file from the tree" placeholder |
| Tree not loaded yet | Same loading state as dashboard (repo not selected / tree empty) |

## Files Changed

| File | Change |
|------|--------|
| `apps/console/src/pages/WikiPage.tsx` | New |
| `packages/ui/src/components/MarkdownPreview.tsx` | New |
| `packages/ui/src/index.ts` | Export MarkdownPreview |
| `apps/console/src/App.tsx` | Add `/wiki` route |
| `packages/ui/src/LifeOS/Organisms/StatusBar.tsx` | Add `onWikiClick` prop + button |
| `apps/console/src/pages/KnowledgeBasePage.tsx` | Replace wiki tab body with "Open wiki →" link |

## Out of Scope

- Deep-linking to specific file via URL (no `/wiki/:path*` route — selection is local state)
- Full-text search within wiki (GitHub search already covers this)
- Wiki-link (`[[page]]`) resolution
- Graph view
