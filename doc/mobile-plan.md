# Mobile App (iOS & Android): Implementation Plan

> **For autonomous agentic workers (Antigravity IDE / `/goal` / `/teamwork`):**
> Execute this plan phase-by-phase. The main agent acts as an **Orchestrator** and delegates each Phase (or Task) to a fresh subagent (`invoke_subagent` with `TypeName: "self"`) so every phase starts with an empty context window. Do not ask the user questions—make the cleanest architectural choice aligned with `doc/mobile.md` and `CLAUDE.md`.

**Goal:** Build `@kaihuman/mobile` (`apps/mobile`) using Expo + React Native with full console feature parity and interactive iOS (SwiftUI WidgetKit + AppIntents) and Android (Jetpack Glance) Todo widgets.

**Spec:** [`doc/mobile.md`](./mobile.md)

## Global Constraints

- **ESM & Imports:** Node/TS packages use `"type": "module"`, `.js` extensions in relative imports, and `node:` built-ins where applicable.
- **No Regression in Console or Existing Apps:** `pnpm run build`, `pnpm run check`, and `pnpm -r test` must pass with zero Biome warnings and zero type errors at the end of every phase.
- **Dependency Hygiene:** Keep dependencies minimal and pure-JS/testable under Vitest on Linux so the entire business logic, screen models, widget snapshot builders, and native source generators are verified in CI without requiring macOS for unit tests.
- **Documentation Updates:** Every phase updates `doc/progress.md` with a dated entry at the top and ticks `[x]` on completed checkboxes in this file and `doc/roadmap.md`.

---

## Phase 1: Core Storage Abstraction, Widget Sync Engine & Mobile OAuth

**Objective:** Decouple `@kaihuman/core` from browser-only `idb`/`localStorage` globals while keeping web behavior 100% backwards-compatible, add the shared `widget-sync.ts` Todo snapshot & mutation reconciliation engine in `@kaihuman/core`, and add mobile deep-link callback support to `apps/auth-worker`.

### Task 1.1: Pluggable `CoreStorageAdapter` in `@kaihuman/core`
**Files:**
- Create: `packages/core/src/storage/adapter.ts`
- Create: `packages/core/src/storage/memory-adapter.ts`
- Create: `packages/core/src/storage/web-adapter.ts`
- Create: `packages/core/src/storage/storage.test.ts`
- Modify: `packages/core/src/db.ts`, `packages/core/src/stores/auth.store.ts`, `packages/core/src/stores/github-file.store.ts`, `packages/core/src/stores/github-profile.store.ts`, `packages/core/src/stores/password.store.ts`, `packages/core/src/index.ts`
- Modify: `packages/core/package.json` (add `"test": "vitest run"` script)

**Steps:**
- [x] Define `CoreStorageAdapter`, `CachedFileRecord`, and `PendingMutation` in `packages/core/src/storage/adapter.ts`, plus `getCoreStorage()` and `configureCoreStorage(adapter)`.
- [x] Implement `InMemoryStorageAdapter` (`memory-adapter.ts`) and `WebStorageAdapter` (`web-adapter.ts`) which uses `idb` + `localStorage` when available in the browser and falls back to `InMemoryStorageAdapter` when `indexedDB` or `localStorage` is undefined (such as React Native or Node).
- [x] Guard direct `window` / `localStorage` / `document` references in `auth.store.ts`, `github-profile.store.ts`, `github-file.store.ts`, and `password.store.ts` so `@kaihuman/core` imports cleanly in non-DOM runtimes (React Native & Node) and supports `authStore.handleCallbackUrl(url: string)` in addition to `window.location.search`.
- [x] Add an offline mutation queue (`enqueueOfflineSave`, `flushOfflineMutations`) to `githubFileStore` backed by `CoreStorageAdapter`.
- [x] Write unit tests in `packages/core/src/storage/storage.test.ts` covering custom adapter injection, auth token persistence, `handleCallbackUrl('kaihuman://auth/callback?access_token=gho_test')`, and offline mutation queuing/flushing.

### Task 1.2: Shared Widget Todo Snapshot & Toggle Reconciliation in `@kaihuman/core`
**Files:**
- Create: `packages/core/src/widget-sync.ts`
- Create: `packages/core/src/widget-sync.test.ts`
- Modify: `packages/core/src/index.ts`

