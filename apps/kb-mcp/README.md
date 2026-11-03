# @kaihuman/kb-mcp

A stdio [MCP](https://modelcontextprotocol.io) server. It gives an LLM agent (for example Claude Code or Claude Desktop) access to the kaihuman knowledge base and the ideas in a local repository clone.

The server reads the `.kh/` folder in the repository. If `.kh/` does not exist, it uses the legacy `.lifeos/` folder.

```
.kh/
  raw/*.md            unprocessed sources (processed: false)
  raw/processed/*.md  ingested sources
  wiki/*.md           compiled wiki pages, cross-linked with [[Page Title]] or [[slug]]
  index.kb.md         catalog
  log.md              append-only log: ## [YYYY-MM-DD] <op> | <title>
  search.kb.json      optional inverted index (built by /kb-index)
  ideas/<slug>.md     one file per product or feature idea (doc/ideas.md)
```

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `kb_search` | `query`, `limit` (default 5, max 50) | Ranked wiki pages: `file`, `title`, `type`, `tags`, `score`, `snippet`. Uses `search.kb.json` when it exists, plus full-text scoring. Title and tag hits have a higher weight than body hits. |
| `kb_read` | `page`: filename, slug or title (case-insensitive) | Full markdown of the page and its `backlinks` (the pages that link to it with `[[...]]`). A reference that resolves outside `wiki/` is rejected. |
| `kb_list` | `type` (`source`, `entity`, `concept`, `topic`, `question`), `tag` (both optional) | Wiki pages with `title`, `type`, `tags`, `updated`. |
| `kb_index` | none | Content of `index.kb.md`. |
| `kb_log` | `limit` (default 20) | Entries of `log.md` (`date`, `op`, `title`, `body`), newest first. |
| `kb_add_raw` | `title`, `text`, `url` (optional), `tags` (optional, default `[general]`) | Writes `raw/<epoch-ms>-<slug>.md` with `processed: false` and returns its repo-relative path. It does not write other files. Run `/kb-ingest` later to process the note. |

### Ideas tools

The idea files use the format of `@kaihuman/formats` (`packages/formats/src/ideas.ts`) and the rules of the `kh-ideas` skill: one log entry per meaningful step, the summary is the only part that is rewritten, and the log, challenges and braindump are never rewritten. `author` is the agent's short lowercase name (`claude`, `gemini`, …); the user is `human`. A slug is 2–40 characters of `a-z`, `0-9` and `-`.

| Tool | Input | Result |
| --- | --- | --- |
| `ideas_list` | `status`, `product`, `includeClosed` (default `false`) | Ideas, most recently active first: `slug`, `title`, `status`, `product`, `tags`, `updated`, `activity` (`level`, `recent`, `total`), `openChallenges`, `lastLog`. Closed ideas (`shipped`, `parked`, `dropped`) are left out unless `includeClosed` is set or `status` asks for them. |
| `ideas_find` | `query` | At most 10 ideas that match the words in the slug, title, product or tags, best first. |
| `ideas_read` | `slug` | The file text (`content`) and the parsed fields: `title`, `status`, `summary`, `log`, `challenges`, `braindump`, `activity`, … |
| `ideas_create` | `title`, `slug` (optional, default from the title), `product`, `tags`, `summary`, `braindump` (optional), `author` | Writes a new idea with status `seed` and a first log entry. Fails if the slug exists. |
| `ideas_append` | `slug`, `kind` (`log`, `challenge`, `braindump`), `text`, `author` | Adds a log entry at the top of the log, an open challenge, or text at the end of the braindump. |
| `ideas_set_summary` | `slug`, `summary` | Replaces the summary under the title. |
| `ideas_set_status` | `slug`, `status`, `reason` (optional), `author` | Changes the status and logs `Status <old> → <new>. <reason>`. |
| `ideas_import` | `text`, `author` | Applies every ` ```kh-idea ` hand-off block in the text. If one block fails, no file is written. |

Each ideas write returns the written path(s) and a `git` line that says if the change was committed and pushed (see [Git sync](#git-sync)). The server runs ideas and business writes one at a time, so concurrent calls cannot overwrite each other.

### Business tools

These tools read the business data in `.kh/business/` (see `doc/business.md`). They always use `.kh/business`, even when the knowledge base uses the legacy `.lifeos/` folder. Amounts are minor units (cents). Status, VAT and validation come from `@kaihuman/formats`, not from the server. `client` is the client's slug or name (case-insensitive). `today` (`YYYY-MM-DD`) is optional and defaults to the current date. The tools skip symlinks in `.kh/business`.

| Tool | Input | Result |
| --- | --- | --- |
| `business_clients` | `stage`, `today` (both optional) | Clients with `slug`, `name`, `stage`, `tags`, currency, open invoice amount, overdue invoice count and unbilled minutes. |
| `business_client` | `client`, `today` | One client: record, projects, contracts with dates, drafts in full, offers and invoices with derived status, payments, unbilled time, minutes per month, expenses, and the notes, todos and log files as text. |
| `business_open_invoices` | `client` (optional), `today` | Invoices with an open amount (overdue first) and the totals of open and overdue amounts. |
| `business_vat_summary` | `period`: `YYYY`, `YYYY-MM` or `YYYY-Qn` | Output VAT by rate, input VAT, reverse-charge base and the amount payable. It is not a tax filing. |
| `business_reminders` | `today`, `retainerDays` (default 14), `contractDays` (default 60) | Retainers due (overdue included, with `hasDraft`) and contract renewal, notice and end dates. |
| `business_check` | none | Findings of the repository check. It works without a profile and does not check the frozen-file rule (issued documents never change), which needs git history. |
| `business_create_draft` | `kind` (offer, invoice, credit note), `client`, `lines`, and optional fields such as `project`, `service_period`, `valid_until`, `corrects` | Saves a new draft under `drafts/` with a new id. |
| `business_update_draft` | `id` and the same fields | Replaces an existing draft completely. Read it first with `business_client`. An issued draft is refused. |
| `business_add_time` | `client`, `minutes`, `note`, `project`, `date` (optional) | Adds a time entry. |
| `business_add_todo` | `client`, `text` | Adds an open todo to the client's todo file. |
| `business_add_log` | `client`, `text` | Adds a dated entry to the client's action log. |
| `business_add_expense` | `date`, `supplier`, `description`, `category`, `net`, `vat`, `gross`, `vat_rate`, `client`, `project` | Records a new expense without a receipt file. |

The write tools return `{ paths, id?, git }` (`id` is set when a draft, time entry or expense is created). The server only writes drafts, time entries, todos and log lines, and expenses without receipts. It never issues or numbers a document, and it never deletes a file or changes issued documents, payments, links, events, clients, projects, contracts or the profile. A write to any other path is refused. The user issues drafts in the console.

All tools except `kb_add_raw`, the ideas writes and the business writes (`business_create_draft`, `business_update_draft`, `business_add_time`, `business_add_todo`, `business_add_log`, `business_add_expense`) are read-only.

## Setup

Prerequisites: Node.js 22 or later, pnpm.

```sh
pnpm install
pnpm --filter @kaihuman/kb-mcp build
```

The build writes `apps/kb-mcp/dist/index.js`. This file is also the `kaihuman-kb-mcp` bin. `@kaihuman/formats` ships TypeScript source, so the build (`vite build` in SSR mode) bundles it into `dist/index.js`; `@modelcontextprotocol/sdk` and `zod` stay external.

### Repository selection

The server uses the first value that is set:

1. `--repo <path>` argument
2. `KB_REPO_PATH` environment variable
3. the current working directory

The kaihuman CLI clones repositories to `~/.config/cli/repos/<owner>/<repo>` (Linux). When Claude Code runs inside such a clone, you do not need to set a path.

### Git sync

Clients without a shell (Claude Desktop) cannot commit. Start the server with `--git` (or set `KB_GIT=1`) to let it do that for ideas and business writes:

- Before an ideas or business write runs, the server runs `git pull --ff-only`, at most once every 60 seconds. If the pull fails, the tool still runs on the local clone.
- After each ideas write, it commits only the written file(s) with the message `kaihuman: idea <slug> — <op>`, then runs `git push`. A business write is committed the same way with a message that starts with `business: `. Other staged changes stay out of the commit.
- If the push fails, the tool still succeeds. Its `git` line says that the change is committed locally but not pushed, with git's error.

Without `--git`, the `git` line says that the file was written but not committed. Git runs without a shell and never prompts for credentials, so the clone needs credentials that work without a prompt (the CLI's clones have them).

### Claude Code

Add the server to the current project:

```sh
claude mcp add kaihuman-kb -- node /absolute/path/to/monorepo/apps/kb-mcp/dist/index.js
```

To use a specific repository:

```sh
claude mcp add kaihuman-kb -- node /absolute/path/to/monorepo/apps/kb-mcp/dist/index.js \
  --repo ~/.config/cli/repos/<owner>/<repo>
```

### Claude Desktop

Add the server to `claude_desktop_config.json` (Settings → Developer → Edit Config). Point `--repo` at the CLI's clone and turn on git sync, so ideas written from a chat are committed and pushed:

```json
{
  "mcpServers": {
    "kaihuman-kb": {
      "command": "node",
      "args": [
        "/absolute/path/to/monorepo/apps/kb-mcp/dist/index.js",
        "--repo",
        "/home/<you>/.config/cli/repos/<owner>/<repo>",
        "--git"
      ]
    }
  }
}
```

Claude Desktop does not expand `~`, so give the absolute path.

### `.mcp.json`

Alternatively, put this in `.mcp.json` at the root of the knowledge-base repository:

```json
{
  "mcpServers": {
    "kaihuman-kb": {
      "command": "node",
      "args": ["/absolute/path/to/monorepo/apps/kb-mcp/dist/index.js"],
      "env": { "KB_REPO_PATH": "." }
    }
  }
}
```

The server writes diagnostics to stderr, because stdout carries the MCP protocol. If the repository path does not exist, the server stops with exit code 1.

## Development

```sh
pnpm --filter @kaihuman/kb-mcp build        # vite to dist/
pnpm --filter @kaihuman/kb-mcp check-types  # tsc --noEmit
pnpm --filter @kaihuman/kb-mcp lint         # biome check
pnpm --filter @kaihuman/kb-mcp test         # vitest run
```

Source layout (`src/`):

- `frontmatter.ts`, `wikilinks.ts`, `search.ts`, `log.ts`: pure parsing and scoring logic
- `repo.ts`: filesystem access to the knowledge-base folder (`KnowledgeBase`)
- `ideas.ts`: the idea files in `<kb>/ideas/` (`IdeaFiles`); the format itself comes from `@kaihuman/formats`
- `git.ts`: opt-in pull, commit and push (`GitSync`)
- `server.ts`: MCP tool registration (`createKbServer`)
- `config.ts`, `index.ts`: CLI arguments and the stdio entry point
