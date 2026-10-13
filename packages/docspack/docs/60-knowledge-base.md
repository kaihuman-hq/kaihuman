# Knowledge base

The kaihuman knowledge base is a personal wiki kept in the `.kh/` folder of the user's GitHub repository. It follows the LLM-wiki pattern: capture tools drop raw sources into `.kh/raw/`, and Claude Code slash commands such as `/kb-ingest`, `/kb-ask`, `/kb-digest` and `/kb-lint` compile them into cross-linked wiki pages. The console scaffolds the folder and the commands from `apps/console/src/lib/kb-skills.ts`, and `apps/kb-mcp` exposes the same folder to MCP clients.

## What is inside the `.kh/` knowledge base folder
<!-- docspack: tags=layout,directory,structure,folders -->

The console's scaffold and the `CLAUDE.md` it writes describe this layout:

| Path | Holds |
|---|---|
| `.kh/raw/` | Unprocessed sources with frontmatter `processed: false` |
| `.kh/raw/processed/` | Sources already ingested, with `processed: true` |
| `.kh/wiki/` | Compiled wiki pages, cross-linked with `[[wikilinks]]` |
| `.kh/journal/` | Monthly `YYYY-MM.md` files with each ingested source verbatim |
| `.kh/assets/` | Images downloaded with pinned pages, linked as `/.kh/assets/...` |
| `.kh/braindumps/` | Braindump texts from the desktop palette, one `<created-ms>.md` each |
| `.kh/schema.md` | Domain definition and page format rules |
| `.kh/index.kb.md` | Master catalog of all wiki pages, grouped by type |
| `.kh/log.md` | Append-only history of every operation |
| `.kh/search.kb.json` | Optional inverted index built by `/kb-index` |
| `.kh/.skill-version` | Version of the installed slash commands and skills, for example `1.8.0` |

The same `.kh/` folder also holds the widget files (todos, action logs, habits) and app configuration such as `.kh/.dashboard.config.json` and `.kh/command-palette.settings.json`. The slash commands themselves live in `.claude/commands/` at the repository root.

## How the LLM-wiki workflow fits together
<!-- docspack: tags=llm wiki,pattern,karpathy,workflow,pipeline -->

The user curates sources and asks questions; Claude maintains the wiki. The scaffolded `CLAUDE.md` lists the workflow:

1. Sources land in `.kh/raw/` with `processed: false`. They come from the browser extension, the console's "Add note", `kaihuman capture`, the palette's `>q`, `/kb-session`, `/kb-digest` or the MCP tool `kb_add_raw`.
2. `/kb-ingest` compiles them into `.kh/wiki/` pages, appends each to `.kh/journal/YYYY-MM.md`, and moves it to `.kh/raw/processed/`.
3. `/kb-index` rebuilds `.kh/search.kb.json` from all wiki pages.
4. `/kb-ask <question>` answers from the wiki; `--save` files the answer as a new page.
5. `/kb-lint` fixes contradictions, stale claims, orphans and gaps.
6. `/kb-digest` turns the user's tracked personal data into a raw source, weekly.

Raw sources are ground truth: apart from the `processed` flag, the commands never change them. The wiki is the synthesis and can be rebuilt or corrected against them.

## Setting up a knowledge base in a repository
<!-- docspack: tags=scaffold,initialize,install,setup -->

Open the console at `/knowledge` with a repository selected. When `.kh/.skill-version` is missing, the page offers to set the knowledge base up. `scaffoldKB` in `apps/console/src/lib/github-kb.ts` then commits these files with the message `chore: scaffold knowledge base`:

- `.kh/.skill-version`, `.kh/schema.md`, `.kh/index.kb.md`, `.kh/log.md`
- `.kh/raw/.gitkeep`, `.kh/journal/.gitkeep`, `.kh/wiki/.gitkeep`, `.kh/ideas/.gitkeep`
- `.claude/commands/kb-ingest.md`, `kb-index.md`, `kb-lint.md`, `kb-ask.md`, `kb-session.md`, `kb-digest.md`, `kb-agent-capture.md`
- `.agents/skills/kh-ideas/SKILL.md` and `.claude/skills/kh-ideas/SKILL.md`, the ideas skill (see "Idea file format")
- `CLAUDE.md` with the knowledge base and ideas conventions, and `AGENTS.md` with the same text for agents that do not read `CLAUDE.md` (Antigravity, Codex, Copilot, Cursor)