**Steps:**
- [x] Implement `buildWidgetTodoSnapshot(files: Record<string, { content: string; sha: string }>, repoFullName: string, branch?: string): WidgetTodoSnapshot` in `packages/core/src/widget-sync.ts`.
  - Parses all `.todos.md` files under `.kh/` (or `.lifeos/`), prioritizing `.kh/inbox.todos.md` and `in-progress` items, computing `counts` (`inbox`, `inProgress`, `backlog`, `doneToday`), and extracting `upcomingMilestone` via `getUpcomingMilestone`.
- [x] Implement `applyWidgetTodoToggle(snapshot: WidgetTodoSnapshot, itemId: string, now?: Date): { snapshot: WidgetTodoSnapshot; updatedFilePath: string; updatedContent: string; baseSha: string } | null` so both the JS bridge and tests share the exact mutation logic that the Swift/Kotlin widget intents execute.
- [x] Write unit tests in `packages/core/src/widget-sync.test.ts` verifying snapshot prioritization, milestone extraction, and toggling an item from `backlog` / `in-progress` to `done` with `::updated::` metadata.

### Task 1.3: Mobile OAuth Redirect in `apps/auth-worker`
**Files:**
- Modify: `apps/auth-worker/src/index.ts`
- Modify: `apps/auth-worker/src/index.test.ts`

**Steps:**
- [x] Update `/login` in `apps/auth-worker/src/index.ts` to check `url.searchParams.get('client') === 'mobile'`. Encode a `:mobile` suffix on the state token (or cookie) so `/callback` knows whether to redirect to `env.APP_URL` or `kaihuman://auth/callback`.
- [x] Verify existing tests pass and add tests for `/login?client=mobile` and `/callback` redirecting to `kaihuman://auth/callback?access_token=gho_token`.

---

## Phase 2: Mobile App Workspace, Core Adapters & Navigation Shell (`apps/mobile`)

**Objective:** Create `apps/mobile` (`@kaihuman/mobile`) in the monorepo with TypeScript, Biome, Vitest, mobile storage & widget bridges, theme tokens matching Nexus/LifeOS, auth flow, and main navigation shell.

### Task 2.1: Scaffold `apps/mobile` and Monorepo Integration
**Files:**
- Create: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/app.json`
- Create: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/adapters/mobile-storage.ts`
- Create: `apps/mobile/src/adapters/widget-bridge.ts`
- Create: `apps/mobile/src/adapters/mobile-adapters.test.ts`

**Steps:**
- [x] Configure `apps/mobile` workspace package `@kaihuman/mobile` depending on `@kaihuman/core` and `@kaihuman/formats`, with `build`, `lint`, `format`, `fix`, `check-types`, and `test` scripts compatible with Turborepo and CI.
- [x] Implement `MobileStorageAdapter` (`src/adapters/mobile-storage.ts`) with pluggable native drivers (SecureStore for auth tokens, SQLite/KV for files & trees, and App Group / SharedPreferences mirror) that gracefully runs in-memory during headless/Vitest tests.
- [x] Implement `WidgetBridge` (`src/adapters/widget-bridge.ts`) that subscribes to `githubFileStore.openFiles` / `githubProfileStore.currentRepo`, writes `WidgetTodoSnapshot` to the shared native container (`group.com.kaihuman.app/widget-todos.json`), reconciles any `pending-widget-mutations.json` written by the native iOS/Android widget while the app was backgrounded, and triggers `reloadAllTimelines()`.
- [x] Write unit tests in `src/adapters/mobile-adapters.test.ts` testing end-to-end sync between `githubFileStore`, `MobileStorageAdapter`, and `WidgetBridge` (including replaying a widget toggle back into `githubFileStore`).

### Task 2.2: Mobile View-Models, Router & Auth / Repo Selection Controllers
**Files:**
- Create: `apps/mobile/src/navigation/routes.ts`
- Create: `apps/mobile/src/screens/login-screen.ts`
- Create: `apps/mobile/src/screens/repo-selector-screen.ts`
- Create: `apps/mobile/src/screens/navigation.test.ts`

