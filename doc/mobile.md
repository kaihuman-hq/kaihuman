# Mobile App (iOS & Android) — Design Specification

Date: 2026-11-01 · Status: approved for autonomous implementation

## 1. Goal

Build a native iOS and Android application (`apps/mobile`, `@kaihuman/mobile`) using **Expo + React Native** (Option B) with full functional parity with the web console (`apps/console`), native offline-first caching, and interactive home-screen / lock-screen **Todo Widgets** (iOS WidgetKit + AppIntents in SwiftUI, Android Jetpack Glance in Kotlin).

Everything stays 100% aligned with the core kaihuman architecture:
- Your GitHub repository is the single source of truth (`.kh/` folder, `.todos.md`, `.habit.csv`, `.timetracking.csv`, `.events.csv`, `.actionlog.md`, `.readitlater.json`, `.bookmarks.json`, `.timezones.json`, `.budget.csv`, `.stocks.csv`, `.consumption.csv`, `.data-collection.csv`, `.prompts.md`, `.commands.md`, `.kh/ideas/*.md`, `.kh/wiki/*.md`, `.kh/raw/*.md`, `.enc`).
- `@kaihuman/formats` and `@kaihuman/core` are shared directly from the monorepo without duplicating parser or GitHub API logic.
- Aesthetics match the Life OS / Nexus dark theme (`#0a0a0f` / `#000000` background, `#00ff00` neon green / `#00f0ff` cyan accents, `JetBrains Mono` monospace typography, crisp 1px `#2a2a35` / `#333333` borders).

---

## 2. Decisions & Architecture

| Topic | Decision |
|---|---|
| Framework | **Expo SDK 54+ (React Native + Expo Router)** in `apps/mobile` (`@kaihuman/mobile`). |
| State & Logic | Reuse `@kaihuman/formats` (100% as-is) and `@kaihuman/core` (`@preact/signals` + `Octokit`). |
| Storage Abstraction | Decouple `@kaihuman/core` from browser-only `idb` and `localStorage` via a pluggable `CoreStorageAdapter` (Web uses `idb` + `localStorage` by default so `apps/console` has zero breaking changes; Mobile injects `expo-sqlite` + `expo-secure-store`). |
| OAuth Sign-In | Extend `apps/auth-worker` (`/login?client=mobile` or `?redirect_uri=kaihuman://auth/callback`) to redirect back to `kaihuman://auth/callback?access_token=...` via `expo-web-browser` (`openAuthSessionAsync`). Also support Personal Access Token (PAT) entry and Demo Mode (`enterDemo`). |
| Offline Write Queue | Add a durable offline mutation queue in `@kaihuman/core` so Todo toggles, quick captures, and file edits made offline (or from the native widget) replay against GitHub when connectivity returns. |
| Rich Code/Widget Editor | Native React Native screens for all primary workflows; complex CodeMirror / force-graph views (`@cascivo/editor`, `react-force-graph-2d`) have an optional embedded WebView fallback (`react-native-webview`) where needed so 100% of console file types work on day one. |
| iOS Widgets | Native **SwiftUI WidgetKit + AppIntents** target (`ios-widgets/`) compiled via Expo Config Plugin (`@bacons/apple-targets` or custom config plugin). Shares data via iOS App Group `group.com.kaihuman.app`. |
| Android Widgets | Native **Kotlin Jetpack Glance** `GlanceAppWidget` + `GlanceAppWidgetReceiver` compiled via Expo Config Plugin, reading shared `SharedPreferences` / SQLite in the app data directory. |

---

## 3. Repository & Package Changes

### 3.1 `packages/core` — Platform Storage & Offline Queue
Currently, `packages/core/src/db.ts`, `auth.store.ts`, `github-file.store.ts`, `github-profile.store.ts`, and `password.store.ts` access browser globals (`openDB` from `idb`, `localStorage`, `window.location`) at module import time.

