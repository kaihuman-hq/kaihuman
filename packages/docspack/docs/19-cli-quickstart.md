# CLI quickstart

The `kaihuman` CLI is for you and your AI agents: it reads and changes the data repo that kaihuman keeps on GitHub (todos, ideas, knowledge notes) from a terminal, with JSON output that agents can parse. Install it, sign in once, and teach your agents the commands with one more command.

## Installing the kaihuman CLI
<!-- docspack: tags=install,curl,install.sh,download,macos,linux,arm64,cargo -->

```sh
curl -fsSL https://kaihuman.com/install.sh | sh
```

The script picks the prebuilt binary for your system (macOS Apple silicon or Intel, Linux x86_64 or arm64) from the latest `cli-v…` GitHub release, checks its SHA-256 against the release's `SHA256SUMS`, and installs `kaihuman` to `~/.local/bin`. Set `KAIHUMAN_VERSION` to pin a version and `KAIHUMAN_INSTALL_DIR` to install elsewhere. There is no Windows build yet.

To build from source instead (needs Rust):

```sh
cargo install --git https://github.com/kaihuman-hq/kaihuman cli --locked
```

## Signing in
<!-- docspack: tags=login,auth,github,sign in -->

Run `kaihuman`. With no saved login it opens your browser to sign in with GitHub, then stores the token and your active repo locally. The commands below use that login.

## Working with todos
<!-- docspack: tags=todo,kaihuman todo,json,examples,agents -->

Add `--json` to any command for machine-readable output.

```sh
kaihuman todo lists --json                                   # todo files and counts
kaihuman todo list --due today --json                        # what is due today, all lists
kaihuman todo add "Renew passport" --list admin --due 2026-12-01 --json
kaihuman todo update <id> --due 2026-12-15 --add-tag travel --json
kaihuman todo done <id> --json                               # recurring todos move to their next date
kaihuman todo move <id> --to work --json
```

Every change targets a todo `id` that `list` or `show` returns. Exit codes: 0 ok, 1 error, 2 bad usage, 3 id not found, 4 write conflict after a retry.

## Setting up your AI agents
<!-- docspack: tags=skills,agents,claude code,codex,gemini,kh-todos,setup -->

```sh
kaihuman skills install
```

This writes the `kh-ideas` and `kh-todos` skills to `~/.claude/skills/` (Claude Code) and `~/.agents/skills/` (Codex, Gemini CLI, Copilot, Cursor, Antigravity). After that, saying "add a todo to renew my passport" or "what is due this week?" in any of those agents runs the right `kaihuman todo` command.

## Moving from TickTick
<!-- docspack: tags=ticktick,migrate,import,csv -->

Export a backup from TickTick (Settings, Account, Generate Backup), then:

```sh
kaihuman todo import ticktick backup.csv           # dry run: prints the plan as JSON
kaihuman todo import ticktick backup.csv --apply   # writes it, one commit per file
```

Running it again adds nothing twice. Add `--include-done` to bring completed todos too. Or ask your agent: the `kh-todos` skill knows the migration steps.

More detail on every command is in the [terminal CLI reference](/docs/cli/).
