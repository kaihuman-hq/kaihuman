# kaihuman CLI

Welcome to the kaihuman CLI! This is a terminal-based user interface (TUI) application designed to let you interact with your kaihuman console directly from your terminal.

## Download

Prebuilt binaries for Linux (x86_64) and macOS (Apple silicon) are on the
[releases page](https://github.com/kaihuman-hq/kaihuman/releases) (tags `cli-v…`). Unpack the tarball and put `kaihuman` on your `PATH`:

```bash
tar -xzf kaihuman-<version>-linux-x86_64.tar.gz
install -Dm755 kaihuman-<version>-linux-x86_64/kaihuman ~/.local/bin/kaihuman
```

To build it yourself instead, read on.

## Prerequisites

- [Rust & Cargo](https://rustup.rs/) installed on your machine
- Access to the kaihuman Console (to authenticate with GitHub)

## Building the CLI

To compile the application, navigate to the `apps/cli` directory and run:

```bash
cargo build --release
```

## Running the CLI

You can run the CLI directly through Cargo or by executing the compiled binary from the `target/` directory.

### Using Cargo
```bash
cargo run
```

### Using the Compiled Binary
```bash
./target/debug/kaihuman
```
*(Use `./target/release/kaihuman` if you built with the `--release` flag)*

Before October 2026 the binary was called `cli`. Install `kaihuman` in its place and delete the old
one; `scripts/kh-capture` still falls back to `cli` until you do.

## Usage

When you launch the kaihuman CLI, it opens an interactive interface built with `ratatui`. Here are the keyboard shortcuts available:

| Key | Action | Description |
|---|---|---|
| `l` | **Login** | Opens your web browser to authenticate with the kaihuman Console. |
| `n` | **New Note** | Opens a text area to quickly jot down a note. `Enter` saves it as a new file, `.lifeos/quicknotes/quicknote-<UTC timestamp>.md`, in your currently active repository. |
| `i` | **Ideas** | Lists the ideas in `.kh/ideas/`, open ones first. `Enter` opens one in the editor, `n` creates one from a title, `l` adds a log entry to the selected one, `r` refreshes. |
| `q` | **Quit** | Exits the CLI application. |
| `Up / Down` | **Navigate** | Navigate the repository selection list (if you need to select a repository). |
| `Enter` | **Submit** | Submits your new note or confirms a repository selection. |
| `Esc` | **Cancel** | Cancels your current action (like abandoning a note) and returns to the home screen. |

## Ideas

Each product or feature idea is one Markdown file, `.kh/ideas/<slug>.md`, in your active repo
(see `doc/ideas.md` for the format). Reads use the local clone, pulled first; if the pull fails,
the CLI shows the clone as it was and prints a warning. Writes go through GitHub. When GitHub
does not answer, a write is queued in the config directory (`spool/ideas/`) and sent, in order,
by the next `idea` or `ideas` command that reaches GitHub.

```sh
kaihuman idea "Offline sync for the palette" --product kaihuman --tag palette  # new seed idea
printf "Title\nthe rest is the braindump\n" | kaihuman idea                  # from stdin
kaihuman ideas                                # overview, open ideas first (--all, --status, --product, --json)
kaihuman ideas show palette-sync [--json]     # the file
kaihuman ideas find offline palette [--json]  # best matches first
kaihuman ideas log palette-sync "Researched CRDTs: too heavy." --by claude
kaihuman ideas challenge palette-sync "Conflicts on two devices"
kaihuman ideas dump palette-sync "Also the settings file?"   # stdin or $EDITOR without text
kaihuman ideas summary palette-sync "Queue writes; no CRDT."
kaihuman ideas status palette-sync committed --reason "Small enough." --by claude
kaihuman ideas import --by claude.ai < chat.md # apply kh-idea hand-off blocks
kaihuman ideas path [palette-sync]            # local clone path
kaihuman skills install                       # kh-ideas skill → ~/.claude/skills/, ~/.agents/skills/
```

`--by` is the author of the log entry: `human` (the default) or an agent's short name. A new idea
whose slug is taken fails; pick another one with `--slug`.

## Authentication Workflow

When you press `l` to log in:
1. The CLI spawns a lightweight local HTTP callback server on `127.0.0.1`, and picks a random `state` for this login.
2. It automatically opens your default web browser to the kaihuman Console authentication page, with that `state` in the URL.
3. Once authorized, the web console posts a form to your local server carrying your GitHub token and active repository. It is a POST, so the token never appears in a URL or in the browser's history. The console sends the `state` back, and the CLI accepts only a callback carrying it. Any other website could post its own token to the waiting server; such a post is refused and the CLI keeps waiting for its own login. The server still accepts the query-string redirect that older console builds sent.
4. Your token and selected repository are saved locally in your system's configuration directory (`~/.config/cli/auth.json` on Linux, `~/Library/Application Support/com.kaihuman.cli/auth.json` on macOS), keeping you logged in for future sessions!

## Releasing

1. Raise `version` in `Cargo.toml`.
2. `pnpm run package` builds and writes `release/kaihuman-<version>-<os>-<arch>.tar.gz` for this
   machine.
3. Push a tag `cli-v<version>`. The **Release CLI and Desktop Palette** workflow tests and builds
   Linux x86_64 and macOS arm64 tarballs and attaches them to a GitHub release. It fails if the
   tag does not match `Cargo.toml`.
