# Roadmap

## CLI

- [x] GitHub OAuth login
- [x] Quick notes to active repo
- [x] Select active repository
- [x] Local AI server proxy (`server` subcommand)
- [x] AI prompt piped to Claude / Copilot / Gemini CLI
- [x] File browser (with recently-used files highlighted)
- [x] Nano-like file editor (Ctrl+S save, Esc close)
- [x] Dashboard config view (`dashboard.config.json` awareness)
- [x] Git sync of active repo before file operations
- [ ] Fuzzy search / filter in file browser
- [ ] Git commit from editor (stage + commit changed file)
- [ ] Multi-repo dashboard (switch between repos without re-syncing all)
- [ ] AI chat history (persist conversations per repo)

## Knowledge base (LLM-wiki pattern)

- [x] File `/kb-ask` answers back into the wiki (`--save`)
- [x] `/kb-digest` — personal data as a raw source
- [x] Shared log format and page types in `CLAUDE.md` and the schema
- [x] Markdown page capture with images; selection clips into `.kh/raw/`
- [x] Interactive `/kb-ingest`; `/kb-lint` stale claims and research suggestions
- [x] Wiki view: wikilinks, backlinks, tags
- [x] MCP server over the knowledge base (`apps/kb-mcp`)

## Documentation

- [x] Document every app, package, file format and CLI command as a docspack package (`packages/docspack`)
- [ ] Publish `@kaihuman/docspack` to npm
- [ ] Run `docspack doctor --strict` and `docspack eval` in CI