**Steps:**
- [x] Define all deep-link routes (`kaihuman://auth/callback`, `kaihuman://quick-todo`, `kaihuman://quick-note`, `kaihuman://quick-log`, `kaihuman://quick-idea`, `kaihuman://quick-knowledge`, `kaihuman://board`, `kaihuman://files/...`) and URL parser in `src/navigation/routes.ts`.
- [x] Implement `LoginScreenController` (OAuth login URL builder with `?client=mobile`, deep-link callback handler, PAT sign-in, and one-tap Demo Mode via `demoStore.enterDemoMode()`) and `RepoSelectorController`.
- [x] Write unit tests in `src/screens/navigation.test.ts` verifying deep-link parsing, OAuth callback handling, Demo Mode initialization, and repository switching.

---

## Phase 3: Native Screens & Widget Tile Renderers (Full Console Parity)

**Objective:** Implement all console features and widget tiles in `apps/mobile`: Dashboard tiles, Kanban Board, Quick Captures (Todo, Note, Log, Idea, Knowledge), Ideas overview, Wiki, Knowledge Base, Action Log, Todo Analytics, and File Browser/Editor with `.enc` decryption.

### Task 3.1: Quick Capture Suite & Kanban Board
**Files:**
- Create: `apps/mobile/src/screens/quick-capture.ts`
- Create: `apps/mobile/src/screens/kanban-board.ts`
- Create: `apps/mobile/src/screens/todo-analytics.ts`
- Create: `apps/mobile/src/screens/todos-and-capture.test.ts`

**Steps:**
- [x] Implement unified Quick Capture controllers (`quickTodo`, `quickNote`, `quickLog`, `quickIdea` including `kh-idea` handoff blocks, and `quickKnowledge` to `.kh/raw/`) using `@kaihuman/formats` and `githubFileStore`.
- [x] Implement `KanbanBoardController` supporting multi-file `.todos.md` aggregation (always including `.kh/inbox.todos.md`), status transitions (`backlog` / `in-progress` / `done` / `rejected`), tag & milestone filtering, moving a todo between files, and milestone CRUD.
- [x] Implement `TodoAnalyticsController` computing completion velocity, tag distribution, and milestone progress.
- [x] Write comprehensive tests in `src/screens/todos-and-capture.test.ts`.

### Task 3.2: Dashboard Tiles & LifeOS Widget Suite
**Files:**
- Create: `apps/mobile/src/components/widgets/tile-controllers.ts`
- Create: `apps/mobile/src/components/widgets/tile-controllers.test.ts`

**Steps:**
- [x] Implement native mobile controllers/presenters for every dashboard widget extension supported by the console:
  - `.todos.md` (visible todos, inline toggle, add task)
  - `.habit.csv` (streak computation, 7-day strip, today check-in toggle)
  - `.timetracking.csv` (active timer detection, elapsed seconds, clock in / clock out)
  - `.events.csv` (upcoming events & birthdays countdown, add event)
  - `.actionlog.md` (recent entries, tag filter, inline log append)
  - `.timezones.json` (world clocks with live offset calculation)
  - `.readitlater.json` (unread/read queue, mark read, clear all, add URL)
  - `.bookmarks.json` (search, tag filter, frecency/useCount sort, add/delete)
  - `.budget.csv`, `.stocks.csv`, `.consumption.csv`, `.data-collection.csv` (summary metrics & series data for charts)
  - `.prompts.md` & `.commands.md` (`{{param}}` interpolation & copy)
- [x] Write unit tests in `src/components/widgets/tile-controllers.test.ts` against the demo seed data (`buildDemoSeed()`).

### Task 3.3: Ideas, Wiki, Knowledge Base, File Browser & Encrypted (`.enc`) Files
**Files:**
- Create: `apps/mobile/src/screens/ideas-screen.ts`
- Create: `apps/mobile/src/screens/wiki-screen.ts`
- Create: `apps/mobile/src/screens/knowledge-screen.ts`
- Create: `apps/mobile/src/screens/file-editor-screen.ts`
- Create: `apps/mobile/src/screens/content-screens.test.ts`

