# Terminal CLI

The terminal CLI is a Rust program in `apps/cli` whose binary is called `cli` (crate `cli`, version `0.1.0`, npm workspace name `@kaihuman/cli`). Run with no arguments, it opens an interactive terminal UI built with `ratatui` and `crossterm` for notes, knowledge captures, repo selection, a file browser and editor, a dashboard view and an AI prompt. It also has two subcommands: `cli server` starts a local AI proxy over HTTP, and `cli capture` writes a knowledge note to `.kh/raw/` with an offline spool. It signs in with GitHub through the web console and works on one active GitHub repository at a time.

## Building and running the CLI
<!-- docspack: tags=install,cargo,compile,release binary -->

Prerequisites are Rust and Cargo, `git` on `$PATH` for repo sync, and optionally `claude`, `copilot` or `gemini` on `$PATH` for AI features. The toolchain is pinned to `1.94.1` with `rustfmt` and `clippy` in `apps/cli/rust-toolchain.toml`; rustup fetches it automatically.

```sh
cd apps/cli
cargo run                        # launch the TUI (dev build)
cargo run -- server --port 3000  # run a subcommand through cargo
cargo build --release            # release binary: target/release/cli
./target/release/cli
```

To use the desktop capture overlay, install the binary on your `PATH`:

```sh
install -Dm755 target/release/cli ~/.local/bin/cli
```

## Which commands and flags the cli binary accepts

The command line is defined with `clap` (derive) in `apps/cli/src/main.rs`.

| Command | What it does |
|---|---|
| `cli` | Opens the interactive TUI in the terminal's alternate screen |
| `cli server [--port <n>]` / `-p <n>` | Starts the local AI proxy on `127.0.0.1`, default port `4000` |
| `cli capture [TEXT...]` | Captures a knowledge note to `.kh/raw/` in the active repo |
| `cli --help`, `cli --version` / `-V` | Clap's built-in help and version |

`cli capture` joins all words of `TEXT` with spaces. With no words it reads piped stdin, or opens `$EDITOR` when stdin is a terminal. There are no other flags, no `login` subcommand and no config-file options.

## Signing in with GitHub from the terminal
<!-- docspack: tags=login,oauth,authenticate,token,auth -->

On first launch with no saved login, the TUI shows the Login screen and starts sign-in by itself. Press `l` later to sign in again. The flow lives in `apps/cli/src/auth.rs`:

1. The CLI binds a callback server on `127.0.0.1` with an ephemeral port.
2. It generates a random 128-bit hex `state` and opens `https://app.kaihuman.com/auth/cli?port=<port>&state=<state>` in the default browser.
3. The console POSTs a form with `token`, `state` and `repo` to `http://localhost:<port>/callback`. The body is capped at 16 KB. A `GET /callback?token=…` query from older console builds is still accepted.
4. A callback with a missing or wrong `state` gets HTTP 400, and the CLI keeps waiting. A callback with an empty `token` also gets 400.
5. The token and the repo chosen in the console are written to `auth.json` in the config directory.

The browser tab shows "Login successful!" and tries to close itself.

## Selecting the active repository

Press `s` on the main menu to choose the repository every action works on. The list comes from GitHub `GET /user/repos?sort=updated&per_page=20`, so only your 20 most recently updated repos appear. Use `Up`/`Down` to move, `Enter` to choose and `Esc` to cancel.

The choice is saved as `active_repo` (`owner/repo`) in `auth.json`, and the header shows `Repo: owner/repo`. The `cli capture` command and the desktop capture tools also read `active_repo`. Changing the repo clears the local clone path, so the next file browser open syncs again.

## TUI key bindings on the main menu
<!-- docspack: tags=shortcuts,keys,keyboard,hotkeys -->

The main menu is a list; press its letter or move with `Up`/`Down` and press `Enter`. Menu items are defined in `MENU_ITEMS` in `apps/cli/src/app.rs`.

| Key | Action |
|---|---|
| `n` | New quick note |
| `k` | New knowledge note to `.kh/raw/` |
| `s` | Select active repository |
| `a` | AI prompt (Claude / Copilot / Gemini) |
| `f` | File browser |
| `d` | Dashboard config view |
| `l` | Login |
| `q` | Quit (main menu only) |
| `Ctrl+C` | Quit from any screen |

