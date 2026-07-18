# Lifosy Monorepo

A personal life-OS built on GitHub — notes, dashboards, habits, and tasks, all stored as files in your own repos.

## Apps

| App | Stack | Description |
|-----|-------|-------------|
| `apps/cli` | Rust + Ratatui | Terminal UI — notes, file browser, AI prompt, dashboard |
| `apps/console` | Preact + Vite | Web dashboard (files, kanban, analytics) |
| `apps/browser-extension` | Preact + CRXJS | Browser extension |

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) LTS + [pnpm](https://pnpm.io/)
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

**AI prompt:** `Tab` cycles provider · `Ctrl+Enter` sends · `Esc` cancels

**File editor:** `Ctrl+S` saves · `Esc` closes

See [`doc/documentation.md`](doc/documentation.md) for full key-binding reference.

## Web console — quick start

```sh
pnpm install
pnpm dev --filter=@lifosy/app-console
# → http://localhost:5173
```

## Monorepo commands

```sh
pnpm turbo build          # build everything
pnpm turbo dev            # dev servers for all apps
pnpm turbo check          # lint + type-check
pnpm turbo test           # run tests
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/core` | Shared business logic, GitHub service, Preact Signals stores |
| `packages/ui` | Shared Preact UI components |
| `packages/config` | Shared TypeScript / Biome / Tailwind config |

## Config files stored by the CLI

```
~/.config/com/lifosy/cli/
  auth.json            # GitHub token + active repo
  recent_files.json    # Last 20 opened files (relative repo paths)
  repos/<owner>/<repo> # Shallow git clone of active repo
```
