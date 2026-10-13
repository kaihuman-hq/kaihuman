---
name: kh-ideas
description: Capture, update and review product and feature ideas kept in the user's kaihuman data repo (.kh/ideas/). Use when the user says "new idea", "add this to the <x> idea", "log this on the idea", "park / drop / commit this idea", "what ideas do I have for <product>", or mentions idea:<slug>.
---

# kaihuman ideas

Each idea is one Markdown file, `.kh/ideas/<slug>.md`, in the user's kaihuman **data repo** (their
life-OS repo, not the repo you are working in). Many agents (Claude, Gemini, Codex, Copilot,
Cursor) and the user share these files. Write little and write it in the right place.

## 1. Find the idea

- The user names a slug (`palette-sync`, `idea:palette-sync`): use it.
- Otherwise run `kaihuman ideas find "<a few words>" --json`.
  - One clear match: use it, and say which one in one line.
  - Several: show at most 3 (slug, title, status) and ask.
  - None: offer to create one.
- Remember the idea for the rest of the conversation. "Add this to the idea" means that one.

## 2. Decide what goes where

| What the user gives you | Where it goes | Command |
| --- | --- | --- |
| A finding, a decision, a result of research | Log | `kaihuman ideas log <slug> "<text>" --by <you>` |
| A risk or an open question | Challenges | `kaihuman ideas challenge <slug> "<text>"` |
| Their own raw words, when they say "braindump" or "add my notes" | Braindump | `kaihuman ideas dump <slug> "<text>"` |
| A changed understanding of what the idea is | Summary (≤ 3 sentences, rewritten) | `kaihuman ideas summary <slug> "<text>"` |
| "We'll build it", "park it", "drop it", "it shipped" | Status | `kaihuman ideas status <slug> <status> --reason "<why>" --by <you>` |
| A new idea | New file | `kaihuman idea "<title>" --by <you> [--product <p>] [--tag <t>]` |

`--by` is your short lowercase name: `claude`, `gemini`, `codex`, `copilot`, `cursor`. The
user is `human`.

Statuses: `seed` (captured) → `exploring` → `committed` → `shipped`, or `parked` / `dropped`.
Always give a reason when you drop or park an idea: why an idea died is the most useful history.

## 3. Noise rules

- One log entry per meaningful step, not one per message. One or two sentences. No entry for
  "discussed the idea".
- Before you write, say in one line what you will write and where.
- Never rewrite or reorder the log, the challenges or the braindump. Only the summary is rewritten.
- Never write the user's braindump in your own words. Quote them.
- Long research goes to the knowledge base (`kaihuman capture`, then `/kb-ingest`). Log one line
  with the result and the wiki page.

## 4. Read

- `kaihuman ideas` — overview of open ideas (`--all` for closed ones, `--status`, `--product`,
  `--json`).
- `kaihuman ideas show <slug>` — the whole file. Read it before you change the summary or status.
- `kaihuman ideas path [<slug>]` — the local file path, for reading with your own tools.

## 5. Without the CLI

If `kaihuman` is not installed, edit the file in the data repo directly, then commit and push.
Keep the format exactly:

```markdown
---
title: "Offline sync for the desktop palette"
status: exploring
product: kaihuman
tags: [palette, sync]
created: 2026-10-13T09:12+02:00
updated: 2026-10-14T18:40+02:00
---

# Offline sync for the desktop palette

Summary: at most 3 sentences on where the idea stands now.

## Log

- 2026-10-14 18:40 · claude · Newest entry first. Local time, `·` between the parts.
- 2026-10-13 09:12 · human · Created.

## Challenges

- [ ] An open question.
- [x] A resolved one. Checked, never deleted.

## Braindump

The user's own words. Only ever append below.
```

The slug is the file name: 2–40 characters of `a-z`, `0-9` and `-`. It never changes, even if the
title does. Set `updated` on every change. A status change also gets a log entry:
`Status <old> → <new>. <reason>`.

## 6. Chat apps that cannot write files

In claude.ai, the Gemini app, or any chat with no shell, end with a hand-off block that the user
pastes into `kaihuman ideas import` or the console's quick idea page:

````markdown
```kh-idea
slug: palette-sync
log: One-line result of this conversation.
challenges:
  - An open question that came up
summary: |
  Only if the idea itself changed.
status: exploring
```
````

Use `slug: new` and add `title:` (and optionally `product:`, `tags: [a, b]`, `braindump: |`) for a
new idea. Leave out every field that did not change.
