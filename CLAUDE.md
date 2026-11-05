# kaihuman — instructions

## Repository

pnpm + Turborepo monorepo, TypeScript strict, Biome for lint and format.
- `apps/console`: the main app ("Life OS"). Preact + `@preact/signals`, Tailwind, `@cascivo/*` components (React aliased to `preact/compat` in `vite.config.ts`).
- Other apps: `auth-worker` (Cloudflare Worker, GitHub sign-in), `share-worker` (Cloudflare Worker, encrypted share links), `kb-mcp` (MCP server for a `.kh` knowledge base), `browser-extension` (Preact), `desktop-palette` (Tauri), `cli` (Rust, cargo), `kh-capture-native`, `landing-page` and `landing-page-nextgen` (Astro).
- `packages/`: `core`, `formats`, `palette`, `ui` (Preact components + Storybook), `config` (shared tsconfig/Biome/Tailwind), `docspack` (this repo's docs as a docspack package).

## Commands

- Build: `pnpm run build` · Lint + type-check: `pnpm run check` · Test: `pnpm -r test` (CI `.github/workflows/ci.yml` runs exactly these after `pnpm install --frozen-lockfile`).
- Fix formatting: `pnpm run fix` (Biome; `cargo fmt` for `apps/cli`).

## Rules

- State assumptions; ask when a request is ambiguous. Prefer the simplest change, touch only what the task needs, and don't refactor or reformat unrelated code.
- Done means zero Biome warnings, zero type errors, and passing tests. New behaviour gets tests; bug fixes get a regression test. Never skip or delete tests.
- All `devDependencies` go in the root `package.json`; runtime `dependencies` go in the package that uses them. Add a package only when it can't reasonably be written in-repo.
- Node code is ESM only: `"type": "module"`, `.js` extensions in relative imports, `node:` imports for built-ins.
- Prefer type-level guarantees (discriminated unions, branded types) over runtime checks. Comments explain why, not what.
- Use docspack (block below) before broad searches. A `PreToolUse` hook (`scripts/docspack-nudge.mjs`) nudges toward it; follow the nudge.

## Docs to update

- `doc/progress.md`: a dated entry at the top for **every** change.
- `doc/features.md`: when a feature is added.
- `doc/documentation.md`: when CLI usage changes.
- `doc/roadmap.md`: tick `[x]` on completed items.
- `README.md`: on significant changes.

<!-- docspack:start recipe=repo -->
## Documentation for this project's dependencies

Run `npx docspack ask "<question>"` for documentation on this project's
dependencies. It answers from the installed versions.

## Finding things in this repository

Before reading files to find where something is, ask the index:

- `npx docspack recall --name repo-code "<what the code does>"` answers with the `file:line`,
  signature and doc comment of matching declarations. Then read only that range.
- `npx docspack recall --name repo-docs "<question>"` answers from this repository's Markdown.

An answer is a pointer: read the file before you edit it. If you already know a name,
`grep` is as good. If `recall` says nothing is indexed, run `npx docspack index --repo`.

## Working efficiently in this repository

Every tool call is a turn, and every turn resends the whole conversation. Use fewer, larger calls:

- Read several files, or several ranges of one file, in one shell command
  (`sed -n '40,90p' a.ts; sed -n '1,60p' b.ts`) instead of one Read per file.
- Search once, with a pattern that covers everything you are looking for.
- Make related edits together, and run the tests once the change is complete.

<!-- Written by `npx docspack agent install`. Re-run it to update this block. -->
<!-- docspack:end -->
