# CLI Documentation

## Installation

```sh
cd apps/cli
cargo build --release
# Binary: target/release/kaihuman
```

## Usage

```sh
cli          # Launch TUI
kaihuman server   # Start local AI proxy server (default port 4000)
kaihuman server --port 3000

kaihuman capture "TIL ..."        # Capture a knowledge note to .kh/raw/
echo "note" | kaihuman capture    # …or read from stdin (used by the desktop overlay)
kaihuman capture                  # …or open $EDITOR for a multi-line note

kaihuman idea "Offline sync"      # New idea in .kh/ideas/ (first line = title)
kaihuman ideas                    # Overview of open ideas
kaihuman ideas log <slug> "…"     # Add a log entry (see below for all commands)
kaihuman skills install           # Install the kh-ideas skill for every agent
```

## `kaihuman capture` — knowledge quick-capture

Writes a free-text note to `.kh/raw/` in the active repo as an OKF-aligned
markdown file (front matter `title`, `url`, `date`, `processed: false`, `tags: [general]`;
title and slug derived from the first line), later
folded into the journal + wiki by `/kb-ingest`.

It is **offline-safe**: every capture is written to a local spool (in the CLI
config dir) *before* the network push. If a push fails, the note stays on disk
and the next capture flushes the whole backlog to GitHub, oldest first.

Text is resolved from CLI args, else piped stdin, else `$EDITOR`. This is the
engine behind the Hyprland `Super+K` overlay — see
[`apps/cli/scripts/README.md`](../apps/cli/scripts/README.md).

The command palettes (browser extension and `apps/desktop-palette`) write the same kind of file
with `>q` — or by choosing **Capture “…”** under whatever is typed into the main search. They push
straight to GitHub with their own token and have no offline spool: a failed push shows the error
and leaves the text in the input to try again.

## `kaihuman idea` and `kaihuman ideas` — product ideas

One Markdown file per idea in `.kh/ideas/<slug>.md` (design and format: [`doc/ideas.md`](ideas.md)).
Agents use the same commands through the `kh-ideas` skill.

| Command | Does |
|---|---|
| `kaihuman idea [TEXT…] [--slug S] [--product P] [--tag T]… [--by A]` | New `seed` idea; text from args, stdin or `$EDITOR`; first line = title, rest = braindump |
| `kaihuman ideas [--status S] [--product P] [--all] [--json]` | Overview grouped by status; closed ideas only with `--all` |
| `kaihuman ideas show <slug> [--json]` | The file, or its parsed fields |
| `kaihuman ideas find <words…> [--json]` | Best matches first |
| `kaihuman ideas log <slug> <text…> [--by A]` | Log entry at the top of `## Log` |
| `kaihuman ideas challenge <slug> <text…>` | Open challenge |
| `kaihuman ideas dump <slug> [text…]` | Append to `## Braindump` (stdin or `$EDITOR` without text) |
| `kaihuman ideas summary <slug> <text…>` | Replace the summary |
| `kaihuman ideas status <slug> <status> [--reason R] [--by A]` | `seed`, `exploring`, `committed`, `shipped`, `parked`, `dropped`; logged |
| `kaihuman ideas import [--by A]` | Apply `kh-idea` hand-off blocks from stdin or `$EDITOR` |
| `kaihuman ideas path [slug]` | Path in the local clone |
| `kaihuman skills install [--dir D]` | Write the `kh-ideas` skill to `~/.claude/skills/` and `~/.agents/skills/` |

Reads pull the local clone first. Writes go through the GitHub contents API: creates never
overwrite, edits are checked against the file's `sha`. Offline, or on a GitHub error, a write is
queued in the spool (`ideas/`) and replayed in order before the next write.

## TUI Key Bindings

### Main screen

| Key | Action |
|-----|--------|
| `l` | Login via browser (GitHub OAuth) |
| `s` | Select active repository |
| `n` | Add a quick note to active repo |
| `k` | Add a knowledge note to `.kh/raw/` (compiled by `/kb-ingest`) |
| `a` | Open AI prompt |
| `f` | Open file browser (syncs repo) |
| `d` | Open dashboard config view (syncs repo) |
| `i` | Ideas list: `Enter` opens, `n` new, `l` log entry, `r` refresh |
| `q` / `Ctrl+C` | Quit |

### AI Prompt

