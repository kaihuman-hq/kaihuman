# Web console

The web console is the main Lifosy (kaihuman) web app, in `apps/console` (package `@lifosy/app-console`). It is a Preact + Vite + Tailwind CSS single-page app, installable as a PWA, that reads and writes plain files in your own GitHub repository through the GitHub API. Most UI lives in `packages/ui` (`@lifosy/ui`) and the stores and GitHub service live in `packages/core` (`@lifosy/core`); the console wires them to routes. It is deployed to Cloudflare Pages and served at `app.kaihuman.com`.

## Running the console locally
<!-- docspack: tags=dev server,start,localhost,pnpm dev -->

Run `pnpm install` once at the monorepo root. Then start the Vite dev server from `apps/console`:

```sh
cd apps/console
pnpm dev          # generates src/version.ts, then vite (port 4300, see vite.config.ts)
pnpm prod         # dev server with --mode prod (reads .env.prod)
```

From the root, `pnpm dev:console` runs `turbo run dev watch --filter=@lifosy/app-console --filter=@lifosy/ui`, so changes in `packages/ui` rebuild too. The root `README.md` also shows `pnpm dev --filter=@lifosy/app-console`.

Login needs the env variable `VITE_GH_LOGIN`, the URL of the GitHub OAuth gateway. It is set in `apps/console/.env.prod`. Without it, `authStore.login()` logs `VITE_GH_LOGIN is not defined` and does nothing. Use `/demo` to try the app without a login.

## Building, testing and linting the console
<!-- docspack: tags=build,vitest,biome,typecheck,version bump -->

Scripts in `apps/console/package.json`:

| Script | Does |
|--------|------|
| `pnpm build` | `node scripts/generate-version.js && vite build` |
| `pnpm build:prod` | Bumps the patch version (`scripts/bump-version.js`), then `vite build --mode prod` |
| `pnpm preview` | Serves the production build locally |
| `pnpm test` | `vitest run` (jsdom, setup in `vitest.setup.ts`) |
| `pnpm lint` / `pnpm format` / `pnpm fix` | `biome check .`, with `--write`, or `--write --unsafe` |
| `pnpm check-types` | `tsc --noEmit` |
| `pnpm version:bump[:minor|:major]` | Bumps `version.json` and regenerates `src/version.ts` |

The default Vitest config excludes `src/spikes/**`. Those spike tests run only with `vitest.spike.config.ts`. The version (`version.json`, shown in the status bar) and `src/version.ts` (generated, with build time and git hash) are described in `apps/console/VERSION.md`. Type checking the console may need `@lifosy/ui` to be built first.

## Deploying the console
<!-- docspack: tags=deploy,cloudflare pages,ci,github actions -->

The workflow `.github/workflows/deploy-magic-life-os.yaml` ("[PROD] Deploy Life OS") deploys the console. It runs on a push to `main` that touches `apps/console/**`, or by `workflow_dispatch`.

- It calls `template-deploy-to-cloudflare.yaml` with `buildTarget: console:build`.
- The root script `console:build` runs `turbo run build:prod --filter=@lifosy/app-console`, which bumps the patch version.
- It uploads `apps/console/dist` to the Cloudflare Pages project `lifosy-console`.
- It commits the generated `apps/console/src/version.ts` and `apps/console/version.json` back to the branch.
- Secrets: `CF_ACCOUNT_ID`, `CF_API_TOKEN`.

`public/_redirects` contains `/* /index.html 200`, so every deep link (like `/quick-todo` or `/files/...`) loads the SPA.

## Where the console code lives
<!-- docspack: tags=source layout,architecture,files,folders -->

