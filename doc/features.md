# Features

## Landing pages (`apps/landing-page`, `apps/landing-page-nextgen`)

| Feature | Location | Added |
|---------|----------|-------|
| Auto-generated, seamless-looping product screencast (demo-mode walkthrough) | both pages' demo section + `landing-page-nextgen/scripts/record-screencast.mjs` | 2026-06-25 |

## Documentation package (`packages/docspack`)

| Feature | Location | Added |
|---------|----------|-------|
| `@kaihuman/docspack` — every app, package, repo file format and `cli` command documented for AI agents (232 chunks), built and checked with docspack; `docspack ask` answers from it offline | `packages/docspack` | 2026-10-04 |
| "Documented for agents" section and **Docs** nav link | nextgen landing page `#docs` | 2026-10-04 |
| Docs readable on the website: the docspack Markdown rendered as `/docs/` pages, linked from the nav and the docs section | nextgen landing page `/docs/` | 2026-10-07 |
| Link previews: Open Graph and Twitter card tags with a 1200×630 card (`og.png`), canonical links, privacy policy at `/privacy/` | nextgen landing page, console `index.html` | 2026-10-09 |
| Console views documented: knowledge graph, commit history, AI panel, quick dump, push reminders, zen mode | `packages/docspack/docs/32-console-views.md` | 2026-10-04 |

## Console (`apps/console`)

| Feature | Route/Location | Added |
|---------|---------------|-------|
| Ideas overview: every `.kh/ideas/` idea as a card coloured by status, with a 12-week activity strip and a hot/warm/cool/dormant level; status chips, text, product and sort filters; inline log, challenge and status edits | `/ideas` (navbar **Ideas**) | 2026-10-13 |
| Quick idea: one text becomes a seed idea; pasted `kh-idea` hand-off blocks from chat apps are applied | `/quick-idea` | 2026-10-13 |
| `kh-ideas` agent skill installed into the data repo (`.agents/skills/`, `.claude/skills/`) together with `CLAUDE.md` / `AGENTS.md`; set up in one commit from `/knowledge` or `/ideas`, and a half-finished set-up is completed on the next visit | `/knowledge`, `/ideas` | 2026-10-13 |
| Business data module: clients, drafts, issued invoices, time and payments as files under `.kh/business/`; `kh-business` agent skill and a GitHub Action check (formats, totals, numbering, frozen issued files); `enableBusiness` set-up for private repos. Read-only console pages: `/business` dashboard, `/clients`, `/clients/:slug`, `/business/enable`; All / Business / Personal toggle on the board, todo analytics and action log; `[[client:slug]]` wiki links; sample business in demo mode | `.kh/business/`, `doc/business.md`, `/business`, `/clients` | 2026-10-27 |
| Business daily forms: log time, shared running timer, clients and projects, client todo / log lines, payments, offer decisions, draft editor, issue and credit notes, all via one conflict-safe commit per action; palette commands `todo`/`log <client>:`, `timer`, `stop timer`; issued files read-only in the file browser; "Business today" hours and timer line in the browser extension's start page | `/business/time/new`, `/business/drafts/:id`, `doc/business.md` | 2026-11-02 |
| Business client targets in the browser extension and desktop palette: `todo <client>: …`, `log <client>: …`, `timer <client>[/project]`, `stop timer` write the client's files in one commit, as the console does | command palette (extension), desktop palette, `doc/business.md` | 2026-11-03 |
| Business share links: encrypted PDF links for issued offers, invoices and credit notes (key only in the link, EU storage on Cloudflare, per-upload confirm, revoke, expiry for offers, download counts, `/business/shared` page, self-hostable `apps/share-worker`) | `/business/shared`, client page, `doc/business.md` | 2026-11-02 |
| Business expenses: expense list per year, receipt upload (PDF/JPG/PNG/WEBP/HEIC up to 10 MB, in the same commit as the record), retention-aware delete, VAT summary per month/quarter/year (Soll or Ist basis, §19 aware; `vat_basis` choice in the enable form), CSV export of expenses and VAT (German Steuerberater format), year export zip with documents, receipts, summaries and checksums | `/business/expenses`, `doc/business.md` | 2026-11-02 |
| Business retainers and contracts: `Retainers due` card with one-click draft (issuing advances `next_date` once), contract form with optional PDF (10 MB), renewal / notice / end reminders on the dashboard and client page, retention-aware delete | `/business`, `/clients/:slug/contracts/new`, `doc/business.md` | 2026-11-02 |
| Business pipeline board: clients by stage (Lead, Contacted, Offer sent, Active; Past and Lost collapsed) with open amount and last activity, stage change by select | `/business/pipeline`, `doc/business.md` | 2026-11-02 |
| `>id` ideas — list by activity, create a seed idea, `<slug>: <text>` logs on one | command palette, desktop palette | 2026-10-13 |
| `>w` Wi‑Fi — turn it on or off, see the networks in range, connect with a password prompt when needed (NetworkManager via `nmcli`); GitHub work moves to `>gw` | desktop palette | 2026-09-28 |
| Bookmarks: rename, change the link or delete any entry, including in search results | Bookmarks widget → pencil / trash | 2026-09-25 |
| Command palette settings (`.kh/command-palette.settings.json`) — search engines and `>`-prefixed link tools with parameters, added, removed and reordered in a widget | New File → Command Palette Settings | 2026-09-24 |
| `>q` knowledge capture — what is typed becomes its own `.kh/raw/` file for `/kb-ingest`, the same file `kaihuman capture` writes; any text in the main search also offers **Capture “…”** | command palette, desktop palette | 2026-09-24 |
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
| Demo banner: "nothing you change is saved", with **Sign in with GitHub** and **Exit** | demo mode, all pages | 2026-10-09 |
| Quick todo to inbox | `/quick-todo` | 2026-03-28 |
| Quick note to dump.md | `/quick-note` | 2026-03-28 |
| Shortcuts setup guide | `/shortcuts` | 2026-03-28 |
| Android long-press shortcuts | manifest.webmanifest | 2026-03-28 |
| Inbox always on board | KanbanBoard | 2026-03-28 |
| Move todo between files | KanbanBoard card hover | 2026-03-28 |

