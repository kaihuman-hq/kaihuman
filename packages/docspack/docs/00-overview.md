# kaihuman

kaihuman is a personal life OS: notes, todos, habits, dashboards, bookmarks and a knowledge base, all stored as plain files in a GitHub repository you own. The web app is at `https://app.kaihuman.com`; the code, packages and binaries use the same name (`@kaihuman/*`, `kaihuman-palette`). The monorepo `kaihuman-hq/kaihuman` holds a web console, a terminal CLI, a browser extension, a desktop command palette, an MCP server and the landing pages.

## kaihuman, LifeOS and Lifosy: which name is which
<!-- docspack: tags=naming,brand,kaihuman,lifosy,lifeos -->

The project has had three names. They all refer to the same product.

| Name | Where it appears |
| --- | --- |
| kaihuman | Everything current: landing pages, the app at `https://app.kaihuman.com`, packages (`@kaihuman/core`), binaries (`kaihuman-palette`) |
| LifeOS | Older code: the `.lifeos/` app folder, the IndexedDB database `life-os-db`, `localStorage` keys such as `lifeos_gh_token` |
| Lifosy | The former code name, replaced by kaihuman in October 2026. Apps move their local files from the old `lifosy` locations on first start |

"Kai" (改) stands for kaizen, continuous improvement. The tagline is "The ever-improving human". The data folder in a repository is `.kh/` (for kaihuman). Code that reads it falls back to the legacy `.lifeos/` folder when `.kh/` does not exist.

## What the idea behind kaihuman is
<!-- docspack: tags=concept,philosophy,local-first,plain-files -->

kaihuman treats your life data as files in your own GitHub repositories. There is no kaihuman database server holding your notes.

- Every widget is backed by a file with a known suffix, for example `.todos.md`, `.habit.csv`, `.events.csv`, `.actionlog.md`, `.bookmarks.json`.
- The files are human-readable Markdown, CSV or JSON. You can edit them in any editor, grep them, or open them on github.com.
- Every app reads and writes the same files through the same parsers in `packages/formats`, so an entry added in the browser shows up in the console and the desktop palette.
- Git history is the backup and the audit log. A deleted entry can be recovered from history.
- AI agents (for example Claude Code) can work on the same repository. The `.kh/` knowledge base and its `/kb-ingest` style commands are built for that.

The landing page states the principle as "Local-First. We store nothing."

## Which apps are in the monorepo
<!-- docspack: tags=apps,components,architecture,map -->

Each app has its own chunk of documentation. The "Doc" column names that chunk's title.

| App | Stack | What it does | Doc |
| --- | --- | --- | --- |
| `apps/console` | Preact, Vite, Tailwind, PWA | The main web app at `app.kaihuman.com`: file browser, Markdown editor, widgets, kanban board, analytics, wiki, knowledge graph, commit history, local AI chat, push reminders | Web console, Console widgets, Console views |
| `apps/cli` | Rust, Ratatui | Terminal UI with notes, file browser, AI prompt, dashboard view; `cli capture` and `cli server` subcommands | Terminal CLI |
| `apps/cli/scripts` | shell, wofi | `Super+K` Hyprland overlay that pipes a thought into `cli capture` | Desktop quick capture |
| `apps/kh-capture-native` | Zig, native-sdk (experimental) | Native quick-capture window that writes to `.kh/raw/` | Desktop quick capture |
| `apps/browser-extension` | Preact, CRXJS, Vite | Popup, bookmarks mirror, pinned-tab groups, read later, start page, `Ctrl+Shift+K` palette | Browser extension |
| `apps/desktop-palette` | Tauri (Rust) + Vite | The same command palette as a Wayland overlay, plus the braindump window | Desktop palette |
| `apps/kb-mcp` | Node, MCP SDK | stdio MCP server over the `.kh/` knowledge base in a local clone | Knowledge base MCP server |
| `apps/landing-page-nextgen` | Astro, Tailwind | The production landing page | Landing pages |
| `apps/landing-page` | Astro, Tailwind | The older landing page, no longer deployed | Landing pages |

## Which shared packages exist
<!-- docspack: tags=packages,libraries,workspace -->

The `packages/` folder holds code that more than one app uses. The "Doc" column names the chunk that covers it.

| Package | Name | What it holds | Doc |
| --- | --- | --- | --- |
| `packages/core` | `@kaihuman/core` | GitHub service, auth and file stores (Preact Signals), IndexedDB cache, demo mode | Shared packages |
| `packages/ui` | `@kaihuman/ui` | Shared Preact UI components, the editor, Storybook | Shared packages |
| `packages/formats` | `@kaihuman/formats` | Parsers and writers for every widget file format (todos, action logs, events, prompts, commands, habits, time tracking, timezones, read later) | Repo file formats |
| `packages/palette` | `@kaihuman/palette` | The command palette UI and protocol shared by the extension and the desktop palette | Command palette |
| `packages/config` | `@kaihuman/config` | Shared `tsconfig.base.json`, `biome.json` and `tailwind-preset.js` | Shared packages |
| `packages/docspack` | `@kaihuman/docspack` | This documentation, packaged for AI agents | Developing in the monorepo |