| Path | Holds |
|------|-------|
| `apps/console/src/App.tsx` | The router (`preact-router`) and `ProtectedRoute` |
| `apps/console/src/pages/` | One component per route (`Dashboard.tsx`, `QuickTodoPage.tsx`, `KnowledgeBasePage.tsx`, …) |
| `apps/console/src/components/` | `FileViewer`, `editor/CodeMirrorEditor.tsx`, `KBCommandsModal`, `ExtensionAuthBridge`, `ErrorBoundary` |
| `apps/console/src/lib/` | `github-kb.ts` (knowledge base API), `kb-skills.ts` (scaffolded `/kb-*` skill text), `cli-callback.ts` |
| `apps/console/src/hooks/useManifest.ts` | Per-page PWA manifest swap |
| `apps/console/vite.config.ts` | PWA manifest, Android shortcuts, aliases, port |
| `packages/ui/src/LifeOS/Layouts/MainApp.tsx` | The dashboard shell, Ctrl+K search, zen mode, views |
| `packages/ui/src/LifeOS/Organisms/` | `StatusBar`, `SearchModal`, `SettingsView`, `NewFileWizard`, `WikiView`, widgets |
| `packages/ui/src/LifeOS/Templates/` | `KanbanBoard`, `TodoAnalytics`, `ActionLogView`, `Login` |
| `packages/core/src/stores/` | `authStore`, `githubFileStore`, `githubProfileStore`, `layoutStore`, `navigationStore`, demo store |

State uses Preact signals in these stores. Widget file formats come from `packages/formats` (`@lifosy/formats`). React imports are aliased to `preact/compat` in `vite.config.ts`.

## Console routes
<!-- docspack: tags=urls,pages,router,paths -->

All routes are in `apps/console/src/App.tsx`. Routes marked protected show the login page when there is no token.

| Route | Page | Protected |
|-------|------|-----------|
| `/login` | `Login` | no |
| `/demo` | `DemoEntry` — starts demo mode | no |
| `/auth/cli` | `AuthCli` — token hand-off to the CLI or desktop palette | no |
| `/` | `Dashboard` (also `/files`, `/files/:rest*`, `/new`) | yes |
| `/board` | `KanbanBoardPage` | yes |
| `/analytics` | `TodoAnalyticsPage` | yes |
| `/action-log` | `ActionLogViewPage` | yes |
| `/quick-todo`, `/quick-note`, `/quick-knowledge`, `/quick-log` | Quick capture pages | yes |
| `/shortcuts` | `ShortcutsPage` | yes |
| `/cheatsheet` | `CheatsheetPage` | yes |
| `/knowledge` | `KnowledgeBasePage` | yes |
| `/wiki` | `WikiPage` | yes |
| `/extension-onboarded` | `ExtensionSuccess` | yes |

Any other path renders `NotFound` from `@lifosy/ui`. `/files/<path>` opens that repo file in the editor; `/files/new` and `/new` open the New File wizard. A `?repo=owner/name` parameter on a deep link selects that repository first (the browser extension sends it).

## Signing in with GitHub
<!-- docspack: tags=login,oauth,auth,token,logout -->

The login page (`Login` in `packages/ui/src/LifeOS/Templates/Login.tsx`) has a **Sign in with GitHub** button and a **View demo** button.

1. **Sign in with GitHub** calls `authStore.login()`, which sends the browser to `VITE_GH_LOGIN` (the OAuth gateway).
2. The gateway returns to the console with `?access_token=…`.
3. `ProtectedRoute` calls `authStore.handleCallback()` first on every protected route. It stores the token and strips it from the URL.
4. If you opened a deep link before login, it was saved in `localStorage` key `lifeos_redirect` (path and query) and you are sent back to it.

The token is kept in IndexedDB, with `localStorage` key `lifeos_gh_token` as a backup. Logout sets `lifeos_logged_out` and clears the token. After login, `Dashboard` fetches your repositories; with no repository selected it shows `RepositorySelector`. The selected repo is `githubProfileStore.currentRepo`.

## Trying the console in demo mode
<!-- docspack: tags=demo,try without login,sample data,in-memory -->

Demo mode runs the console on seeded, in-memory data, with no GitHub account. Open `/demo`, or click **View demo** on the login page. Both call `enterDemoMode()` from `@lifosy/core` and route to `/`.

