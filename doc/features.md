# Features

## Landing pages (`apps/landing-page`, `apps/landing-page-nextgen`)

| Feature | Location | Added |
|---------|----------|-------|
| Auto-generated, seamless-looping product screencast (demo-mode walkthrough) | both pages' demo section + `landing-page-nextgen/scripts/record-screencast.mjs` | 2026-06-25 |

## Console (`apps/console`)

| Feature | Route/Location | Added |
|---------|---------------|-------|
| Bookmarks: rename, change the link or delete any entry, including in search results | Bookmarks widget → pencil / trash | 2026-09-25 |
| Command palette settings (`.kh/command-palette.settings.json`) — search engines and `>`-prefixed link tools with parameters, added, removed and reordered in a widget | New File → Command Palette Settings | 2026-09-24 |
| `>q` knowledge capture — what is typed becomes its own `.kh/raw/` file for `/kb-ingest`, the same file `cli capture` writes; any text in the main search also offers **Capture “…”** | command palette, desktop palette | 2026-09-24 |
| Metric ⇄ US customary units in the palette's conversions — length (and heights in feet and inches), mass, volume, area, speed, temperature; `5 km in ft` for one unit; lengths ⇄ pixels at 80, 150 and 300 dpi (`10 cm to px`, `1000 px`) | command palette, desktop palette (main search and `>k`) | 2026-09-24 |
| `>w` GitHub work (review requests, assigned, your PRs with failing checks), `>k` conversions (colors, number bases, arithmetic, timestamps, case, Lorem ipsum; inline in the main search for colors, sums and timestamps), `>s` symbols, emoji and kaomoji; a prefix that a longer one starts with is entered after a space | command palette, desktop palette | 2026-09-24 |
| `>a` ask AI — the typed question to ChatGPT, Claude, Gemini, GitHub Copilot or Perplexity (configurable assistants, also in the settings widget); default link tools `>e` LEO, `>m` Google Maps, `>n` npm, `>i` IMDb | command palette, desktop palette, Command Palette Settings widget | 2026-09-24 |
| Read it later: **CLEAR ALL** empties the reading list after a confirmation | Read it later widget | 2026-09-24 |
| Wiki view: clickable `[[wikilinks]]`, backlinks, page type and tags, tag filter, repo-stored images | `/wiki` | 2026-09-23 |
| Knowledge base commands: `/kb-ask --save` files answers, new `/kb-digest` for personal data, interactive `/kb-ingest`, `/kb-lint` stale claims and suggestions | `/knowledge` → Commands | 2026-09-23 |
| Bookmarks (`.bookmarks.json`) — tagged, searchable bookmarks; mirrored into the browser extension | New File → Bookmarks | 2026-09-22 |
| Command library (`.commands.md`) — shell commands with `{{name}}` parameters, a field per parameter and copy; run from the desktop palette (`>x`) | New File → Commands | 2026-09-23 |
| Prompt library (`.prompts.md`) — searchable, taggable prompts in one grep-able file | New File → Prompts | 2026-09-16 |
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

## Browser extension (`apps/browser-extension`)

| Feature | Location | Added |
|---------|----------|-------|
| Start page "today" view: upcoming events and milestone, in-progress/overdue todos and inbox count, habit check-in and time-tracking clock cards, read-later queue, world clocks — from one hourly cache | start page | 2026-09-23 |
| Start page capture box writes a note, an inbox todo or an action log entry | start page | 2026-09-23 |
| Sync status (age of the cached data, opens waiting to be pushed) with a sync button | start page header | 2026-09-23 |
| Read later: this page — adds the page to the repo's `.readitlater.json` | command palette, popup clock icon | 2026-09-23 |
| Pin to Knowledge Base saves the page as Markdown with its images in `.kh/assets/` (popup toggle turns image downloads off) | popup, palette | 2026-09-23 |
| Selected-text clips go to `.kh/raw/` as their own notes | context menu, palette | 2026-09-23 |
| Recent per prefix: each palette mode lists the last 10 entries chosen in it first | command palette, desktop palette | 2026-09-24 |
| One shared way to add todos, action log entries, events, prompts and commands (`packages/formats`), used by the console, popup, start page and palettes alike | all apps | 2026-09-24 |
| Widget entries from the palette: ⏎ on a todo list, action log, events, prompts or commands file (from `>f` or ⇥ repo search) offers **Open in Kaihuman** or **Add …**, written as the console widget's Add form writes it | command palette, desktop palette | 2026-09-24 |
| `>g` GitHub search (repository, then issues or pull requests, then the term) and `>l` Tsuga logs | command palette, desktop palette | 2026-09-23 |
| `>x` commands from `.commands.md` — fill in parameters, then copy (extension) or copy / run in ghostty / run in the background (desktop) | command palette, desktop palette | 2026-09-23 |
| Prefixes are `>` plus a letter (`>p`, `>t`…); `>b` lists bookmarks only | command palette, desktop palette | 2026-09-23 |
| Palette prefix modes: `>p` prompts from the repo's `.prompts.md` files (⏎ copies), `>t` DeepL translation into EN/DE (typed text is offered too; the last 20 texts are kept to translate again), `>r` GitHub repositories with ⇥ for issues, PRs… | command palette (pages and start page) | 2026-09-23 |
| Web search from the command palette — Google, DuckDuckGo, Ecosia, Amazon, Amazon.de, Reddit, Bing, Brave Search, Startpage, Wikipedia, YouTube, GitHub, Stack Overflow, Yahoo, Qwant by default, by URL only; engines and link tools configurable in `.kh/command-palette.settings.json` (2026-09-24) | command palette (pages and start page), desktop palette | 2026-09-23 |
| Pinned tab groups on the start page — compact cards above the bookmarks; a click loads the group | start page | 2026-09-23 |
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