The `n`, `k`, `s`, `f` and `d` actions start a login first if there is no GitHub client yet.

## Keys on the other TUI screens

| Screen | Keys |
|---|---|
| Note input (`n`, `k`) | Type text; `Enter` saves; `Esc` cancels |
| Repo select | `Up`/`Down`; `Enter` selects; `Esc` cancels |
| AI prompt | `Tab` cycles provider Claude → Copilot → Gemini; `Enter` sends; `Esc` back |
| AI response | `Up`/`Down` scroll; `Esc` or `Enter` back to the prompt |
| File browser | `Up`/`Down`; `Enter` opens a file; `Esc` back |
| Dashboard view | `Up`/`Down`; `Enter` opens a file; `Esc` back |
| File editor | Type to edit; `Ctrl+S` saves, commits and pushes; `Esc` closes |

The AI prompt sends on plain `Enter` with any modifier, because `Ctrl+Enter` is unreliable across terminals.

## Writing a quick note or knowledge note in the TUI
<!-- docspack: tags=n key,k key,quick note,knowledge note,file created -->

Both note types use a single text box in the TUI and save on `Enter` through the GitHub contents API.

| Key | File created in the active repo | Commit message |
|---|---|---|
| `n` | `.lifeos/quicknotes/quicknote-<UTC timestamp>.md`, for example `quicknote-2024-03-24T12-34-56Z.md` | `Add quicknote via CLI` |
| `k` | `.kh/raw/<epoch-ms>-<slug>.md` with knowledge frontmatter | `note: add knowledge capture via CLI` |

The quick note file holds the raw text. The knowledge note uses the same format as `cli capture`. Neither path uses the offline spool. A failed save is written to `error.log` in the current working directory. `append_to_inbox` in `github.rs` is unused: nothing writes to `inbox.md` from the TUI.

## Capturing a note from the command line with cli capture
<!-- docspack: tags=headless,quick capture,til,stdin,pipe -->

`cli capture` saves a thought to `.kh/raw/` in the active repo without opening the TUI. `/kb-ingest` later folds these notes into the journal and wiki. The code is in `apps/cli/src/capture.rs`.

```sh
cli capture "TIL rustfmt output changes between releases"
echo "note text" | cli capture   # read from piped stdin
cli capture                      # open $EDITOR (fallback nano) on a temp file
```

The text source order is: arguments, then piped stdin, then `$EDITOR`. The editor edits `kh-capture-<pid>.md` in the system temp directory. Text is trimmed; empty text prints `Nothing captured.` and exits 0. Any error prints `capture error: …` and exits 1.

Possible output lines:

- `Captured → owner/repo (N pushed)` when the spool is empty afterwards.
- `Captured locally · N pushed, M pending (will retry on next capture)` when some pushes failed.
- `Saved locally — not authenticated.` when there is no `auth.json`.
- `Saved locally — no active repo.` when no repo is selected; run `cli` and press `s`.

## How the capture spool keeps notes safe offline
<!-- docspack: tags=offline,queue,retry,backlog -->

Every `cli capture` writes the note to the `spool/` directory in the CLI config directory before any network call. It then flushes the whole spool, oldest first, to `.kh/raw/<filename>` on GitHub. Spool filenames start with a millisecond timestamp, so sorting by name gives capture order.

- Each file gets up to 3 PUT attempts, with backoff of 0.5 s and then 1 s.
- A spool file is deleted only after its push succeeds.
- A file that still fails stays in the spool for the next `cli capture` run.
- Only `*.md` files in the spool are pushed.

The timestamp and date are fixed when the note is spooled, so a late push keeps the real capture time. The native capture app writes failed captures into the same `spool/` directory, so `cli capture` also flushes those.

## Knowledge note file format in .kh/raw/
<!-- docspack: tags=frontmatter,okf,filename,slug -->

`build_kb_note` in `apps/cli/src/github.rs` builds the file name and content for `k` notes and `cli capture`.