## Browser extension (`apps/browser-extension`)

| Feature | Location | Added |
|---------|----------|-------|
| Work side panel: pinned streams with labels, Waiting on you / New activity inbox from GitHub, My open PRs, live CI and review status, merged or closed items done by themselves | side panel (popup → **Open work panel**, or the start page card) | 2026-10-14 |
| One capture box that files notes, todos, log entries and events (on-device model) | start page | 2026-10-15 |
| Bookmark and save suggestions: tidy titles, tags, environment, duplicate warning, read-later and knowledge base summaries, types and image alt text | popup, palette | 2026-10-15 |
| New tab cards: likely-next bookmarks, read later for today, focus line, braindump digest | start page | 2026-10-15 |
| Side panel triage: suggestion reasons, find related, inbox labels in your own words with mute, PR/issue TL;DR, standup and week review | side panel | 2026-10-15 |
| Palette: on-device translation, summarize/ask this page, plain-language actions (Ask kaihuman), `>n` meaning search, tidy open tabs | palette, popup | 2026-10-15 |
| New tab ranking: frecency bookmarks, inbox and work card by urgency, overdue todos by due date, habits at risk first, resurfaced idle ideas | start page, side panel | 2026-10-15 |
| Stream and label suggestions from Chrome's on-device model: preselected in the This-tab card, one click on inbox rows, `Alt+Shift+P` and **Suggested stream** file there (new streams included), optional auto-filing of new inbox items | side panel, shortcut, context menu | 2026-10-15 |
| Open the work side panel with Alt+Shift+W or **Open work panel** in the command palette | all pages, start page | 2026-10-14 |
| Pin any tab to a stream: Alt+Shift+P, right-click **Pin to stream ▸**, or the This-tab bar; stored in .kh/browser.streams.json | all pages | 2026-10-14 |
| Work summary card and toolbar badge with the Waiting-on-you count | start page, toolbar icon | 2026-10-14 |
| Service status traffic lights (GitHub, Claude, AWS, Cloudflare, GCP by default; any Statuspage, AWS regions, GCP products via `.kh/browser.status.json`), checked at most every five minutes, no proxy | start page | 2026-10-07 |
| Delete braindumps (and old local dumps) from the desktop palette: `>d`, ⇥ on one, **Delete…**, type DELETE — removed here and, by an immediate sync, from the repo | desktop palette | 2026-09-30 |
| Braindumps on the start page: the ten newest from `.kh/braindumps/` with preview and age, opened to the whole text or in the console, deleted after a second click (only the version shown); a start page on data older than a minute checks the repo | start page | 2026-09-30 |
| Favourite tab groups: ☆/★ on each group chip; favourites come first and are highlighted, saved in the repo file | start page, popup Pinned Tabs panel | 2026-09-30 |
| Start page redesign: full-width two-column layout, Noto Sans Mono bundled, date with ISO week in the header | start page | 2026-09-30 |
| Start page search filters pinned and recent bookmarks as you type; ⏎ hands the text to the palette; `/` focuses it | start page | 2026-09-30 |
| Pinned bookmarks as numbered cards, opened with keys 1–9; recently used as a separate list | start page | 2026-09-30 |
| DEV / INT / PROD tags on recent bookmarks, from a bookmark tag or the title | start page | 2026-09-30 |
| Habit rows with a 7-day strip; working-time timer in the Doing card, ticking in seconds | start page | 2026-09-30 |
| Capture box: Ctrl/⌘+Enter saves; last five entries per kind listed and kept across tabs | start page | 2026-09-30 |
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
| Business tools: `business_clients`, `business_client`, `business_open_invoices`, `business_vat_summary`, `business_reminders`, `business_check` (read) and `business_create_draft`, `business_update_draft`, `business_add_time`, `business_add_todo`, `business_add_log`, `business_add_expense` (draft-only writes, never issue) | `kaihuman-kb-mcp --repo <path>` | 2026-11-03 |
| Ideas tools (`ideas_list`, `ideas_find`, `ideas_read`, `ideas_create`, `ideas_append`, `ideas_set_summary`, `ideas_set_status`, `ideas_import`) and opt-in `--git` commit and push, for Claude Desktop | `kaihuman-kb-mcp --repo <path> --git` | 2026-10-13 |
| stdio MCP server: `kb_search`, `kb_read`, `kb_list`, `kb_index`, `kb_log`, `kb_add_raw` over a local clone | `kaihuman-kb-mcp --repo <path>` | 2026-09-23 |

