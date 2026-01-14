# Life OS v2 Implementation Roadmap

Context: Fresh start in an empty repository.
Goal: Re-implement Life OS as "Console" using a high-performance, offline-first stack (Preact + Signals + CodeMirror).

---

## Part 1: Foundation & Core Architecture
**Goal**: Establish the monorepo structure, build system, and shared configurations.

### Phase 1.1: Monorepo Bootstrap
*   [x] **Initialize Repository**: Run `pnpm init` and `npx create-turbo@latest`.
*   [x] **Configure Workspace**: Setup `pnpm-workspace.yaml` defining `apps/*` and `packages/*`.
*   [x] **Agent Setup**: Copy `.cursorrules` and `.agent/*` from the bootstrap kit.

### Phase 1.2: Shared Configuration (`packages/config`)
*   [x] **TypeScript**: Create composable `tsconfig.base.json` (Strict Mode).
*   [x] **Linting/Formatting**: Setup `Biome` configuration.
*   [x] **Tailwind**: Create a shared Tailwind preset with the "Nexus Theme" tokens (colors, spacing).

### Phase 1.3: Authentication & GitHub Integration
**Goal**: Re-implement the OAuth flow found in `apps/life-os/src/models/app-boot.ts`.
*   [x] **AuthStore**: Create a Signal-based store to hold `token` and `user` profile. Persist to `localStorage`.
*   [x] **Env Config**: Define `VITE_GH_LOGIN` (OAuth Gatekeeper URL) in `.env`.
*   [x] **Boot Logic**: Implement logic to parse `?access_token=...` from URL on app startup.
    *   *Ref*: See `ApplicationBoot.preLoggedInBoot` in legacy app.
*   [x] **Login UI**: Create a simple Login page with a "Login with GitHub" button redirecting to `VITE_GH_LOGIN`.

---

## Part 2: The Core Domain
**Goal**: Implement the "Brain" of the OS without any UI. Pure TypeScript logic.
**Target**: `packages/core`

### Phase 2.1: Domain Modeling
*   [ ] **File Types**: Define Zod schemas for `Todo`, `Habit`, `Timetracking`, and `Config`.
*   [ ] **Store Architecture**: Define the Signal-based `RootStore` interface.

### Phase 2.2: Git & Storage Layer (The Hard Part)
*   [ ] **Web Worker Setup**: Scaffold a Web Worker to host `isomorphic-git`.
*   [ ] **Git Service**: Implement `clone`, `pull`, `push`, `commit`, `log` inside the Worker.
*   [ ] **Storage Service**: Implement `lightning-fs` / `idb` integration for offline persistence.
*   [ ] **Sync Logic**: Implement the conflict resolution and "sync loop" logic.

### Phase 2.3: State Management
*   [ ] **GithubProfileStore**: Implement authentication and repository selection logic.
*   [ ] **GithubFileStore**: Implement file loading, saving, and caching logic using Signals.

---

## Part 3: UI System & Design
**Goal**: Build the visual language.
**Target**: `packages/ui`

### Phase 3.1: Environment
*   [ ] **Storybook**: Initialize Storybook for Preact.
*   [ ] **Tailwind integration**: Ensure Tailwind works in Storybook.

### Phase 3.2: Nexus Design System
*   [ ] **Primitives**: Build atomic components using Radix UI / Headless patterns (Button, Input, Dropdown, Modal).
*   [ ] **Layouts**: create `Sidebar`, `Panel`, `SplitView` shells.
*   [ ] **Visuals**: Implement the "Cyberpunk/Clean" aesthetic (Glassmorphism, thin borders).

---

## Part 4: Console Application
**Goal**: Assemble the application.
**Target**: `apps/console`

### Phase 4.1: App Shell
*   [ ] **Scaffold**: Initialize Vite + Preact + TypeScript project.
*   [ ] **Routing**: Setup a lightweight router.
*   [ ] **Layout Integration**: Connect `packages/ui` layouts.
*   [ ] **Store Injection**: Connect `packages/core` stores to the UI.

### Phase 4.2: Dashboard & Navigation
*   [ ] **File Tree**: Implement the sidebar file explorer (virtualized list for performance).
*   [ ] **Dashboard**: Create the widget grid layout.
*   [ ] **Repo Onboarding**: Implement the "Select Repo" / "Create Repo" flow.

### Phase 4.3: The Editor (CodeMirror 6)
*   [ ] **Integration**: Create a `CodeMirror` wrapper component in `packages/ui` (or `apps/console` if too specific).
*   [ ] **Modes**: Configure Markdown syntax highlighting.
*   [ ] **Vim Mode**: Enable Vim keybindings (optional/configurable).

---

## Part 5: Feature Implementation
**Goal**: Port specific logic from v1.

### Phase 5.1: Widget Rendering
*   [ ] **Split-Pane Logic**: Allow simultaneous "Edit" (CodeMirror) and "View" (Widget) modes.
*   [ ] **Trackers**: Implement CSV parsing and Chart rendering (using a lightweight chart lib, e.g., Recharts or generic SVG).
*   [ ] **Habit Tracker**: Implement the commit-graph style habit grid.
*   [ ] **Todo List**: Implement the interactive Markdown checkbox parsing.

### Phase 5.2: Knowledge Graph & Search
*   [ ] **Search Index**: Implement a client-side search indexer (running in Web Worker).
*   [ ] **Graph View**: Implement D3 Force Graph visualization of file links.

---

## Part 6: Polish & Production
**Goal**: Make it a true Local-First PWA.

### Phase 6.1: PWA Handling
*   [ ] **Service Worker**: Configure `vite-plugin-pwa` for asset caching.
*   [ ] **Manifest**: Create the Web Manifest for installability.

### Phase 6.2: Optimization
*   [ ] **Bundle Analysis**: Verify bundle size constraints (Target < 300kb initial load).
*   [ ] **Profiling**: Ensure 60fps scrolling and < 50ms interaction latency.

## Next Steps
Start with **Part 1** to establish the foundation.