If the repository already has a `CLAUDE.md` or `AGENTS.md`, the page names them and can scaffold without both (`skipClaudeMd`). On every later visit, `updateSkillsIfNeeded` compares `.kh/.skill-version` with `KB_SKILL_VERSION`. When they differ, it rewrites the command and skill files, `CLAUDE.md` and `AGENTS.md` with the message `chore: update KB skills to v<version>`.

The page also lists the files in `.kh/raw/` and `.kh/raw/processed/`, has an "Add note" form, and shows a Commands modal (`apps/console/src/components/KBCommandsModal.tsx`) describing each slash command.

## Where the `/kb-*` slash commands are defined
<!-- docspack: tags=skills,claude commands,source code -->

The command text is not stored in this monorepo as Markdown files. It lives as string constants in `apps/console/src/lib/kb-skills.ts`:

| Constant | Written to |
|---|---|
| `KB_INGEST_SKILL` | `.claude/commands/kb-ingest.md` |
| `KB_INDEX_SKILL` | `.claude/commands/kb-index.md` |
| `KB_LINT_SKILL` | `.claude/commands/kb-lint.md` |
| `KB_ASK_SKILL` | `.claude/commands/kb-ask.md` |
| `KB_DIGEST_SKILL` | `.claude/commands/kb-digest.md` |
| `KB_SESSION_SKILL` | `.claude/commands/kb-session.md` |
| `KB_AGENT_CAPTURE_SKILL` | `.claude/commands/kb-agent-capture.md` |
| `KB_CLAUDE_MD` | `CLAUDE.md` and `AGENTS.md` |
| `@kaihuman/formats/skills/kh-ideas/SKILL.md` | `.agents/skills/kh-ideas/SKILL.md`, `.claude/skills/kh-ideas/SKILL.md` |
| `KB_SCHEMA_TEMPLATE` | `.kh/schema.md` |

`getScaffoldFiles()` returns every file for a new knowledge base. `getSkillOnlyFiles()` returns only the commands, skills, `CLAUDE.md`, `AGENTS.md` and `.kh/.skill-version`, for upgrades. To change a command, edit the constant and bump `KB_SKILL_VERSION`, so existing repositories pick up the new text on their next visit to `/knowledge`. Tests are in `apps/console/src/lib/kb-skills.test.ts`.

## Ingesting raw sources with `/kb-ingest`
<!-- docspack: tags=ingest,compile,process sources -->

`/kb-ingest` compiles files in `.kh/raw/` into wiki pages. It processes only direct children of `.kh/raw/`, oldest first.

| Invocation | Behaviour |
|---|---|
| `/kb-ingest` | Interactive: discusses each source before writing |
| `/kb-ingest FILENAME` | Ingests only `.kh/raw/FILENAME`, interactively |
| `/kb-ingest --batch` | Ingests everything without stopping, for unattended runs |

For each source the command:

1. Reads `.kh/schema.md`, `CLAUDE.md` and `.kh/index.kb.md`, then the source and any images under `/.kh/assets/`.
2. Without `--batch`, shows 3–7 takeaways, the planned page changes and any contradictions, and waits for the user.
3. Writes a `type: source` page, then creates or updates `entity`, `concept` and `topic` pages, adding the source to each page's `sources` and bumping `updated`.
4. Marks contradictions as `> [!warning] Contradiction — [[Source A]] says X, [[Source B]] says Y`.
5. Adds `[[wikilinks]]` both ways and new pages to `.kh/index.kb.md`.
6. Appends `## [YYYY-MM-DD] ingest | SOURCE TITLE` to `.kh/log.md`.
7. Sets `processed: true`, moves the file to `.kh/raw/processed/`, and appends the body verbatim to `.kh/journal/YYYY-MM.md`.