- `enterDemoMode()` (`packages/core/src/stores/demo.store.ts`) loads `buildDemoSeed()` (`packages/core/src/demo/seed.ts`) into `inMemoryGithubService` and sets the `demoMode` signal.
- All persistence goes to memory; nothing is written to `localStorage` or IndexedDB. Data is gone on refresh.
- The seed has three dashboards (`overview`, `finance`, `reading`) with files like `.kh/projects.todos.md`, `.kh/inbox.todos.md`, `.kh/health.habit.csv`, `.kh/monthly.budget.csv`, `.kh/browser.bookmarks.json` and `.kh/news.rss.json`.
- Dates in the seed are relative to now, so streaks and upcoming events look current.
- `exitDemoMode()` clears the session.

`/demo` is also used to record the landing page screencast.

## Logging in the CLI or desktop palette through the console
<!-- docspack: tags=auth cli,token handoff,localhost callback,desktop palette login -->

The CLI and the desktop palette log in by opening `/auth/cli?port=<port>&state=<state>` in the browser. The `AuthCli` page (`apps/console/src/pages/AuthCli.tsx`) works like this:

- If you are not logged in, it shows **Login to Continue**.
- When logged in, `submitCliCallback()` (`src/lib/cli-callback.ts`) builds a hidden form and POSTs `token`, `state` and `repo` (the current repo) to `http://localhost:<port>/callback`.
- A POST keeps the token out of the browser history. Older versions redirected with the token in the query.
- `isCallbackPort()` accepts only a number from 1 to 65535; otherwise the page shows an error.
- If `port` is missing it defaults to `3000`.

## How the browser extension gets the console token
<!-- docspack: tags=extension auth,bridge,onboarding -->

`ExtensionAuthBridge` (`apps/console/src/components/ExtensionAuthBridge.tsx`) is mounted on every page. It writes these attributes on `<body>` for the extension's content script:

- `data-lifosy-auth` — the GitHub token
- `data-lifosy-repo` — the selected repo `owner/name`
- `data-lifosy-repos` — the repo list as JSON

It also dispatches a `lifosy-auth-update` window event with `{ token, repo, repos }`. The `/extension-onboarded` page fetches the repos, shows "You're connected." and closes itself 1.5 s after the extension fires `EXTENSION_ONBOARDED`.

## Dashboard config file
<!-- docspack: tags=.dashboard.config.json,workspaces,tiles,theme,recent files -->

The dashboard reads `<appFolder>/.dashboard.config.json`, normally `.kh/.dashboard.config.json`. The app folder is `.kh`; an old `.lifeos` folder is still read and migrated to `.kh` by `githubFileStore.migrateAppFolder()`. The type is `DashboardConfig` in `packages/core/src/models/types.ts`.

```json
{
  "version": 1,
  "dashboards": [{ "id": "default", "name": "Main" }],
  "entries": [{ "path": ".kh/inbox.todos.md", "dashboard": "default" }],
  "theme": "nexus",
  "files": { "recentlyOpened": [], "quickNotes": [] },
  "navbar": ["dashboard", "files", "board", "shortcuts"]
}
```

- `dashboards` are the workspaces; `entries` place a file as a tile on one (optional `skipOnMobile`).
- `theme` is `nexus` (default), `light` or `amethyst`.
- `files.recentlyOpened` keeps the last 10 opened files; `files.quickNotes` lists quick-note targets for the extension.
- With no file, the console uses one `Main` dashboard and no entries.
- On load, entries and recent files that point to deleted files are removed, and `.lifeos/` paths are rewritten to `.kh/`.
- Every change is saved (committed) at once. The files of the first dashboard are pre-loaded before the dashboard shows.

## Changing workspaces, theme and the bottom navbar
<!-- docspack: tags=settings,bottom navbar,theme,workspaces,customize navbar -->

The Settings view (`SettingsView` in `packages/ui/src/LifeOS/Organisms/SettingsView.tsx`) edits `.dashboard.config.json`. It has these sections:

- **APPEARANCE** — theme `nexus`, `light` or `amethyst`.
- **DASHBOARDS (WORKSPACES)** — add, rename, reorder or delete workspaces.
- **BOTTOM NAVBAR** — which items the desktop bottom bar shows, and their order. Items are added from **AVAILABLE**, removed or moved.
- **NOTIFICATIONS** — enable push notifications.

