# Knowledge base MCP server

`@lifosy/kb-mcp` in `apps/kb-mcp` is a stdio MCP server that gives an LLM agent such as Claude Code access to the Lifosy knowledge base in a local repository clone. It reads the `.kh/` folder (or the legacy `.lifeos/` folder) and exposes six tools for searching, reading, listing and adding raw notes. It is written in TypeScript on Node.js 22+ with `@modelcontextprotocol/sdk` and `zod`, and builds to the `lifosy-kb-mcp` bin.

## Which tools the MCP server exposes
<!-- docspack: tags=tools,kb_search,kb_read,kb_list,kb_index,kb_log,kb_add_raw -->

The server registers itself as `lifosy-kb` version `0.1.0`. Tools are registered in `createKbServer` in `apps/kb-mcp/src/server.ts`:

| Tool | Input | Result |
|---|---|---|
| `kb_search` | `query` (1–500 chars), `limit` (default 5, max 50) | Ranked pages: `file`, `title`, `type`, `tags`, `score`, `snippet` |
| `kb_read` | `page`: filename, slug or title | Full Markdown `content` plus `backlinks` |
| `kb_list` | `type` (`source`, `entity`, `concept`, `topic`, `question`), `tag`, both optional | Pages with `file`, `title`, `type`, `tags`, `updated` |
| `kb_index` | none | Text of `index.kb.md` |
| `kb_log` | `limit` (default 20, max 500) | Entries of `log.md` as `date`, `op`, `title`, `body`, newest first |
| `kb_add_raw` | `title`, `text`, `url` (optional), `tags` (optional) | The repo-relative path written |

All tools except `kb_add_raw` are read-only. Results are returned as pretty-printed JSON text, except `kb_index`, which returns the raw Markdown.

## How `kb_search` ranks wiki pages
<!-- docspack: tags=search,ranking,scoring,search.kb.json -->

`searchPages` in `apps/kb-mcp/src/search.ts` tokenizes the query into unique lowercase terms, split on anything that is not a letter or digit. Each term adds to a page's score:

| Match | Weight |
|---|---|
| Term in the page title | 5 |
| Term in a tag | 4 |
| `search.kb.json` `index` maps the term to the page | 3 |
| Term in the page's `keywords` in `search.kb.json` | 2 |
| Each body occurrence, up to 10 per term | 1 |

Pages with score 0 are dropped. Ties sort by title. The snippet is about 160 characters around the first hit. The prebuilt index `.kh/search.kb.json` comes from the `/kb-index` slash command and is optional; a missing or invalid index is ignored and full-text scoring still works. Index filenames with a `wiki/` prefix are normalised to bare filenames.

## Reading a wiki page and its backlinks with `kb_read`
<!-- docspack: tags=read page,backlinks,wikilinks,resolve -->

`kb_read` resolves `page` in two steps (`KnowledgeBase.readPage` in `apps/kb-mcp/src/repo.ts`):

1. It tries `<page>.md` (or `page` as given when it ends in `.md`) directly in `wiki/`.
2. Otherwise it matches case-insensitively against each page's title, filename without `.md`, or slug of the reference.

A reference that resolves outside `wiki/`, including through a symlink, is rejected with an error. When nothing matches, the error says `No wiki page matches "<ref>". Use kb_list or kb_search to find pages.`

Backlinks are the other pages whose body contains a `[[...]]` link to this page. Links can be `[[Target]]`, `[[Target|alias]]` or `[[Target#heading]]`, and match by title, filename or slug. The page title comes from the `title` frontmatter field, or the filename when it is missing.

## Adding a raw note from an agent with `kb_add_raw`
<!-- docspack: tags=add note,capture,raw source,write -->

`kb_add_raw` is the only tool that writes. It creates `raw/<epoch-ms>-<slug>.md` inside the knowledge base folder and creates `raw/` if needed. It never overwrites an existing file and writes nothing else.

```markdown
---
title: "My note"
url: "https://example.com"
date: 2026-09-23
processed: false
tags: [general]
---

Note text
```

- `title`: 1–200 characters; line breaks become spaces.
- `text`: up to 1,000,000 characters.
- `url`: optional, must be a valid URL.
- `tags`: up to 20; each starts with a letter or digit and may contain letters, digits, space, `_`, `.`, `/` or `-`. Default `[general]`.

