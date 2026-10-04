# Landing pages

The kaihuman marketing site is a static Astro site styled with Tailwind CSS v4 (`@tailwindcss/vite`). Two versions live in the monorepo: `apps/landing-page-nextgen` (`@lifosy/landing-page-nextgen`) is the production site, and `apps/landing-page` (`@lifosy/landing-page`) is the older design, kept in the repo but no longer deployed. Both pages link to the app at `https://app.kaihuman.com`, the live demo at `/demo`, and the source at `github.com/lifosy/monorepo`.

## Which landing page is in production
<!-- docspack: tags=production,nextgen,old-landing-page,which -->

`apps/landing-page-nextgen` is the production landing page since 2026-06-25.

| App | Package | Status |
| --- | --- | --- |
| `apps/landing-page-nextgen` | `@lifosy/landing-page-nextgen` | Production, deployed to the Cloudflare Pages project `lifosy-landing` |
| `apps/landing-page` | `@lifosy/landing-page` | Older design, not deployed by any workflow |

Before that date a separate `deploy-landing-nextgen.yml` deployed nextgen to a preview project (`kh-landingpage-nextgen`). That workflow was removed, and `deploy-landing.yml` was switched from the old app to nextgen. `doc/progress.md` records the change under "Nextgen is the default landing page".

## What the landing page contains
<!-- docspack: tags=sections,content,copy,hero -->

The nextgen page is a single route, `src/pages/index.astro`, wrapped by `src/layouts/Layout.astro`. Its sections, top to bottom:

- **Hero:** "EVERY DAY IS AN EDIT." with the 改 (kai) mark and the CTAs **Start Improving** (`https://app.kaihuman.com`) and **View Source →**.
- **Demo:** the looping product screencast in an app-window frame, plus **▶ Try the live demo — no signup**, linking to `https://app.kaihuman.com/demo`.
- **Philosophy:** kaizen, getting 1% better every day.
- **Principles:** three cards, **Track**, **Own** and **Know**.
- **Ownership:** "YOUR DATA. YOUR RULES." — local-first, plain files, no tracking.
- **CTA:** **START IMPROVING TODAY** and the GitHub link.

The page title is "kaihuman — The ever-improving human." The default meta description is set in `Layout.astro`. The old page in `apps/landing-page` has the same screencast and demo link right below its hero.

## How the landing page is styled
<!-- docspack: tags=css,tailwind,design-tokens,fonts -->

Both apps load Tailwind through the Vite plugin in `astro.config.mjs`:

```js
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ vite: { plugins: [tailwindcss()] } });
```

- **Nextgen:** `src/styles/global.css` imports `./tokens.css` and then `tailwindcss`. `tokens.css` defines OKLCH color tokens on `:root` (`--color-paper`, `--color-ink`, `--color-accent` and others), a near-black background with a neon-green accent. Most layout is plain CSS classes such as `hero__declaration` and `demo__player`. Fonts are Tomorrow and JetBrains Mono from Google Fonts.
- **Old page:** `src/styles/global.css` imports `tailwindcss` and defines `--los-*` variables (`--los-bg`, `--los-fg`, `--los-accent`). Markup uses Tailwind utility classes. The font is JetBrains Mono.

Static files (`favicon.svg`, `favicon.ico`, the screencast) live in each app's `public/` folder.

## Running and building the landing page locally
<!-- docspack: tags=dev,build,preview,astro,localhost -->

Run `pnpm install` from the repository root first. Each app has the same Astro scripts:

| Script | Command | Result |
| --- | --- | --- |
| `dev` | `astro dev` | Dev server at `localhost:4321` |
| `build` | `astro build` | Static site in `./dist/` |
| `preview` | `astro preview` | Serves the built `dist/` |
| `astro` | `astro` | The Astro CLI, for example `pnpm astro check` |

From the root:

```sh
pnpm --filter @lifosy/landing-page-nextgen dev
pnpm landing-nextgen:build     # turbo run build --filter=@lifosy/landing-page-nextgen
pnpm dev:landing               # old page: turbo run dev --filter=@lifosy/landing-page
pnpm landing:build             # old page build
```

## How the landing page is deployed
<!-- docspack: tags=deploy,cloudflare-pages,ci,github-actions,lifosy-landing -->

`.github/workflows/deploy-landing.yml` (named `[PROD] Deploy Landing Page`) deploys the nextgen app. It runs on a push to `main` that touches `apps/landing-page-nextgen/**`, or manually via `workflow_dispatch`.

It calls the reusable `template-deploy-to-cloudflare.yaml` with these inputs:

| Input | Value |
| --- | --- |
| `buildTarget` | `landing-nextgen:build` |
| `rootDir` | `./apps/landing-page-nextgen` |
| `distDir` | `./dist` |
| `cfPagesName` | `lifosy-landing` |
| `branchName` | `main` |
| `commitGeneratedFile` | `false` |

The template installs with pnpm on Node 22, runs `pnpm run build` and `pnpm run landing-nextgen:build`, then runs `wrangler pages deploy ./dist --project-name=lifosy-landing --branch=main`. It needs the secrets `CF_ACCOUNT_ID` and `CF_API_TOKEN`. A change to `apps/landing-page` triggers no deploy.

## Regenerating the product screencast
<!-- docspack: tags=screencast,video,playwright,ffmpeg,record-screencast,demo-video -->

The hero video is recorded automatically from the console's demo mode by `apps/landing-page-nextgen/scripts/record-screencast.mjs`.

```sh
pnpm --filter @lifosy/landing-page-nextgen screencast
```

What it needs:

- The console dev server on `http://localhost:4300`. If none is running, the script starts `pnpm --filter @lifosy/app-console dev` and stops it afterwards. That needs `pnpm install` and one `pnpm --filter @lifosy/ui build`.
- Chromium for Playwright: `pnpm exec playwright install chromium`.
- ffmpeg. The script looks for `FFMPEG_PATH`, then Playwright's bundled ffmpeg, then `ffmpeg` on `PATH`. Without it the raw clip ships untrimmed and the loop is not seamless.

What it writes, to both `apps/landing-page-nextgen/public/` and `apps/landing-page/public/`:

- `screencast.webm` — VP8 WebM, 1440×900, about 51 s.
- `screencast-poster.jpg` — the first-frame poster.

Commit both files. A commit under `apps/landing-page-nextgen/` triggers the production deploy.

### What the screencast shows and how the loop works

The script opens `/demo`, which seeds the in-memory demo data. It then walks a fixed storyline: Overview dashboard, the Finance and Reading workspaces, back to Overview, `/board` (kanban), `/analytics`, `/action-log`, `/wiki`, then the files browser and Markdown editor at `/`, and back to Overview.

- A full page reload wipes the demo session, so every later route change uses `history.pushState` plus a `popstate` event, which preact-router listens to.
- Recorded video has no mouse pointer, so the script injects a synthetic cursor that glides and pulses on clicks.
- The clip starts and ends on the same Overview frame with the cursor centred. ffmpeg trims the leading `/demo` load, so the wrap from last frame to first is invisible.