## Knowledge base MCP server (`apps/kb-mcp`)

| Feature | Location | Added |
|---------|----------|-------|
| stdio MCP server: `kb_search`, `kb_read`, `kb_list`, `kb_index`, `kb_log`, `kb_add_raw` over a local clone | `lifosy-kb-mcp --repo <path>` | 2026-09-23 |

## Desktop palette (`apps/desktop-palette`)

| Feature | Location | Added |
|---------|----------|-------|
| The command palette as a desktop overlay, centered on the focused monitor (wlr-layer-shell: Hyprland, Sway, KDE…) | `lifosy-palette-toggle` bound to a key | 2026-09-23 |
| Bookmarks, web search, repo search, notes and action log, recents, repository switch — shared with the extension via `@lifosy/palette` | desktop palette | 2026-09-23 |
| `>f` files: add a todo, action, event, prompt or command to the repo's widget files, or open one in Kaihuman — shared with the extension | desktop palette | 2026-09-24 |
| `>u` shows the cached usage at once with its age (green / yellow / red) and syncs in the background once it is 5 min old | desktop palette | 2026-09-24 |
| `>c` Claude Code (new session on claude.ai for a repo from omarchy's `eee` history) and `>u` Claude usage (rate limits, pace, resets, spend per account) — from omarchy | desktop palette | 2026-09-23 |
| `?` help — every prefix with its description, searching and keys, and every action; searchable, ⏎ switches mode or runs the action | desktop palette, command palette | 2026-09-23 |
| `>d` dumps — a scratch text editor in the palette with the last 25 kept as local files; ⌃⏎ copies all, ⌃S saves a copy to a path | desktop palette | 2026-09-23 |
| `>p` prompts, `>t` translate, `>r` repos — omarchy's prompt, translate and repo menus in the palette; copies with `wl-copy`, and `>r` ranks omarchy's `~/.config/eee/counts` first | desktop palette | 2026-09-23 |
| `lifosy-palette login`: token checked against the repo, kept in the Secret Service | CLI | 2026-09-23 |

## CLI (`apps/cli`)

| Feature | Key | Added |
|---------|-----|-------|
| GitHub OAuth login | `l` | Initial |
| Quick note to active repo | `n` | Initial |
| Knowledge note to `.kh/raw/` | `k` | 2026-07-18 |
| Headless knowledge capture (offline-safe spool) | `cli capture` | 2026-07-18 |
| Desktop quick-capture overlay (Hyprland `Super+K`) | `scripts/kh-capture` | 2026-07-18 |
| Native-sdk capture app (experimental, Zig core, direct GitHub API + auth.json reuse) | `apps/kh-capture-native` | 2026-07-18 |
| Agent-driven capture command (drives native app via automation server; auto-scaffolded to KB repo) | `/kb-agent-capture` | 2026-07-18 |
| Select active repository | `s` | Initial |
| Local AI server proxy | `cargo run -- server` | Initial |
| AI prompt (Claude / Copilot / Gemini) | `a` | 2026-03-19 |
| File browser with recent files | `f` | 2026-03-19 |
| Nano-like file editor | via file browser | 2026-03-19 |
| Dashboard config view | `d` | 2026-03-19 |
| Repo git sync before file actions | automatic | 2026-03-19 |