**Steps:**
- [x] Implement `IdeasScreenController` (status chips, 12-week activity strip, hot/warm/cool/dormant levels, search/product/sort filters, inline log, challenge, and status mutations).
- [x] Implement `WikiScreenController` (`[[wikilink]]` resolution, backlinks computation, tag filter, `.kh/wiki/` page rendering) and `KnowledgeScreenController` (`.kh/raw/` inbox list, processed list, add raw note).
- [x] Implement `FileEditorController` (directory traversal, file creation/deletion/rename, markdown editing, and `.enc` decryption/encryption via `decryptContent`/`encryptContent` and `passwordStore` from `@kaihuman/core`).
- [x] Write unit tests in `src/screens/content-screens.test.ts`.

---

## Phase 4: Native iOS WidgetKit (SwiftUI + AppIntents) & Android Jetpack Glance Targets

**Objective:** Implement the native iOS WidgetKit extension (`targets/ios-widget/*.swift`), Android Jetpack Glance widget (`targets/android-widget/*.kt`), Expo Config Plugin (`plugins/with-kaihuman-widgets.ts`), and local notification scheduler for overdue milestones and events.

### Task 4.1: iOS WidgetKit + AppIntents Target (`targets/ios-widget/`)
**Files:**
- Create: `apps/mobile/targets/ios-widget/SharedTodoModels.swift`
- Create: `apps/mobile/targets/ios-widget/SharedTodoStore.swift`
- Create: `apps/mobile/targets/ios-widget/ToggleTodoIntent.swift`
- Create: `apps/mobile/targets/ios-widget/TodoWidgetViews.swift`
- Create: `apps/mobile/targets/ios-widget/KaihumanWidgets.swift`
- Create: `apps/mobile/targets/ios-widget/Info.plist`
- Create: `apps/mobile/targets/ios-widget/KaihumanWidgets.entitlements`

**Steps:**
- [x] Implement `SharedTodoModels.swift` matching `WidgetTodoSnapshot` and `WidgetTodoItem` (`Codable`).
- [x] Implement `SharedTodoStore.swift` reading/writing `group.com.kaihuman.app/widget-todos.json`, mutating `.todos.md` lines (`- [x]` / `- [>]` → `- [x]` + `::updated::`), queueing `pending-widget-mutations.json`, and pushing directly to GitHub's `PUT /repos/{owner}/{repo}/contents/{path}` endpoint using the Keychain/AppGroup token.
- [x] Implement `ToggleTodoIntent.swift` (`AppIntent` for iOS 17+ interactive widget buttons) and `QuickCaptureTodoIntent.swift`.
- [x] Implement `TodoWidgetViews.swift` and `KaihumanWidgets.swift` supporting `systemSmall`, `systemMedium`, `systemLarge`, `accessoryCircular`, and `accessoryRectangular` in Nexus dark theme (`#0A0A0F` background, `#00FF00` neon accent, monospaced font).

### Task 4.2: Android Jetpack Glance Target (`targets/android-widget/`) & Expo Config Plugin
**Files:**
- Create: `apps/mobile/targets/android-widget/TodoGlanceWidget.kt`
- Create: `apps/mobile/targets/android-widget/TodoWidgetReceiver.kt`
- Create: `apps/mobile/targets/android-widget/ToggleTodoAction.kt`
- Create: `apps/mobile/targets/android-widget/res/xml/todo_widget_info.xml`
- Create: `apps/mobile/plugins/with-kaihuman-widgets.ts`
- Create: `apps/mobile/src/notifications/milestone-reminders.ts`
- Create: `apps/mobile/src/targets.test.ts`

**Steps:**
- [x] Implement `TodoGlanceWidget.kt`, `TodoWidgetReceiver.kt`, and `ToggleTodoAction.kt` providing interactive Android home-screen Todo widgets with direct GitHub sync and offline mutation queueing.
- [x] Implement `with-kaihuman-widgets.ts` Expo Config Plugin wiring the iOS App Group entitlement (`group.com.kaihuman.app`), URL scheme (`kaihuman`), iOS WidgetKit extension target, and Android `TodoWidgetReceiver` manifest entries.
- [x] Implement `milestone-reminders.ts` computing local notification schedules from upcoming/overdue milestones in `.todos.md` and events in `.events.csv`.
- [x] Write verification tests in `apps/mobile/src/targets.test.ts` validating the config plugin transformations, Swift/Kotlin model parity with `WidgetTodoSnapshot`, and reminder scheduling.