The navbar items are listed in `NAVBAR_ITEMS` (`packages/ui/src/LifeOS/navbar-items.ts`): `dashboard`, `files`, `board`, `shortcuts`, `wiki`, `knowledge`, `actionLog`, `graph`, `commits`. The order is saved in the `navbar` key. Without it, `DEFAULT_NAVBAR` is `dashboard`, `files`, `board`, `shortcuts`.

## Navigating on mobile and desktop
<!-- docspack: tags=status bar,tab bar,fab,more sheet,mobile navigation -->

`StatusBar` (`packages/ui/src/LifeOS/Organisms/StatusBar.tsx`) is the bottom bar on every page. Its state lives in `navigationStore` (`packages/core/src/stores/navigation.store.ts`).

- **Desktop (≥ 768 px):** a bar with the configured navbar items, the repo and workspace selectors, and a magic button that opens an overflow drawer.
- **Mobile (< 768 px):** four tabs — Home, Board, Search and More. More opens a sheet with Files, Shortcuts, Analytics, Graph, Commits, Repositories, Workspaces and Settings. Swipe it down to close.
- **Mobile FAB:** a tap opens a quick note; a long press (500 ms) shows **New Note**, **Quick Todo** (`/quick-todo`) and **Log Entry** (`/quick-log`).

The design and its checklist are in `doc/navigation-improvements.md`.

## Searching files and running commands with Ctrl+K
<!-- docspack: tags=command palette,search modal,cmd+k,keyboard shortcuts,zen mode -->

In the console, `Ctrl+K` (or `Cmd+K`) toggles the search modal (`SearchModal` in `packages/ui/src/LifeOS/Organisms/SearchModal.tsx`). It has no `>` prefixes; those belong to the browser extension and desktop palettes.

- It matches file names against the loaded repo tree at once.
- After 500 ms it runs one GitHub code search (`/search/code`, `per_page=10`) in the current repo, with one retry on HTTP 403.
- Commands: **Navigate to Files**, **Create new File**, **Open Shortcuts**, **Open Action Log**, **Open Wiki**, **Open Knowledge Base**, **Knowledge Base Commands**, plus **Switch to Repo …** and **Switch to Workspace …**.
- Keys: `↑`/`↓` to move, `Enter` to open, `Esc` to close.

`Ctrl+Shift+Z` (or `Cmd+Shift+Z`) toggles zen mode for the editor. Both shortcuts are handled in `MainApp.tsx`.

## Where the palette prefixes appear in the console
<!-- docspack: tags=>q,>a,>x,>p,palette prefixes,command palette settings -->

The `>`-prefixed command palette (`>q`, `>a`, `>x`, `>p`, `>w`, `>k`, …) runs in the browser extension and in `apps/desktop-palette`, from `packages/palette`. The console does not run it, but it touches it in three places:

- The **Command Palette Settings** widget edits `.kh/command-palette.settings.json`: search engines, `>a` assistants and link tools (see `# Console widgets`).
- The `.commands.md` and `.prompts.md` widgets edit the files that `>x` and `>p` read.
- The `/cheatsheet` **Quick Capture** tab lists `>q` knowledge capture.

Palette deep links open files in the console as `/files/<path>?repo=owner/name`.

## Editing files in the console
<!-- docspack: tags=editor,codemirror,cascivo,save,autosave,markdown -->

Files open in `FileViewer` (`apps/console/src/components/FileViewer.tsx`), which renders `CodeMirrorEditor` (`src/components/editor/CodeMirrorEditor.tsx`). Despite the name, the editor is now `CodeEditor` from `@cascivo/editor`; the README still says CodeMirror 6.

- The language comes from the file extension (`languageForPath` in `src/components/editor/language.ts`). Unknown or extension-less files use `markdown`.
- `.md` files wrap lines.
- A **SAVE CHANGES** button shows when there are unsaved changes. Saving commits the file to GitHub through `githubFileStore.saveFile()`.
- Dirty files auto-save every 2 minutes.
- Zen mode uses a darker editor theme.
- Files that end in `.enc` are decrypted with a password first (`EncryptedTileWrapper`).

## Capturing a todo to the inbox
<!-- docspack: tags=quick todo,inbox,inbox.todos.md,capture task -->

