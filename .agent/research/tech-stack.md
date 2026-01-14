# Life OS Tech Stack Analysis

## 1. Current Tech Stack

Based on `packages/life-os` and shared packages in the monorepo.

### Core Framework & Build
- **Build Tool**: [Vite](https://vitejs.dev/) (v5)
    - Fast development server and HMR.
    - Optimized production builds (Rollup under the hood).
- **Framework**: [React](https://react.dev/) (v18)
- **Language**: TypeScript

### State Management
- **Library**: [MobX](https://mobx.js.org/) & [MobX State Tree (MST)](https://mobx-state-tree.js.org/)
    - **Usage**: Deeply integrated. `RootStore` pattern containing `GithubFileStore`, `GithubProfileStore`, etc.
    - **Pros**: Structured patches (useful for history/sync), runtime type checking.
    - **Cons**: MST has significant bundle size overhead and instantiation cost for large datasets compared to raw MobX or newer alternatives.

### UI & Styling
- **Component Library**: [Carbon Design System](https://carbondesignsystem.com/) (`@carbon/react`)
    - **Pros**: Comprehensive enterprise-grade components.
    - **Cons**: Can be visually "heavy" and generic; large CSS footprint.
- **Styling**: [Styled Components](https://styled-components.com/) (CSS-in-JS).
- **Charts**: `@carbon/charts-react` (D3 based).

### Data & Offline Persistence
- **Git**: [`isomorphic-git`](https://isomorphic-git.org/)
    - **Key Feature**: Runs full Git implementation in the browser.
- **File System**: [`@isomorphic-git/lightning-fs`](https://github.com/isomorphic-git/lightning-fs)
    - **Storage**: Emulates a filesystem on top of IndexedDB.
- **PWA**: `vite-plugin-pwa` (Service Workers).

### Editor & Visualization
- **Text**: **CodeMirror 6**.
    - **Why**: Modular (only pay for what you use), fast, headless capabilities, much smaller than Monaco.
    - **Replaces**: Monaco Editor (Heavy, 2-4MB).
- **Blocks**: BlockNote (`@blocknote/react`).
- **Canvas**: `tldraw` (Whiteboarding).
- **Graph**: `d3`, `d3-cloud`, `d3-sankey` (via `@urbanisierung/react-components`).

---

## 2. Proposed Tech Stack for Re-implementation

**Goals**: "Super super fast", Small bundle size, Maintainable, PWA/Offline-first.

### Framework Choice

| Option | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- |
| **React** | Massive ecosystem, familiar. | Virtual DOM overhead. Bundle size is larger than Preact. | Good safety net. |
| **Preact** | **3kb size**. Faster than React. API compatible. | Smaller ecosystem (some React libs need aliasing). | **Top Strong Candidate**. Ideal for "lite" OS. |
| **Astro** | Zero JS by default. Great for content. | "Islands" architecture is complex for an app where *everything* is interactive (Editor, Git sync). | Not recommended for a thick-client SPA/PWA. |
| **HTMX** | Simple. | Requires server round-trips. **Incompatible** with offline-first local Git logic. | **Rejected**. |
| **Vanilla** | Fastest. | **Unmaintainable** for complex state/UI interactions like an Editor/Dashboard. | **Rejected**. |

**Recommendation**: **Vite + Preact (or React)**.
Use **Preact** if strict bundle size limits are effectively enforced.

### State Management

| Option | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- |
| **MobX (MST)** | Structured, patches, types. | **Heavy**. Slow instantiation. | Move away for performance. |
| **MobX (Core)** | Fast, reactive. | Mutable state can be tricky to debug without strict mode. | Good. |
| **Signals** | **Fastest updates**. Fine-grained reactivity (updates DOM directly, skips VDOM). | Newer paradigm (though similar to MobX). | **Strong Recommendation**. (Use `@preact/signals`). |
| **Zustand** | Minimal boilerplate, small. | Global store might need careful organization for complex apps. | Good alternative. |

**Recommendation**: **Preact Signals** or **MobX (Core)**.
Signals align perfectly with the "performance first" goal.

### Design System & Styling

*   **Approach**: Move away from heavy component libraries (Carbon).
*   **Styling**: **Tailwind CSS** (v4).
    *   **Why**: Zero runtime size (unlike Styled Components), atomic classes, highly compressible.
*   **Components**: **Radix UI** (Primitives) or **Shadcn/UI**.
    *   **Why**: Headless, accessible primitives. You own the styles. No bloat.
    *   **Icons**: `lucide-react` (Clean, tree-shakeable).

### Tooling

*   **Bundler**: **Vite** (Keep usage).
*   **Test**: **Vitest** (Native Vite integration, fast).
*   **Lint/Format**: **Biome** (Rust-based, super fast replacement for ESLint + Prettier).

### PWA & Offline Plan

*   **Storage**: Continue using **IndexedDB** (via `idb` or `lightning-fs`).
*   **Sync**: `isomorphic-git` is excellent. Keep it.
*   **Service Worker**: `vite-plugin-pwa` with strict offline caching strategies.

### PWA & Offline Plan

*   **Storage**: Continue using **IndexedDB** (via `idb` or `lightning-fs`).
*   **Sync**: `isomorphic-git` is excellent. Keep it.
*   **Service Worker**: `vite-plugin-pwa` with strict offline caching strategies.

### Dependency Management

*   **Strategy**: strictly use **pnpm** workspaces.
*   **Dev Dependencies**: **ALL** `devDependencies` must be installed in the **ROOT** `package.json`.
    *   *Reasoning*: Ensures consistent tooling versions (TypeScript, Vite, Biome) across all packages/apps and reduces disk space.
*   **Orchestration**: **Turborepo** is the required build system.
*   **Versions**: Mandate **Latest Versions** for all dependencies.
    *   *Policy*: Regular automated updates (e.g., Renovate) to stay on the bleeding edge.

### Development Strategy "Life OS v2"

1.  **Shell**: Vite + Preact + TypeScript + Tailwind.
2.  **State**: Global Store using Signals.
3.  **Data**: Abstract `isomorphic-git` into a Web Worker to keep the Main Thread free (vital for "super fast" UI).
4.  **UI**: Build a small custom design system ("Nexus Theme") using Tailwind.

---

## 3. Monorepo Structure

The project already uses **pnpm** and **Turborepo** (`root package.json`), which is excellent. We should stick to this.

### Packages Proposal

To support the future landing page and ensure strict "clean architecture" separation, we recommend the following shared packages:

#### `packages/ui` (New)
*   **Purpose**: A dumb, presentational component library.
*   **Tech**: React/Preact, Tailwind, **Storybook**.
*   **Content**: Button, Inputs, Cards, Layouts, "Nexus Theme".
*   **Why**:
    *   **Faster Development**: You develop UI in isolation (Storybook) without running the full heavy app.
    *   **Shared Identity**: The Landing Page and App will import the exact same buttons/headers, ensuring visual consistency `100%`.
    *   **Optimization**: Can be bundled/treeshaken independently.

#### `packages/core` (or `packages/domain`) (New)
*   **Purpose**: Pure business logic / data models. **NO UI CODE**.
*   **Tech**: TypeScript, MobX (Stores), Zod (Validation), isomorphic-git (Logic).
*   **Content**:
    *   `GithubFileStore`, `GithubProfileStore` logic (refactored).
    *   Data models for File types (Todo, Habit).
    *   Sync logic & Conflict resolution strategies.
*   **Why**:
    *   The App imports this for the full experience.
    *   The Landing Page can import *just* the `GithubProfileStore` types or mock logic to show a "demo" mode without needing the full heavy editor implementation.
    *   Enables testing logic in Node.js (fast unit tests) without a browser environment.

#### `packages/config` (Existing/Refine)
*   **Purpose**: Shared configuration.
*   **Content**: TypeScript `tsconfig.base.json`, Biome/ESLint configs, Tailwind presets.

### Applications

#### `apps/life-os` (The Main App)
*   **Role**: The "Assembly" layer.
*   **Connects**: `packages/ui` + `packages/core`.
*   **Handles**: Routing, Service Worker (PWA), specific browser integrations.

#### `apps/landing-page` (Future)
*   **Role**: Marketing site.
*   **Connects**: `packages/ui` (for visual consistency).
*   **Tech**: Astro (perfect for static/SEO) + Preact (for interactive islands using `packages/ui`).
