# Progress

## 2026-07-18 — Experiment: native-sdk capture app (`apps/kh-capture-native`)

Stage 2, running in parallel with the shipped `cli capture` + wofi overlay — a
place to evaluate [native-sdk](https://native-sdk.dev) (Zig core).

- **Thin GUI over the tested CLI**: a native-sdk window (`src/app.native` markup +
  `src/main.zig` Zig core) that, on submit, spawns `cli capture <text>` via the
  `spawn` effect. The Rust CLI keeps ownership of auth + offline spool + retry, so
  the app inherits offline-safety and duplicates no push logic. Manifest in
  `app.zon`; always-on-top/float/center delegated to Hyprland window rules.
- **Honest status**: doc-derived, **not compiled** against a live toolchain (no
  Zig/native CLI in the environment). Uncertain symbol names are flagged inline
  with `VERIFY(api)` and tabulated in the app README with a one-command way to
  reconcile against `native init --template zig-core`.
- No workspace impact: Zig-core app has no `package.json`, so pnpm/turbo ignore
  it. Documented upgrade path: drop the CLI dependency by calling the GitHub API
  via `fx.fetch` + reading `auth.json` via `fx.readFile`; the automation server is
  the reason to prefer native-sdk over Tauri if it graduates.

## 2026-07-18 — Desktop quick-capture: `cli capture` + Hyprland overlay (offline-safe)

Stage 1 of OS-level capture on Linux/Hyprland — reuses the CLI's auth + push
instead of a new app (on Wayland the compositor owns the hotkey, so a native
framework wouldn't have helped the hard part anyway).

- **`cli capture` subcommand** (`apps/cli/src/capture.rs`, wired in `main.rs`):
  resolves text from args → piped stdin → `$EDITOR`. **Spools every capture to a
  local file _before_ pushing**, so an offline/failed push never loses a thought;
  the next capture flushes the whole spool to `.kh/raw/`, oldest first, with
  retry + backoff.
- **github.rs refactor**: extracted `build_kb_note(text) -> (filename, content)`
  (freezes capture-time timestamp/date so offline captures keep their real time)
  and a generic `put_file`; `create_kb_note` now composes them (TUI `k` behaviour
  unchanged).
- **Overlay** (`apps/cli/scripts/`): `kh-capture` (wofi → fuzzel → zenity, returns
  typed text and pipes to `cli capture`), `hyprland-kh-capture.conf` (`Super+K`
  bind + optional floating-terminal multi-line variant with window rules), and a
  `README.md` setup guide.
- Docs: README (subcommands, desktop-capture section, spool dir), documentation.md
  (`cli capture` usage), Cheatsheet Quick-Capture tab.

## 2026-07-18 — Knowledge base: capture-everywhere + journal-as-derived-artifact + cheatsheet

Reworked the knowledge base around low-friction capture and an auditable,
re-buildable wiki. Concept summary in the "How it works" section of the
Cheatsheet page (`/cheatsheet`).

- **Pipeline (KB skills → v2.0.0, `apps/console/src/lib/kb-skills.ts`)**:
  - `/kb-ingest` now appends every capture **verbatim** to a monthly journal
    `.kh/journal/YYYY-MM.md` (single `# YYYY-MM` heading, one
    `## [YYYY-MM-DD HH:MM] Title` section per capture) in addition to compiling
    the deduplicated wiki. The journal is the human-readable log; the wiki is the
    synthesized view.
  - **Raw captures are immutable**; ingestion only flips `processed` and copies
    the body into the journal — a bad compile is recoverable from git.
  - **Provenance**: every wiki page carries a `## Sources` section linking claims
    back to their journal entry / raw file. `/kb-lint` now flags missing sources
    and topic drift (near-duplicate pages).
  - **Canonical Topics** list in `schema.md` steers ingest toward merging rather
    than fragmenting. Schema frontmatter is OKF-aligned (`type` field on captures
    and wiki pages). Added `.kh/journal/.gitkeep` to the scaffold; refreshed
    `CLAUDE.md` template and documented running ingest/index on a routine.
- **Capture everywhere** (all write to `.kh/raw/` with `type` frontmatter):
  - CLI: new `k` — "New knowledge note" menu item + `create_kb_note`
    (`apps/cli/src/github.rs`, `app.rs`) writing an OKF-aligned file to
    `.kh/raw/`, zero required structure.
  - Console: `/quick-knowledge` page (`QuickKnowledgePage.tsx`) + PWA manifest +
    home-screen shortcut (QUICK_ROUTES, vite `shortcuts`). Free-text only; the
    first line becomes the title.
  - Extension `PIN_ARTICLE` and console `addRawNote` now stamp `type:`
    (`article` / `note`); `/kb-session` stamps `type: session`.
- **Cheatsheet page** (`CheatsheetPage.tsx`, `/cheatsheet`): tabbed reference —
  Knowledge Base (how the wiki works, required), Quick Capture, CLI Keys, Slash
  Commands. Reachable from the Magic Menu (`onCheatsheetClick` plumbed through
  `packages/ui/.../MainApp.tsx`).

## 2026-07-12 — Fix persistent cmd+k search CORS failures by cutting request volume

- **Root cause (confirmed)**: `SearchModal.tsx` fired two concurrent
  `/search/code` requests per debounced keystroke against GitHub's code-search
  endpoint, whose dedicated limit is ~10 req/min even when authenticated. Its
  limiter rejections arrive without CORS headers, so the browser reports an
  opaque "Failed to fetch" / CORS error instead of a 403. #113's trailing-space
  theory was invalid — the Fetch spec strips trailing whitespace from header
  values, so auth was never broken.
- **Fix**:
  - New pure `matchFilenames()` (`packages/ui/src/LifeOS/Organisms/search-filename-matcher.ts`)
    resolves filename matches locally from the already-loaded `githubFileStore`
    tree — zero API calls, instant, works while throttled. Prefix matches rank
    above substring matches.
  - `SearchModal.tsx` now issues a **single** content-search request per
    debounce (down from two), aborts the in-flight request when the query
    changes or the modal closes (via `AbortController`), and no longer needs
    `Promise.allSettled`. Removed the dangling trailing `%20` from the query.
  - Unit tests in `apps/console/src/search-filename-matcher.test.ts` (run under
    console's vitest, importing the matcher via relative path like
    `navbar-config.test.ts`).

## 2026-07-11 — Investigation + fix plan for persistent cmd+k search CORS failures

- **Symptom**: after both #112 and #113 the cmd+k search still fails — the
  content `/search/code` request returns data while the parallel
  `filename:` request is blocked by CORS ("No 'Access-Control-Allow-Origin'
  header").
- **Finding**: #113's premise was wrong — the Fetch spec strips
  leading/trailing whitespace from header values before sending
  (`new Headers({Authorization: 'Bearer abc '})` → `'Bearer abc'`), so the
  trailing space never reached the wire and auth was never broken. The real
  root cause is request volume: two concurrent `/search/code` requests per
  debounced keystroke against the code-search endpoint's dedicated
  10 req/min (authenticated) limit; GitHub's limiter rejections arrive
  without CORS headers and surface as opaque CORS errors.
- **Plan**: `docs/superpowers/plans/2026-07-11-searchmodal-cors-fix.md` —
  replace the `filename:` API request with local matching against the
  already-loaded `githubFileStore` tree, keep a single content-search
  request per debounce, and abort in-flight searches on query change.

## 2026-07-11 — Fix real root cause of cmd+k search failures: malformed auth header

- **Symptom**: after PR #112 the cmd+k GitHub code search still failed with the
  same CORS / "Failed to fetch" errors.
- **Root cause**: `SearchModal.tsx` built the auth header as
  `` `Bearer ${githubToken} ` `` — with a **trailing space** after the token.
  That makes the credential invalid, so GitHub ignores the token and treats
  every search request as *unauthenticated*. The Search API's unauthenticated
  quota is only ~10 requests/minute, but the modal fires two requests per
  debounced keystroke, so it exhausts the quota almost immediately and gets
  `403` secondary-rate-limit responses — which arrive without CORS headers and
  surface as the opaque CORS error. PR #112's `Promise.allSettled` + retry
  treated the symptom but couldn't help, because auth was permanently broken and
  every retry burned more of the tiny unauthenticated quota. Every other GitHub
  call in the repo (e.g. `apps/console/src/lib/github-kb.ts`) uses
  `` `Bearer ${token}` `` with no trailing space.
- **Fix**: `packages/ui/src/LifeOS/Organisms/SearchModal.tsx` — removed the
  trailing space so the token is sent correctly and requests use the
  authenticated Search API rate limit, eliminating the throttling that produced
  the CORS errors.

## 2026-07-07 — Harden cmd+k GitHub code search against CORS/rate-limit failures

- **Symptom**: the cmd+k search modal's GitHub code search (e.g.
  `filename:devto repo:urbanisierung/life-os`) started failing in the browser
  with a CORS error ("missing allow origin header").
- **Root cause**: `SearchModal.tsx` fires two direct `fetch()` calls per
  keystroke straight to `api.github.com/search/code` (content search + filename
  search) via `Promise.all`. GitHub's Search API sits behind a stricter
  abuse/rate-limit layer than the rest of the REST API (which the app's other
  GitHub calls go through via Octokit and don't hit this problem); throttled
  responses from that layer can come back without CORS headers, which the
  browser surfaces as an opaque CORS failure rather than a readable 403. Since
  the two searches were joined with `Promise.all`, one failing request wiped
  out both result sets.
- **Fix**: `packages/ui/src/LifeOS/Organisms/SearchModal.tsx` — switched to
  `Promise.allSettled` so a failure on one query no longer discards the other,
  and added `fetchGithubSearchWithRetry`, a single retry with backoff
  (honoring `Retry-After` on 403s, exponential backoff on network/CORS
  failures) before giving up on that query.

## 2026-06-26 — Configurable desktop bottom navbar

- **What**: the desktop bottom navbar items are now configurable from Settings
  instead of being hardcoded. Users choose which destinations appear and in what
  order; the choice is persisted to the repo's internal `.kh` settings file
  (`.kh/.dashboard.config.json`) alongside the rest of the dashboard config.
- **Config**: added `navbar?: NavItemId[]` to `DashboardConfig`
  (`packages/core/src/models/types.ts`) plus the `NavItemId` union. When unset it
  defaults to the historical items — Dashboard, Files, Board, Shortcuts.
- **Catalog**: `packages/ui/src/LifeOS/navbar-items.ts` defines `NAVBAR_ITEMS`
  (id/label/icon) and `DEFAULT_NAVBAR`. Beyond the four defaults it offers the
  other magic-menu destinations: Wiki, Knowledge Base, Action Log, Graph,
  Commits.
- **UI**: `StatusBar` now renders the desktop nav links from a resolved `navbar`
  prop; `MainApp` builds that list from config (mapping each id to its existing
  navigation handler and skipping unwired destinations); `SettingsView` gained a
  "Bottom Navbar" section with enable/disable + reorder controls that write back
  through the standard `onConfigChange` → GitHub persistence path.
- **Tests**: `apps/console/src/navbar-config.test.ts` covers the catalog
  invariants and the default set.

## 2026-06-25 — Fix editor padding/active-line drift (robustly) + per-file language

- **Symptom (recurrence)**: the markdown editor again rendered with no inner
  padding — text/line-numbers flush to the border, no gutter→text gap — and the
  active-line highlight sat one `space-3` (12px) below its row. Exactly the
  cascade-layer bug the 2026-06-24 fix targeted, but back in the production
  build.
- **Root cause**: cascade-layer priority is set by *first appearance*. The
  bundler hoists Cascivo's `@layer cascivo.component` CSS (pulled in as a
  component dependency of the editor) to the very top of the bundle — *before*
  the `@layer …` order declaration that lived in `index.css` (which landed
  ~60 KB later). So `cascivo.component` resolved as the **lowest**-priority
  layer and Tailwind's Preflight (`* { padding: 0 }` in `@layer base`) won,
  collapsing the editor's `padding`/`padding-inline`/`padding-block`. The
  active-line overlay positions via `top: var(--cascivo-space-3)` (a `top`, not
  padding — so *not* reset), while the text lost its matching `padding-block`,
  dropping the highlight by `space-3`. Verified against the real bundle: pre
  padding computed `0px` (broken) → `12px` (fixed).
- **Fix**: declare the cascade order in an inline `<style>` in
  `index.html`'s `<head>` — guaranteed to precede the bundled stylesheet, so it
  wins regardless of how the bundler orders the CSS. The `index.css` statement
  is kept as a (non-authoritative) mirror with an updated comment.
- **Per-file language**: the editor hardcoded `language="markdown"` for every
  file. Added `languageForPath` (`apps/console/src/components/editor/language.ts`)
  and wired it into `CodeMirrorEditor` so the grammar is derived from the file
  extension — `.md`/`.markdown` → `markdown` (so markdown highlighting is
  reliably set), plus `json`/`javascript`/`typescript`/`css`/`html`/`bash` using
  Cascivo's **registered** grammar names (short aliases like `ts`/`js` silently
  fall back to plaintext, so the long names are used); unknown/extension-less
  files default to `markdown` (this app is markdown-centric).
- *Verified*: console `tsc` + Biome clean; `vite build` green; full console
  suite 31/31 (incl. new `language.test.ts`); padding/highlight fix confirmed in
  a browser against the actual production CSS bundle (0px → 12px).

## 2026-06-25 — Nextgen is the default landing page + "try the demo" link

- Added a **"▶ Try the live demo — no signup"** call-to-action next to the
  screencast on both landing pages, linking to
  `https://app.kaihuman.com/demo` (the console's `/demo` deep link that seeds
  the in-memory demo) so visitors can play around themselves.
- **Made the nextgen landing page the production default.** The
  `[PROD] Deploy Landing Page` workflow (`deploy-landing.yml`, which targets the
  `lifosy-landing` Cloudflare Pages project) now builds and deploys
  `apps/landing-page-nextgen` and triggers on `apps/landing-page-nextgen/**`.
  The redundant `deploy-landing-nextgen.yml` (which deployed nextgen to the
  separate `kh-landingpage-nextgen` preview project) was removed. The old
  `apps/landing-page` app remains in the repo but is no longer auto-deployed.

## 2026-06-25 — Auto-generated product screencast on the landing pages

- The **nextgen landing page** demo section previously held a hand-built
  terminal mock + three placeholder "screenshot" panels marked *PLACEHOLDER*.
  Replaced them with a **real, auto-generated screencast** of the app, framed
  as an app window (title bar + `DEMO` badge), autoplaying muted on loop with a
  poster frame. The same player was added to the **original landing page**
  (`apps/landing-page`) right below the hero. Both consume the same asset.
- **Recorder (`apps/landing-page-nextgen/scripts/record-screencast.mjs`):** a
  Playwright script that drives the console's **demo mode** through a scripted
  storyline and records it to each landing page's `public/screencast.webm`
  (+ a first-frame `screencast-poster.jpg`). Run with
  `pnpm --filter @lifosy/landing-page-nextgen screencast` (it reuses a running
  dev server on :4300 or starts one itself).
- **Storyline:** Overview dashboard → Finance → Reading workspaces → Kanban
  board → todo analytics → action log → wiki → files browser + markdown editor
  → back to Overview. A synthetic on-screen cursor (the recorded video has no
  real pointer) glides and pulses on clicks for legibility.
- **Seamless loop:** the clip is recorded so it begins *and* ends on the exact
  same Overview frame (cursor centred, held a beat); ffmpeg then trims off the
  leading `/demo` load and re-encodes (VP8), so wrapping from the last frame
  back to the first is invisible. ffmpeg is auto-discovered (Playwright's
  bundled binary, `FFMPEG_PATH`, or `ffmpeg` on PATH); without it the raw clip
  is shipped un-trimmed.
- **Key constraint:** demo data lives only in memory and is wiped by a full
  page reload, so every transition after the initial `/demo` load is done
  client-side via `history.pushState` + a `popstate` event (which
  preact-router listens to) — never a fresh navigation.
- **Format:** VP8 WebM (≈3.7 MB, 1440×900, ~51 s). The poster image is the
  graceful fallback for browsers without WebM support.
- Added `playwright` as a root devDependency.
- *Verified*: both landing-page builds bundle the video + poster into `dist/`
  with correct `<video>`/`<source>` references and zero remaining placeholder
  markup; first and last video frames are the same Overview view; both built
  pages render the screencast playing in its frame.

## 2026-06-25 — Demo mode (in-memory, seeded data)

- Added a **demo mode** so the console can be shown (e.g. for a screen
  recording) with realistic data and no GitHub account. Entered via a **"View
  demo"** button on the login screen or the **`/demo`** deep link. All data is
  generated, lives only in memory, and disappears on refresh — edits and saves
  during the session operate on the temporary in-memory store.
- **Mechanism (no store/widget changes):** every read/write already funnels
  through the `githubService` singleton. It is now a small `Proxy` façade that
  routes each call to either the real Octokit-backed service or a new
  `InMemoryGithubService` (a seeded `Map<path,{content,sha}>` returning
  Octokit-shaped responses), based on a global `demoMode` signal
  (`packages/core/src/demo-mode.ts`).
- **Ephemerality:** durable writes are skipped while `demoMode` is on — the
  auth/profile persistence effects early-return, and the file store's
  IndexedDB handle is wrapped so `put`/`delete`/`get`/`getKey` become no-ops.
  No fake token or repo ever touches localStorage/IndexedDB.
- **Seed (`packages/core/src/demo/seed.ts`):** a fake repo + user and a virtual
  filesystem dated relative to "now", including a `.kh/.dashboard.config.json`
  wiring three workspaces (Overview / Finance / Reading) to one of every widget
  (todos + Kanban inbox, time-tracking, habits, events, action log, timezones,
  board overview, budget, stocks, consumption, data-collection, read-it-later,
  RSS) plus plain notes for the file browser.
- **Orchestration:** `enterDemoMode()` / `exitDemoMode()` in
  `stores/demo.store.ts`; console wires the login button and a `/demo` route
  (`pages/DemoEntry.tsx`).
- *Verified*: 28 console tests pass (seed integrity, format contracts,
  in-memory service round-trip); Overview, Finance, Board and Analytics all
  render via the real app with zero console errors. Added `fake-indexeddb`
  (root devDependency) so store-importing tests run under jsdom.

## 2026-06-25 — Switch to @cascivo/react 0.3.7 (per-component CSS, no monolith)

- `@cascivo/react@0.3.7` ships each component prebuilt with its CSS co-located
  (`button/button.js` → `button.module.js` → `import './button.css'`) and
  `sideEffects: ["**/*.css"]`. Importing a component now pulls in only that
  component's CSS automatically — the 252KB aggregate `styles.css` is only needed
  for no-bundler/CDN setups (per the library's own README).
- Reverted the interim copy-paste vendoring: deleted
  `packages/ui/src/components/cascivo/{button,input}.tsx` and
  `cascivo-components.css`, and pointed the `@lifosy/ui` Button/Input wrappers
  back at `@cascivo/react` (re-added as a `@lifosy/ui` dependency, `^0.3.7`).
  Dropped the corresponding `cascivo-components.css` imports (console
  `index.css` + Storybook) and the `./cascivo-components.css` package export.
- `InputProps` now extends `JSX.InputHTMLAttributes` (was `HTMLAttributes`) so
  `placeholder`/`value`/etc. type-check; still omits the numeric `size` (collides
  with Cascivo's `'sm'|'md'|'lg'`). Fixes a pre-existing story type error that
  the dts build never surfaced. The `Input` wrapper drops the unused `forwardRef`
  (no caller forwards a ref to it).
- Also bumped `@cascivo/editor` 0.2.1→0.2.2 and `@cascivo/charts` 0.3.0→0.3.1.
- **Bundle impact** (console, gzip): CSS still ~17KB (per-component tree-shaking
  matches the hand-vendored result), monolith gone.
- *Verified*: full build green (6/6); bundled CSS carries `_button_`/`_input_`
  and none of the monolith-only classes (accordion/carousel/data-table/dropdown
  = 0); `tsc` clean (ui + console); spikes (5/5) + console suite (20/20) green;
  Biome clean.

## 2026-06-25 — Drop the 252KB @cascivo/react CSS monolith (copy-paste model)

- `@cascivo/react/styles.css` shipped the CSS for all 254 component class-groups
  (252KB raw / ~33KB gzip) but we only used `Button` + `Input` from it.
- Switched those two to Cascivo's **copy-paste model**: vendored the components
  (`npx cascivo add button input`) into
  `packages/ui/src/components/cascivo/{button,input}.tsx`, adapted them to Preact
  types, and flattened their per-component CSS-modules into
  `packages/ui/src/cascivo-components.css` (~6KB, stable class names, kept in
  `@layer cascivo.component`). The `@lifosy/ui` Button/Input wrappers now point at
  the vendored components.
- Removed the `@cascivo/react` dependency (console + `@lifosy/ui`) and its
  `styles.css` import (main.tsx + Storybook); added `@cascivo/core` as a direct
  `@lifosy/ui` dep (the vendored components use `cn`/`Slot`/`useMachine`).
  Editor + charts (separate, already-small packages) are unchanged.
- **Bundle impact** (console, gzip): CSS **48.6KB → 17.1KB (−31.5KB)**; JS
  ~unchanged (345→342KB). Initial JS+CSS now ~359KB gz — **−33% vs the original
  pre-Cascivo `main`** (was 539KB gz), realizing the earlier "future win".
- *Verified*: console build green; no `@cascivo/react` refs remain; bundled CSS
  carries `cascivo-btn`/`cascivo-field` and none of the monolith classes; `tsc`
  clean; spikes (5/5) + suite (20/20) green; Biome clean.

## 2026-06-24 — Fix white active-line number in the editor gutter

- **Symptom**: the active line's gutter cell rendered as a solid white box over
  the line number.
- **Cause**: the previous theme fix set `--cascivo-editor-gutter-active:
  var(--los-fg)`, but that token is the *background* of the active gutter line
  (not the number's text color); `--los-fg` is near-white, so it painted a white
  block.
- **Fix** (`packages/ui/src/cascivo.css`): remove the override so the editor's
  own fallback applies — `var(--cascivo-editor-gutter-active,
  var(--cascivo-editor-current-line))` → the subtle
  `rgba(--los-accent-rgb, 0.06)` tint, matching the code area's active line.
- *Verified*: console build green; the white override is gone from the bundled
  CSS; suite (20/20) green; Biome clean.

## 2026-06-24 — Fix Cascivo editor layout (gutter gap + active-line drift)

- **Symptom**: vs the official demo, the editor had too much gutter→text gap and
  the active-line highlight sat ~half a line too low.
- **Root cause**: a cascade-layer ordering problem. Cascivo wraps its component
  CSS in `@layer cascivo.component`, which was imported *before* Tailwind in
  `main.tsx`, so it appeared first in the cascade — *earlier* layers lose. Thus
  Tailwind's Preflight (`* { margin:0; padding:0 }` in `@layer base`) overrode
  the editor's `padding-block`/`padding-inline`. The active-line/gutter overlays
  position via `top: var(--cascivo-space-3)` (a `top`, not padding — so *not*
  reset), while the text lost its matching `padding-block` → the highlight
  dropped by `space-3` and the gutter spacing collapsed.
- **Fix**: declare the cascade order so Cascivo's layers come *after* Tailwind's
  (`@layer theme, base, components, utilities, cascivo.tokens, cascivo.base,
  cascivo.theme, cascivo.component;` at the top of `index.css`) and import
  `index.css` *before* the Cascivo CSS in `main.tsx` so that order takes effect.
  Verified in the bundled CSS: `@layer base` now precedes `@layer
  cascivo.component`, so Cascivo's component styles win over Preflight.
- *Note for the library*: any Tailwind app that imports Cascivo CSS before
  Tailwind gets its components silently reset by Preflight. Worth documenting the
  required layer order (or shipping a guard).
- *Verified*: console build green; bundled layer order corrected; spikes (5/5) +
  suite (20/20) green; Biome clean.

## 2026-06-24 — Fix Cascivo editor rendering on a light background

- **Symptom**: the markdown editor rendered on a near-white background with a
  washed-out active-line band, despite the dark app theme.
- **Root cause**: `@cascivo/tokens` declares every `--cascivo-editor-*` at
  `:root` with a *light* fallback (e.g.
  `--cascivo-editor-bg: var(--cascivo-color-surface, oklch(0.985 …))`). The
  LifeOS bridge sets `--cascivo-color-*` on `.life-os-root` (and Cascivo's dark
  theme keys off `[data-theme="dark"]`, also on `.life-os-root`), so at `:root`
  those references are undefined → the editor tokens compute to their light
  fallbacks and inherit down. `.life-os-root` never re-declared them, so the
  editor stayed light.
- **Fix** (`packages/ui/src/cascivo.css`): re-declare the `--cascivo-editor-*`
  tokens (bg/fg/gutter/current-line/selection/border + the syntax palette) on
  `.life-os-root` so they re-resolve against the dark `--los-*` / accent / chart
  tokens. Active line is now a subtle `rgba(--los-accent-rgb, 0.06)` tint.
- *Note for the library*: editor tokens declared at `:root` referencing
  `--cascivo-color-*` will mis-resolve for any consumer that scopes the theme to
  a sub-element via `data-theme` (a documented pattern) — worth defining them
  alongside the theme tokens, or with theme-aware fallbacks.
- *Verified*: console build green; bundled CSS carries the `.life-os-root`
  editor-token overrides; spikes (5/5) + suite (20/20) green; Biome clean.

## 2026-06-24 — Cascivo charts migrated (DonutChart/StackedBarChart → @cascivo/charts)

- The charts feedback shipped in **`@cascivo/charts@0.3.0`** (a standalone
  package — `@cascivo/react` bundles only components; editor/icons/charts are
  separate). It ships a real `dist/` with per-datum/series `color`,
  `centerValue`/`centerLabel`/`thickness`/`size`/`emptyLabel`/`tooltipFormat`
  (pie) and `xLabelEvery`/`tooltip` + `toStackedSeries` (bar).
- Re-implemented `packages/ui/src/LifeOS/Charts/DonutChart.tsx` and
  `StackedBarChart.tsx` as thin wrappers over Cascivo's `PieChart`/`BarChart`,
  preserving their exact APIs so `TodoAnalytics` is unchanged: semantic per-slice
  / per-series colors, donut center value/label + size/thickness, `toStackedSeries`
  pivot (per-segment color preserved), the app's grid/axis colors applied via
  `--cascivo-chart-*` tokens, `plain`/`legend={false}` (callers own the legend).
- Wired `@cascivo/charts/styles.css` into `main.tsx` + Storybook; added a
  `Cascivo/Charts` story for visual verification. Added `@cascivo/charts` to
  `@lifosy/ui` (charts live there) and the console (for the CSS import).
- *Verified*: console production build green (full chain TodoAnalytics → wrappers
  → @cascivo/charts compiles/bundles); `tsc` clean; spikes (5/5) + console suite
  (20/20) green; Biome clean. **This completes the Phase 3 primitive migration.**

## 2026-06-24 — Cascivo Phase 4 DONE: CodeMirror → Cascivo CodeEditor

- `@cascivo/editor@0.2.1` shipped its build (prior empty-publish blocker fixed).
  Validation gate (`apps/console/src/spikes/cascivo-editor.spike.test.tsx`)
  mounts the real `CodeEditor` under Preact and verifies the imperative handle:
  markdown language, `onValueChange`, and `applyEdit`/`getSelection`/`undo`/
  `redo`/`openFind`/`focus` (selection-preserving sync confirmed).
- Ported both editors to Cascivo's `CodeEditor`:
  - `apps/console/src/components/editor/CodeMirrorEditor.tsx` — same external API;
    uncontrolled `defaultValue` + `ref.applyEdit` for store/prop external sync
    (echo-guarded); native `onSave` (Mod-S); `theme` for Zen mode; `.md` wrap;
    auto-save + save-button preserved. `bracketMatching` on; `virtualize` (auto)
    handles large docs.
  - `packages/ui/src/components/editor/Editor.tsx` (used by `DumpView`).
- Removed orphaned `docSync.ts` + `docSync.test.ts`; dropped all seven
  `@codemirror/*` deps from the console and `@lifosy/ui` (−24 packages). Wired
  `@cascivo/editor/styles.css` into `main.tsx` + Storybook preview.
- *Verified*: console build green; `tsc` clean; gates (5/5) + console suite
  (20/20, was 28 — the 8 docSync tests were removed with the helper) green;
  Biome clean; 0 CodeMirror source references remain.

## 2026-06-24 — Cascivo Phase 4 blocked (editor publish) + charts feedback

- **Phase 4 (editor swap) blocked**: `@cascivo/editor@0.1.1` ships no `dist/`
  (the published tarball contains only package.json/README/LICENSE despite
  `files: ["dist"]`), and the registry's `editor/code-editor` has `files: []` —
  so neither the npm package nor the copy-paste source is importable. The Preact
  bridge + migration target are ready; the swap can land once the package ships
  its build. Wrote `doc/cascivo-editor-package-feedback.md` with the root cause
  and fix.
- **Charts feedback**: wrote `doc/cascivo-charts-feedback.md` — a per-chart gap
  analysis (DonutChart→PieChart, StackedBarChart→BarChart) listing exactly what
  Cascivo's chart components need for a zero-downside swap. Headline blocker:
  per-datum/per-series `color` overrides (both charts encode meaning in color);
  plus donut center label/value, thickness, and tooltip/empty-state parity.
- No app code changed this round (investigation + docs only).

## 2026-06-23 — Cascivo migration Phase 3: remove unused Panel/Sidebar/SplitView/FileTree

- Confirmed `Panel`, `Sidebar`, `SplitView` (ResizablePanelGroup/Panel/Handle),
  and `FileTree` are unused exports (0 references anywhere). Removed the four
  component files + their `index.ts` exports, consistent with the earlier
  Dialog/DropdownMenu decision.
- Dropped the now-orphaned `react-resizable-panels` (SplitView's only dependency).
  `@dnd-kit` kept — still used by `MainApp`.
- Remaining Phase 3 item: the charts (DonutChart/StackedBarChart), the only
  *used* primitives, deferred for careful visual migration.
- *Verified*: console build green; `tsc` clean; spike (2/2) + console suite
  (28/28) green; Biome clean.

## 2026-06-23 — Cascivo migration Phase 3: remove unused Radix Dialog/DropdownMenu

- `@lifosy/ui`'s `Dialog` and `DropdownMenu` were full Radix-based compound
  components (10–12 sub-exports each) with **no consumers** anywhere in the repo.
  Rather than speculatively re-wrap 24 unused sub-components over Cascivo, they
  were removed: deleted `components/Dialog.tsx` + `components/DropdownMenu.tsx`,
  dropped their `index.ts` exports, and removed `@radix-ui/react-dialog` +
  `@radix-ui/react-dropdown-menu` (−39 packages) and the Radix `external` entry
  from the lib build. A Cascivo-backed Modal/Dropdown can be added when a real
  consumer needs one.
- *Verified*: console build green; `tsc` clean; spike (2/2) + console suite
  (28/28) green; Biome clean; 0 Radix references remain.

## 2026-06-23 — Cascivo migration Phase 3 (start): Button + Input primitives

- **Button** (`packages/ui/src/components/Button.tsx`): re-implemented as a thin
  wrapper over Cascivo's `Button`, preserving the existing `@lifosy/ui` API —
  `variant` (`outline`→ghost, `danger`→destructive), `size` (`icon`→md), and the
  `label` convenience. Console call sites (e.g. `AuthCli.tsx`) unchanged.
- **Input** (`packages/ui/src/components/Input.tsx`): wraps Cascivo's `Input`;
  `error` widened to `boolean | string` (the string form supplies Cascivo's
  message). Drops the bespoke Tailwind input styling.
- **Build wiring**: `@lifosy/ui` lib build now externalizes `@cascivo/*` and
  `@preact/signals-react[/runtime]`; the console app build aliases
  `@preact/signals-react → @preact/signals` and the `/runtime` `useSignals` to a
  no-op shim, so Cascivo runs under Preact in the real app (not just the spike).
  React-typed Cascivo components are bridged with an
  `as unknown as (props) => h.JSX.Element` cast (same pattern as the Radix
  wrappers).
- Fixed a latent type error in the Phase 2 `CascivoBridge` story (same cast).
- *Verified*: console production build green; `tsc` clean (no new errors beyond
  the pre-existing `packages/core` baseline); spike (2/2) + console suite (28/28)
  green; Biome clean.

## 2026-06-23 — Cascivo migration Phase 2: theme/token bridge

- **Bridge stylesheet** (`packages/ui/src/cascivo.css`, exported as
  `@lifosy/ui/cascivo.css`): remaps Cascivo's semantic color/font tokens
  (`--cascivo-color-*`, `--cascivo-font-*`) onto the live LifeOS palette
  (`--los-*`), so Cascivo components automatically follow the active LifeOS
  theme (nexus / light / amethyst). Declared unlayered to win over Cascivo's
  layered theme values.
- **data-theme**: LifeOS themes live on `<html>`; Cascivo's `dark.css` keys off
  `[data-theme='dark']`. Set `data-theme="dark"` on the inner `.life-os-root`
  (`apps/console/src/App.tsx`) so Cascivo's structural tokens (radius, shadow,
  ring, status, chart, fonts) apply without colliding with LifeOS switching.
- **CSS import order** (components → tokens+theme → brand overrides): wired in
  `apps/console/src/main.tsx` (+ `index.css` for the brand layer) and
  `packages/ui/.storybook/preview.ts`.
- **Storybook bridge** (`packages/ui/src/CascivoBridge.stories.tsx` +
  signals-react alias/shim in `.storybook/main.ts`): renders raw Cascivo
  Button/Input/Badge/Card under the bridge for visual verification.
- **Deps**: added `@cascivo/react` / `@cascivo/themes` / `@cascivo/tokens` to
  `@lifosy/ui`.
- *Verified*: console production build resolves+bundles the full Cascivo CSS
  chain; spike (2/2) and console suite (28/28) green; Biome clean.

## 2026-06-23 — Cascivo UI migration: plan + Phase 0 integration spike

- **Plan** (`doc/cascivo-migration.md`): full plan to migrate the console's UI
  (which lives in `@lifosy/ui`) onto Cascivo — a CSS-native, signal-driven,
  AI-first React design system. Includes the `@lifosy/ui` → Cascivo component
  mapping derived from the live registry (181 components), a phased rollout, and
  risks. Decisions: own the source (copy-paste model), Tailwind coexistence,
  editor migrated to `@cascivo/editor`.
- **AI tooling wired** (`.mcp.json`): added the Cascivo MCP server
  (`npx -y @cascivo/mcp`) so the migration is driven by `list_components` /
  `select_component` / `get_component` / `add_to_project`.
- **Phase 0 integration spike (green)**: proved Cascivo's React/`signals-react`
  components mount under Preact. Cascivo imports `@preact/signals-react` +
  `@preact/signals-react/runtime`; the bridge aliases `@preact/signals-react →
  @preact/signals` and stubs `useSignals` as a no-op
  (`apps/console/src/shims/signals-react-runtime.ts`). Spike test
  `apps/console/src/spikes/cascivo-preact.spike.test.tsx` (run via
  `vitest.spike.config.ts`) mounts a real Cascivo `<Button>` under Preact and
  confirms signal-driven re-render. Spikes excluded from the default suite.
- **Editor re-validated**: the upgraded `editor/code-editor` manifest now covers
  the previously-missing capabilities (markdown highlighting, find/replace, real
  undo/redo, `applyEdit`/`getSelection` for selection-preserving sync, `onSave`,
  live `theme`). Open item: large-document performance, to be measured before
  retiring CodeMirror.

## 2026-06-22 — Restore habit-tracker streak stats on the dashboard

- **Missing stats row** (`HabitTrackerWidget.tsx`): on the desktop dashboard, `.habit.csv` tiles render in `SMALL` mode, which showed the heat map and a line of muted motivational text but no icon-with-number stats — unlike the mobile views (`MOBILE_COLLAPSED`/`MOBILE_EXPANDED`), which display a `Flame` icon plus streak numbers. The dashboard tile was therefore "missing the icons with numbers below the heat map".
- **Fix**: added a compact stat row directly below the heat map in the shared `SMALL`/`FOCUS` render, showing `Flame` → current daily streak (days), `CalendarCheck` → weekly streak (weeks), and `Trophy` → total completions. Reuses the already-computed `stats` (`currentStreak`, `weekStreak`, `totalCount`) and the existing `--los-accent`/`--los-muted` styling; the motivational `streakText` line is unchanged.

## 2026-06-19 — Wiki previews for JSON, CSV, and plain-text files

- **JSON preview** (`WikiView.tsx`): `.json` files render syntax-highlighted via `highlight.js` (imported as `highlight.js/lib/core` + the `json` language only, to avoid pulling the full bundle). Falls back to raw text if highlighting throws.
- **CSV preview** (`WikiView.tsx`): `.csv` files render as a table. Added a minimal RFC-4180-style `parseCsv` (handles quoted fields with embedded commas, escaped `""` quotes, and CRLF/LF) instead of reusing the heavier `CsvTableView` widget, which carries sort/filter/pagination and the app's `--los-*` theme rather than the wiki's GitHub-dark palette.
- **Plain-text fallback**: all other non-binary files render their content as-is in a `<pre>`. Binary files (detected via NUL bytes or a high ratio of U+FFFD replacement characters) keep the "no preview / open in editor" message.
- The Markdown branch is unchanged; preview selection now keys off `isLoaded` (file present in `openFiles`) so empty files no longer show a perpetual "Loading…".

## 2026-06-19 — Wiki collapsed-by-default tree and edit-navigation fix

- **Lazy sidebar tree** (`WikiView.tsx`): `WikiTreeItem` now defaults `expanded` to `false` instead of `true`. The sidebar renders only the root folders/files on load; expanding a folder reveals just its direct children (each still collapsed), instead of rendering the entire repo tree fully expanded.
- **Edit navigation fix** (`WikiPage.tsx`): clicking "Edit" called `layoutStore.navigate(path)` then `route('/')`. Routing to `/` remounts `MainApp`, whose URL→State resolver reads pathname `/` and resets `activeTileId` to `null`, discarding the focus — so the editor never opened. Now routes to `/files/<encoded path>` so the resolver detects the file and opens it in the editor. Removed the now-unused `layoutStore` import.

## 2026-06-19 — Wiki magic menu link and empty-view fix

- **Wiki in magic menu** (`MainApp.tsx`): added an `onWikiClick` prop and a "Wiki" item to the `StatusBar` menu, following the same conditional-prop pattern as Knowledge Base / Board. Wired from `Dashboard.tsx` as `onWikiClick={() => route('/wiki')}`. The `/wiki` route existed but was unreachable from the app UI.
- **Empty Wiki view fix** (`WikiPage.tsx`): `WikiView` renders from `githubFileStore.tree`, which was only populated by the Dashboard. Direct navigation to `/wiki` left the tree empty, so no files rendered. Added a mount effect that calls `githubFileStore.loadTree()` when the tree is empty — the same pattern used by `QuickNotePage`/`QuickLogPage`/`QuickTodoPage`.

## 2026-06-14 — Fix editor cursor jumping to the top

- **Root cause** (`apps/console/src/components/editor/CodeMirrorEditor.tsx`): the store-sync paths replaced the whole document (`{ from: 0, to: doc.length, insert: content }`) whenever store content differed from the editor. Because `githubFileStore.openFiles` is mutated by background work (`openFile` network revalidation, `saveFile`), the store-connected `useSignalEffect` re-ran mid-edit and the full-document replace collapsed the caret to position 0 — the cursor "jumping to the top" on desktop and mobile.
- **`docSync.ts`** (new): `computeMinimalChange(current, next)` derives the smallest replacement by preserving the shared prefix/suffix, and `syncDocPreservingSelection(view, content)` dispatches only that minimal change so CodeMirror maps the existing cursor/selection through a localized edit instead of resetting it.
- **`CodeMirrorEditor`**: the late-`initialContent` sync and the same-path external-update sync now call `syncDocPreservingSelection`. The path-change branch keeps a full replace (a new file should reset the caret to the top).
- **`docSync.test.ts`** (new): regression tests for the minimal-diff logic and, via `EditorState` selection mapping, that an external content update keeps the caret in place rather than collapsing it to 0.

## 2026-05-05 — Board Overview dashboard widget

- **`BoardOverviewWidget`** (`packages/ui/src/LifeOS/Organisms/Widgets/BoardOverviewWidget.tsx`): new widget that reads all `.todos.md` files from `githubFileStore` and `layoutStore` (same file resolution as `KanbanBoard`) and displays three stats: inbox (backlog count), in-progress count, and overdue count (in-progress items with `updatedAt`/`createdAt` older than 7 days). Clicking any part of the widget calls `onNavigate` to jump to the Board view.
- **`MainApp` wired** (`renderRawTileContent`): added `.board-overview.json` extension case; passes `onBoardClick` through as `onNavigate`.
- **`Dashboard` wired** (`renderFile` isWidget check): `.board-overview.json` treated as a widget so it renders via `FileViewer` rather than the plain editor.
- **`NewFileWizard` template**: added "Board Overview" entry with `Kanban` icon and `.board-overview.json` extension; default content `{}`.

## 2026-04-21 — Knowledge Base navigation, 404 fix, and KB commands modal

- **`/knowledge` in command palette**: added "Open Knowledge Base" command (`SearchModal.tsx`); dispatched via `onOpenKnowledge` callback chain → `MainApp` → `Dashboard` → `route('/knowledge')`
- **`/knowledge` in magic menu**: added "Knowledge Base" item to `StatusBar` menu in `MainApp.tsx`; follows the same conditional-prop pattern as Board / Action Log / Shortcuts
- **Scaffold 404 fix** (`github-kb.ts`): `scaffoldKB` now calls `githubService.saveFile` directly (no SHA) instead of `upsertRepoFile`; eliminates 11 pre-check GET requests that all 404'd on first-time setup since none of the files exist yet
- **KB commands modal** (`KBCommandsModal.tsx`): new modal in `apps/console` showing the general flow and all four KB slash commands (`/kb-ingest`, `/kb-lint`, `/kb-ask`, `/kb-session`) with descriptions; triggered from command palette via "Knowledge Base Commands" entry

## 2026-04-11 — Quick Dump view modes (JSON, JSONL, CSV)

- **`DumpView` component** (`packages/ui/src/LifeOS/Organisms/DumpView.tsx`): replaces the plain editor in Quick Dump (`/new`) with auto-detecting view modes
- **Format detection**: detects `json_array`, `jsonl`, `csv`, or `raw` from pasted content; auto-switches to TABLE on first structured detection
- **TABLE mode**: per-column live filters, sortable columns, pagination (50 rows/page); reuses `CsvTableView` for CSV; converts JSON/JSONL objects to rows
- **LOG mode** (JSONL only): global search bar, reverse-chron order, level coloring (error/warn/info/debug), timestamp column first
- **`CsvTableView`**: extended with optional `data` prop for pre-parsed input
- **`LogView` component** (`packages/ui/src/LifeOS/Organisms/LogView.tsx`): standalone log table for JSONL entries

## 2026-04-02 — Board card inline editing + URL rendering

- **KanbanBoard / KanbanCard**: added EDIT button (pencil icon) on each card; clicking it opens an inline textarea pre-filled with the todo's current text; SAVE commits the change, CANCEL discards it; drag-and-drop is disabled while editing
- **TodoLogic**: added `updateTodoText` helper (same pattern as `setStatus`)
- **KanbanBoard**: todo card text now detects URLs (`http://`/`https://`) and renders them as clickable links that open in a new tab

- **KanbanBoard**: todo card text now detects URLs (`http://`/`https://`) and renders them as clickable anchor tags opening in a new tab

## 2026-03-28 — Action Log view, inbox, quick-log route

- **`ActionLogView` template** (`packages/ui`): single-column combined view of all `.actionlog.md` files from dashboard config; always includes `inbox.actionlog.md` if it exists; search input; clickable tag cloud (frequency-sorted); date separators (sticky, formatted); entry rows show file source + MOVE dropdown on hover; add-entry panel (collapsible) with file selector, description textarea, tags — creates inbox on first use; footer stats
- **Move between files**: removes from source, inserts into target maintaining chronological order; saves sequentially
- **`/action-log` route** + `ActionLogViewPage.tsx` wrapper
- **`inbox.actionlog.md`**: lives in `.kh/`, always surfaced on the view if it exists in the tree; add panel always offers it even if not yet created
- **`/quick-log` route** + `QuickLogPage.tsx`: focused quick capture to inbox; same pattern as quick-todo/quick-note
- **Shortcuts page**: added "Quick Log" (`/quick-log`) entry
- **Android manifest**: added "Quick Log" shortcut
- **Magic menu**: "Action Log" item wired via `onActionLogClick` prop
- **Command palette**: "Open Action Log" command added

## 2026-03-28 — Shortcuts in magic menu + command palette, /new route added

- **Magic menu**: added "Shortcuts" item (between Search and Board); routes to `/shortcuts`; conditional on `onShortcutsClick` prop being provided
- **Command palette** (`Ctrl+K`): added "Open Shortcuts" command to static commands list
- **`/new` added to shortcuts page** as "New File" entry with suggested name "KH New"
- Wired `onShortcutsClick` and `onOpenShortcuts` through `MainApp` → `SearchModal` → `Dashboard`

## 2026-03-28 — Shortcuts page, quick-note route, Android manifest shortcuts

- **`/quick-note` route**: new page for fast note capture to `.kh/dump.md`; prepends dated entries (`- YYYY-MM-DD text`) to the top of the file, auto-creates on first use
- **`/shortcuts` page**: platform-aware guide listing all quick-capture routes; auto-detects iOS/Android/desktop; shows step-by-step instructions per route and per platform; platform can be toggled manually; explains iOS icon limitation; notes Android long-press shortcut
- **Android manifest shortcuts**: `shortcuts` array added to `vite.config.ts` manifest so Android users get long-press shortcuts on the installed app icon without needing extra home screen icons
- `QUICK_ROUTES` registry in `ShortcutsPage.tsx` — single place to add future quick routes

## 2026-03-28 — Inbox todos, quick-todo route, move between files

- **`/quick-todo` route** (`apps/console`): new focused page for fast todo capture into `.kh/inbox.todos.md`; auto-focuses input, parses tags from space/comma-separated input, creates the inbox file if it doesn't exist yet
- **Inbox always on board** (`KanbanBoard`): `.kh/inbox.todos.md` is always included in the board's file pool if it exists in the repo tree, regardless of dashboard config entries
- **Move todo between files** (`KanbanBoard`): each card shows a "MOVE" dropdown on hover (only when ≥2 todo files exist); selecting a target file removes the item from the source and appends it to the target, preserving all fields (tags, timestamps, milestone, prompt)
- **`TodoLogic` exported** from `@lifosy/ui` so console app pages can use `parseTodos` / `addTodo` / `serializeTodos` directly

## 2026-03-19 — Setup64: CLI enhancements

- Added `git.rs`: clone / pull active repo into `~/.config/com/lifosy/cli/repos/` before any file action
- Added `files.rs`: recent-files list (`recent_files.json`), `dashboard.config.json` parser, flat repo file listing
- Extended `auth.rs`: exposed `config_dir()` helper
- New TUI screens in `app.rs` / `ui.rs`:
  - **AI Prompt** (`a`) — pipe a multi-line prompt to Claude, Copilot, or Gemini CLI via `-p`; Tab cycles provider; Ctrl+Enter submits
  - **AI Response** — scrollable response view; Esc/Enter returns to prompt
  - **File Browser** (`f`) — syncs repo, lists files with recently-used files (★) at top; Enter opens nano-like editor
  - **File Editor** — full `tui-textarea` editor; Ctrl+S saves to disk; Esc closes
  - **Dashboard View** (`d`) — syncs repo, parses `dashboard.config.json`, shows workspaces + primary files; Enter opens any file in editor
- Main screen shortcut bar updated to reflect new keys