`/quick-todo` (`apps/console/src/pages/QuickTodoPage.tsx`) adds one task to `<appFolder>/inbox.todos.md`, normally `.kh/inbox.todos.md`.

- Fields: **Task** and optional **Tags** (space or comma separated; `#` is stripped, lowercased).
- **ADD TO INBOX** appends the entry with `addTodoEntry` from `@lifosy/formats` and commits. The file is created if missing.
- **BOARD →** opens `/board`, where the inbox always shows.

The todo file format is documented with the formats, not here.

## Capturing a quick note
<!-- docspack: tags=quick note,dump.md,capture thought -->

`/quick-note` (`apps/console/src/pages/QuickNotePage.tsx`) prepends a line to `<appFolder>/dump.md` (normally `.kh/dump.md`):

```md
- 2026-10-04 your note text
```

The newest note is at the top. **SAVE NOTE** or `Ctrl+Enter` / `Cmd+Enter` saves and commits. The file is created if missing.

## Capturing something you learned
<!-- docspack: tags=quick knowledge,.kh/raw,knowledge capture,til -->

`/quick-knowledge` (`apps/console/src/pages/QuickKnowledgePage.tsx`) writes free text as a new file in `.kh/raw/`, for `/kb-ingest` to compile later. It needs a selected repo.

`addRawNote()` in `src/lib/github-kb.ts` writes `.kh/raw/<epoch-ms>-<slug>.md`:

```md
---
title: "First line, max 80 chars"
url: ''
date: 2026-10-04
processed: false
tags: [general]
---

whole text
```

**SAVE TO KNOWLEDGE** or `Ctrl+Enter` saves. The commit message is `note: add "<title>"`. The CLI (`cli capture`) and the palettes' `>q` write the same kind of file.

## Logging an action
<!-- docspack: tags=quick log,action log,inbox.actionlog.md -->

`/quick-log` (`apps/console/src/pages/QuickLogPage.tsx`) adds a timestamped entry to `<appFolder>/inbox.actionlog.md`, normally `.kh/inbox.actionlog.md`.

- Fields: **What happened?** and optional **Tags**.
- **LOG IT** or `Ctrl+Enter` writes the entry with `addActionLogEntry` from `@lifosy/formats` and commits.
- **VIEW LOG →** opens `/action-log`.

`/action-log` (`ActionLogView` in `packages/ui/src/LifeOS/Templates/ActionLogView.tsx`) shows all `.actionlog.md` files on the dashboards (or in the tree with no config), always including the inbox log, and has an add form.

## Adding capture shortcuts to a phone home screen
<!-- docspack: tags=pwa,android shortcuts,ios home screen,manifest,install -->

The console is a PWA (`vite-plugin-pwa`, `registerType: 'autoUpdate'`). The manifest in `vite.config.ts` has name `kaihuman`, short name `kh`, and four Android long-press shortcuts:

| Shortcut | URL | Short name |
|----------|-----|------------|
| Quick Todo | `/quick-todo` | KH Inbox |
| Quick Note | `/quick-note` | KH Note |
| Quick Knowledge | `/quick-knowledge` | KH Learn |
| Quick Log | `/quick-log` | KH Log |

On iOS, each quick page swaps the `<link rel="manifest">` to its own file (`public/manifest-quick-*.webmanifest`) with `useManifest()`, so **Add to Home Screen** starts at that page. The service worker serves `index.html` for every navigation, so a shortcut does not fall back to the dashboard.

`/shortcuts` (`ShortcutsPage.tsx`) shows step-by-step setup for iOS, Android and desktop, for each entry in `QUICK_ROUTES`. That list also has New File (`/new`) and Knowledge Base (`/knowledge`). Keep `QUICK_ROUTES` and the manifest `shortcuts` in sync.

## Using the kanban board
<!-- docspack: tags=board,kanban,todos,inbox,milestones -->

`/board` shows `KanbanBoard` (`packages/ui/src/LifeOS/Templates/KanbanBoard.tsx`) with columns backlog, in progress, done and rejected.

- It reads every `.todos.md` file that is an entry in `.dashboard.config.json`. With no config, it reads all `.todos.md` files in the tree.
- `.kh/inbox.todos.md` is always included if it exists.
- You can filter by file and milestone, add tasks and milestones, edit todo text, and move a todo to another file (card hover).
- The board can create a new todo file and opens a file in the editor at `/files/<path>`.
- A chart icon opens `/analytics`.

