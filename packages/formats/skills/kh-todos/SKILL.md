---
name: kh-todos
description: Read, add, complete and change todos in the user's kaihuman data repo (*.todos.md) with the `kaihuman todo` CLI. Use when the user says "add a todo", "remind me to", "what's on my list / due today / overdue", "mark <x> done", "move this to <list>", or asks to import or clean up todos.
---

# kaihuman todos

Todos live in `*.todos.md` files in the user's kaihuman **data repo**. The inbox is
`.kh/inbox.todos.md` (`.lifeos/` in older repos). Always go through the `kaihuman todo` CLI: it
reads the latest state from GitHub, writes with conflict checks, and keeps the file format right.
Do not edit the files by hand.

## Rules

- Always pass `--json` and read the JSON. Text output is for humans.
- Every change targets an **id** (8 chars `[0-9a-z]`). Get it from `list`/`show` first; never guess
  by text. If a todo has `"id": null`, run `kaihuman todo assign-ids --json` once, then list again.
- Several todos match what the user said? Show at most 3 (id, text, list) and ask.
- Exit codes: 0 ok, 1 error, 2 bad usage, 3 id not found (list again), 4 conflict twice (rerun).
  Errors come on stderr as `{"error":{"code","message"}}`.

## Read

```sh
kaihuman todo lists --json                                    # files with counts
kaihuman todo list --json [--list inbox|<name>|<path>|all] [--status active|open|in-progress|done|rejected|any]
                          [--due overdue|today|week|YYYY-MM-DD] [--tag t] [--limit n]
kaihuman todo show <id> --json
```

Default: all lists, `active` (open + in progress). `week` = due within 7 days, overdue included.
A todo: `{id, list, status, text, tags[], priority, due, repeat, created, updated, note}`.

## Write

```sh
kaihuman todo add "<text>" --json [--list inbox|<name>|<path>] [--due 2026-11-20[T09:00]] [--tag t]...
                  [--priority high|super-high|ultra-high] [--repeat <rule>] [--note "<text>"]
kaihuman todo update <id> --json [--text ..] [--due ..|--no-due] [--priority ..|--no-priority]
                  [--add-tag t] [--rm-tag t] [--status open|in-progress|done|rejected]
kaihuman todo done <id> --json          # recurring: moves due to the next occurrence, stays open
kaihuman todo move <id> --to <list> --json
kaihuman todo rm <id> --json            # only when the user asks to delete; prefer done or rejected
```

- `<name>` means `.kh/<name>.todos.md`; a new name creates the list.
- Repeat rules: `daily`, `weekdays`, `weekly:mon,thu`, `every 2 weeks:fri`, `monthly:15`,
  `monthly:last`, `yearly:02-29`, `every 3 days`.
- Many todos at once: `kaihuman todo add --stdin --json` with one JSON object per line, same
  fields as above plus optional `id`, `status`, `created`, `updated`. A line whose `id` already
  exists is skipped, so a rerun is safe. One commit per list file.

After a change, tell the user in one line what changed (text, list, due).

## Migrate from TickTick

1. Ask the user for the TickTick backup CSV (TickTick: Settings > Account > Generate Backup).
2. Dry run: `kaihuman todo import ticktick <csv> --json`. It prints, per target file, `new` and
   `existing` counts and the todos. Check it with the user; `excluded_done` counts completed todos left
   out (add `--include-done` to keep them).
3. Write: the same command with `--apply`. One commit per list file.
- `Inbox` goes to the inbox; every other list to `<name>.todos.md`. Status, priority (5 super-high,
  3 high), tags, due, created time and notes carry over.
- Repeat rules the CLI cannot express get the tag `#repeat-unmapped` and the TickTick rule as a note.
  Offer to fix those by hand with `todo update`.
- The id comes from the TickTick task id, so a rerun skips what is already imported.