The slug is the title lowercased with non-alphanumeric runs replaced by `-`, cut to 40 characters, or `note`. Run `/kb-ingest` later to compile the note into the wiki.

## Building the kb-mcp server
<!-- docspack: tags=build,install,compile,pnpm -->

Prerequisites are Node.js 22 or later and pnpm. From the monorepo root:

```sh
pnpm install
pnpm --filter @lifosy/kb-mcp build
```

The build runs `tsc -p tsconfig.build.json` and writes `apps/kb-mcp/dist/index.js`. That file is also the package's `lifosy-kb-mcp` bin, and `pnpm --filter @lifosy/kb-mcp start` runs it with `node dist/index.js`.

## Choosing which repository the server reads
<!-- docspack: tags=KB_REPO_PATH,--repo,environment variable,working directory -->

`resolveRepoPath` in `apps/kb-mcp/src/config.ts` uses the first value that is set:

1. The `--repo <path>` argument
2. The `KB_REPO_PATH` environment variable
3. The current working directory

Any other argument is an error, because argument parsing is strict. Inside the repository, the server uses `.kh/` when it exists, else the legacy `.lifeos/`, else `.kh/`, which is created on the first `kb_add_raw`.

The Lifosy CLI clones repositories to `~/.config/cli/repos/<owner>/<repo>` (Linux). When Claude Code runs inside such a clone, no path is needed.

## Adding the server to Claude Code
<!-- docspack: tags=claude mcp add,claude code,setup -->

Register the server for the current project:

```sh
claude mcp add lifosy-kb -- node /absolute/path/to/monorepo/apps/kb-mcp/dist/index.js
```

To point it at a specific clone:

```sh
claude mcp add lifosy-kb -- node /absolute/path/to/monorepo/apps/kb-mcp/dist/index.js \
  --repo ~/.config/cli/repos/<owner>/<repo>
```

After that, Claude Code can call `kb_search`, `kb_read` and the other tools directly, alongside the `/kb-*` slash commands in the repository's `.claude/commands/`.

## Configuring the server with `.mcp.json` or another MCP client
<!-- docspack: tags=mcp.json,mcpServers,cursor,other clients,config file -->

Put this in `.mcp.json` at the root of the knowledge base repository:

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

Any MCP client that launches stdio servers can use the same three settings:

- `command`: `node`
- `args`: the path to `dist/index.js`, optionally followed by `--repo <path>`
- `env`: `KB_REPO_PATH` when `--repo` is not given

## Diagnosing kb-mcp startup errors
<!-- docspack: tags=troubleshooting,stderr,exit code,errors -->

stdout carries the MCP protocol, so the server writes all diagnostics to stderr.

- On success it prints `lifosy-kb-mcp serving <kb folder>` to stderr.
- If the repository path does not exist or is not a directory, it prints `lifosy-kb-mcp: Repository path does not exist or is not a directory: <path>` and exits with code 1.
- An unknown command-line argument also exits with code 1.
- A missing `wiki/` folder returns an empty page list, not an error.
- A missing `index.kb.md` or `log.md` makes `kb_index` or `kb_log` fail with `.kh/<file> does not exist in <repo>`.

## Developing and testing kb-mcp
<!-- docspack: tags=tests,vitest,lint,source layout -->

Scripts in `apps/kb-mcp/package.json`:

```sh
pnpm --filter @lifosy/kb-mcp build        # tsc to dist/
pnpm --filter @lifosy/kb-mcp check-types  # tsc --noEmit
pnpm --filter @lifosy/kb-mcp lint         # biome check
pnpm --filter @lifosy/kb-mcp test         # vitest run
```

Source layout in `apps/kb-mcp/src/`:

| File | Role |
|---|---|
| `frontmatter.ts`, `wikilinks.ts`, `search.ts`, `log.ts` | Pure parsing and scoring logic |
| `repo.ts` | Filesystem access to the knowledge base folder (`KnowledgeBase`) |
| `server.ts` | MCP tool registration (`createKbServer`) |
| `config.ts`, `index.ts` | CLI arguments and the stdio entry point |
| `test/fixture.ts` | Shared test fixture |

Each module has a matching `*.test.ts` file.
