# Ideas — study and proposal

Status: built (2026-10-13). The answers to the open questions are at the end. Where the build
differs from the first proposal, this file says what was built.

## Goal

Every product or feature idea you think about has one home: your data repo. Every agent (Claude
Code, Antigravity / Gemini CLI, Codex, Copilot, Cursor, Claude Desktop) reads and writes the same
files. You can see all ideas at a glance in the terminal and in the console. A new idea takes one
command or one key.

**Problems this solves**

| Today | After |
| --- | --- |
| Ideas live in Gemini and Claude chats. You lose track of them. | Each idea is one Markdown file in `.kh/ideas/`, in git. |
| One agent does not know what another found. | All agents use the same files and the same skill. |
| No history in your own space. | Each file has a dated log, and git keeps every version. |
| A quick thought has nowhere to go. | `kaihuman idea "…"`, `>id` in the palette, or `/quick-idea` in the console. |

**Success criteria**

- In any agent, "add this to the palette-sync idea" changes the right file without more questions.
- `kaihuman ideas` lists every idea, with status and last change, in under a second from the local
  clone.
- A quick idea is saved offline and is in the repo after the next push.
- An idea file stays readable: one screen for the summary, the newest log entries and the open
  challenges.

**Non-goals.** This is not a project manager. Ideas that you start to build become todos
(`.todos.md`) or issues in the product repo. The idea file only links to them.

## What exists today, and where ideas fit

kaihuman already has six capture paths (see `doc/braindump.md`). An idea must not be a seventh copy
of one of them. It is a different thing because it has a **lifecycle** (seed → explored → built or
dropped) and many writers over weeks or months.

| Existing | Lifecycle | Relation to ideas |
| --- | --- | --- |
| `.kh/braindumps/<ms>.md` | Scratch. Written once, maybe deleted. | A braindump can be **promoted** to an idea. |
| `.kh/raw/` → `/kb-ingest` → `.kh/wiki/` | Knowledge about the world. | Research done for an idea goes to the KB. The idea links to the wiki page. It does not copy it. |
| `.todos.md` | Work to do. | A committed idea gets todos. The idea links to them. |
| `.kh/log.md` (KB log) | Log of KB operations. | Not shared. Each idea has its own log. |
| `notes/ideas.md` (demo seed only) | A flat bullet list. | Replaced by `.kh/ideas/`. |

## Decision 1 — where the files live

**Recommendation: `.kh/ideas/` in the data repo (your life-OS repo), not in each product repo.**

| | Data repo `.kh/ideas/` (recommended) | `.kh/ideas/` in each product repo |
| --- | --- | --- |
| Ideas for products that do not exist yet | Yes | No repo to put them in |
| Ideas that move between products | Change one field | Move the file between repos |
| One overview of everything | Yes | Needs a scan of all repos |
| The console, CLI, palette and extension already know this repo | Yes | No |
| Agent working in a product repo can reach it | Through the CLI or MCP (Decision 5) | Directly |
| Private ideas stay private when the product repo is public | Yes | No |

The last-but-one row is the cost. Decision 5 solves it: agents do not edit the data repo by path.
They call `kaihuman idea …`, which already knows the active repo.

The product is a field in the file (`product: kaihuman`), not a folder. A folder per product makes
a move a rename, and many ideas are not for one product.

## Decision 2 — one file per idea, and how to name it

One file per idea, for the same reasons as braindumps: one writer per file, create-only PUT,
small diffs, delete by sha.

```
.kh/ideas/<slug>.md
```

- **The slug is the id.** You refer to an idea by it: `palette-sync`, `idea:palette-sync` in text,
  `[[ideas/palette-sync]]` as a wikilink. It is lowercase kebab-case, 2–40 characters,
  `^[a-z0-9][a-z0-9-]{1,39}$`.
- **The slug never changes.** The title can change at any time. A rename breaks references in
  other ideas, in chats and in agent memory.
- **No number prefix** (`IDEA-0042`). Two devices that create an idea offline both pick 0042. A
  slug is easier to say ("add to palette-sync") than a number. Uniqueness is checked by a
  create-only write: if the file exists, the writer asks for another slug (or appends `-2`).
- **No date in the name.** The creation time is in the frontmatter, and the overview sorts by it.

Why not a ms id like braindumps? Braindumps are never referenced by name. Ideas are referenced all
the time, by people and by agents, so the name must be readable.

