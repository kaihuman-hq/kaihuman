# Lifosy - Feature Documentation & Roadmap

## Overview
Lifosy is a "Life Operating System" designed to give users control over their data by using files instead of proprietary services. It is currently built as a Git-backed web application.

## Current Experience & Features
Based on the analysis of `apps/life-os` and `apps/life-os-landingpage`.

### Core Philosophy
- **Files over Services**: Data is stored in a Git repository (GitHub) rather than a closed database.
- **Ownership**: Users own their data completely.
- **Universal Access**: Web-based access across devices.

### Key Functionality

#### 1. Dashboard (`/`)
- Personalized dashboards using widgets.
- **Types**: Personal (Habits, Goals), Work (Projects, Collab), Projects (Tasks, Timelines).
- **Components**:
    - Recently Opened Files.
    - Favorites (Quick access to specific dashboards/files).
    - Widget System (implied by "Widget View").

#### 2. Editor & File Management (`/editor`, `/files`)
- **Monaco Editor**: Full code/text editing capabilities.
- **Markdown Support**: First-class support for writing.
- **View Modes**:
    - **Source**: Raw text editing.
    - **Widget View**: Specialized interactive UI based on file type.
    - **Additional View**: Split view for auxiliary information (e.g., Markdown preview, CSV table).
- **Supported File Types & Widgets**:
    The app detects file types via `FileTemplateUtils.getTypeFromFileName(path)` which likely checks extensions or naming conventions.
    All widgets are React components rendered in `RenderedView.tsx`.
    - **Productivity**:
        - `Timetracking` (`RenderedTimetracking`):
            - **UI**: Display "Hours worked this week", "Start/Stop" buttons, and "Add Break" buttons.
            - **Visualization**: `LineChart` (from `@carbon/charts-react`) showing "Per Day" and "Per Week" hours.
            - **Data**: Parses/Updates CSV content directly.
            - **Actions**: `track` (add entry), `addBreak` (add 15/30/60m break).
        - `Habit` (`RenderedDailyHabitGoal`):
            - **UI**: Motivational text ("You reached X goals in a row!").
            - **Visualization**: `ActivityTracker` (heatmap tile) showing streaks.
            - **Data**: CSV based.
            - **Actions**: `checkinToday`, `checkinYesterday`.
        - `Todos` (`RenderedTodo`):
            - **UI**: Grouped lists of todos (by `# Heading`). Large lists are truncated on mobile.
            - **Interaction**: `SelectableTile` items. Clicking toggles "done" status (strikethrough).
            - **Actions**: `add` (Dropdown for section + Text input for new todo).
            - **Data**: Markdown parsing (checkbox syntax).
        - `PomodoroTechnique`: Likely a timer overlay/widget (needs verify, but similar pattern to others).
    - **Data & Finance**:
        - `Budget`: Likely parses CSV financial data, renders Carbon Charts (Pie/Bar) for expenses vs income.
        - `DataCollection`: General key-value pairwise tracking.
    - **Information & Planning**:
        - `Events`: Renders a calendar view or list of upcoming events from a file.
        - `Timezones`: Converts current time across defined zones.
        - `Rss`: Fetches and displays feed items from RSS URLs listed in the file.
        - `ReadItLater`: List of saved URLs with read status.
    - **Creative & Visual**:
        - `TLDraw`: Integrates `tldraw` canvas for whiteboard sketches stored as JSON/binary.
        - `BioLinks`: Renders a public-profile style page with links, avatars, and social icons (Mobile-first view).
        - `Poi`: Renders Map (likely Leaflet or Google Maps) with pins from file data.
    - **System & Generic**:
        - `Generic`: Fallback text view.
        - `Diary`: Validates dates, offers "Yesterday"/"Today" slash commands to insert date headers.
        - `LifosyEvent`, `LifosyForm`: Specific JSON schemas for internal app events or data collection forms.

#### 3. Search & Navigation (`/search`)
- **Global Search**:
    - **UI**: Simple text input with `SkeletonPlaceholder` for loading state.
    - **Results**: Renders `ClickableTile` for each matching file.
    - **Mechanism**:
        - Likely uses a server-side search (GitHub Search API) or client-side index depending on implementation visibility.
        - *Correction*: `apps/life-os/src/pages/search/page.tsx` calls `search.getSearchResults()`. Need to verify if this is client-side filtering of loaded files or API call. (Assuming API given the separate search route).

#### 4. Reference Graph (`/graph`)
- **Visualizes dependencies** between Markdown files (e.g., wiki-links `[[link]]` or standard `[link](./file.md)`).
- **Implementation**:
    - **Store**: `ReferenceGraphStore` (`models/api/reference-graph.ts`).
    - **Parsing**: Regex based (`MARKDOWN_LINK_REGEX`) to extract links from content.
    - **Fetching**:
        - Fetches **all** markdown files in the repo/branch to build the graph.
        - **Rate Limiting (Client-side)**: Implements a custom rate limiter (1000 files/hour) using `localStorage` to prevent exhaustion of GitHub API limits.
        - **Concurrency**: Fetches files in batches (concurrency: 8).
    - **Rendering**:
        - Uses `ForceDirectedGraph.Component` (likely D3.js based wrapper).
        - **Interactivity**: Zoom/Pan support. Clicking nodes navigates to `/editor`.
        - **Responsive**: Auto-resizes based on container dimensions.

#### 5. History & Commits (`/commits`)
- **Global History**:
    - **Route**: `/commits`.
    - **UI**: `DataTable` showing all commits in the repository.
    - **Columns**: Commit (Link), Message, Date (Sortable), Author.
    - **Pagination**: Client-side pagination (10/20/50/100 items).
