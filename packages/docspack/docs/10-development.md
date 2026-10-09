# Developing in the monorepo

The kaihuman code lives in one Turborepo monorepo with pnpm workspaces (`apps/*` and `packages/*`, from `pnpm-workspace.yaml`). TypeScript apps use Vite, Biome for lint and format, and Vitest for tests; the CLI and the desktop palette backend are Rust. This page covers the prerequisites, the root commands, per-app commands, CI deployment to Cloudflare Pages, versioning, documentation conventions and how the `@kaihuman/docspack` documentation package is built.

## Prerequisites and the pnpm 12.4.1 install gotcha
<!-- docspack: tags=setup,install,pnpm,corepack,ERR_PNPM_IGNORED_BUILDS -->

You need these tools before the first install:

- Node.js LTS. The root `package.json` declares `"engines": { "node": ">=18" }`; CI uses Node 22, and `apps/kb-mcp` needs Node 22 or later.
- pnpm **12.4.1**, the version pinned in `"packageManager": "pnpm@12.4.1"`.
- Rust (stable via rustup) for `apps/cli` and `apps/desktop-palette`.
- `git` on `$PATH`; the CLI uses it for repo sync.

Install pnpm 12.4.1 yourself before `pnpm install`:

```sh
corepack enable            # fetches the pinned binary
# or
npm install -g pnpm@12.4.1
```

Do not let an older pnpm provision 12.4.1. Its bootstrap runs `pnpm add pnpm@12.4.1 --allow-build=@pnpm/exe`. The `preinstall`/`postinstall` scripts belong to the `pnpm` package, not `@pnpm/exe`, so a pnpm that enforces build approval refuses them and the install fails with `ERR_PNPM_IGNORED_BUILDS`.

## Installing dependencies and pnpm workspace settings
<!-- docspack: tags=pnpm-install,allowBuilds,minimumReleaseAge -->

Run `pnpm install` once from the repository root. It installs every workspace package.

`pnpm-workspace.yaml` holds two pnpm settings that affect installs:

- `allowBuilds` lists the dependencies allowed to run build scripts: `@biomejs/biome`, `esbuild` and `sharp`. pnpm 11+ replaced `onlyBuiltDependencies` with this yes/no list. A new dependency with a build script must be added here before its script runs.
- `minimumReleaseAgeExclude` pins exact `@cascivo/*` versions published inside pnpm's 24-hour `minimumReleaseAge` window. Without the exclusion, a cold-cache install fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. The pins can go once those versions are older than the cutoff.

All `devDependencies` belong in the root `package.json` (`@biomejs/biome`, `typescript`, `vitest`, `vite`, `turbo`, `playwright`, `jsdom`, `fake-indexeddb`, `docspack`). Runtime `dependencies` go in each app or package.

## Root scripts: build, lint, check-types, verify
<!-- docspack: tags=turbo,commands,scripts,ci-checks -->

The root `package.json` scripts call Turborepo tasks defined in `turbo.json`.

