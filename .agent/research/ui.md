# Life OS: UI/UX Implementation Plan

## 1. Project Vision
A keyboard-centric, terminal-aesthetic "Life Operating System" that prioritizes speed, density, and focus over standard GUI conventions.
**Core Metaphor:** "The Digital Bento Box" — a gapless tiling grid that morphs organically based on user focus.

## 2. Design Principles
* **No Chrome:** No headers, no window frames. The content defines the hierarchy.
* **Tiling First:** Everything lives in a tile. Tiles share borders. No gaps/gutters.
* **Physicality:** Transitions (Squeeze, Morph, Slide) are essential to prevent disorientation.
* **Keyboard Driven:** Mouse is a second-class citizen (supported, but not optimized for).
* **Zen by Default:** Distractions are hidden until explicitly requested.

---

## 3. UI Architecture & Component Breakdown

The UI will be built as a specific collection within the existing Storybook package.

### A. The Layout Engine (The "Grid")
* **Concept:** A CSS Grid wrapper that handles the three visual states.
* **States:**
    1.  **Dashboard (Default):** Equal distribution of tiles (e.g., 3-column or Masonry).
    2.  **Focus (The Squeeze):** Center column expands to 60-70vw. Left/Right columns compress to sidebar strips.
    3.  **Zen (The Void):** Center column expands to 100vw. Sidebars pushed off-canvas.
* **Technical Reqs:**
    * Use `FLIP` (First, Last, Invert, Play) techniques or CSS View Transitions API for performant sizing animations.
    * Sidebars must visually "fade" content or switch to "icon-only" mode when compressed.

### B. The Footer (The "Magic Drawer")
* **Concept:** A persistent status bar that morphs into the main control center.
* **States:**
    * **Collapsed:** 32px height. Flex row. Shows: `[Mode] [Breadcrumbs] [Clock/Stats]`.
    * **Expanded:** 40vh height. Bottom-sheet animation. Overlay backdrop on main grid.
* **Content (Expanded):**
    * **Command Input:** Auto-focused search bar (`cmd+k`).
    * **Action Grid:** Large clickable/tappable areas for "New File", "File Tree", "Settings".

### C. The File Browser (Miller Columns)
* **Location:** Renders inside the "Center Stage" when active.
* **Layout:** Horizontal flex container with fixed-width columns.
* **Behavior:**
    * `Left Arrow`: Go to parent.
    * `Right Arrow`: Enter folder OR Focus Preview.
    * `Enter`: Promote Preview to Active Editor.
* **Preview Pane:** Renders Markdown (read-only) instantly on selection.

### D. The Editor Tile
* **Concept:** The core work unit.
* **Features:**
    * **Micro-Header:** 24px top bar showing filename and unsaved changes indicator (`*`).
    * **Mode Awareness:**
        * *Navigation Mode:* Vim-style scrolling (`j/k`).
        * *Insert Mode:* Standard text entry.
* **Typography:** Monospace only (e.g., JetBrains Mono, Geist Mono).

---

## 4. Implementation Phases

### Phase 1: Environment Integration
* **Goal:** Configure the existing Storybook to support the "Terminal" theme without breaking existing components.
* **Action Items:**
    * [ ] **Namespace Setup:** Create a dedicated directory (e.g., `src/stories/LifeOS` or `src/components/TerminalUI`) to keep these specific components isolated.
    * [ ] **Design Tokens:** Inject a scoped CSS file or `ThemeProvider` specifically for the Life OS components to ensure the "Terminal Look" doesn't bleed into other app parts.
        * `--los-border`: 1px solid #333
        * `--los-bg`: #000000
        * `--los-accent`: #00FF00 (Neon Green)
        * `--los-font`: 'JetBrains Mono', monospace
    * [ ] **Global Reset:** Ensure `box-sizing: border-box` is applied strictly to these components.

### Phase 2: The Core Components
* **Goal:** Build individual operational units.
* **Action Items:**
    * [ ] **Component: Status Bar**
        * Story: `Default` (Static footer).
        * Story: `Expanded` (The Magic Menu grid).
    * [ ] **Component: Miller Columns**
        * Story: `Browsing` (3 columns with dummy data).
        * Story: `Preview` (Selection active, preview pane visible).
    * [ ] **Component: Editor**
        * Story: `Read Mode` vs `Edit Mode`.
        * Implement basic Markdown rendering.

### Phase 3: The Layout & Animation Engine
* **Goal:** Connect components with the "Squeeze" physics.
* **Action Items:**
    * [ ] **Layout: Dashboard Grid**
        * Create a responsive grid that holds generic `Tile` components.
    * [ ] **Interaction: Focus Transition**
        * Implement the click-to-expand logic.
        * Handle the "compression" of sibling tiles (fade out text, fade in icons).
    * [ ] **Interaction: Magic Drawer**
        * Wire up the status bar click to the expanded view state.

### Phase 4: Integration (The App)
* **Goal:** Connect to real file system / data.
* **Action Items:**
    * [ ] Hook up File System API (or local storage for prototype).
    * [ ] Implement "Command Palette" logic in the Magic Drawer.
    * [ ] Final Polish: Keyboard shortcuts (`Cmd+P`, `Cmd+S`, `Esc`).

---

## 5. Storybook Structure (New Section)

Add these specific stories to your existing Storybook sidebar under a "LifeOS" group:

* **LifeOS / Atoms**
    * `Typography` (Headings, Paragraphs, Monospace)
    * `Icon` (Lucide/Heroicons, specifically customized for the terminal look)
    * `TileFrame` (The base box with the specific border logic)
* **LifeOS / Molecules**
    * `MicroHeader` (The strip at the top of every tile)
    * `FileListItem` (For Miller columns)
    * `Widget` (Clock, Weather, Todo Item)
* **LifeOS / Organisms**
    * `StatusBar` (The footer logic)
    * `FileBrowser` (The full navigation widget)
    * `Editor` (The text area)
* **LifeOS / Layouts** (The most important section for this project)
    * `MainGrid` (The Bento Box)
        * *Controls:* Add Storybook "Knobs" or "Controls" to toggle between `Dashboard`, `Focus`, and `Zen` states to test animations manually.

---

## 6. Technical Notes on Animation
* **Do not animate `width/height` directly** if possible. It causes layout thrashing.
* **Technique:**
    * Use CSS Grid for the static states.
    * Use the **View Transitions API** (if Web) to interpolate between the grid states automatically.
    * *Fallback:* Use `framer-motion` (React) or `GSAP` (Vanilla/Vue) with layout projection.

## 7. Next Step
**Immediate Action:** Create the `LifeOS` folder in your existing component library and create the `TileFrame` component. This component is the atomic unit of your design—verify the "gapless border" logic works within your current CSS setup.