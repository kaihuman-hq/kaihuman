# Spike: `@getnarro/pdf` in the browser (2026-11-18)

Run: `pnpm exec vitest run --config src/spikes/narro/vitest.config.ts` (from `apps/console`).
Bundle: `NARRO_OUT=<dir> pnpm exec vite build --config src/spikes/narro/vite.config.ts`.
PDF proxy: `NARRO_DUMP=<f.html> NARRO_DUMP_REF=<ref.json> vitest …`, then
`NARRO_CHROMIUM=<chrome> node src/spikes/narro/tools/pdf.mjs f.html f.pdf`.

## 1. Bundling
Works with 5 stubs (`fs`, `fs/promises`, `module`, `path`, `url`) plus aliases `react*` → `preact/compat`,
`react-dom/server` → `shim-react-dom-server.ts` (mount into a detached node, read `innerHTML`; no new dependency).
The import-time `createRequire(import.meta.url)` is harmless once `module` is stubbed.
Size (minified, lib build with Preact, narro, remark/unified, zod, yaml): 476 kB JS / 122 kB gzip, plus
12 woff2 (≈277 kB raw, 3 families × latin/latin-ext × 400/600) that load on demand as separate assets in an app build.

## 2. HTML without fs
`render.ts: renderOfferHtml({data, markdown, logo, css, fontCss})` = narro's `renderHtml` minus fs.
Test `parity` compares it with `renderHtml(examples/offer.md)`: identical modulo font CSS and DOM-serialiser noise.
Redone in-repo (all small):
- `extends:` merge (`loadDocument`; ~60 lines incl. cycle check) — spike takes merged data.
- Frontmatter split (`---` regex) + YAML parse (`yaml` is already a narro dependency).
- Fonts: `fontFaceCss` reads files; browser uses `?url` woff2 + `unicode-range` (`fonts.ts`).
- Logo / body `<img>`: file → data URI (browser: `FileReader`/fetch).
- `pageCss`, `styleText`, `FONTS` (not exported by narro; copied, `PAGE_MARGIN` top 24mm).
- Template `css` and `resolveTemplate("offer"|"invoice")` work as-is (built-ins need no fs; custom path templates do).
- `loadAssets` user css, `renderRules` (negative invoice, discount, address lines) — only if wanted.

## 3. Print quality (Chromium `page.pdf`, 29-item offer)
3 × A4, `@page` margins from narro, DIN 5008 first-page letterhead/fold marks, running header on pages 2+,
footer (3 columns + "Seite n von N") on every page, table header repeated, totals/acceptance kept together,
Inter embedded. `window.print()` uses the same engine and CSS; user must disable the browser's
headers/footers and "fit to page" (cannot be forced); Safari/Firefox have weaker `@page` margin-box
support (footer/"Seite n von N" are margin boxes), so output there is NOT verified.

## 4. Verdict
See the session report.
