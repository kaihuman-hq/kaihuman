# Features

## Landing pages (`apps/landing-page`, `apps/landing-page-nextgen`)

| Feature | Location | Added |
|---------|----------|-------|
| Auto-generated, seamless-looping product screencast (demo-mode walkthrough) | both pages' demo section + `landing-page-nextgen/scripts/record-screencast.mjs` | 2026-06-25 |

## Console (`apps/console`)

| Feature | Route/Location | Added |
|---------|---------------|-------|
| Cheatsheet (tabbed reference: KB how-to, capture, CLI keys, slash commands) | `/cheatsheet` | 2026-07-18 |
| Quick Knowledge capture (free-text → `.kh/raw/`) | `/quick-knowledge` | 2026-07-18 |
| KB journal — monthly `.kh/journal/YYYY-MM.md` from `/kb-ingest` | `.kh/journal/` | 2026-07-18 |
| Configurable desktop bottom navbar (stored in `.kh` config) | Settings → Bottom Navbar | 2026-06-26 |
| Demo mode (in-memory seeded data) | `/demo` + login "View demo" | 2026-06-25 |
| Quick todo to inbox | `/quick-todo` | 2026-03-28 |
| Quick note to dump.md | `/quick-note` | 2026-03-28 |
| Shortcuts setup guide | `/shortcuts` | 2026-03-28 |
| Android long-press shortcuts | manifest.webmanifest | 2026-03-28 |
| Inbox always on board | KanbanBoard | 2026-03-28 |
| Move todo between files | KanbanBoard card hover | 2026-03-28 |

## CLI (`apps/cli`)

| Feature | Key | Added |
|---------|-----|-------|
| GitHub OAuth login | `l` | Initial |
| Quick note to active repo | `n` | Initial |
| Knowledge note to `.kh/raw/` | `k` | 2026-07-18 |
| Headless knowledge capture (offline-safe spool) | `cli capture` | 2026-07-18 |
| Desktop quick-capture overlay (Hyprland `Super+K`) | `scripts/kh-capture` | 2026-07-18 |
| Native-sdk capture app (experimental, Zig core, direct GitHub API + auth.json reuse) | `apps/kh-capture-native` | 2026-07-18 |
| Agent-driven capture skill (drives native app via automation server; app acceptance test) | `.claude/skills/kb-agent-capture` | 2026-07-18 |
| Select active repository | `s` | Initial |
| Local AI server proxy | `cargo run -- server` | Initial |
| AI prompt (Claude / Copilot / Gemini) | `a` | 2026-03-19 |
| File browser with recent files | `f` | 2026-03-19 |
| Nano-like file editor | via file browser | 2026-03-19 |
| Dashboard config view | `d` | 2026-03-19 |
| Repo git sync before file actions | automatic | 2026-03-19 |