- **File History**:
    - **Context**: Inside `/editor`.
    - **Features**: View past versions of the specific file and **Restore** content from a previous commit.

#### 6. General App Features
- **Theming**:
    - **State**: Managed in `AppStore` (`theme` model).
    - **Default**: Defaults to "dark" mode if no local storage preference found (`LOCALSTORAGE_KEYS.theme`).
    - **Implementation**: Uses `@urbanisierung/mobx-types` ThemeStore. Passed to Carbon components (e.g., charts options) and `react-components` (e.g., `ActivityTracker`).
- **GitHub Organization & Repo Switching**:
    - **Onboarding**: `RepoOnboarding` component allows users to "Onboard now" (current user) or "Create new repo".
    - **Selection**: `GithubProfileStore` manages `owner` (User/Org) and `repo`.
    - **Switching**: Users can switch the active repository context. `selectRepo` action triggers a full state reset (clears caches, reloads config).
    - **PARA Method**: Includes a "Create new repo" flow that can scaffold a repository with PARA (Projects, Areas, Resources, Archives) folder structure.
- **Quick Notes**:
    - **Feature**: One-click creation of a timestamped markdown file.
    - **Implementation**: `createQuickNote` action in `GithubFileStore`.
    - **Format**: Filename `quicknote-YYYY-MM-DD-HH:mm:ss.md`.
    - **Location**: Stored in `quicknotes/` sub-directory (defined in `APP_CONFIG`).
    - **Behavior**: Creates file and immediately opens it in the editor.

- **Unsaved Changes**:
    - **Mechanism**: `GithubFileStore` tracks `unsaved` vs `current` vs `original` content.
    - **Persistence**: Unsaved changes are written to `IndexedDB` immediately.
    - **Restoration**: On app boot, `restoreUnsavedFilesFromIndexedDB` loads these back into memory, protecting against browser crashes/refreshes.

## Data & API Architecture

### State Management
- **MobX State Tree (MST)**: The entire app state is a tree (`RootStore`).
- **Stores**:
    - `GithubFileStore`: Manages file content, cache state, history, and unsaved changes.
    - `GithubProfileStore`: Manages User profile, Repo selection, and Branch state.
- **Caching**:
    - `StateAndCache`: A centralized generic cache logic. Features conditional fetching (`shouldFetch(key, ttl)`).
    - **TTL**: Different TTLs for different data types (e.g., 5 days for RepoCommits, 2 years for content at specific commit).

### Data Synchronization Flow
1.  **Load**:
    - Check Cache -> Return if valid.
    - Fetch from GitHub API (`GithubRepo.Service.getFile`).
    - Decode Base64 content.
    - Update MST Store & Cache.
2.  **Save/Update**:
    - **Optimistic**: Update local MST Store immediately.
    - **Persist**: Write to `IndexedDB` (as unsaved).
    - **Sync**: `save` action calls `GithubRepo.Service.saveFile` (GitHub API specific commit).
    - **Confirm**: On success, update `original` sha in Store and remove from `unsaved`.
3.  **Offline**:
    - App functions if assets are cached (Service Worker).
    - Reads/Writes to `IndexedDB` allowing full editing offline.
    - Syncs when back online (though explicit "sync queue" logic needs to be verified/built for the re-write).

### API Layer
- **Package**: `@urbanisierung/api` (Shared workspace package).
- **Service Patterns**:
    - `GithubRepo.Service`: `getFile`, `saveFile`, `deleteFile`, `renameFile`.
    - `GithubProfile.Service`: `get` (Profile), `searchRepos`.
- **Authentication**: OAuth token based (stored in `localStorage`).
- **History**: File commit history visualization with restore capability.
- **Favorites**: Mark files as favorites for quick access.

#### 3. Knowledge Management
- **Reference Graph** (`/graph`): Visualization of links between Markdown files (Force-directed graph).
- **Global Search** (`/search`): Search across the repository.

#### 4. "Micro Pages" & Public Profiles
- **Biolinks** (`/b/:username`): Public profile page generated from repository data.
- **POI** (`/p/:username/:name`): Points of Interest or specific public pages.
- **Idea**: Hosting simple pages/forms without extra services.

#### 5. Connectivity & Integration
- **GitHub Integration**: Authenticate with GitHub, select repositories, commit changes.
- **Onboarding**: Flow to select or create a repository.

#### 6. Smart Features
- **AI Integration** (`/ai`): Prompt interface for AI assistance (Local or API).

## Future Requirements (The Re-implementation)

### Goals
- **Local-First & Offline**:
    - Must function completely without an internet connection.
    - **PWA**: Installable web app.
    - **Conflict Resolution**: Robust sync mechanism (likely CRDTs or smarter Git merging) to handle offline edits and multi-device sync seamlessly.
- **Performance**:
    - "Must get faster". Significant optimization of load times and interaction latency.
- **Design Upgrade**:
    - Replace the current design system (Carbon) with a new, custom, premium design.
    - Focus on aesthetics ("wow" factor) and responsiveness.

### Technical Direction
- **Framework**: Move to a performance-focused stack (likely Vite + React/Preact with minimal overhead).
- **Styling**: Vanilla CSS or a lightweight, flexible system (avoiding heavy UI kits like Carbon).
- **State/Sync**: Re-evaluate MobX/MST. Consider local-first databases (e.g., drift via electric-sql, rxdb, or just smarter git-in-browser w/ local caching).
- **Git**: Continue using `isomorphic-git` but optimize for local caching (LightningFS) to reduce network roundtrips.

## Use Cases to Support
1.  **Daily Journaling**: Offline-capable, syncs when online.
2.  **Coding/Notes**: editing config files or docs on the go.
3.  **Public Presence**: Publishing simple sites/links from the personal repo.
