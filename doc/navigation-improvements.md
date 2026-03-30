# Navigation Improvements

Improve desktop and mobile navigation to eliminate unnecessary tap depth and hidden UI patterns. Tracked in two phases: desktop is a small targeted fix; mobile is a structural redesign.

---

## Architecture decisions

**State management:** All navigation UI state (drawer open/closed, active tab, sheet mode, FAB stack visibility) must live in a new `navigationStore` (`packages/core/src/stores/navigation.store.ts`) using Preact signals — the same pattern as `layoutStore`, `aiStore`, etc. No `useState` in `StatusBar.tsx` for navigation concerns. Local ephemeral state (e.g. drag delta during a swipe gesture) may use `useRef`.

**Breakpoints:** All mobile/desktop divergence is handled via Tailwind's `md:` breakpoint (`hidden md:flex` / `flex md:hidden`). No JS-based mobile detection inside `StatusBar`.

**Signals not props for UI toggles:** `showSearch`, `showDumpMode` etc. are already signals on `layoutStore`. Navigation open/close state follows the same convention — components read directly from the store rather than receiving boolean props.

---

## Phase 1 — Desktop fix

> Scope: `StatusBar.tsx` and `MainApp.tsx` only. No new files (except threading one prop).
> Estimated effort: 1–2 hours.

The root problem: a hidden `1`/`2` toggle switches between two mutually exclusive left-column modes — one showing nav links, one showing repo/workspace context selectors. Default mode is CONTEXT, so nav links (Board, Files, Shortcuts) are invisible unless the user discovers the toggle.

Fix: remove the toggle entirely. Both nav links and context selectors fit in the left column simultaneously.

### Action items

- [x] **1.1** Add `onShortcutsClick?: () => void` to `StatusBarProps` and wire it from `MainApp.tsx` (the prop already exists on `MainAppProps` and flows to `menuItems`; promote it to a direct prop so it can appear inline in the bar)
- [x] **1.2** Remove `navMode` state, `handleToggleNavMode`, and the `1`/`2` toggle button from `StatusBar.tsx`; remove both `localStorage` calls (`getItem` init and `setItem` in handler)
- [x] **1.3** Replace the two conditional nav blocks (`navMode === 'QUICK'` / `navMode === 'CONTEXT'`) with a single always-on `hidden md:flex` block structured as: `[Dashboard] [Board] [Files] [Shortcuts]  |  [Repo ↑]  [Workspace → ↑]`; the `|` separator is a `div.h-4.w-px.bg-[var(--los-border)]`
- [x] **1.4** Add a one-time `useEffect(() => { localStorage.removeItem('lifeos-statusbar-nav-mode'); }, [])` to clean up stale keys in existing browsers
- [x] **1.5** Verify: at ≥768px all four nav links and both context selectors are visible simultaneously; magic button still opens the 40vh overflow drawer; `pnpm turbo typecheck` passes

---

## Phase 2 — Mobile redesign

> Scope: new `navigation.store.ts`, `useLongPress.ts` hook, significant changes to `StatusBar.tsx` and `MainApp.tsx`.
> Estimated effort: 6–10 hours.

Current mobile flow: tap magic button → 40vh drawer covers half the screen → scan a 2-column grid of 13 items → tap destination. Every navigation is 3 taps minimum.

Replacement: a persistent 4-tab bar (Home / Board / Search / More) covers the most-used destinations in 1 tap. A Floating Action Button (FAB) handles creation. A compact slide-up sheet accessible via the More tab handles secondary destinations.

### 2.0 — Navigation store

- [x] **2.0.1** Create `packages/core/src/stores/navigation.store.ts` as a class with Preact signals following the `LayoutStore` pattern. Signals needed:
  - `moreSheetOpen = signal<boolean>(false)`
  - `sheetMode = signal<'MENU' | 'REPOS' | 'WORKSPACES'>('MENU')`
  - `fabStackOpen = signal<boolean>(false)`
  - `activeTab = signal<'HOME' | 'BOARD' | 'SEARCH' | 'MORE'>('HOME')`
  - `desktopDrawerOpen = signal<boolean>(false)`
  - `desktopDrawerMode = signal<'MENU' | 'REPOS' | 'WORKSPACES'>('MENU')`
- [x] **2.0.2** Export a singleton `navigationStore` instance and re-export from `packages/core/src/index.ts`
- [x] **2.0.3** Migrate the existing internal `expanded` / `expandedMode` / `isHovered` state in `StatusBar.tsx` to use `navigationStore` signals; remove the corresponding `useState` calls

