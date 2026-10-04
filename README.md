# Lifosy Monorepo

A personal life-OS built on GitHub — notes, dashboards, habits, and tasks, all stored as files in your own repos.

## Apps

| App | Stack | Description |
|-----|-------|-------------|
| `apps/cli` | Rust + Ratatui | Terminal UI — notes, file browser, AI prompt, dashboard |
| `apps/console` | Preact + Vite | Web dashboard (files, kanban, analytics) |
| `apps/browser-extension` | Preact + CRXJS | Browser extension |
| `apps/kb-mcp` | Node + MCP SDK | MCP server over the `.kh/` knowledge base |

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) LTS + [pnpm](https://pnpm.io/) **12.4.1**, the version
  pinned in `packageManager`. Install it before the first `pnpm install` — `corepack enable`
  fetches the pinned binary, or `npm install -g pnpm@12.4.1`. Letting an older pnpm
  provision 12.4.1 for you does not work: the bootstrap runs
  `pnpm add pnpm@12.4.1 --allow-build=@pnpm/exe`, but the `preinstall`/`postinstall` scripts
  belong to the `pnpm` package rather than to `@pnpm/exe`, so a pnpm that enforces build
  approval refuses them and the install dies with `ERR_PNPM_IGNORED_BUILDS`.
- `git` on `$PATH` (used by the CLI for repo sync)
- Optional: `claude`, `copilot`, or `gemini` CLI on `$PATH` for AI features

## CLI — quick start

```sh
cd apps/cli

# Run directly (dev mode)
cargo run

# Run with a subcommand
cargo run -- server          # start local AI proxy on :4000
cargo run -- server --port 3000
cargo run -- capture "TIL ..."   # capture a knowledge note to .kh/raw/ (offline-safe)
echo "note" | cargo run -- capture   # …or pipe it in (used by the desktop overlay)

# Build a release binary
cargo build --release
./target/release/cli
```

### First launch

The CLI opens a browser window to authenticate via GitHub OAuth. After that it drops you into the TUI.

### Key bindings

| Key | Action |
|-----|--------|
| `l` | Login (GitHub OAuth) |
| `s` | Select active repository |
| `n` | Add a quick note to active repo |
| `k` | Add a knowledge note to `.kh/raw/` (compiled by `/kb-ingest`) |
| `a` | AI prompt — pipe to Claude / Copilot / Gemini |
| `f` | File browser (syncs repo first) |
| `d` | Dashboard config view (syncs repo first) |
| `q` / `Ctrl+C` | Quit |

**AI prompt:** `Tab` cycles provider · `Enter` sends · `Esc` cancels

**File editor:** `Ctrl+S` saves, then commits and pushes the file · `Esc` closes

See [`doc/documentation.md`](doc/documentation.md) for full key-binding reference.

### Desktop quick-capture (Hyprland / wlroots)

A `Super+K` overlay that captures a thought straight into `.kh/raw/` via
`cli capture` (spooled locally, offline-safe). See
[`apps/cli/scripts/README.md`](apps/cli/scripts/README.md) for setup.

## Web console — quick start

```sh
pnpm install
pnpm dev --filter=@lifosy/app-console
# → http://localhost:4300
```

## Monorepo commands

```sh
pnpm turbo build          # build everything
pnpm turbo dev            # dev servers for all apps
pnpm check                # lint + type-check (turbo has no `check` task)
pnpm -r test              # run tests in every package that has them (turbo has no `test` task)
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/core` | Shared business logic, GitHub service, Preact Signals stores |
| `packages/ui` | Shared Preact UI components |
| `packages/formats` | The widget file formats every app reads and writes (todos, action logs, events, prompts, commands, habits, time tracking, timezones, read later) |
| `packages/palette` | The command palette shared by the browser extension and the desktop app |
| `packages/config` | Shared TypeScript / Biome / Tailwind config |
| `packages/docspack` | `@lifosy/docspack` — all of the above documented for AI agents with [docspack](https://docspack.dev) (`npx docspack ask "…"`) |

## Config files stored by the CLI

In `~/.config/cli/` on Linux (`~/Library/Application Support/com.lifosy.cli/` on macOS):

```
~/.config/cli/
  auth.json            # GitHub token + active repo
  recent_files.json    # Last 20 opened files (relative repo paths)
  spool/               # Pending knowledge captures awaiting push (offline queue)
  repos/<owner>/<repo> # Shallow git clone of active repo
```