It finishes by committing and recommends running `/kb-index` afterwards.

## Asking the wiki a question with `/kb-ask`
<!-- docspack: tags=query,question,answer,save answer -->

`/kb-ask <question>` answers from the wiki and cites pages as `[[Page Title]]`.

- **Fast path**: when `.kh/search.kb.json` exists, it tokenizes the question, looks each keyword up in `index`, and reads the top 5 pages by hit count.
- **Slow path**: without the index, it reads `.kh/index.kb.md` and picks pages by hand, then suggests running `/kb-index`.
- It follows `[[links]]` one hop when they look relevant.

With `--save`, or when the user accepts the offer, it files the answer:

1. Writes `.kh/wiki/<kebab-case-question>.md` with `type: question` and sections `## Question`, `## Answer`, `## Related Topics`.
2. Links the new page from each cited page and adds it under "Questions" in `.kh/index.kb.md`.
3. Appends `## [YYYY-MM-DD] query | THE QUESTION` to `.kh/log.md` and commits.

## Summarising personal data with `/kb-digest`
<!-- docspack: tags=digest,weekly review,personal data,habits,action log -->

`/kb-digest` turns the user's tracked data into a raw source, so the wiki learns about the user. It accepts no argument (since the last `digest` log entry, or the last 7 days), a range `YYYY-MM-DD..YYYY-MM-DD`, or an ISO week such as `2026-W38`.

It reads, without modifying:

| File | Taken |
|---|---|
| `*.actionlog.md` | What was done, grouped by `#tag` |
| `dump.md`, `quicknotes/` | Ideas and notes |
| `*.todos.md` | Tasks completed and added |
| `*.habit.csv` | Completion rate and streak |
| `*.data-collection.csv` | Min, max, average and trend |
| `*.consumption.csv` | Totals per category |
| `*.events.csv` | Events in the period |
| `*.readitlater.json`, `*.bookmarks.json` | New items, as leads |

It uses `git log --since=START --until=END -p` for files without dated rows, and skips secrets. It writes `.kh/raw/END-digest-LABEL.md` with `tags: [digest, personal]` and `period: START..END`, logs `## [YYYY-MM-DD] digest | START..END`, commits, and suggests `/kb-ingest`.

## Auditing and repairing the wiki with `/kb-lint`
<!-- docspack: tags=lint,audit,orphans,dead links,contradictions -->

`/kb-lint` checks the wiki and fixes what it can. Audits:

- Contradictions, including unresolved `> [!warning] Contradiction` callouts
- Stale claims superseded by a newer source
- Orphans with no inbound `[[link]]` or missing from `index.kb.md`
- Dead links and missing links
- Missing pages for entities mentioned on two or more pages
- Frontmatter without a valid `type`, `sources`, `created` or `updated`
- Index drift and data gaps

Repairs include adding backlinks, removing dead links, adding orphans to the index, creating stub pages and rewriting clearly superseded claims. Genuine contradictions are listed for the user, not resolved. It ends with 3–5 research questions and suggested source types, and appends `## [YYYY-MM-DD] lint | N issues, M repairs` to `.kh/log.md`.

## Building the search index with `/kb-index`
<!-- docspack: tags=search index,search.kb.json,inverted index -->

`/kb-index` reads every page in `.kh/wiki/`, extracts 10–20 lowercase key terms per page, and writes `.kh/search.kb.json`. It logs `## [YYYY-MM-DD] index | N pages, M terms`. A full rebuild is always safe; large wikis are processed in batches of 20.

```json
{
  "version": "1",
  "built": "YYYY-MM-DD",
  "pages": {
    "react-hooks.md": {
      "title": "React Hooks",
      "type": "concept",
      "tags": ["react", "hooks"],
      "keywords": ["usestate", "useeffect"]
    }
  },
  "index": { "react": ["react-hooks.md"], "usestate": ["react-hooks.md"] }
}
```