| Key | Action |
|-----|--------|
| `Tab` | Cycle provider: Claude → Copilot → Gemini |
| `Enter` | Send prompt |
| `Esc` | Back to main |

### AI Response

| Key | Action |
|-----|--------|
| `↑` / `↓` | Scroll response |
| `Esc` / `Enter` | Back to prompt |

### File Browser

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate |
| `Enter` | Open file in editor |
| `Esc` | Back to main |

Recently-used files are marked with ★ and shown at the top.

### File Editor (nano-like)

| Key | Action |
|-----|--------|
| Any key | Edit text |
| `Ctrl+S` | Save file to local repo clone |
| `Esc` | Close without saving |

### Dashboard View

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate entries |
| `Enter` | Open file in editor |
| `Esc` | Back to main |

Shows workspaces, theme, and all files referenced in `dashboard.config.json`.

## Local repo clone

When you open the file browser or dashboard view, the CLI automatically:

1. Clones `https://github.com/<owner>/<repo>` (shallow, depth 1) into
   `~/.config/cli/repos/<owner>/<repo>/` (Linux; `~/Library/Application Support/com.kaihuman.cli/` on macOS)
2. On subsequent opens it runs `git pull --ff-only` to sync.

`Ctrl+S` in the editor writes the file to the local clone, then commits and pushes it in the
background.

## Recent files

The last 20 opened files are stored in
`~/.config/cli/recent_files.json` (relative paths within the repo).

## AI providers

The CLI pipes your prompt via the `-p` flag to whichever CLI tool is on your `$PATH`:

| Provider | Command |
|----------|---------|
| Claude | `claude -p "<prompt>"` |
| Copilot | `copilot -p "<prompt>"` |
| Gemini | `gemini -p "<prompt>"` |

## dashboard.config.json

The CLI understands this structure:

```json
{
  "version": "1",
  "dashboards": [{ "id": "work", "name": "Work" }],
  "entries": [{ "path": "work/dashboard.md", "dashboard": "work" }],
  "theme": "dark",
  "files": ["inbox.md", "notes.md"]
}
```

`files` lists primary files always shown at the top of the dashboard view.

## Knowledge base MCP server (`apps/kb-mcp`)

A stdio MCP server that exposes a repo's `.kh/` knowledge base (falls back to `.lifeos/`) to Claude
Code or any MCP client. It works on a local clone — for example the CLI's
`~/.config/cli/repos/<owner>/<repo>`.

```sh
pnpm --filter @kaihuman/kb-mcp build
claude mcp add kaihuman-kb -- node /path/to/monorepo/apps/kb-mcp/dist/index.js --repo /path/to/clone
```

The repo path comes from `--repo`, then `KB_REPO_PATH`, then the current directory.

| Tool | Does |
|------|------|
| `kb_search {query, limit?}` | Ranks wiki pages (title, tags, `search.kb.json`, body) |
| `kb_read {page}` | A page by filename, slug or title, with its backlinks |
| `kb_list {type?, tag?}` | Pages with title, type, tags and updated date |
| `kb_index` | `index.kb.md` |
| `kb_log {limit?}` | Parsed `log.md` entries, newest first |
| `kb_add_raw {title, text, url?, tags?}` | Writes a new `raw/<epoch>-<slug>.md` source; nothing else is written |

See `apps/kb-mcp/README.md` for a `.mcp.json` snippet.

## Sign-in worker (`apps/auth-worker`)

The console signs in through a Cloudflare Worker that exchanges GitHub's one-time code for an
access token and redirects to the console with it. It has no storage and keeps no token.

```sh
pnpm --filter @kaihuman/auth-worker dev      # http://localhost:8787, reads .dev.vars
pnpm --filter @kaihuman/auth-worker run deploy
```

See `apps/auth-worker/README.md` for the GitHub OAuth app, the secrets and the switch-over.

## Documentation for AI agents

Everything in this file, and the rest of the monorepo, is also packaged for agents as
`@kaihuman/docspack` (`packages/docspack`). From the repo root:

```sh
pnpm --filter @kaihuman/docspack build
pnpm --filter @kaihuman/docspack exec docspack preview "how do I capture a note"
```

## Mobile app

Build and ship the iOS app from Linux with EAS and TestFlight: see [mobile-testflight.md](mobile-testflight.md).