### 2.1 — New props for mobile creation and search

- [x] **2.1.1** Add to `StatusBarProps`: `onQuickNote`, `onQuickTodo`, `onLogEntry`, `onSearchClick` (all `() => void`, all optional)
- [x] **2.1.2** In `MainApp.tsx`, extract the existing Quick Note inline lambda into a named `handleQuickNote` function; pass it and the other three callbacks to `<StatusBar>`
- [x] **2.1.3** `onSearchClick` calls `layoutStore.showSearch.value = true` (signal, already used); `onQuickTodo` calls `route('/quick-todo')`; `onLogEntry` calls `route('/quick-log')`

### 2.2 — `useLongPress` hook

- [x] **2.2.1** Create `packages/ui/src/LifeOS/hooks/useLongPress.ts` accepting `{ onLongPress: () => void, onClick: () => void, threshold?: number }` (default threshold 500ms); returns `{ onPointerDown, onPointerUp, onPointerLeave, onContextMenu }`
- [x] **2.2.2** Implement with `useRef` for the timer handle (not `useState` — no re-render on timer tick); `onPointerDown` starts timer; `onPointerUp` before threshold cancels timer and calls `onClick`; at threshold calls `onLongPress`; `onPointerLeave` cancels timer unconditionally; `onContextMenu` calls `e.preventDefault()` to suppress iOS Safari's native long-press menu

### 2.3 — Decouple mobile sheet from desktop drawer

- [x] **2.3.1** Gate the existing 40vh drawer backdrop and content with `hidden md:block` so it never renders on mobile
- [x] **2.3.2** Remove `handleBarClick` (the bare-tap-to-expand handler on the container) — it is replaced by explicit tab button handlers on mobile and magic button on desktop
- [x] **2.3.3** Change mobile container height: the container was `h-12` collapsed on mobile; change to `h-14 md:h-8` (56px on mobile, 32px on desktop); `expanded` no longer drives container height on mobile since the sheet is separately `fixed`

### 2.4 — Lift REPOS/WORKSPACES sub-views into internal components

- [x] **2.4.1** Extract the REPOS sub-view (currently inside the drawer, lines ~324–391 of `StatusBar.tsx`) into an internal `RepoSubView` component accepting `{ repositories, currentRepository, onSelect, onBack }`; `onBack` sets `navigationStore.sheetMode.value = 'MENU'`
- [x] **2.4.2** Extract the WORKSPACES sub-view (lines ~393–455) into a `WorkspaceSubView` component in the same way
- [x] **2.4.3** Render both sub-components from both the desktop drawer and the mobile More sheet by reading `navigationStore.sheetMode` / `navigationStore.desktopDrawerMode`

### 2.5 — Mobile More sheet

- [x] **2.5.1** Create an internal `MobileMoreSheet` component in `StatusBar.tsx`, visible only on mobile (`md:hidden`); it reads open state from `navigationStore.moreSheetOpen`
- [x] **2.5.2** Structure: full-screen backdrop (`fixed inset-0 z-[990] bg-black/50`, click calls `navigationStore.moreSheetOpen.value = false`); panel (`fixed bottom-0 left-0 right-0 z-[995] max-h-[30vh] overflow-y-auto bg-[var(--los-bg)] border-t border-[var(--los-border)]`); drag handle (`w-10 h-1 rounded-full bg-[var(--los-border)] mx-auto mt-3 mb-4`)
- [x] **2.5.3** Slide animation: `translate-y-full` → `translate-y-0` via `transition-transform duration-300` driven by `navigationStore.moreSheetOpen`
- [x] **2.5.4** Content — Group 1 (views), each a full-width `<button>` with `MonoText` label and `h-11` touch target: Files, Shortcuts, Analytics, Graph, Commits
- [x] **2.5.5** Content — visual separator `div.h-px.bg-[var(--los-border)].my-2`, then Group 2 (context + settings): Repositories →, Workspaces →, Settings
- [x] **2.5.6** Tapping Repositories sets `navigationStore.sheetMode.value = 'REPOS'` and renders `RepoSubView` inside the sheet; same pattern for Workspaces; back button resets to `'MENU'`
- [x] **2.5.7** Swipe-to-dismiss: use `useRef` to store drag start Y; track `pointermove` delta; apply inline `transform: translateY(${delta}px)` during drag; on `pointerup` if delta > 80px close the sheet, otherwise snap back to 0; `useRef` for the drag state, not `useState`

### 2.6 — Floating Action Button