| Command | Runs |
| --- | --- |
| `pnpm build` | `turbo run build` (every package's `build`; depends on `^build`) |
| `pnpm lint` | `turbo run lint` |
| `pnpm format` | `turbo run format` |
| `pnpm check-types` | `turbo run check-types` |
| `pnpm check` | `turbo run lint check-types` |
| `pnpm fix` | `turbo run fix` |
| `pnpm verify` | `fix`, then `build`, `lint`, `format`, `check-types` |
| `pnpm dev` | `turbo run dev` (all dev servers) |
| `pnpm dev:console` | `turbo run dev watch` for `@kaihuman/app-console` and `@kaihuman/ui` |
| `pnpm console:build` | `turbo run build:prod --filter=@kaihuman/app-console` |
| `pnpm landing-nextgen:build` | `turbo run build --filter=@kaihuman/landing-page-nextgen` |

`turbo.json` caches `build` outputs (`dist/**`, `.next/**`, `target/release/**`). `dev` and `watch` are persistent and uncached. `turbo.json` defines no `test` task and no `check` task. So `pnpm turbo test` and `pnpm turbo check` fail with "Could not find task". Use `pnpm check` for lint and types, and `pnpm -r test` (or `pnpm --filter <package> test`) for tests.

`pnpm build` also runs `cargo build --release` in `apps/cli`, so a full build needs Rust.

## Running tests with Vitest and cargo
<!-- docspack: tags=testing,vitest,cargo-test,jsdom -->

Tests run per package with `pnpm --filter <name> test`.

| Package | `test` script | Notes |
| --- | --- | --- |
| `@kaihuman/app-console` | `vitest run` | `jsdom`, setup in `vitest.setup.ts`; spike tests only under `vitest.spike.config.ts` |
| `browser-extension` | `vitest run` | `jsdom` |
| `@kaihuman/palette` | `vitest run` | `jsdom` |
| `@kaihuman/formats` | `vitest run` | |
| `@kaihuman/kb-mcp` | `vitest run` | |
| `@kaihuman/cli` | `cargo test` | Rust |
| `desktop-palette` | `test:desktop` | `vite build && cargo test --manifest-path src-tauri/Cargo.toml` |
| `@kaihuman/docspack` | `docspack eval` | retrieval hit rate, see below |

Example:

```sh
pnpm --filter @kaihuman/formats test
pnpm --filter @kaihuman/app-console test
cd apps/cli && cargo test
```

`fake-indexeddb` in the root devDependencies stands in for IndexedDB in console and core tests.

## Biome lint and format configuration
<!-- docspack: tags=biome,linting,formatting,style -->

Biome is the linter and formatter for all TypeScript packages. The root `biome.json` extends `packages/config/biome.json` and uses the git ignore file.

Settings in `packages/config/biome.json`:

- 2-space indent, line width 100, single quotes in JavaScript.
- Recommended lint rules, with `suspicious.noExplicitAny` turned off.
- `organizeImports` on.

Each package exposes the same three scripts:

```sh
pnpm --filter @kaihuman/core lint     # biome check .
pnpm --filter @kaihuman/core format   # biome check --write .
pnpm --filter @kaihuman/core fix      # biome check --write --unsafe .
```

`@kaihuman/ui` limits Biome to `src/`, `vite.config.ts` and `.storybook/`. The Rust app `apps/cli` maps `lint` to `cargo fmt --check && cargo clippy` and `format`/`fix` to `cargo fmt`.

## Running each app in development
<!-- docspack: tags=dev-server,localhost,ports,per-app -->

| App | Command | Result |
| --- | --- | --- |
| Web console | `pnpm --filter @kaihuman/app-console dev` | Vite on `http://localhost:4300` |
| Browser extension | `cd apps/browser-extension && pnpm dev` | then **Load unpacked** `apps/browser-extension/dist` in `chrome://extensions` |
| Terminal CLI | `cd apps/cli && cargo run` | TUI; `cargo run -- capture "…"`, `cargo run -- server` |
| Desktop palette | `cd apps/desktop-palette && pnpm run build:desktop` | UI and both Rust binaries (`kaihuman-palette`, `kaihuman-palette-toggle`) |
| kb-mcp | `pnpm --filter @kaihuman/kb-mcp build` then `start` | `node dist/index.js` |
| Landing page | `pnpm --filter @kaihuman/landing-page-nextgen dev` | Astro on `localhost:4321` |
| Storybook | `pnpm --filter @kaihuman/ui storybook` | port `6006` |

The console imports `@kaihuman/ui` from its build, so run `pnpm --filter @kaihuman/ui build` once, or use `pnpm dev:console` to watch both. The console dev server runs on port `4300` (`server.port` in `apps/console/vite.config.ts`).

## Rust toolchain for the CLI and desktop palette
<!-- docspack: tags=rust,cargo,rustfmt,clippy,rust-toolchain -->

`apps/cli/rust-toolchain.toml` and `apps/desktop-palette/src-tauri/rust-toolchain.toml` both pin the toolchain:

```toml
[toolchain]
channel = "1.94.1"
components = ["rustfmt", "clippy"]
```

The pin keeps `cargo fmt` output reproducible, because rustfmt output changes between releases. rustup installs the pinned version on first use.

The desktop palette also needs system libraries for Tauri and layer-shell. On Fedora:

```sh
sudo dnf install webkit2gtk4.1-devel gtk3-devel gtk-layer-shell-devel libsoup3-devel \
  librsvg2-devel openssl-devel dbus-devel
sudo dnf group install c-development
```

`pnpm run build` in `apps/desktop-palette` builds only the UI; that is what the monorepo build runs. `build:desktop` builds the Rust binaries too.

## Building the experimental Zig capture app
<!-- docspack: tags=zig,native-sdk,kh-capture-native -->

`apps/kh-capture-native` is an experimental quick-capture window built with native-sdk, which has a Zig core. It has no `package.json`, so it is not part of the pnpm workspace or the Turborepo build.

Its README says the code was written from the native-sdk docs and has not been compiled yet. Symbols to check are marked `VERIFY(api)`. To build it you need the native CLI:

```sh
npm install -g @native-sdk/cli
cd apps/kh-capture-native
native dev      # hot-reloading dev window
native build    # release binary -> zig-out/bin/kh-capture
native check    # typecheck + validate .native / app.zon
```

## CI workflows and Cloudflare Pages deployment
<!-- docspack: tags=github-actions,ci,deploy,cloudflare,wrangler -->

`.github/workflows/` has three workflows. Both deploy workflows call the reusable `template-deploy-to-cloudflare.yaml`.

| Workflow | Name | Trigger | Builds | Cloudflare Pages project |
| --- | --- | --- | --- | --- |
| `deploy-magic-life-os.yaml` | `[PROD] Deploy Life OS` | push to `main` touching `apps/console/**`, or manual | `pnpm run console:build` | `kaihuman-console` |
| `deploy-landing.yml` | `[PROD] Deploy Landing Page` | push to `main` touching `apps/landing-page-nextgen/**`, or manual | `pnpm run landing-nextgen:build` | `kaihuman-landing` |
| `template-deploy-to-cloudflare.yaml` | `Deploy To CloudFlare` | `workflow_call` only | — | input `cfPagesName` |

The template runs on `ubuntu-latest` with Node 22 and pnpm (`pnpm/action-setup@v4`). Steps: `pnpm install`, `pnpm run build`, `pnpm run <buildTarget>`, an optional commit of generated files, then `wrangler pages deploy <distDir> --project-name=<cfPagesName> --branch=main`. It needs the repository secrets `CF_ACCOUNT_ID` and `CF_API_TOKEN`.

The console workflow sets `commitGeneratedFile: true`. It commits `apps/console/src/version.ts` and `apps/console/version.json` back to `main` as `github-actions[bot]` with `[skip ci]`. That is why it needs `contents: write`.

No workflow runs tests or lint on pull requests.

## How the console version number is bumped
<!-- docspack: tags=version,versioning,version.json,release -->

The console version lives in `apps/console/version.json` as `{ "major", "minor", "patch" }`. The app shows it in the status bar after login.

- `scripts/generate-version.js` writes `src/version.ts` with the version, an ISO build timestamp and the short git hash. `dev`, `prod` and `build` run it first.
- `scripts/bump-version.js [patch|minor|major]` increments `version.json` (default `patch`) and then regenerates `src/version.ts`.
- `build:prod` runs the bump, then `vite build --mode prod`. Every production deploy therefore bumps the patch version, and CI commits the result.

```sh
pnpm --filter @kaihuman/app-console version:bump        # patch
pnpm --filter @kaihuman/app-console version:bump:minor
pnpm --filter @kaihuman/app-console version:bump:major
```

`apps/console/VERSION.md` describes the system. Production builds read `.env.prod`, which sets `VITE_GH_LOGIN`.

## Documentation conventions: progress, features, roadmap
<!-- docspack: tags=changelog,docs,doc-folder,claude-md -->

Project documentation lives in `doc/` at the repository root. `CLAUDE.md` sets the update rules.

| File | Purpose | When to update |
| --- | --- | --- |
| `README.md` | Intro, prerequisites, quick start | On significant changes |
| `doc/progress.md` | Changelog, newest entry first | Every change |
| `doc/features.md` | Feature tables per app with an "Added" date | When a feature is added |
| `doc/documentation.md` | Detailed CLI usage | When CLI features change |
| `doc/roadmap.md` | Checklist of planned work | Mark done items `[x]` |

A `doc/progress.md` entry has the heading `## YYYY-MM-DD — <title>`, bullets describing the change, and a closing `Checks:` line listing what was run (Biome, `tsc`, Vitest counts, `cargo test`, clippy). Format specs also live in `doc/`: `doc/commands-format.md`, `doc/prompts-format.md`, `doc/braindump.md`, `doc/native-command-palette.md`. App READMEs (`apps/*/README.md`) hold the per-app user documentation.

## Building and checking the docspack documentation package
<!-- docspack: tags=docspack,docs-package,llms,eval -->

`packages/docspack` publishes this documentation as `@kaihuman/docspack`, an npm package that AI agents query offline. Sources are the Markdown files in `packages/docspack/docs/`; `packages/docspack/cmdspec.yaml` describes the `cli` binary, one chunk per command. `package.json` sets `"docspack": { "from": "./docs", "cmdspec": "./cmdspec.yaml" }`.

```sh
pnpm --filter @kaihuman/docspack build   # docspack build -> .llms/ and llms.txt
pnpm --filter @kaihuman/docspack lint    # docspack build && docspack doctor --strict
pnpm --filter @kaihuman/docspack test    # docspack build && docspack eval ./eval/queries.json --min-hit-rate 90
```

- `build` writes the `.llms/` payload and `llms.txt`; both are git-ignored and published via `files`.
- `doctor --strict` checks the package as the indexer would and treats warnings as failures. It is the package's `lint` script, so root `pnpm lint` runs it.
- `eval` runs the questions in `eval/queries.json` and fails below a 90% hit rate.
- `prepublishOnly` runs build and doctor before `npm publish`.
- `docspack preview "<question>"` in `packages/docspack` shows which chunks answer a question.

Each doc file has one `#` title and `##` sections phrased as questions. A chunk id is `slug(H1)-slug(H2)`.

## Using the kaihuman docs from another project
<!-- docspack: tags=docspack-ask,agents,consumer,sync -->

A project that wants an AI agent to answer kaihuman questions installs the docs package and indexes it locally:

```sh
pnpm add -D docspack @kaihuman/docspack
npx docspack sync                         # index installed docs packages, no network
npx docspack ask "how do I sign in with GitHub"
```

- `docspack sync` reads `node_modules` and indexes every `@vendor/docspack` package into a local SQLite FTS5 store. `--force` re-indexes.
- `docspack ask` answers from that index. `--package kaihuman` limits it to this package, `--limit` sets the number of chunks (default 3).
- One line in the consumer's `CLAUDE.md` or `AGENTS.md` is enough: "Run `docspack ask "<question>"` for documentation on this project's dependencies."