---

## Phase 5: CI/CD Workflow, Documentation & Final Verification

**Objective:** Add the iOS/Android build workflow (`.github/workflows/mobile-build.yml`), update `doc/features.md`, `doc/roadmap.md`, `doc/progress.md`, and `README.md`, and run the full monorepo verification suite.

### Task 5.1: GitHub Actions Workflow & Repository Docs
**Files:**
- Create: `.github/workflows/mobile-build.yml`
- Modify: `doc/roadmap.md`, `doc/features.md`, `doc/progress.md`, `README.md`

**Steps:**
- [x] Create `.github/workflows/mobile-build.yml` (manual `workflow_dispatch` + changes under `apps/mobile/**`) with jobs for type-checking/testing on `ubuntu-latest`, Android debug APK build, and iOS Simulator + WidgetKit compilation check on `macos-latest`.
- [x] Update `doc/roadmap.md`, `doc/features.md`, `doc/progress.md`, and `README.md`.
- [x] Run `pnpm run fix`, `pnpm run build`, `pnpm run check`, and `pnpm -r test` across the entire monorepo and ensure zero warnings and 100% passing tests.


---

## Phase 6: React Native Views & Runnable Expo App

**Objective:** Turn `apps/mobile` from controllers-only into a runnable Expo app: add the Expo SDK, React Native and Expo Router runtime, an app entry and layout, thin `.tsx` views over every existing controller, the native glue the widgets expect (shared token, App Group files, `pending-url`), and a `crypto.subtle` polyfill so `.enc` files work on Hermes. Views stay thin; all logic stays in the existing controllers.

**Decisions:**
- **Expo SDK (latest stable) + Expo Router.** `routes.ts` already models URL-shaped deep links (`kaihuman://board`, `kaihuman://files/<path>`, `kaihuman://quick-<kind>`), which map 1:1 onto file-based routes (`app/board.tsx`, `app/files/[...path].tsx`, `app/quick-[kind].tsx`). `package.json` `main` becomes `expo-router/entry`; the controller barrel stays at `src/index.ts`.
- **Signals in React:** a small in-repo `useSignalValue` hook (`useSyncExternalStore` over `signal.subscribe`) instead of another signals adapter package.
- **Render tests:** Vitest + jsdom with `react-native` aliased to `react-native-web` and `@testing-library/react`. No native toolchain or Jest preset needed, so tests run in the existing Linux CI.
- **Native glue:** a local Expo module (`apps/mobile/modules/kaihuman-shared`, Swift + Kotlin) for the App Group container files, shared token copies and `pending-url`; `expo-secure-store` for the Keychain copy. Same keys the widget targets already read: `github-token`, Keychain service `com.kaihuman.app`, App Group `group.com.kaihuman.app` defaults, Android prefs `kaihuman_widget`.
- **Crypto:** a pure-JS `crypto.subtle` subset (PBKDF2-SHA256 → AES-GCM: `importKey`, `deriveKey`, `encrypt`, `decrypt`) on `@noble/hashes` + `@noble/ciphers`, installed only when `crypto.subtle` is missing; `getRandomValues` from `expo-crypto`.

### Task 6.1: Expo Runtime, Entry Point, App Layout & Render-Test Harness
**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/app.json`, root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (only if needed)
- Create: `apps/mobile/vitest.config.ts`, `apps/mobile/babel.config.js` / `metro.config.js` (only if needed for pnpm monorepo)
- Create: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`
- Create: `apps/mobile/src/views/use-signal.ts`, `apps/mobile/src/views/primitives.tsx` (themed `Screen`, `Title`, `Button`, `Field`, `Row` over `theme/tokens.ts`)
- Create: `apps/mobile/src/views/primitives.test.tsx`