To support React Native and Node/Vitest without breaking `apps/console`:
1. **`packages/core/src/storage/adapter.ts`**:
   ```ts
   export interface CachedFileRecord {
     path: string;
     content: string;
     sha: string;
     timestamp: number;
   }

   export interface PendingMutation {
     id: string;
     repoFullName: string;
     path: string;
     content: string;
     baseSha?: string;
     message: string;
     createdAt: number;
   }

   export interface CoreStorageAdapter {
     getKV(key: string): Promise<string | null>;
     setKV(key: string, value: string): Promise<void>;
     removeKV(key: string): Promise<void>;

     getAuth(key: 'token' | 'user'): Promise<unknown>;
     setAuth(key: 'token' | 'user', value: unknown): Promise<void>;
     deleteAuth(key: 'token' | 'user'): Promise<void>;

     getFile(path: string): Promise<CachedFileRecord | undefined>;
     putFile(record: CachedFileRecord): Promise<void>;
     deleteFile(path: string): Promise<void>;

     getTree(repoFullName: string): Promise<unknown>;
     putTree(repoFullName: string, tree: unknown): Promise<void>;

     getPendingMutations?(repoFullName: string): Promise<PendingMutation[]>;
     putPendingMutation?(mutation: PendingMutation): Promise<void>;
     deletePendingMutation?(id: string): Promise<void>;
   }
   ```
2. **Default Web Adapter (`packages/core/src/storage/web-adapter.ts`)**:
   - Uses existing `idb` (`life-os-db`) and `localStorage` when `typeof indexedDB !== 'undefined'`, falling back to an in-memory adapter in non-browser test environments.
   - `configureCoreStorage(adapter: CoreStorageAdapter)` lets `apps/mobile` register the SQLite + SecureStore + AppGroup adapter at startup.
3. **Widget Snapshot Hook (`packages/core/src/widget-sync.ts`)**:
   - Pure helper `buildWidgetTodoSnapshot(files: Record<string, string>, repoFullName: string)` using `parseTodos`, `getVisibleTodos`, and `getUpcomingMilestone` from `@kaihuman/formats`.
   - Produces a compact JSON payload (`WidgetTodoSnapshot`) written to the shared iOS App Group (`group.com.kaihuman.app/widget-todos.json`) and Android `SharedPreferences` whenever `.todos.md` files change.

### 3.2 `apps/auth-worker` — Mobile Redirect Support
Update `apps/auth-worker/src/index.ts`:
- Accept an optional `?redirect=mobile` query parameter on `GET /login`.
- Store a short indicator in the signed/validated state cookie (e.g., `state` payload or `kh_oauth_redirect=mobile`).
- On `GET /callback`, if the login was initiated with `redirect=mobile`, redirect to `kaihuman://auth/callback?access_token=<token>` instead of `env.APP_URL`.
- Add unit tests in `apps/auth-worker/src/index.test.ts` verifying web login stays unchanged and `redirect=mobile` redirects to `kaihuman://auth/callback`.

### 3.3 `apps/mobile` — Expo Application Structure
```text
apps/mobile/
├── app.json / app.config.ts
├── package.json
├── tsconfig.json
├── plugins/
│   └── with-kaihuman-widgets.ts       # Expo config plugin for iOS WidgetKit + Android Glance
├── targets/
│   ├── ios-widget/
│   │   ├── KaihumanWidgets.swift      # WidgetBundle: InboxTodoWidget, MilestoneWidget, QuickCaptureWidget
│   │   ├── TodoWidgetViews.swift      # SwiftUI views (systemSmall, systemMedium, systemLarge, accessoryRectangular)
│   │   ├── ToggleTodoIntent.swift     # iOS 17+ AppIntent to toggle [ ] -> [x] & sync with GitHub API
│   │   ├── SharedTodoStore.swift      # Reads/writes group.com.kaihuman.app/widget-todos.json + Keychain token
│   │   └── Info.plist / Entitlements
│   └── android-widget/
│       ├── TodoGlanceWidget.kt        # Jetpack Glance widget UI
│       ├── TodoWidgetReceiver.kt      # GlanceAppWidgetReceiver
│       ├── ToggleTodoAction.kt        # ActionCallback to toggle todo & sync with GitHub API
│       └── todo_widget_info.xml
└── src/
    ├── app/                           # Expo Router screens
    │   ├── _layout.tsx                # Root theme, auth guard, deep link handler
    │   ├── login.tsx                  # GitHub OAuth (openAuthSessionAsync), PAT input, Demo mode
    │   ├── (tabs)/
    │   │   ├── _layout.tsx            # Bottom tab bar: Dashboard, Board, Capture (+), Files, More
    │   │   ├── index.tsx              # Dashboard: switchable dashboards + native widget tiles
    │   │   ├── board.tsx              # Kanban Board (Backlog / In Progress / Done / Rejected + Milestones)
    │   │   ├── capture.tsx            # Quick Capture hub (Todo, Note, Log, Idea, Knowledge)
    │   │   ├── files.tsx              # Repository File Browser + Editor / Encrypted (.enc) unlock
    │   │   └── more.tsx               # Ideas, Wiki, Knowledge Base, Action Log, Analytics, Repo Switcher, Settings
    │   ├── quick-todo.tsx             # Deep-link target: kaihuman://quick-todo
    │   ├── quick-note.tsx             # Deep-link target: kaihuman://quick-note
    │   ├── quick-log.tsx              # Deep-link target: kaihuman://quick-log
    │   ├── quick-idea.tsx             # Deep-link target: kaihuman://quick-idea
    │   ├── quick-knowledge.tsx        # Deep-link target: kaihuman://quick-knowledge
    │   ├── ideas.tsx                  # Native Ideas overview & inline log/challenge/status editor
    │   ├── wiki.tsx                   # Native Wiki reader with [[wikilinks]], backlinks & tag filters
    │   ├── knowledge.tsx              # Knowledge Base inbox & processed files
    │   ├── action-log.tsx             # Action Log timeline & filter
    │   ├── analytics.tsx              # Todo velocity & milestone analytics
    │   └── file/[...path].tsx         # Single file viewer/editor (Native widgets + Markdown + .enc decryption)
    ├── adapters/
    │   ├── mobile-storage.ts          # CoreStorageAdapter implementation (SQLite / SecureStore / Memory fallback)
    │   └── widget-bridge.ts           # Native bridge to write WidgetTodoSnapshot & reload WidgetCenter / Glance
    └── components/
        ├── widgets/                   # Native renderers for all console tile types
        │   ├── TodoTile.tsx           # .todos.md
        │   ├── HabitTile.tsx          # .habit.csv
        │   ├── TimeTrackingTile.tsx   # .timetracking.csv (live ticking timer + start/stop)
        │   ├── EventsTile.tsx         # .events.csv
        │   ├── ActionLogTile.tsx      # .actionlog.md
        │   ├── TimezonesTile.tsx      # .timezones.json
        │   ├── ReadItLaterTile.tsx    # .readitlater.json
        │   ├── BookmarksTile.tsx      # .bookmarks.json
        │   ├── FinanceTiles.tsx       # .budget.csv, .stocks.csv, .consumption.csv, .data-collection.csv
        │   └── PromptsCommandsTile.tsx # .prompts.md, .commands.md
        └── EncryptedGate.tsx          # .enc password unlock using passwordStore
```