- File name: `<epoch-ms>-<slug>.md`. The slug comes from the first non-blank line: lowercased ASCII alphanumerics, other characters become `-`, trimmed of `-`, at most 40 characters, or `note` when empty.
- Title: the first non-blank line, `"` replaced with `'`, at most 80 characters.
- The whole text is the body.

```markdown
---
title: "TIL rustfmt output changes between releases"
url: ''
date: 2026-10-04
processed: false
tags: [general]
---

TIL rustfmt output changes between releases
```

Files are created through the contents API without a `sha`, so an existing file is never overwritten. The command palettes' `>q` capture writes the same format.

## Asking Claude, Copilot or Gemini from the TUI
<!-- docspack: tags=ai prompt,llm,assistant -->

Press `a`, type a prompt and press `Enter`. `Tab` cycles the provider; Claude is the default. The CLI runs the provider's own command-line tool, which must be on `$PATH`:

| Provider | Command run |
|---|---|
| Claude | `claude -p "<prompt>"` |
| Copilot | `copilot -p "<prompt>"` |
| Gemini | `gemini -p "<prompt>"` |

Stdin is closed. When the repo has been synced, the tool runs with the local clone as its working directory. The prompt is prefixed with context lines: `Repository: owner/repo`, `Local path: …` and `Current file: …` when known. The stdout of the tool is shown in a scrollable response screen. On failure the response shows `Error: <stderr>` or `Failed to run …`.

## Browsing and editing repository files
<!-- docspack: tags=file browser,editor,nano,ctrl+s,commit,push -->

Press `f` to open the file browser for the active repo. The list appears at once from the sqlite cache, while a background sync clones or pulls the repo. The walk skips names that start with `.` and goes at most 4 directory levels deep. Recently opened files are listed first with a `★` marker; directories end in `/`.

`Enter` on a file opens a nano-like editor (`tui-textarea`) on the local clone. `Ctrl+S` writes the file, then runs `git add <file>`, `git commit -m "Update <file> via kaihuman CLI"` and `git push` in the clone in the background. The status bar shows `Pushed <file>` or `Push failed: …`; "nothing to commit" is not an error. `Esc` closes the editor without saving. If the repo has not synced yet, the status bar shows `Repo not yet synced — please wait.`

Opened files are recorded in `recent_files.json` (last 20). Code: `apps/cli/src/files.rs` and `apps/cli/src/git.rs`.

## How the local repo clone and sync work

Opening the file browser (`f`) or dashboard (`d`) syncs the active repo into `repos/<owner>/<repo>` inside the CLI config directory. `sync_repo` in `apps/cli/src/git.rs` does the work:

- No clone yet: `git clone --depth=1 --quiet https://oauth2:<token>@github.com/<owner>/<repo>.git`.
- Clone exists: `git pull --ff-only --quiet`. A failed pull is ignored and the existing clone is used.

The status bar shows `↻ Syncing…` and then `Sync failed: …` on error. After a sync, the file list is saved to the sqlite cache and the dashboard config is reloaded.

## Viewing the dashboard config in the TUI
<!-- docspack: tags=dashboard.config.json,workspaces,theme -->

Press `d` to see the repo's dashboard config and open the files it lists. The CLI looks for the config in this order, then scans the repo up to depth 4 for any file whose name ends in `dashboard.config.json`:

1. `.dashboard.config.json`
2. `.kh/.dashboard.config.json`
3. `.lifeos/.dashboard.config.json`
4. `dashboard.config.json`
5. `.kh/dashboard.config.json`

```json
{
  "version": "1",
  "dashboards": [{ "id": "work", "name": "Work" }],
  "entries": [{ "path": "work/dashboard.md", "dashboard": "work", "skipOnMobile": false }],
  "theme": "dark",
  "files": ["inbox.md", "notes.md"]
}
```

The view shows the config path, workspace names and theme, then the `files` list followed by each `entries[].path`. A leading `./` is stripped and duplicates are dropped. Fields with unexpected types are skipped rather than failing the parse. `Enter` opens the file in the editor, and `Esc` from that editor returns to the dashboard.

