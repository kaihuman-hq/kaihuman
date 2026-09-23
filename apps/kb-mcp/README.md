# @lifosy/kb-mcp

A stdio [MCP](https://modelcontextprotocol.io) server. It gives an LLM agent (for example Claude Code) access to the Lifosy knowledge base in a local repository clone.

The server reads the `.kh/` folder in the repository. If `.kh/` does not exist, it uses the legacy `.lifeos/` folder.

```
.kh/
  raw/*.md            unprocessed sources (processed: false)
  raw/processed/*.md  ingested sources
  wiki/*.md           compiled wiki pages, cross-linked with [[Page Title]] or [[slug]]
  index.kb.md         catalog
  log.md              append-only log: ## [YYYY-MM-DD] <op> | <title>
  search.kb.json      optional inverted index (built by /kb-index)
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

All tools except `kb_add_raw` are read-only.

## Setup

Prerequisites: Node.js 22 or later, pnpm.

```sh
pnpm install
pnpm --filter @lifosy/kb-mcp build
```

The build writes `apps/kb-mcp/dist/index.js`. This file is also the `lifosy-kb-mcp` bin.

### Repository selection

The server uses the first value that is set:

1. `--repo <path>` argument
2. `KB_REPO_PATH` environment variable
3. the current working directory

The Lifosy CLI clones repositories to `~/.config/com/lifosy/cli/repos/<owner>/<repo>`. When Claude Code runs inside such a clone, you do not need to set a path.

### Claude Code

Add the server to the current project:

```sh
claude mcp add lifosy-kb -- node /absolute/path/to/monorepo/apps/kb-mcp/dist/index.js
```

To use a specific repository:

```sh
claude mcp add lifosy-kb -- node /absolute/path/to/monorepo/apps/kb-mcp/dist/index.js \
  --repo ~/.config/com/lifosy/cli/repos/<owner>/<repo>
```

Alternatively, put this in `.mcp.json` at the root of the knowledge-base repository:

```json
{
  "mcpServers": {
    "lifosy-kb": {
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
pnpm --filter @lifosy/kb-mcp build        # tsc to dist/
pnpm --filter @lifosy/kb-mcp check-types  # tsc --noEmit
pnpm --filter @lifosy/kb-mcp lint         # biome check
pnpm --filter @lifosy/kb-mcp test         # vitest run
```

Source layout (`src/`):

- `frontmatter.ts`, `wikilinks.ts`, `search.ts`, `log.ts`: pure parsing and scoring logic
- `repo.ts`: filesystem access to the knowledge-base folder (`KnowledgeBase`)
- `server.ts`: MCP tool registration (`createKbServer`)
- `config.ts`, `index.ts`: CLI arguments and the stdio entry point
