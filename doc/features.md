# Features

## Landing pages (`apps/landing-page`, `apps/landing-page-nextgen`)

| Feature | Location | Added |
|---------|----------|-------|
| Auto-generated, seamless-looping product screencast (demo-mode walkthrough) | both pages' demo section + `landing-page-nextgen/scripts/record-screencast.mjs` | 2026-06-25 |

## Console (`apps/console`)

| Feature | Route/Location | Added |
|---------|---------------|-------|
| Bookmarks (`.bookmarks.json`) — tagged, searchable bookmarks; mirrored into the browser extension | New File → Bookmarks | 2026-09-22 |
| Prompt library (`.prompts.md`) — searchable, taggable prompts in one grep-able file | New File → Prompts | 2026-09-16 |
| Configurable desktop bottom navbar (stored in `.kh` config) | Settings → Bottom Navbar | 2026-06-26 |
| Demo mode (in-memory seeded data) | `/demo` + login "View demo" | 2026-06-25 |
| Quick todo to inbox | `/quick-todo` | 2026-03-28 |
| Quick note to dump.md | `/quick-note` | 2026-03-28 |
| Shortcuts setup guide | `/shortcuts` | 2026-03-28 |
| Android long-press shortcuts | manifest.webmanifest | 2026-03-28 |
| Inbox always on board | KanbanBoard | 2026-03-28 |
| Move todo between files | KanbanBoard card hover | 2026-03-28 |

## Browser extension (`apps/browser-extension`)

| Feature | Location | Added |
|---------|----------|-------|
| Pinned bookmarks — always first on the start page; pin/unpin from its cards or the console widget | start page cards, Bookmarks widget | 2026-09-22 |
| Start page — kaihuman's own New Tab page: palette, recently used bookmarks, dump note | New Tab (`chrome_url_overrides`) | 2026-09-22 |
| Command palette on the New Tab page, which Chrome's own page cannot host | start page | 2026-09-22 |
| The **kaihuman** title opens app.kaihuman.com | popup header, start page header | 2026-09-22 |
| Sync now — fetch and push immediately, ignoring the hourly budget | popup header, palette → Actions | 2026-09-22 |
| Guided bookmark entry — URL, title and tags editable in both the popup and the palette | popup star, palette → Bookmark this page… | 2026-09-22 |
| Bookmark usage counts, merged additively and synced at most hourly | service worker, console widget | 2026-09-22 |
| Sort bookmarks by least/most used, to find ones worth deleting | Bookmarks widget → LEAST USED | 2026-09-22 |
| Recent actions — the palette's last ten opens and actions, newest first | palette → Recent | 2026-09-22 |
| Every popup/context-menu action as a palette action (notes, clippings, pinned-tab groups, repo switch) | palette → Actions | 2026-09-22 |
| Import this browser's bookmarks into the repo file, tagged by folder | popup star → Import, palette → Actions | 2026-09-22 |
| Pinned-tab groups cached and synced in the background, like bookmarks | service worker | 2026-09-22 |
| Bookmark the current page (popup star opens a tags view with Save/Skip; palette action) | popup, palette | 2026-09-22 |
| Command palette on `Ctrl+Shift+K` — searches cached bookmarks locally; repo code search on `Tab`, opening hits in the console | any page (content script) | 2026-09-22 |
| Bookmarks mirror with background sync (cached from `.kh/browser.bookmarks.json`) | service worker | 2026-09-22 |
| Edit mode for pinned-tab groups (rename/reorder/delete behind an Edit toggle; one large Load button otherwise) | popup → Pinned Tabs | 2026-09-13 |
| Named pinned-tab groups (save/load/update/rename/reorder/delete via `.kh/browser.pinnedtabs.json`) | popup → Pinned Tabs | 2026-09-09 |
| Pinned tabs sync (save/restore Chrome pinned tabs via `.kh/browser.pinnedtabs.json`) | popup → Pinned Tabs | 2026-09-03 |

## CLI (`apps/cli`)

| Feature | Key | Added |
|---------|-----|-------|
| GitHub OAuth login | `l` | Initial |
| Quick note to active repo | `n` | Initial |
| Select active repository | `s` | Initial |
| Local AI server proxy | `cargo run -- server` | Initial |
| AI prompt (Claude / Copilot / Gemini) | `a` | 2026-03-19 |
| File browser with recent files | `f` | 2026-03-19 |
| Nano-like file editor | via file browser | 2026-03-19 |
| Dashboard config view | `d` | 2026-03-19 |
| Repo git sync before file actions | automatic | 2026-03-19 |