`pages` maps a wiki filename to metadata. `index` maps a term to the filenames that contain it. `/kb-ask` and the MCP tool `kb_search` both use this file when it exists.

## Saving a Claude Code session with `/kb-session`
<!-- docspack: tags=session summary,kb.json,multiple repos -->

`/kb-session` summarises the current Claude Code session in under 300 words and writes it to `.kh/raw/<timestamp>-<project>-session.md` through `gh api`, tagged `session`. It is meant to be installed globally; the `/knowledge` page has an "Install /kb-session" button that copies a command downloading it to `~/.claude/commands/kb-session.md`.

The target repository comes from `~/.claude/kb.json`:

```json
{ "default": "owner/kb-repo", "projects": { "my-project": "owner/other-repo" } }
```

- `/kb-session set-default owner/repo` sets `default`.
- `/kb-session set owner/repo` maps the current project (basename of `$PWD`).
- A legacy top-level `"repo"` field is read as `default`.

`/kb-agent-capture` is a separate, experimental command. It drives the `kh-capture` native window through `native automate` to capture a note, and falls back to `kaihuman capture "<text>"`.

## Raw source file format in `.kh/raw/`
<!-- docspack: tags=raw note,capture,frontmatter,inbox -->

Every capture becomes its own file `.kh/raw/<epoch-ms>-<slug>.md`. The slug is the title lowercased, with non-alphanumeric runs replaced by `-`, cut to 40 characters, or `note` when empty.

```markdown
---
title: "Spaced repetition"
url: ''
date: 2026-09-23
processed: false
tags: [general]
---

Note text...
```

Writers of this format:

- `kaihuman capture` and the TUI key `k` (`apps/cli`), with an offline spool
- The palette's `>q` (`knowledgeNote` in `packages/palette/src/knowledge.ts`)
- The browser extension's pin and clip actions (`buildRawNote` in `apps/browser-extension/src/background/kb-capture.ts`)
- The console's "Add note" (`addRawNote`) and `/quick-knowledge` page
- The MCP tool `kb_add_raw`, `/kb-session` and `/kb-digest`

Tags default to `[general]`. `/kb-ingest` later sets `processed: true` and moves the file to `.kh/raw/processed/`.

## Wiki page types and frontmatter
<!-- docspack: tags=page type,entity,concept,topic,question,source -->

Every page in `.kh/wiki/` has a `type`:

| Type | Holds |
|---|---|
| `source` | Summary of one raw source |
| `entity` | A person, organisation, product, place or project |
| `concept` | An idea, method or term |
| `topic` | An overview tying entities and concepts together |
| `question` | A filed answer from `/kb-ask` |

Frontmatter fields are `title`, `type`, `tags`, `sources` (raw filenames or page titles), `created` and `updated`. The filename is the title in kebab-case, for example `.kh/wiki/spaced-repetition.md`. The schema template suggests the body sections `## Overview`, `## Key Concepts`, `## Details` and `## Related Topics`. `.kh/index.kb.md` lists every page under `## Topics`, `## Entities`, `## Concepts`, `## Sources` or `## Questions`, as `- [[Page Title]] — one-line summary`.

## Format of the `.kh/log.md` operation log
<!-- docspack: tags=log,history,changelog,audit trail -->

`.kh/log.md` is append-only. Each operation adds one heading, followed by details such as a bullet list of pages created and updated:

```
## [YYYY-MM-DD] <op> | <title>
```

`<op>` is one of `ingest`, `query`, `lint`, `index` or `digest`. The format is the constant `KB_LOG_FORMAT` in `kb-skills.ts`. One heading per operation keeps the log greppable:

```sh
grep '^## \[' .kh/log.md | tail -5
```

The MCP server's `kb_log` tool parses these headings into `date`, `op`, `title` and `body`, newest first.

## The monthly journal in `.kh/journal/`
<!-- docspack: tags=journal,monthly log,human readable -->

`/kb-ingest` appends every ingested source to `.kh/journal/YYYY-MM.md`. The month comes from the source's `date`, or today when it has none. A new file starts with a single `# YYYY-MM` heading. Each source is appended in chronological order as a section:

```markdown
## [YYYY-MM-DD HH:MM] <source title>

<source body, verbatim>
```

The journal is the human-readable record of what came in. The wiki is the synthesis. The scaffold creates `.kh/journal/.gitkeep` so the folder exists from the start.

## How images from pinned pages are stored
<!-- docspack: tags=images,assets,pin page,clip -->

The browser extension's "Pin to Knowledge Base" saves a page as Markdown into `.kh/raw/`. Its images go to `.kh/assets/`, not next to the note, because `/kb-ingest` moves raw files into `.kh/raw/processed/` and relative links would break. Notes link images from the repository root as `/.kh/assets/...`.

Limits from `apps/browser-extension/src/background/kb-capture.ts`:

- `MAX_IMAGES = 10` per note
- `MAX_IMAGE_BYTES = 2 * 1024 * 1024`
- Types: png, jpg, gif, webp, svg, avif

An image that cannot be fetched or is too large keeps its remote URL. The popup toggle stored as `kb_download_images` turns image downloads off. Selected-text clips become their own raw notes, quoted with `>` under `Clipped from [title](url):`.

## Braindumps in `.kh/braindumps/`
<!-- docspack: tags=braindump,scratch pad,desktop palette -->

Braindumps are texts typed in the desktop palette's braindump window. Each one is a plain Markdown file without frontmatter, named after its creation time in milliseconds:

```
.kh/braindumps/<created-ms>.md
```

The name never changes, so editing the first line renames nothing. The title shown in lists is the first non-empty line without heading marks, cut to 60 characters (`braindumpTitle` in `packages/formats/src/braindumps.ts`). Paths are validated against `^\.kh\/braindumps\/(\d{1,20})\.md$`, so a page cannot name a file outside the folder.

Braindumps are deliberately not in `.kh/raw/`: ingesting is meant to be a deliberate step. The browser extension's start page lists the ten newest and can delete them. The design is described in `doc/braindump.md`.

## Configuration files kept in `.kh/`
<!-- docspack: tags=settings,config,navbar,command palette settings -->

Besides the knowledge base, the app folder holds configuration read by the apps:

| File | Purpose |
|---|---|
| `.kh/.dashboard.config.json` | Console dashboards, widget entries, theme, recent files, quick-note targets and the desktop bottom `navbar` |
| `.kh/command-palette.settings.json` | Search engines, AI assistants (`>a`) and prefixed link tools for both command palettes |
| `.kh/browser.bookmarks.json` | Bookmarks mirrored into the browser extension |
| `.kh/browser.pinnedtabs.json` | Named pinned-tab groups saved by the extension popup |
| `.kh/inbox.todos.md` | Inbox todo list used by `/quick-todo` and the board |

The bottom navbar is the `navbar` array in `.kh/.dashboard.config.json`, edited under Settings → Bottom Navbar. Its ids are `dashboard`, `files`, `board`, `shortcuts`, `wiki`, `knowledge`, `actionLog`, `graph` and `commits`; the default is `dashboard`, `files`, `board`, `shortcuts`. See the "Repo file formats" page for each file's format.

## Repositories that still use the `.lifeos/` folder
<!-- docspack: tags=legacy,migration,lifeos -->

`.lifeos/` is the old name of the app folder. Code resolves the folder like this:

- `githubFileStore.appFolder` in `packages/core` returns `.kh` if any path starts with `.kh/`, else `.lifeos` if one starts with `.lifeos/`, else `.kh`.
- `migrateAppFolder()` renames `.lifeos/` to `.kh/` in one commit when only `.lifeos/` exists. The console dashboard runs it on load, guarded by the localStorage flag `kh_migration_done:<owner/repo>`.
- The dashboard also rewrites `.lifeos/` paths inside `.dashboard.config.json` to `.kh/`.
- `apps/kb-mcp` uses `.kh` when present, else `.lifeos`.
- `/kb-digest` looks in `.kh/` or `.lifeos/`.

Braindumps and `>q` captures always write to `.kh/`, even in a repository that still has `.lifeos/`.