## Viewing todo analytics
<!-- docspack: tags=analytics,charts,velocity,statistics -->

`/analytics` shows `TodoAnalytics` (`packages/ui/src/LifeOS/Templates/TodoAnalytics.tsx`). It reads all `.todos.md` files in the repo tree. Charts:

- **STATUS DISTRIBUTION**
- **COMPLETION VELOCITY (DONE / WEEK)**
- **TODOS BY STATE ON TIMELINE**
- **MILESTONE PROGRESS**
- **TOP TAGS**

**BACK** returns to the previous page.

## Browsing the wiki
<!-- docspack: tags=wiki,wikilinks,backlinks,tags,.wiki.md -->

`/wiki` shows `WikiView` (`packages/ui/src/LifeOS/Organisms/WikiView.tsx`) over the repo's Markdown files.

- It opens `index.wiki.md`, `index.md` or `README.md` first, else the first `.md` file.
- `[[wikilinks]]` are clickable; link parsing is in `Organisms/wiki-links.ts`.
- Each page shows its backlinks, page type and tags from front matter.
- A tag filter lists pages with a tag; images stored in the repo render.
- Editing a page routes to `/files/<path>`, where the editor opens it.

The search modal's **Open Wiki** command instead needs a file that ends in `.wiki.md` and uses its folder as the wiki root.

## Setting up the knowledge base in a repo
<!-- docspack: tags=knowledge base page,scaffold,kb setup,.kh/raw,inbox,processed -->

`/knowledge` (`apps/console/src/pages/KnowledgeBasePage.tsx`) manages the `.kh/` knowledge base of the selected repo.

- **Setup:** if `.kh/.skill-version` is missing, the page offers setup. `scaffoldKB()` creates `.kh/schema.md`, `.kh/index.kb.md`, `.kh/log.md`, `.kh/raw/`, `.kh/journal/`, `.kh/wiki/`, the `/kb-*` skills in `.claude/commands/` and `CLAUDE.md`. If `CLAUDE.md` exists, it asks **Overwrite** or **Keep existing**.
- **Skill updates:** on each visit, `updateSkillsIfNeeded()` rewrites the skill files when `.kh/.skill-version` differs from `KB_SKILL_VERSION` (now `1.7.0`) in `src/lib/kb-skills.ts`.
- **Tabs:** **Inbox** lists `.kh/raw/`, **Wiki** points to `.kh/wiki/` and `/wiki`, **Processed** lists `.kh/raw/processed/`.
- **Add note:** title, comma-separated tags (default `general`) and text, saved with `addRawNote()`.
- **Install /kb-session:** copies a `gh api` command that installs `kb-session.md` into `~/.claude/commands/`.

The `/kb-*` commands themselves are covered in the knowledge base docs.

## Knowledge base commands and cheatsheet in the console
<!-- docspack: tags=kb commands modal,cheatsheet,slash commands,reference -->

The **Knowledge Base Commands** modal (`apps/console/src/components/KBCommandsModal.tsx`) opens from the menu or the Ctrl+K command. It shows the general flow and a card for `/kb-ingest`, `/kb-index`, `/kb-lint`, `/kb-ask`, `/kb-digest`, `/kb-session` and `/kb-agent-capture`.

`/cheatsheet` (`apps/console/src/pages/CheatsheetPage.tsx`) is a tabbed reference:

| Tab | Content |
|-----|---------|
| Knowledge Base | The flow (capture, ingest, index, ask, lint), journal vs. wiki, automation |
| Quick Capture | Every way to capture: CLI `k`, Hyprland `Super+K`, `cli capture`, `/quick-knowledge`, **+ Add note**, browser extension, palette `>q` |
| CLI Keys | The CLI TUI keys (`n`, `k`, `s`, `a`, `f`, `d`, `l`, `q`) |
| Slash Commands | One line per `/kb-*` command |

When you change a `/kb-*` skill, update `kb-skills.ts`, the modal and the cheatsheet together.