---

## 4. iOS & Android Todo Widget Specification

### 4.1 Shared JSON Schema (`widget-todos.json`)
Written to the shared container (`group.com.kaihuman.app/widget-todos.json` on iOS, `SharedPreferences` on Android) whenever todos are loaded or modified:
```ts
export interface WidgetTodoItem {
  id: string;
  filePath: string;        // e.g. ".kh/inbox.todos.md" or ".kh/projects.todos.md"
  indexInFile: number;     // line index in TodoData.items for deterministic mutation
  text: string;
  status: 'backlog' | 'in-progress' | 'done' | 'rejected';
  tags: string[];
  milestoneId?: string;
  milestoneName?: string;
  milestoneDueDate?: string;
  updatedAt?: number;
}

export interface WidgetTodoSnapshot {
  updatedAt: number;       // Unix ms
  repoFullName: string;    // e.g. "owner/life-os"
  branch: string;          // e.g. "main"
  appFolder: string;       // ".kh" or ".lifeos"
  upcomingMilestone?: {
    id: string;
    name: string;
    dueDate?: string;
  };
  counts: {
    inbox: number;
    inProgress: number;
    backlog: number;
    doneToday: number;
  };
  items: WidgetTodoItem[]; // Prioritized: in-progress first, then inbox, then backlog with upcoming milestone
  files: Record<string, { sha: string; content: string }>; // Raw .todos.md files for background intent commits
}
```

### 4.2 Interactive Widget Behavior
1. **Small Widget (`systemSmall`)**:
   - Header: `KAIHUMAN // TODOS` in neon green monospace, plus count badge (`IN-PROGRESS` + `INBOX`).
   - Top 3 prioritized tasks with interactive checkboxes (`Button(intent: ToggleTodoIntent(...))`).
   - Quick `+` button linking to `kaihuman://quick-todo`.
2. **Medium Widget (`systemMedium`)**:
   - Left/Top bar: Upcoming Milestone badge (`!v1 · due YYYY-MM-DD`), counts, and quick capture buttons (`+ Todo`, `+ Note`, `+ Log`).
   - Up to 5 interactive tasks with `#tag` chips and status indicator (`[>]` cyan for in-progress, `[ ]` muted for backlog).
3. **Large Widget (`systemLarge`)**:
   - Full interactive list (up to 10 tasks) grouped by `IN PROGRESS`, `INBOX`, and `BACKLOG`, plus quick-capture bar at the bottom.
