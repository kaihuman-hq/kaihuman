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

## Ideas (`doc/ideas.md`)

- [x] Idea file format in `@kaihuman/formats` (`.kh/ideas/<slug>.md`)
- [x] `kh-ideas` agent skill for Claude Code, Antigravity / Gemini CLI, Codex, Copilot, Cursor
- [x] CLI: `kaihuman idea`, `kaihuman ideas …`, `kaihuman skills install`, TUI screen
- [x] Hand-off blocks from chat apps (`kaihuman ideas import`, `/quick-idea`)
- [x] Console `/ideas` overview and `/quick-idea`
- [x] `kb-mcp` ideas tools for Claude Desktop
- [x] Palette `>id` and braindump "Promote to idea"
- [ ] Gemini app skill, once its format is published

## Business (`doc/business.md`)

- [x] Phase 1: formats, repo check, agent skill, set-up (`enableBusiness`) and `syncKB` wiring
- [ ] Phase 2: read-only console (enable form, `/clients`, client page, `/business` dashboard)
- [ ] Phase 3: daily forms (time, payments, drafts, issue, credit notes, offer accept/decline)
- [ ] Phase 4: share service (encrypted, revocable links)
- [ ] Phase 5: money admin (expenses, VAT summary, year export, retainers, contract reminders)
- [ ] Phase 6: e-invoice XML (XRechnung, ZUGFeRD), before 2028-01-01

## Documentation

- [x] Document every app, package, file format and CLI command as a docspack package (`packages/docspack`)
- [ ] Publish `@kaihuman/docspack` to npm
- [ ] Run `docspack doctor --strict` and `docspack eval` in CI

## Mobile (`doc/mobile.md`)

- [ ] Phase 1: `@kaihuman/core` storage adapter, widget todo snapshot engine, and `auth-worker` mobile OAuth callback
- [ ] Phase 2: `apps/mobile` (`@kaihuman/mobile`) workspace, mobile storage/widget bridges, deep-link router, and auth/repo controllers
- [ ] Phase 3: Native screens & widget tiles (Dashboard, Kanban, Quick Captures, Ideas, Wiki, KB, Action Log, Analytics, File Editor + `.enc`)
- [ ] Phase 4: iOS WidgetKit + AppIntents (`targets/ios-widget/`) and Android Jetpack Glance (`targets/android-widget/`) Todo widgets
- [ ] Phase 5: Mobile CI workflow (`.github/workflows/mobile-build.yml`) and docs