**Steps:**
- [x] Add `expo`, `react`, `react-native`, `expo-router`, `expo-linking`, `expo-web-browser`, `react-native-safe-area-context`, `react-native-screens`, `expo-status-bar` (SDK-matched versions) to `apps/mobile` `dependencies`; `react-native-web`, `react-dom`, `@testing-library/react`, `@types/react` to root `devDependencies`.
- [x] Set `main` to `expo-router/entry`; configure `tsconfig.json` for `react-jsx`; root layout renders a stack, `index.tsx` redirects to login or dashboard from `authStore`.
- [x] Add `useSignalValue` and themed primitives; render tests prove the harness works.
- [x] Console and all other apps still build and test (no hoisting changes that break them); `expo export` smoke check run if it works offline.

### Task 6.2: Native Glue — Secure Token, App Group Bridge, `pending-url` & Crypto Polyfill
**Files:**
- Create: `apps/mobile/modules/kaihuman-shared/` (`expo-module.config.json`, `index.ts`, `ios/KaihumanSharedModule.swift`, `android/.../KaihumanSharedModule.kt`)
- Create: `apps/mobile/src/runtime/token-sync.ts`, `apps/mobile/src/runtime/native-container.ts`, `apps/mobile/src/runtime/pending-url.ts`, `apps/mobile/src/runtime/crypto-polyfill.ts`, `apps/mobile/src/runtime/bootstrap.ts`
- Create: `apps/mobile/src/runtime/runtime.test.ts`
- Modify: `apps/mobile/app/_layout.tsx` (call `bootstrap()`)

**Steps:**
- [x] Mirror `authStore.token` to SecureStore (`keychainService: com.kaihuman.app`, key `github-token`) and to App Group defaults / Android prefs `kaihuman_widget` via the module; clear all copies on sign-out.
- [x] `SharedContainer` implementation backed by the module (App Group directory on iOS, `kaihuman_widget` prefs on Android) feeding `WidgetBridge`.
- [x] On launch and on app foreground, consume `pending-url` and route it with `parseDeepLink`/`routeToUrl`; handle incoming `Linking` URLs (incl. `auth/callback`).
- [x] Pure-JS `crypto.subtle` subset, installed only when missing; tests prove `encrypt`/`decrypt` from `@kaihuman/core` round-trip with it and interoperate with Node WebCrypto.

### Task 6.3: Views — Login, Repo Selector, Quick Capture, Kanban, Todo Analytics
**Files:**
- Create: `apps/mobile/src/views/{login,repo-selector,quick-capture,kanban,todo-analytics}-view.tsx` + `views-core.test.tsx`
- Create: `apps/mobile/app/login.tsx`, `apps/mobile/app/repos.tsx`, `apps/mobile/app/quick-[kind].tsx`, `apps/mobile/app/board.tsx`, `apps/mobile/app/analytics.tsx`

**Steps:**
- [x] Each view takes its controller as a prop and only renders state and forwards events; route files construct controllers and pass them in.
- [x] Render tests cover main states and one user action per view (token sign-in, repo select, capture submit, status move, analytics totals).

### Task 6.4: Views — Dashboard Tiles, Ideas, Wiki, Knowledge, File Editor (incl. `.enc`)
**Files:**
- Create: `apps/mobile/src/views/{dashboard,tile,ideas,wiki,knowledge,file-editor}-view.tsx` + `views-content.test.tsx`
- Create: `apps/mobile/app/dashboard.tsx`, `apps/mobile/app/ideas.tsx`, `apps/mobile/app/wiki.tsx`, `apps/mobile/app/knowledge.tsx`, `apps/mobile/app/files/[...path].tsx`

**Steps:**
- [x] Dashboard renders each tile kind from `presentTile` with its actions; ideas, wiki (with wiki-link navigation), knowledge inbox and file browser/editor render their controllers, including the passphrase flow for `.enc` files.
- [x] Render tests cover each tile kind and each screen's main state and action.

### Task 6.5: Docs & Final Verification
**Files:**
- Modify: `doc/mobile-plan.md`, `doc/mobile.md`, `doc/roadmap.md`, `doc/features.md`, `doc/progress.md`, `README.md`

**Steps:**
- [x] Tick Phase 6 boxes, remove the "no React Native views" gap, add dated progress entry.
- [x] `npx turbo run build`, `npx turbo run lint check-types`, `pnpm -r test` pass for the whole repo.
