# Shared packages

The `packages/` folder of the kaihuman monorepo holds the code shared between the apps. `@kaihuman/core` has the GitHub service, the Preact-signal stores and crypto. `@kaihuman/formats` parses and writes the repo file formats. `@kaihuman/ui` has the console's Preact components and widgets, and `@kaihuman/config` has the shared TypeScript, Biome and Tailwind configuration. All four are private pnpm workspace packages, referenced as `workspace:*`.

## Which shared package to use for what
<!-- docspack: tags=packages,workspace,dependencies,consumers,monorepo layout -->

| Package | Path | Holds | Used by |
|---|---|---|---|
| `@kaihuman/core` | `packages/core` | GitHub API service, signal stores, models, crypto, logger, IndexedDB, demo mode | `apps/console`, `packages/ui` |
| `@kaihuman/formats` | `packages/formats` | Parsers and serialisers for `.todos.md`, `.actionlog.md`, `.events.csv` and other repo files | `apps/console`, `apps/browser-extension`, `packages/ui`, `packages/palette` |
| `@kaihuman/ui` | `packages/ui` | Preact components, dashboard layout, widgets, kanban board, wiki view | `apps/console` |
| `@kaihuman/config` | `packages/config` | `tsconfig.base.json`, `biome.json`, `tailwind-preset.js` | root `biome.json`, `apps/console`, `packages/core`, `apps/browser-extension` |

`packages/palette` (`@kaihuman/palette`) is the command palette engine shared by `apps/browser-extension` and `apps/desktop-palette`; it depends on `@kaihuman/formats`. `packages/docspack` holds these docs. `apps/kb-mcp` and the Rust apps use none of the shared packages.

Rule of thumb: put file-format logic that more than one app needs in `@kaihuman/formats`. Put browser-only state and GitHub access in `@kaihuman/core`, and Preact UI in `@kaihuman/ui`.

## What `@kaihuman/formats` exports
<!-- docspack: tags=formats api,parse,serialize,functions -->

`@kaihuman/formats` has no runtime dependencies and exports TypeScript source directly (`"exports": { ".": "./src/index.ts" }`). `src/index.ts` re-exports every module:

| Module | Main exports |
|---|---|
| `todos.ts` | `parseTodos`, `serializeTodos`, `addTodo`, `setStatus`, `updateTodoText`, `setMilestone`, `setPrompt`, `addMilestone`, `updateMilestone`, `removeMilestone`, `migrateLegacyFormat`, `getVisibleTodos`, `getUpcomingMilestone`, `STATUS_TO_MARKER`, `STATUS_LABELS`, `NEXT_STATUS` |
| `action-log.ts` | `parseActionLog`, `serializeActionLog`, `appendAction` |
| `events.ts` | `parseEvents`, `serializeEvents`, `getUpcomingEvents` |
| `habits.ts` | `parseHabitData`, `serializeHabitData`, `checkIn`, `isCheckedIn`, `calculateStats` |
| `time-tracking.ts` | `parseTimeTracking`, `serializeTimeTracking`, `toggleStartStop`, `addPause`, `isRunning`, `calculateDurationMinutes`, `formatDuration`, `getChartData` |
| `prompts.ts` | `parsePrompts`, `serializePrompts`, `addPrompt` |
| `commands.ts` | `parseCommands`, `commandParameters`, `fillCommand`, `addCommand` |
| `read-later.ts` | `parseReadItLater`, `parseReadItLaterForWrite`, `serializeReadItLater`, `markAsRead`, `markAsNew`, `markReadItLaterRead`, `deleteItem`, `deleteAllRead`, `deleteAll` |
| `timezones.ts` | `parseTimezones`, `serializeTimezones`, `AVAILABLE_TIMEZONES`, `getYearProgress`, `getCurrentTimeInZone`, `getISOWeekNumber` |
| `palette-settings.ts` | `PALETTE_SETTINGS_PATH`, `DEFAULT_PALETTE_SETTINGS`, `readPaletteSettings`, `usablePaletteSettings`, `serializePaletteSettings`, `buildLinkUrl`, `paletteSettingsProblems` |
| `braindumps.ts` | `BRAINDUMP_FOLDER`, `braindumpPath`, `braindumpIdOf`, `braindumpCreatedAt`, `braindumpTitle` |
| `entries.ts` | `addTodoEntry`, `addActionLogEntry`, `addEventEntry`, `addPromptEntry`, `addCommandEntry`, `addReadLaterEntry`, `splitInlineTags` |
| `dates.ts` | `localDate` |

