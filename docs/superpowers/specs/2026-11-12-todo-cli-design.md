# Agent todo CLI — design

## Why
Agents (Claude Code etc.) must read and change kaihuman todos in the data repo. First use: migrate all
TickTick todos into kaihuman (inbox first, then all lists).

## Goals / non-goals
- Goals: `kaihuman todo …` subcommands, JSON in/out, stable ids, GitHub contents API writes with the
  token from the existing web-app login (`auth.rs`), TickTick CSV import.
- Non-goals: TUI for todos, milestones editing, views beyond simple filters.
- Anti-goal: an agent edits the wrong todo. Every mutation targets a stable id.

## Approaches (picked: 1)
1. **Stored id in metadata line** — stable; small format change. Picked.
2. Hash of path+text+created — breaks on text edit.
3. Position + text guard — clumsy for agents.

## Format change (packages/formats)
- Metadata line gets `::id:: <id>`, written **last** on the line (older parsers read `::updated::`
  / `::created::` first). `<id>` = 8 chars `[0-9a-z]`, random. Unique within the repo.
- Parse keeps it; serialize writes it; edits keep it. New todos created by the console get an id.
- Todos without an id stay valid (no forced migration). Merge (`merge.ts`) keys by id when both
  sides have one.

## CLI (apps/cli, Rust, binary `kaihuman`)
Copy the `ideas_cli.rs` pattern (Session, clap, `--json`, sha PUT, one retry on conflict). New
module `todos.rs` (pure parse/serialize port of `todos.ts`, round-trip byte-exact for files it does
not change) + `todos_cli.rs`.

Commands (all accept `--json`; JSON output is the contract, text is for humans):
- `todo lists` — every `*.todos.md` in the repo, with counts. Inbox = `<appFolder>/inbox.todos.md`
  (`.kh`, or `.lifeos` if no `.kh/`).
- `todo list [--list inbox|<path>|all] [--status open|in-progress|done|rejected|any] [--due overdue|today|week|<date>] [--tag t] [--limit n]`
- `todo show <id>`
- `todo add <text> [--list p] [--due d] [--tag t]… [--priority high|super-high|ultra-high] [--repeat rule] [--note text]`
- `todo add --stdin` — NDJSON, one object per todo (same fields), one commit per file.
- `todo update <id> [--text] [--due|--no-due] [--priority|--no-priority] [--add-tag] [--rm-tag] [--status]`
- `todo done <id>` (recurring: advance `::due::` + `::done::` log, as `completeTodo`), `todo move <id> --to <list>`, `todo rm <id>`
- `todo assign-ids` — backfill ids in all files, one commit. Any write also backfills the file it touches.
- `todo import ticktick <csv> [--apply]` — dry run by default (prints plan JSON).

JSON todo: `{id, list, status, text, tags[], priority, due, repeat, created, updated, note}`
(`id` null if absent). Exit codes: 0 ok, 1 error, 2 usage, 3 not found, 4 conflict after retry.
With `--json`, errors go to stderr as `{"error":{"code","message"}}`.
Reads use the GitHub API (not the local clone) so agents always see the latest state.
Ship `packages/formats/skills/kh-todos/SKILL.md`, installed by `kaihuman skills install`.

## TickTick import mapping
CSV columns (TickTick backup export): List Name, Title, Content, Tags, Due Date, Repeat, Priority,
Status, Created Time, taskId. List "Inbox" → inbox file; other lists → `<appFolder>/<slug>.todos.md`.
Status 0→`[ ]`, 2→`[x]`, -1→`[-]`. Priority 5→`^super-high`, 3→`^high`, else none. Tags→`#tags`.
Content → `> ` note lines. RRULE: map daily/weekly/monthly forms that `todo-repeat.ts` supports;
others → tag `#repeat-unmapped` + note. id = first 8 base36 chars of a hash of taskId, so a re-run
skips already-imported todos (idempotent). Completed todos imported only with `--include-done`.

## Left to the builder
Crate choices (keep new deps minimal), internal structure, test layout.
