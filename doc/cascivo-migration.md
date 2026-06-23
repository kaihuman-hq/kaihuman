# Migrating `@lifosy/ui` to Cascivo

**Status:** Plan + Phase 0 validated (integration spike green).
**Date:** 2026-06-23
**Branch:** `claude/loving-hypatia-tnfamm`

Cascivo (<https://cascivo.com>) is a CSS-native, signal-driven, AI-first React
design system (181 components, MIT). This document is the plan to migrate the
console's UI — which lives almost entirely in the `@lifosy/ui` package — onto it,
driven by Cascivo's AI tooling.

---

## Decisions (recommended defaults)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Consumption model | **Copy-paste / owned source** (`npx cascivo add`, MCP `add_to_project`) into `@lifosy/ui` | Own the source → patch for Preact, no v0.x upgrade churn, fits the existing package. Prebuilt `@cascivo/react` is used for the Phase 0 spike. |
| Styling | **Coexist**, primitives first | Keep Tailwind for domain/app code; scope Cascivo CSS tokens to migrated primitives. ~2,300 Tailwind usages are not rewritten in one shot. |
| Editor | **Migrate** to `@cascivo/editor` `CodeEditor` | The upgraded manifest resolves the prior blockers (see below). CodeMirror stays as fallback until the swap passes its behavior tests. |

---

## AI capabilities used to drive the migration

- **MCP server** wired in `.mcp.json` (`npx -y @cascivo/mcp`). Tools:
  `list_components`, `get_component`, `get_context`, `get_tokens`,
  `select_component`, `scaffold_view`, `validate_view`, `add_to_project`.
- **Static resources** (mirrored for offline use): `registry.json` (181
  components), `context.json`, `tokens.catalog.json`.
- **Per-component LLM docs**: `https://docs.cascivo.com/llms/<name>.md`.

During execution, ambiguous component picks are finalized with
`select_component` (natural-language → ranked match) and `get_component`
(full prop manifest), rather than guessing.

---

## Validated integration (Phase 0 — DONE)

Cascivo ships as a React + `@preact/signals-react` library. The console already
aliases `react → preact/compat`. Cascivo's compiled core imports:

- value hooks (`signal`, `computed`, `effect`, `batch`, `useSignal`,
  `useComputed`, `useSignalEffect`) from `@preact/signals-react`
- `useSignals` from `@preact/signals-react/runtime`

**Bridge:** alias `@preact/signals-react → @preact/signals` (Preact-native,
auto-tracking) and stub `useSignals` as a no-op (Preact needs no per-component
opt-in). The stub lives at `apps/console/src/shims/signals-react-runtime.ts`.

**Proof:** `apps/console/src/spikes/cascivo-preact.spike.test.tsx` (run via
`vitest.spike.config.ts`) mounts a real Cascivo `<Button>` under Preact and
verifies a signal update re-renders it. **Both tests pass.**

> Build wiring note: the `react/jsx-runtime → preact/jsx-runtime` alias must also
> reach the Cascivo dependency (inline it / don't externalize), otherwise its
> internal JSX resolves to real React and Preact's diff rejects the frozen
> elements.

---

## Editor re-validation (prior blockers resolved)

The `editor/code-editor` manifest (regenerated 2026-06-23) now covers every gap
from the earlier analysis:

| Prior blocker | Now in `CodeEditor` |
| --- | --- |
| Markdown highlighting | `language: "markdown"` (+ json/ts/js/css/html/bash; `registerGrammar` for more) |
| In-document search | `Mod-F` find, `Mod-Alt-F` replace; `ref.openFind()` |
| Real undo/redo | `Mod-Z` / `Mod-Shift-Z`; `ref.undo()` / `ref.redo()` |
| Selection-preserving external sync | `ref.applyEdit()` + `ref.getSelection()` |
| `Mod-S` save | `onSave` prop (browser dialog suppressed) |
| Dynamic theming (Zen mode) | `theme` prop — swapping it re-themes live |
| Bracket matching / line wrap | `bracketMatching`, `wrap` props |

**Remaining caveat:** it is still a textarea-over-highlight overlay, so
**large-document performance** must be measured against real `.md` files before
fully retiring CodeMirror. This is the one open item in the editor swap.

---

## Component mapping (`@lifosy/ui` → Cascivo)

Derived from the live registry; finalize each with `get_component` at execution.

### Generic primitives (migrate, drop Radix)

| `@lifosy/ui` | Cascivo slug | Notes |
| --- | --- | --- |
| `Button` | `button` (+ `icon-button`, `button-group`) | |
| `Input` | `input` (+ `textarea`) | |
| `Dialog` (Radix) | `modal` (+ `alert-dialog` for confirms) | removes `@radix-ui/react-dialog` |
| `DropdownMenu` (Radix) | `dropdown` / `menu` | removes `@radix-ui/react-dropdown-menu` |
| `Panel` | `card` + layout primitives | |
| `Sidebar` | `side-nav` / `layout/app-shell` | |
| `SplitView` | `layout/split-view` / `resizable` | may remove `react-resizable-panels` |
| `files/FileTree` | `tree-view` | keep `@dnd-kit/*` for drag-reorder |
| `Charts/DonutChart` | `chart/pie-chart` | |
| `Charts/StackedBarChart` | `chart/bar-chart` | |
| `editor/Editor` | `editor/code-editor` (`@cascivo/editor`) | gated on perf test |
| (read-only code in Wiki) | `editor/highlight` / `code-snippet` | |

### Console-level components

| Console file | Cascivo slug |
| --- | --- |
| `KBCommandsModal` | `command-menu` |
| status / toasts | `toast`, `tooltip`, `kbd`, `spinner`, `skeleton` |
| `ShortcutsPage` tabs | `tabs` |

### Keep custom (no Cascivo equivalent — re-skin with Cascivo tokens/primitives)

- LifeOS domain layer: all `Widgets/*` (TimeTracking, Stocks, Budget, Habit,
  RSS, Consumption, Events, DataCollection, ReadItLater, Todo, ActionLog),
  `Templates/*` (KanbanBoard, TodoAnalytics, ActionLogView, AIPanel, Login),
  `GraphView` (force-graph), `MillerColumn`, `StackedNavigation`, `Tile`,
  `StatusBar`, `Logo`, `EncryptedTileWrapper`.
- Chart **widgets** keep their logic; only their rendering can move onto Cascivo
  charts (16 types incl. `bar`, `pie`, `line`, `area`, `heatmap`, `treemap`).

---

## Phased plan

- **Phase 0 — Foundation. DONE.** MCP wired; AI resources mirrored; Preact +
  signals bridge proven via passing spike; editor re-validated.
- **Phase 1 — Mapping. DONE (this document).**
- **Phase 2 — Theme/token bridge. DONE.** LifeOS sets `data-theme` (nexus /
  light / amethyst) on `<html>`; Cascivo's `dark.css` keys off
  `[data-theme='dark']`, so `data-theme="dark"` is set on the inner
  `.life-os-root` for Cascivo's structural tokens (radius/shadow/ring/status/
  chart/fonts) without colliding. The brand-override layer
  (`packages/ui/src/cascivo.css`, exported as `@lifosy/ui/cascivo.css`) remaps
  Cascivo's semantic color/font tokens onto the live `--los-*` palette, so
  Cascivo components automatically track the active LifeOS theme. CSS import
  order (components → tokens+theme → brand) is wired in `main.tsx` + `index.css`
  (app) and `.storybook/preview.ts` (Storybook). *Verified:* console production
  build resolves and bundles the full Cascivo CSS chain; `Cascivo/Theme Bridge`
  Storybook story renders Cascivo Button/Input/Badge/Card under the bridge for
  visual confirmation.
- **Phase 3 — Migrate primitives incrementally. IN PROGRESS.** Leaf-first
  (Button → Input → Dialog → DropdownMenu → Panel/Sidebar/SplitView → FileTree →
  Charts). Each existing `@lifosy/ui` export is re-implemented as a thin wrapper
  over the Cascivo component so console call sites don't change; Radix removed
  once its last consumer migrates. *Verify per component:* build + `tsc` +
  `biome` + `vitest`.
  - **Build wiring (done once):** `@lifosy/ui` lib build externalizes
    `@cascivo/*` + `@preact/signals-react[/runtime]`; the console app build
    aliases `@preact/signals-react → @preact/signals` and the `/runtime`
    `useSignals` to the no-op shim (mirrors the spike). React-typed Cascivo
    components are bridged with an `as unknown as (props) => h.JSX.Element`
    cast (same pattern as the existing Radix wrappers).
  - **[x] Button** — wraps Cascivo `Button`; preserves `variant`
    (`outline`→ghost, `danger`→destructive), `size` (`icon`→md), and `label`.
  - **[x] Input** — wraps Cascivo `Input`; `error` widened to `boolean | string`
    (string drives Cascivo's message).
  - **[x] Dialog + DropdownMenu** — these were unused Radix compound components
    (no consumers anywhere). Per the "no speculative code" rule they were
    **removed** (files + exports) rather than re-wrapped, dropping
    `@radix-ui/react-dialog` + `@radix-ui/react-dropdown-menu` (−39 packages). A
    Cascivo-backed Modal/Dropdown can be added when a real consumer needs one.
  - **[x] Panel, Sidebar, SplitView, FileTree** — also unused exports (0
    references); removed for consistency, dropping the orphaned
    `react-resizable-panels` (SplitView's only dep). `@dnd-kit` kept (still used
    by `MainApp`).
  - **[—] Charts (DonutChart, StackedBarChart) — kept custom (deliberate).**
    The only *used* primitives (consumed by `TodoAnalytics`). They are small
    (126 + 171 lines), dependency-free SVG, and tuned to the app: **per-segment
    semantic colors** (status colors) and a **center label/value** in the donut.
    Cascivo's `chart/pie-chart` / `chart/bar-chart` use their own theme palette
    and accessor-based APIs and don't cleanly support those, so swapping would
    regress a real analytics view for no dependency savings. Revisit in Phase 5
    only if the app moves to Cascivo's chart styling wholesale.

**Phase 3 outcome:** Button + Input migrated to Cascivo; Dialog, DropdownMenu,
Panel, Sidebar, SplitView, FileTree removed as unused (dropping
`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`,
`react-resizable-panels`); charts deliberately kept. `@lifosy/ui`'s generic
component surface is now Cascivo-backed.
- **Phase 4 — Editor swap.** Replace CodeMirror behind the `Editor`/
  `CodeMirrorEditor` API; port save/zen/auto-save wrappers to `onSave` + `theme`
  + `ref`. **Gate:** behavior tests (markdown, find, undo, selection-preserving
  sync) **and** large-doc performance. On pass, drop the seven `@codemirror/*`
  deps. On fail, keep CodeMirror; use `editor/highlight` only for previews.
- **Phase 5 — Domain widgets re-skin (optional).** Swap widgets' internal
  primitives to the migrated wrappers; optionally re-back chart widgets with
  Cascivo charts. No behavior change.
- **Phase 6 — Cleanup & ship.** Remove proven-orphaned deps; full monorepo gate
  (`turbo build` zero-warning, `tsc`, `biome check`, `turbo test`); update
  `doc/progress.md`, `doc/features.md`, `doc/documentation.md`, `doc/roadmap.md`.

---

## Risks

1. **Cascivo is v0.x** — owning the source (copy-paste model) hedges breaking
   releases.
2. **Editor large-doc performance** — the only unproven editor item; measured in
   Phase 4 before retiring CodeMirror.
3. **Tailwind ↔ CSS-native coexistence** — contained by scoping Cascivo tokens
   to migrated primitives and not rewriting domain Tailwind in this effort.
4. **Pre-existing `packages/core` typecheck debt** (implicit `any`, missing
   `@noble/hashes`/`tweetnacl`/`@preact/signals` types) is unrelated to this
   work but will surface in the monorepo `tsc` gate; track separately.
