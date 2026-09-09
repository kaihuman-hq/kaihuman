# Features

## Landing pages (`apps/landing-page`, `apps/landing-page-nextgen`)

| Feature | Location | Added |
|---------|----------|-------|
| Auto-generated, seamless-looping product screencast (demo-mode walkthrough) | both pages' demo section + `landing-page-nextgen/scripts/record-screencast.mjs` | 2026-06-25 |

## Console (`apps/console`)

| Feature | Route/Location | Added |
|---------|---------------|-------|
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