## Running the local AI server with cli server
<!-- docspack: tags=http,api,proxy,endpoints,port 4000,cors -->

`cli server` starts a warp HTTP server on `127.0.0.1` that lets the web app and browser extension call a local AI CLI. Code: `apps/cli/src/server.rs`.

```sh
cli server            # http://127.0.0.1:4000
cli server -p 3000
```

| Route | Request | Response |
|---|---|---|
| `GET /health` | none | JSON string `"OK"` |
| `POST /chat` | `{"message": "...", "provider": "claude" \| "gemini" \| "copilot"}` | `{"response": "..."}` |

`provider` is optional; a missing or unknown value uses `copilot`. The server runs `<provider> -p <message>` and returns its stdout. A failing tool still gets HTTP 200, with `Error connecting to …` or `Failed to execute … CLI` in `response`. CORS allows any origin, the `content-type` header and the `GET` and `POST` methods. The server runs until stopped.

## Where the CLI stores config and data
<!-- docspack: tags=config directory,auth.json,data location,xdg -->

The config directory comes from `ProjectDirs::from("com", "kaihuman", "cli")` (the `directories` crate). On Linux it is `$XDG_CONFIG_HOME/cli`, which is `~/.config/cli`. On macOS it is `~/Library/Application Support/com.kaihuman.cli`; a `com.lifosy.cli` directory from before October 2026 is moved there on the next start.

| Path in config dir | Contents |
|---|---|
| `auth.json` | `{"token": "...", "active_repo": "owner/repo"}`; deleting it logs out |
| `cache.db` | sqlite cache of repo file trees |
| `recent_files.json` | `{"files": [...]}`, last 20 opened paths, newest first |
| `spool/` | `cli capture` notes waiting to be pushed |
| `repos/<owner>/<repo>/` | Shallow git clone of the active repo |

The TUI also writes `error.log` to the current working directory when saving a note fails.

## What the sqlite cache database holds
<!-- docspack: tags=sqlite,rusqlite,cache.db,schema -->

`cache.db` lets the file browser show a file list before the background sync finishes. It is opened with `rusqlite` in WAL mode by `apps/cli/src/db.rs`.

```sql
CREATE TABLE files (owner TEXT, repo TEXT, path TEXT, is_dir INTEGER DEFAULT 0,
                    PRIMARY KEY (owner, repo, path));
CREATE TABLE meta  (owner TEXT, repo TEXT, last_sync INTEGER DEFAULT 0,
                    PRIMARY KEY (owner, repo));
```

After each sync, `set_files` replaces all rows for the repo in one transaction and sets `meta.last_sync` to the current Unix time. Queries are parameterized.

## Where the CLI source code lives

| File in `apps/cli/src` | Responsibility |
|---|---|
| `main.rs` | clap command line, TUI terminal setup and teardown |
| `app.rs` | `App` state, screens (`CurrentScreen`), key handling, AI calls, background sync and push |
| `ui.rs` | ratatui rendering of every screen and the status bar |
| `auth.rs` | `AuthManager`, browser login, `/callback` route, `auth.json` |
| `github.rs` | `GithubClient` (repos, quick notes, `put_file`), `build_kb_note` |
| `capture.rs` | `cli capture`, spool and retry |
| `git.rs` | `sync_repo`, `commit_and_push` |
| `files.rs` | recent files, dashboard config loading, file walk |
| `db.rs` | sqlite `Cache` |
| `server.rs` | `cli server` routes |

## Linting, formatting and testing the CLI
<!-- docspack: tags=clippy,rustfmt,cargo test,ci -->

`apps/cli/package.json` wires the crate into the Turborepo tasks:

| Script | Command |
|---|---|
| `build` | `cargo build --release` |
| `dev` | `cargo run` |
| `lint` | `cargo fmt --check && cargo clippy` |
| `format`, `fix` | `cargo fmt` |
| `test` | `cargo test` |

`lint` fails on unformatted Rust and names the file and line. Inside `pnpm run verify`, the `fix` step reformats first, so verify passes and leaves the change in the working tree. The tests are in `auth.rs` and cover the login callback: POSTed forms, legacy queries, wrong or missing `state`, and empty tokens.