## Decision 3 — the file format

Few sections, each with **one owner and one write rule**. This is what keeps noise out: an agent
knows exactly where it may write, and how.

```markdown
---
title: Offline sync for the desktop palette
status: exploring
product: kaihuman
tags: [palette, sync]
created: 2026-10-13T09:12+02:00
updated: 2026-10-14T18:40+02:00
links:
  - wiki/crdt.md
  - .kh/projects.todos.md
---

# Offline sync for the desktop palette

The palette works with no network and syncs when it comes back. Worth it only if it stays
simpler than the braindump sync.

## Log

- 2026-10-14 18:40 · claude · Status seed → exploring. Braindump sync already solves 80%; reuse it.
- 2026-10-14 18:31 · claude · Researched CRDTs: too heavy for single-user data. → [[wiki/crdt]]
- 2026-10-13 09:12 · human · Created from the palette.

## Challenges

- [ ] Conflicts when two devices edit the same file offline.
- [x] ~~Does the extension need it too?~~ No: it is always online. (2026-10-14)

## Braindump

Palette should work on the train. Maybe just queue writes like `capture` does?
Also: what about the settings file?
```

| Part | Owner | Write rule |
| --- | --- | --- |
| Frontmatter | Tools | Changed only through the CLI or skill rules. `updated` changes on every write. |
| Title and summary (the paragraph under `#`) | Agent | **Rewritten**, at most 3 sentences: the current state of the idea. It is the only part an agent may rewrite. |
| `## Log` | Everyone | **Append only, newest first.** One line per entry: `- YYYY-MM-DD HH:MM · <author> · <text>`. Never edited, never deleted. |
| `## Challenges` | Everyone | Open questions and risks as a checklist. Resolved items are checked and get a date, not deleted. |
| `## Braindump` | **You** | Free text. Agents may only append below what is there, and only when you say "add this to the braindump". They never reformat or summarise it. |

**Why newest first in the log.** You asked for the log at the top, and you read newest first, like
Keep a Changelog. The cost is that two writers insert at the same line, so a git merge can conflict.
That is rare for one person, and the fix is trivial.

**Why no separate "History" section.** A log entry for every status change *is* the history, and git
has every version of the file. A second section would hold the same facts twice.

**Optional sections**, created only when needed, never as empty headings: `## Decisions` (for an
ADR-style "we chose X because Y") and `## Next`. Empty template sections are noise.

**Status lifecycle** (a TypeScript union in `@kaihuman/formats`):

```
seed → exploring → committed → shipped
          ↘           ↘
           parked      dropped
```

- `seed` — captured, not thought through. The default for quick ideas.
- `exploring` — an agent or you are working on it.
- `committed` — you will build it. It should link to todos or issues.
- `shipped`, `parked`, `dropped` — closed. `parked` can come back. A `dropped` idea keeps its file
  and gets a log entry with the reason. Knowing why an idea died is the most useful history.

**Timestamps.** `created` and `updated` are ISO 8601 with offset, to the minute. Log entries use
local time `YYYY-MM-DD HH:MM`, like the action log. The author is `human` or the agent's short name
(`claude`, `gemini`, `codex`, `copilot`, `cursor`). This shows which agent added what, which is the
"shared knowledge" part of the goal.

**Size budget.** If a file is over ~300 lines, the skill moves long research to the KB
(`.kh/raw/` → `/kb-ingest`) and keeps a link plus a one-line result in the log. Attachments that
must stay with the idea go in `.kh/ideas/<slug>/` (rare).

## Decision 4 — no committed index file

An `ideas/README.md` index, rebuilt on every change, rewrites one shared file on every write. That
is the problem Decision 1 of `doc/braindump.md` avoids. The overview is computed instead: the CLI
reads the local clone, the console reads the tree it already syncs. An agent with no CLI can run
`grep -H '^status:\|^title:' .kh/ideas/*.md`. Frontmatter is the index.

## Decision 5 — one write path for all agents: the CLI

Agents are good at editing Markdown, but they also edit too much. They reformat, re-sort and
"tidy". They write in the wrong repo, or in a stale clone. A small CLI gives every agent the same
safe operations, and the skill only needs to explain *when* to call them.