The knowledge-base concepts (`.kh/raw/`, `.kh/wiki/`, `/kb-ingest`) are covered in the "Knowledge base" doc.

## How data flows between GitHub and the apps
<!-- docspack: tags=sync,storage,github-api,cache,architecture -->

The GitHub repository is the single source of truth. Each app talks to it in its own way.

- **Web console:** reads the repository tree and files through the GitHub REST API (`githubService` in `packages/core`). Files are cached in IndexedDB (`life-os-db`, stores `files` and `trees`). Saves commit through the API against the file's last known `sha`.
- **Browser extension:** calls the GitHub API from its service worker. It caches bookmarks and pinned-tab groups in `chrome.storage.local` and refreshes them at most once an hour, using `ETag`/`If-None-Match` so unchanged files cost a `304`.
- **Desktop palette:** a Rust backend calls the GitHub API and caches files under `$XDG_CACHE_HOME/kaihuman/`.
- **Terminal CLI:** keeps a shallow git clone of the active repository in its config directory (`repos/<owner>/<repo>`) and syncs it before file operations.
- **kb-mcp:** reads a local clone on disk; it never calls GitHub.

The console detects conflicts: when a file changed on GitHub while you had unsaved local edits, it offers "keep local" or "use remote" (`resolveConflict` in `packages/core/src/stores/github-file.store.ts`).

## What happens when you are offline
<!-- docspack: tags=offline,network,spool,pwa -->

Offline behaviour differs per app.

- **Console:** it is a PWA (`vite-plugin-pwa`), so the shell loads from the service worker cache. Files already opened are served from the IndexedDB cache. Saving needs the GitHub API.
- **`cli capture`:** offline-safe. Every capture is written to a local spool directory before the push. A failed push leaves the note on disk, and the next capture flushes the backlog, oldest first.
- **kh-capture-native:** on a failed push it writes the note into the CLI's spool directory, so the next `cli capture` sends it.
- **Command palettes (`>q`):** push straight to GitHub with no spool. A failed push shows the error and keeps the text in the input.
- **Desktop palette braindumps:** saved locally as you type, synced later; a failed sync is retried a minute later.
- **Browser extension:** serves bookmarks and tab groups from its cache; writes (saving a bookmark, loading a group change) need the network.

## Where my data lives and what kaihuman stores
<!-- docspack: tags=privacy,security,data,token,local-first,server,copy of my notes,cloud -->

Your content lives only in your GitHub repository. Each app keeps local copies and a GitHub token on your machine.

| App | Token stored in | Local cache |
| --- | --- | --- |
| Web console | IndexedDB `life-os-db` (`auth` store), mirrored in `localStorage` key `lifeos_gh_token` | IndexedDB `files` and `trees` stores |
| Terminal CLI | `auth.json` in the CLI config directory | shallow clone under `repos/`, `spool/` |
| Browser extension | `chrome.storage.local` | `chrome.storage.local` |
| Desktop palette | the Secret Service (gnome-keyring, KeePassXC), never a file | `$XDG_CACHE_HOME/kaihuman/`, `$XDG_DATA_HOME/kaihuman/` |

Demo mode (`/demo`, or **View demo** on the login screen) uses seeded in-memory data and writes nothing to `localStorage` or IndexedDB. The extension and palette only send data to GitHub, plus DeepL for `>t` translations when you set a key. AI assistant links (`>a`) only build a URL.

## Signing in with GitHub
<!-- docspack: tags=login,auth,oauth,authentication,token -->

All apps authenticate with a GitHub token. The web console is where the token is first obtained.

1. In the console, **Login** sends the browser to the OAuth gateway named by `VITE_GH_LOGIN` (set in `apps/console/.env.prod`).
2. The gateway redirects back with `?access_token=…`. `authStore.handleCallback()` in `packages/core/src/stores/auth.store.ts` stores it and removes it from the URL.
3. You pick the active repository in the console.

The other apps take the token from the console:

- **CLI:** press `l`. The CLI starts a callback server on `127.0.0.1` and opens the console. The console POSTs the token, the repository and a random `state` back.
- **Desktop palette:** `kaihuman-palette login` (or **Log in with the kaihuman console**) opens `app.kaihuman.com/auth/cli` and receives the token the same way.
- **Browser extension:** while you are logged in, the console exposes the token on `document.body` as `data-kaihuman-auth` (`ExtensionAuthBridge`). The extension's content script reads it and sends an `AUTH_TOKEN_UPDATE` message to the service worker. Before that, the start page shows only **Open Console**.

Logging out of the console sets `lifeos_logged_out` and deletes the stored token.
