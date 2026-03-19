# Progress

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