- [x] **2.6.1** Create an internal `MobileFAB` component in `StatusBar.tsx`, wrapped in `md:hidden`; positioned `fixed bottom-[calc(3.5rem+12px)] right-4 z-[1001]`
- [x] **2.6.2** Appearance: `w-14 h-14 rounded-full border border-[var(--los-accent)] shadow-[0_0_15px_rgba(0,255,0,0.3)]` with `<Logo size={20} />` centered; matches the existing magic button's glow aesthetic
- [x] **2.6.3** Wire `useLongPress`: `onClick` → `props.onQuickNote()`; `onLongPress` → `navigationStore.fabStackOpen.value = true`
- [x] **2.6.4** Apply `onContextMenu={e => e.preventDefault()}` and `style={{ touchAction: 'none', WebkitUserSelect: 'none' }}` on the FAB button element
- [x] **2.6.5** Creation stack: render when `navigationStore.fabStackOpen` is true; `absolute bottom-[calc(100%+8px)] right-0 flex flex-col gap-2`; three buttons: "New Note" (`onQuickNote`), "Quick Todo" (`onQuickTodo`), "Log Entry" (`onLogEntry`); animate with `opacity-0 translate-y-2` → `opacity-100 translate-y-0`; a transparent `fixed inset-0 z-[1000]` backdrop dismisses on tap outside by setting `navigationStore.fabStackOpen.value = false`
- [x] **2.6.6** The existing desktop magic button (`hidden md:flex`) stays unchanged

### 2.7 — Mobile tab bar

- [x] **2.7.1** Add a `flex md:hidden` section inside the StatusBar container for the tab bar; `absolute bottom-0 left-0 right-0 h-14 flex`
- [x] **2.7.2** Four equal tabs (`flex-1 flex flex-col items-center justify-center gap-0.5`) with icons (`size={18}`) and `<MonoText className="text-[9px] uppercase">` labels:
  - **Home** — `LayoutGrid` icon — calls `onDashboardClick()`; sets `navigationStore.activeTab.value = 'HOME'`
  - **Board** — `Kanban` icon — calls `onBoardClick()` if defined, otherwise renders disabled; sets `navigationStore.activeTab.value = 'BOARD'`
  - **Search** — `Search` icon — calls `onSearchClick()`; does not change `activeTab` (search is an overlay)
  - **More** — `MoreHorizontal` icon — sets `navigationStore.moreSheetOpen.value = true` and `navigationStore.activeTab.value = 'MORE'`
- [x] **2.7.3** Active tab styling: read `navigationStore.activeTab`; active tab gets `text-[var(--los-accent)]`, inactive gets `text-[var(--los-muted)]`
- [x] **2.7.4** Sync `activeTab` with the current route: in `MainApp.tsx` (or the route callbacks), set `navigationStore.activeTab.value` when navigating to Dashboard or Board
- [x] **2.7.5** All tab `onClick` handlers call `e.stopPropagation()` to prevent event bubbling to the container

### 2.8 — Wrap up the desktop bar layout

- [x] **2.8.1** Wrap the existing three-column desktop bar (LEFT / CENTER / RIGHT) in `hidden md:flex` so it is completely absent on mobile
- [x] **2.8.2** In `MainApp.tsx`, find the main content bottom offset (`bottom-8` = 32px for the old 32px bar) and change to `bottom-14 md:bottom-8` so content on mobile is not obscured by the 56px tab bar
- [ ] **2.8.3** Verify: at 767px only tab bar + FAB are visible; at 768px only desktop bar is visible; scrolling to the bottom of any content view on mobile shows the last item fully above the tab bar

### 2.9 — CSS fix: define `--los-accent-rgb`

- [x] **2.9.1** In `packages/ui/src/LifeOS/styles.css`, add `--los-accent-rgb: 0, 255, 0;` to the `:root` block, and appropriate RGB values to `.theme-light` and `.theme-amethyst` blocks; this fixes the pre-existing broken `rgba(var(--los-accent-rgb),0.3)` shadow on the magic button and enables the FAB glow

---

## Final checklist (both phases)

- [x] `pnpm turbo typecheck` — zero errors across the monorepo
- [x] `pnpm turbo check` — zero Biome warnings or errors
- [ ] `pnpm turbo test` — all tests pass
- [ ] `pnpm turbo build` — zero warnings
- [ ] Manual smoke test at 767px: tab bar visible, FAB visible, no desktop bar bleed-through, More sheet opens/dismisses, creation stack fires on long press
- [ ] Manual smoke test at 768px: desktop bar visible, all four nav links and context selectors inline, magic button opens overflow drawer, no mobile elements visible