## Sign-in worker (`apps/auth-worker`)

| Feature | Location | Added |
|---------|----------|-------|
| GitHub OAuth sign-in for the console as a Cloudflare Worker without storage bindings: `/login`, `/callback` with a state cookie, token handed straight to the console | `auth.kaihuman.com` | 2026-10-09 |

## Desktop palette (`apps/desktop-palette`)

| Feature | Location | Added |
|---------|----------|-------|
| ⌃I Promote to idea: the braindump becomes a `.kh/ideas/` idea and is deleted | braindump window | 2026-10-13 |
| The command palette as a desktop overlay, centered on the focused monitor (wlr-layer-shell: Hyprland, Sway, KDE…) | `kaihuman-palette-toggle` bound to a key | 2026-09-23 |
| Bookmarks, web search, repo search, notes and action log, recents, repository switch — shared with the extension via `@kaihuman/palette` | desktop palette | 2026-09-23 |
| `>f` files: add a todo, action, event, prompt or command to the repo's widget files, or open one in Kaihuman — shared with the extension | desktop palette | 2026-09-24 |
| `>o` files on this computer: by name, `>o c: …` by contents too, in the home directory or with `>o a: …` the whole file system (`fd`/`find`, `rg`/`grep`); ⏎ opens with the default app, ⇥ opens the folder in the file manager or ghostty | desktop palette | 2026-10-04 |
| `>u` shows the cached usage at once with its age (green / yellow / red) and syncs in the background once it is 5 min old | desktop palette | 2026-09-24 |
| `>c` Claude Code (new session on claude.ai for a repo from omarchy's `eee` history) and `>u` Claude usage (rate limits, pace, resets, spend per account) — from omarchy | desktop palette | 2026-09-23 |
| `?` help — every prefix with its description, searching and keys, and every action; searchable, ⏎ switches mode or runs the action | desktop palette, command palette | 2026-09-23 |
| Find in a braindump: ⌃F in the braindump window opens a find bar that highlights every match in the text (the current one in orange) and counts them; ⏎ / ⇧⏎ step through, Esc goes back to the text with the match selected | desktop palette | 2026-10-06 |
| Braindump window — its own key (`kaihuman-palette-toggle braindump`) or `>d` opens a text window that saves as you type and keeps each braindump in the repo (`.kh/braindumps/`), synced when you stop; ⌃O lists them, ⌃N starts another, ⌃⏎ copies all | desktop palette | 2026-09-30 |
| Same active repository as the browser extension, through Chrome native messaging (`kaihuman-palette native-host install <id>`); the newer choice wins | desktop palette, browser extension | 2026-09-30 |
| `>d` dumps — a scratch text editor in the palette with the last 25 kept as local files; ⌃⏎ copies all, ⌃S saves a copy to a path (replaced by braindumps on 2026-09-30; old dumps stay listed) | desktop palette | 2026-09-23 |
| `>p` prompts, `>t` translate, `>r` repos — omarchy's prompt, translate and repo menus in the palette; copies with `wl-copy`, and `>r` ranks omarchy's `~/.config/eee/counts` first | desktop palette | 2026-09-23 |
| `kaihuman-palette login`: token checked against the repo, kept in the Secret Service | CLI | 2026-09-23 |

## CLI (`apps/cli`)

| Feature | Key | Added |
|---------|-----|-------|
| GitHub OAuth login | `l` | Initial |
| Quick note to active repo | `n` | Initial |
| Knowledge note to `.kh/raw/` | `k` | 2026-07-18 |
| Headless knowledge capture (offline-safe spool) | `kaihuman capture` | 2026-07-18 |
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