```sh
kaihuman idea "Offline sync for the palette"          # new seed idea; prints the slug
kaihuman idea "…" --product kaihuman --tag palette   # with fields
echo "long text" | kaihuman idea                      # from stdin (first line = title)
kaihuman ideas                                        # overview (table, see Decision 7)
kaihuman ideas --status exploring --product kaihuman  # filtered
kaihuman ideas show palette-sync                      # print the file
kaihuman ideas find "offline palette"                 # fuzzy match on slug, title, tags
kaihuman ideas log palette-sync "Researched CRDTs: too heavy." --by claude
kaihuman ideas challenge palette-sync "Conflicts on two devices"
kaihuman ideas dump palette-sync "Also the settings file?"   # append to Braindump
kaihuman ideas status palette-sync exploring --by claude --reason "…"
kaihuman ideas summary palette-sync "…"               # replace the summary
kaihuman ideas path [palette-sync]                    # local clone path, for direct reads
```

- Every write sets `updated`. Only `log` and `status` add log entries: a log line that only says
  "added a challenge" would be noise, and the challenge itself is in the file.
- It writes through the GitHub contents API, like `capture` (commit `kaihuman: idea palette-sync —
  log`): creates never overwrite, edits are checked against the file's sha. Reads pull the local
  clone first. Offline, a write is queued in the spool and replayed in order.
- `--json` on read commands, so agents can parse the output.
- Agents without a shell (Claude Desktop chat) use MCP (Decision 6).

**Fallback when the CLI is not installed.** The skill also says how to edit the file directly in
the data repo, with the same rules. The CLI is the safe path, not the only one.

## Decision 6 — one skill for every agent

### The skill

