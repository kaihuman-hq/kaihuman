# CLI Documentation

## Installation

```sh
cd apps/cli
cargo build --release
# Binary: target/release/cli
```

## Usage

```sh
cli          # Launch TUI
cli server   # Start local AI proxy server (default port 4000)
cli server --port 3000

cli capture "TIL ..."        # Capture a knowledge note to .kh/raw/
echo "note" | cli capture    # …or read from stdin (used by the desktop overlay)
cli capture                  # …or open $EDITOR for a multi-line note
```

## `cli capture` — knowledge quick-capture

Writes a free-text note to `.kh/raw/` in the active repo as an OKF-aligned
markdown file (`type: note`; title and slug derived from the first line), later
folded into the journal + wiki by `/kb-ingest`.

It is **offline-safe**: every capture is written to a local spool (in the CLI
config dir) *before* the network push. If a push fails, the note stays on disk
and the next capture flushes the whole backlog to GitHub, oldest first.

Text is resolved from CLI args, else piped stdin, else `$EDITOR`. This is the
engine behind the Hyprland `Super+K` overlay — see
[`apps/cli/scripts/README.md`](../apps/cli/scripts/README.md).

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
| `q` / `Ctrl+C` | Quit |

### AI Prompt

| Key | Action |
|-----|--------|
| `Tab` | Cycle provider: Claude → Copilot → Gemini |
| `Ctrl+Enter` | Send prompt |
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
   `~/.config/com/lifosy/cli/repos/<owner>/<repo>/`
2. On subsequent opens it runs `git pull --ff-only` to sync.

Changes saved in the editor are written to the local clone only. Use git to push them.

## Recent files

The last 20 opened files are stored in
`~/.config/com/lifosy/cli/recent_files.json` (relative paths within the repo).

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