4. **Lock Screen Widgets (`accessoryCircular`, `accessoryRectangular`, `accessoryInline`)**:
   - `accessoryCircular`: Open todos gauge.
   - `accessoryRectangular`: Next in-progress task + upcoming milestone due date.
5. **Direct Background GitHub Sync on Toggle (`ToggleTodoIntent` / `ToggleTodoAction`)**:
   - When the user taps a task in the widget:
     1. Immediately updates `widget-todos.json` and the raw `.todos.md` content in `files[filePath]` (replacing `- [ ]` or `- [>]` with `- [x]` and updating `::updated:: <ms>`).
     2. Reloads the widget timeline immediately (`WidgetCenter.shared.reloadAllTimelines()`) for sub-100ms feedback.
     3. Reads the GitHub token from shared Keychain / App Group and sends a `PUT https://api.github.com/repos/{owner}/{repo}/contents/{path}` request with the new base64 content and `sha`.
     4. If offline or the SHA conflicted, appends a record to `pending-widget-mutations.json` in the App Group so the main app reconciles and commits it via `githubFileStore` on next launch or background fetch.

---

## 5. Console Feature Parity Matrix

Every feature in `apps/console` maps to a native screen or component in `apps/mobile`:

| Console Route / Feature | Mobile Screen / Component |Shared Packages |
|---|---|---|
| `/login`, `/demo` | `src/app/login.tsx` | `@kaihuman/core` (`authStore`, `demoStore`) |
| `/` (Dashboard & Tiles) | `src/app/(tabs)/index.tsx` + `src/components/widgets/*` | `@kaihuman/core` (`layoutStore`, `githubFileStore`), `@kaihuman/formats` |
| `/board` (Kanban Board) | `src/app/(tabs)/board.tsx` | `@kaihuman/formats` (`todos.ts`) |
| `/analytics` (Todo Analytics) | `src/app/analytics.tsx` | `@kaihuman/formats` (`todos.ts`) |
| `/action-log` | `src/app/action-log.tsx` | `@kaihuman/formats` (`action-log.ts`) |
| `/quick-todo` | `src/app/quick-todo.tsx` | `@kaihuman/formats` (`entries.ts`, `todos.ts`) |
| `/quick-note` | `src/app/quick-note.tsx` | `@kaihuman/core` (`githubFileStore`) |
| `/quick-log` | `src/app/quick-log.tsx` | `@kaihuman/formats` (`entries.ts`, `action-log.ts`) |
| `/quick-idea` | `src/app/quick-idea.tsx` | `@kaihuman/formats` (`ideas.ts`) |
| `/quick-knowledge` | `src/app/quick-knowledge.tsx` | `@kaihuman/formats` (`entries.ts`) |
| `/ideas` | `src/app/ideas.tsx` | `@kaihuman/formats` (`ideas.ts`) |
| `/knowledge` | `src/app/knowledge.tsx` | `@kaihuman/core` (`githubService`) |
| `/wiki` | `src/app/wiki.tsx` | `@kaihuman/core` (`githubFileStore`) |
| `/files`, `/files/:path*` | `src/app/(tabs)/files.tsx` & `src/app/file/[...path].tsx` | `@kaihuman/core` (`githubFileStore`, `passwordStore`, `crypto.ts`) |
| Push / Reminders | Local notifications scheduled from milestone `dueDate` & events | `@kaihuman/formats` (`todos.ts`, `events.ts`) |
| Home / Lock Screen Widgets | `targets/ios-widget/*` (SwiftUI) & `targets/android-widget/*` (Kotlin) | `packages/core/src/widget-sync.ts` |

## 6. Status & Known Gaps

Phases 1–6 are implemented (Phase 5: `.github/workflows/mobile-build.yml`; Phase 6: runnable Expo app with React Native views, expo-router routes in `apps/mobile/app/`, and the `kaihuman-shared` native module). Known gaps:

- Swift and Kotlin widget code has never been compiled here (no Xcode or Android toolchain in this environment); CI compile checks are the first real build.
- The Expo config plugin's editing of the real Xcode project is untested.
- The app must write the GitHub token to key `github-token` (iOS Keychain service `com.kaihuman.app`, then App Group defaults; Android prefs `kaihuman_widget`) and handle the App Group `pending-url` key.
- Core `encrypt`/`decrypt` (`.enc` files) need a `crypto.subtle` polyfill on React Native.
- Phase 6 views have not been run on a device or simulator, and the Swift/Kotlin native targets are still uncompiled.