One `SKILL.md` in the [Agent Skills](https://agentskills.io/specification) format. Only `name` and
`description` in the frontmatter, because tool-specific fields (`allowed-tools`, …) do not port.

```markdown
---
name: kh-ideas
description: Capture, update and review product and feature ideas stored in the user's kaihuman
  repo (.kh/ideas/). Use when the user says "add this to the <x> idea", "new idea", "park this
  idea", "what ideas do I have for <product>", or refers to idea:<slug>.
---
```

The body (about 80 lines) holds:

1. **How to find the idea.** Use the slug if one is given. Else `kaihuman ideas find "<words>"`.
   One clear match: use it and say which. Several: list at most 3 and ask. None: offer to create
   one. Remember the chosen idea for the rest of the conversation, so "add this to the idea" works
   the second time.
2. **What goes where.** A finding or decision → log. A risk or open question → challenge. The
   user's own words when they say "braindump" → braindump. A changed understanding → summary.
3. **Noise rules.** One log entry per meaningful step, not per message. At most 2 lines. No log
   entry for "discussed the idea". Before writing, say in one line what will be written. Never
   rewrite the log or the braindump. Long research → KB.
4. **The commands** from Decision 5, then the direct-edit fallback with the format.
5. **Hand-off block** (see below) for chat apps that cannot write.

### Where the files go

Research on 2026-10-13 (sources at the end):

| Agent | Reads project skills from | Notes |
| --- | --- | --- |
| Claude Code | `.claude/skills/` | Does **not** read `.agents/skills/`. |
| Antigravity CLI (`agy`) | `.agents/skills/` | Replaced Gemini CLI for individual users on 2026-06-18. |
| Gemini CLI (enterprise) | `.gemini/skills/`, `.agents/skills/` | |
| Codex | `.agents/skills/` | |
| GitHub Copilot | `.github/skills/`, `.claude/skills/`, `.agents/skills/` | |
| Cursor | `.agents/skills/`, `.cursor/skills/`, `.claude/skills/` | |

So **two copies of the same file cover all of them**: `.agents/skills/kh-ideas/SKILL.md` and
`.claude/skills/kh-ideas/SKILL.md`. Copies, not a symlink: the console writes through the GitHub
contents API, which cannot make symlinks easily, and not every tool is known to follow them.

The skill is installed in two places:

1. **In the data repo**, by the console's scaffold. `apps/console/src/lib/kb-skills.ts` already
   writes the `/kb-*` commands and `CLAUDE.md`, and re-writes them when `KB_SKILL_VERSION` changes.
   Add the two `SKILL.md` copies there. Also add an `AGENTS.md` that points to the same rules,
   because only Claude Code reads `CLAUDE.md` (Antigravity, Codex, Copilot and Cursor read
   `AGENTS.md`). This also makes the existing KB setup less Claude-only.

   *As built:* kaihuman owns one marked section in `CLAUDE.md` and `AGENTS.md` and only ever
   replaces that section, so the user's own text in both files stays. `/ideas` runs the same
   update as `/knowledge` when the skills are installed, and links to `/knowledge` when they are
   not. The section and the skill tell an agent working in the data repo (for example a cloud
   session, which works on its own branch) to **ask the user** before committing idea changes
   straight to the default branch, where the kaihuman apps read them.
2. **Globally**, because you talk about ideas while you work in a *product* repo, not in the data
   repo. `kaihuman skills install` copies the skill to `~/.claude/skills/kh-ideas/` and
   `~/.agents/skills/kh-ideas/` (read by Antigravity, Codex, Copilot, Cursor). This is the install
   that makes "add this to the idea" work everywhere. It is also the reason the skill uses the CLI:
   the CLI knows the data repo, the product repo does not.

**Slash commands.** Claude Code makes `/kh-ideas` from the skill. A short `/idea <text>` shortcut
is easy to add as a second skill (`kh-idea`, which only creates). Gemini TOML commands are not
needed: Antigravity converts commands to skills anyway.

### Chat apps (claude.ai, Claude Desktop, Gemini app)

This is where most ideas are now. They cannot run the CLI.

| App | Path | Effort |
| --- | --- | --- |
| Claude Desktop | **MCP**: add idea tools to `apps/kb-mcp` (below). Desktop runs local stdio MCP servers, so it can read and write ideas directly. | Medium |
| claude.ai (web, mobile) | Upload the same skill as a ZIP (Customize → Skills). There it produces a **hand-off block**, because it cannot write to the repo. | Small |
| Gemini app | Gemini "Skills" are rolling out now and replace Gems. Their format is not confirmed. Until then: a saved instruction that produces the same hand-off block. | Small |

The **hand-off block** is a fenced block the chat writes at the end of a discussion:

````markdown
```kh-idea
slug: palette-sync
title: Offline sync for the desktop palette
product: kaihuman
log: Compared CRDT vs queue; queue wins for single-user data.
challenges:
  - Conflicts when two devices edit offline
summary: …
```
````

You copy it, then run `kaihuman ideas import` (reads stdin or `$EDITOR`), or paste it into the
console's quick-idea box. Both apply it with the normal rules and the author `claude.ai` or
`gemini`. This is one copy and one paste, and it is the same for every chat app.

**MCP tools** for `apps/kb-mcp` (it already has `kb_add_raw` as a create-only write, plus tests):
`ideas_list`, `ideas_find`, `ideas_read`, `ideas_create`, `ideas_append` (`kind: log | challenge |
braindump`), `ideas_set_status`. A remote, hosted MCP server for claude.ai would remove the paste,
but it needs hosting and auth. Not now.

## Decision 7 — the overview and quick add

"Console" means two things in kaihuman, so both:

### Terminal

`kaihuman ideas`, grouped by status, newest change first:

```
EXPLORING (2)
  palette-sync        Offline sync for the desktop palette    kaihuman   2h ago   ⚠ 1
  ideas-mcp           Ideas tools in kb-mcp                   kaihuman   3d ago
SEED (5)
  voice-capture       Voice capture on Android                —          1d ago
  …
PARKED (1) · SHIPPED (3) · DROPPED (2)    (--all to show)
```

`⚠ 1` = open challenges. Closed statuses are collapsed by default: that keeps the list short.

In the TUI: a menu item `i` (Ideas) with the same list. ⏎ opens the file in the editor, `n` makes a
new idea, `l` adds a log entry, `s` changes status. This uses the `CurrentScreen` / `MENU_ITEMS` /
`ListState` pattern of the file browser.

### Web console

- **`/ideas`** — a board with one column per open status, or a list with status, product and tag
  filters. A card shows the title, summary, last log line, age and open challenges. Opening a card
  shows the file with three input boxes: log, challenge, braindump.
- **`/quick-idea`** — the same shape as `/quick-note` and `/quick-knowledge`, with a PWA shortcut.
  One text box. It also accepts a `kh-idea` hand-off block.
- An **Idea** template in the New File wizard is *not* needed: `/quick-idea` does it better.

### Everywhere else

- **Palette `>id`** (`>i` is already IMDb): lists ideas, most recently active first. Typing text and ⏎ makes a seed idea. `slug: text` adds a
  log line to that idea. Works in the extension and the desktop palette.
- **Braindump window**: a "Promote to idea" action makes an idea from the braindump. The braindump
  text becomes the idea's Braindump section, then the braindump is deleted.
- **Extension start page**: none for now. The start page is about today. Ideas would be noise there.

## Code changes, by layer

| Layer | Change |
| --- | --- |
| `packages/formats/src/ideas.ts` | `IDEAS_FOLDER`, `IdeaSlug` (branded), `ideaSlugOf(path)`, `IdeaStatus` union, `parseIdea` / `serializeIdea`, `newIdea`, `appendIdeaLog`, `addIdeaChallenge`, `appendIdeaBraindump`, `setIdeaStatus`, `parseIdeaHandoff`. Tests next to it, like `braindumps.test.ts`. |
| `apps/cli` (Rust) | `ideas.rs` mirroring the format (with "Mirrors `X`" comments, as `build_kb_note` does), the `idea` / `ideas` subcommands, the TUI screen, the spool reuse. |
| `apps/console` | Skill files in `kb-skills.ts` (+ version bump), `/ideas` and `/quick-idea` pages. |
| `apps/kb-mcp` | `ideas_*` tools. |
| `packages/palette`, `apps/desktop-palette` | `>id` mode, `LIST_IDEAS` / `SAVE_IDEA` messages, ⌃I "Promote to idea" in the braindump window. |
| Docs | `doc/documentation.md`, `doc/features.md`, `packages/docspack` (file format page), roadmap. |

The format must exist in TypeScript and Rust. That is the same duplication as the raw-note format
(`knowledgeNote` / `build_kb_note`). Keep the Rust side to what the CLI needs and share test cases
(the same input files in both test suites).

## Phases

| # | What | Gives you | Check |
| --- | --- | --- | --- |
| 1 | Format in `@kaihuman/formats` + `kaihuman idea` / `ideas` CLI + skill (global install) | Every terminal agent can capture and update ideas. You have the overview in the terminal. | Create, log and change status from Claude Code and Antigravity in a product repo; the data repo gets the commits. |
| 2 | Hand-off block + `kaihuman ideas import` + claude.ai skill ZIP | Ideas from web chats reach the repo in one paste. | Paste a block from claude.ai; the log line has `claude.ai` as author. |
| 3 | Console `/ideas` + `/quick-idea`; scaffold writes skill + `AGENTS.md` | Overview and quick add in the browser and on Android. | |
| 4 | `kb-mcp` idea tools | Claude Desktop reads and writes ideas. | |
| 5 | Palette `>id`, braindump "Promote to idea", TUI screen | One-key capture on the desktop. | |

Phase 1 is the core. Everything after it is another way in to the same files.

**Migration.** A one-time `/kb-*`-style prompt (or `kaihuman ideas import --from-text`) that turns a
pasted list, or an exported chat, into seed ideas. You review the slugs before anything is written.

## Decided (2026-10-13)

1. **Data repo only.** Product repos do not get their own `.kh/ideas/`.
2. **The six statuses** stay: `seed / exploring / committed / shipped / parked / dropped`.
3. **The log stays newest first**, with its small merge cost.
4. **Agents may change the status**, always with a log line.

Still open: the CLI's `AiProvider` runs `gemini`, and individual users now have `agy` instead.
That is outside this feature.

## Sources

- Agent Skills specification: https://agentskills.io/specification
- Claude Code skills and AGENTS.md: https://code.claude.com/docs/en/skills ,
  https://code.claude.com/docs/en/memory#agents-md
- Gemini CLI to Antigravity CLI:
  https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ ,
  https://antigravity.google/docs/cli/gcli-migration
- Gemini CLI skills: https://geminicli.com/docs/cli/skills/
- Copilot agent skills: https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- Cursor skills: https://cursor.com/docs/context/skills
- AGENTS.md: https://agents.md
- Skills in claude.ai: https://support.claude.com/en/articles/12512180-using-skills-in-claude
- Skills in the Gemini app: https://blog.google/intl/de-de/produkte/suchen-entdecken/skills-starten-in-gemini/
- Prior art: Backlog.md (https://github.com/MrLesk/Backlog.md), MADR (https://adr.github.io/madr/),
  Keep a Changelog (https://keepachangelog.com)