Tests sit next to each module as `*.test.ts` and run with `pnpm --filter @kaihuman/formats test` (`vitest run`). The file formats themselves are described on the "Repo file formats" page.

## Adding an entry to a widget file from any app
<!-- docspack: tags=entries,add entry,shared write path -->

`packages/formats/src/entries.ts` is the single implementation of "add one entry" for every app: the console's Add forms and quick-add pages, the extension popup and start page, and both command palettes. A change there reaches all of them at once.

```ts
import { addTodoEntry } from '@kaihuman/formats';

const next = addTodoEntry(currentText, { text: 'Call #admin the bank', tags: ['home'] });
// "- [ ] Call the bank #home #admin" plus a ::updated:: / ::created:: line
```

Each function takes the file's current text and returns the new text. Invalid input throws an `Error` whose message is meant for the user, such as `Nothing to add`, `An event needs a name` or `The start date is YYYY-MM-DD`. `packages/palette/src/entries.ts` maps file suffixes (`.todos.md`, `.actionlog.md`, `.events.csv`, `.prompts.md`, `.commands.md`) to these functions for the palettes.

## GitHub access and demo mode in `@kaihuman/core`
<!-- docspack: tags=github service,octokit,demo mode,in-memory -->

`packages/core/src/services/github.service.ts` wraps Octokit (`@octokit/rest`) in the `GithubService` class. Its methods include:

- `getRepo`, `listRepos`, `fetchRepoTree`
- `getFileContent`, `saveFile`, `upsertRepoFile`, `deleteFile`
- `renameFolder`, used for the `.lifeos` → `.kh` migration
- `listCommits`
- `getActionsPublicKey`, `setActionsSecret`

The exported `githubService` is a `Proxy`. When the `demoMode` signal is true, every call goes to `inMemoryGithubService` (`github.service.memory.ts`), a virtual filesystem with content-derived pseudo-SHAs. No store needs to branch on demo mode. `buildDemoSeed()` in `demo/seed.ts` fills the demo repository, and `enterDemoMode` / `exitDemoMode` in `stores/demo.store.ts` switch modes. In demo mode, durable writes to localStorage and IndexedDB are skipped.

## State stores exported by `@kaihuman/core`
<!-- docspack: tags=stores,signals,preact signals,state management -->

State is held in `@preact/signals` stores, each exported as a singleton:

| Export | Holds |
|---|---|
| `authStore` | GitHub token (`token`), `user`, `isAuthenticated`; `login`, `logout`, `handleCallback` |
| `githubProfileStore` | `repos`, `currentRepo`; `fetchRepos`, `selectRepo` |
| `githubFileStore` | `tree`, `openFiles`, `activeFile`, `dirtyFiles`, `fileConflicts`, `appFolder`; `loadTree`, `openFile`, `updateFileContent`, `saveFile`, `createFile`, `deleteFile`, `renameFile`, `migrateAppFolder`, `resolveConflict` |
| `githubCommitStore` | Commit history for the commits view |
| `layoutStore` | Dashboard `view`, `columns`, `remoteConfig` (the dashboard config), modals, zen mode, dump mode |
| `navigationStore` | Mobile bottom navigation tab and sheet |
| `passwordStore` | Passwords for encrypted files, optionally remembered; `unlockedFiles` |
| `aiStore` | AI chat messages and provider (`copilot`, `claude`, `gemini`) |

`githubFileStore.appFolder` resolves `.kh` or the legacy `.lifeos`. Saves detect remote changes and record them in `fileConflicts`, which the UI resolves with `keep_local` or `use_remote`.

## Models, crypto and utilities in `@kaihuman/core`
<!-- docspack: tags=types,zod,crypto,logger,indexeddb,push notifications -->

Other exports from `packages/core/src`:

- `models/types.ts`: Zod schemas `TodoSchema`, `HabitSchema`, `TimetrackingSchema`, `ConfigSchema`, plus `DashboardConfig`, `DashboardEntry`, `DashboardFilesConfig`, `NavItemId`, `TileDef` and `Column`.
- `utils/crypto.ts`: `encrypt(text, password)` and `decrypt(...)` with AES-GCM 256 and PBKDF2 (100,000 iterations), output base64 of `salt:iv:ciphertext` hex.
- `logger.ts`: `Logger` class with a module prefix; production logs only errors, development logs everything; `Logger.setLevel` overrides.
- `db.ts`: `dbPromise`, the IndexedDB database `life-os-db` (via `idb`) with stores `auth`, `profiles`, `files` and `trees`.
- `utils/push-notifications.ts`: `setupPushNotifications`, `isPushEnabled`.
- `demo-mode.ts`: the `demoMode` signal.

Runtime dependencies are `@octokit/rest`, `@preact/signals`, `idb`, `@noble/hashes`, `tweetnacl` and `zod`. The package exports TypeScript source (`"main": "src/index.ts"`) and has `lint`, `format`, `fix` and `check-types` scripts, but no tests.

## What `@kaihuman/ui` provides
<!-- docspack: tags=ui components,widgets,preact,storybook,cascivo -->

`@kaihuman/ui` is a Preact component library built with Vite into `dist/index.mjs` with type declarations. It re-exports all of `@kaihuman/formats`, so the console can import format helpers from either package. Main exports from `src/index.ts`:

- Layout: `MainApp` (dashboard grid, file browser, widget routing by file suffix), `StatusBar`, `RepositorySelector`, `NotFound`
- Templates: `KanbanBoard`, `TodoAnalytics`, `ActionLogView`, `AIPanel`, `Login`
- Views: `WikiView`, `EncryptedTileWrapper`
- Widgets: `CommandPaletteSettingsWidget`, `ConsumptionWidget`, `StocksWidget` and their logic modules
- Basics: `Button`, `Input`, `Editor`, `Logo`, `DonutChart`, `StackedBarChart`, `cn` in `utils`

All widgets live in `packages/ui/src/LifeOS/Organisms/Widgets/`; `MainApp` loads them internally. The bottom navbar catalog `NAVBAR_ITEMS` and `DEFAULT_NAVBAR` are in `src/LifeOS/navbar-items.ts`. Stylesheets are exported as `@kaihuman/ui/styles.css`, `@kaihuman/ui/LifeOS/styles.css` and `@kaihuman/ui/cascivo.css`. Dependencies include `@cascivo/*`, `@dnd-kit/*`, `lucide-preact`, `react-markdown` and `react-force-graph-2d`.

## Building and previewing `@kaihuman/ui`
<!-- docspack: tags=build ui,storybook,vite,dist -->

Because `@kaihuman/ui` resolves to `dist/index.mjs`, it must be built before the console can type-check or run against changes. Turborepo's `build` task has `"dependsOn": ["^build"]`, so `pnpm turbo build` builds it first.

```sh
pnpm --filter @kaihuman/ui build            # vite build → dist/
pnpm --filter @kaihuman/ui watch            # rebuild on change
pnpm --filter @kaihuman/ui storybook        # Storybook on port 6006
pnpm --filter @kaihuman/ui build-storybook
pnpm --filter @kaihuman/ui lint             # biome check src/ vite.config.ts .storybook/
```

Stories sit beside components as `*.stories.tsx`, for example `CommandsWidget.stories.tsx` and `NewFileWizard.stories.tsx`. `preact` is a peer dependency.

## Shared TypeScript, Biome and Tailwind config in `@kaihuman/config`
<!-- docspack: tags=tsconfig,biome,tailwind preset,lint config -->

`@kaihuman/config` contains no code, only three config files:

| File | Content | Consumers |
|---|---|---|
| `tsconfig.base.json` | `target` ES2022, `module`/`moduleResolution` `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `isolatedModules`, `skipLibCheck` | `apps/console/tsconfig.json`, `packages/core/tsconfig.json` |
| `biome.json` | Formatter with 2-space indent and line width 100, organize imports, lint rules | Root `biome.json` via `"extends": ["./packages/config/biome.json"]` |
| `tailwind-preset.js` | `nexus` theme colours (`bg`, `panel`, `border`, `primary`, `secondary`, `accent`, `text`, `muted`), fonts Inter and JetBrains Mono | `apps/browser-extension/tailwind.config.js` |

To change formatting for the whole repository, edit `packages/config/biome.json`. Its `check-types` script is a no-op.
