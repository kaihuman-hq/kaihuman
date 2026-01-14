# Life OS (Console) Project Context

## Philosophy
*   **Files over Services**: Data is stored in plain text/markdown files in a Git repository.
*   **Ownership**: The user owns their data completely. No vendor lock-in.
*   **Universal Access**: Works offline, works on mobile (PWA), syncs via Git.

## Core Features

### 1. Dashboard
*   Personalized widgets (Time tracking, Habits, Todos).
*   "Nexus" design theme.

### 2. Editor
*   **Markdown Support**: Full WYSIWYG or Hybrid editor.
*   **Widgets**: Special rendering for specific file types:
    *   `*.tracker.csv`: Time tracking charts.
    *   `*.habit.csv`: Activity heatmaps.
    *   `*.todo.md`: Interactive checkbox lists.
*   **Split Views**: Edit source and view rendered widget simultaneously.

### 3. Navigation & Search
*   **Graph View**: Force-directed graph of wiki-links (`[[links]]`) between files.
*   **Global Search**: Fast client-side search of all file paths and content.
*   **Quick Notes**: One-click creation of timestamped files.

### 4. Git Integration (Local-First)
*   **Sync**: Pull/Push to GitHub (or other providers).
*   **History**: View commit history per file.
*   **Unsaved Changes**: cached in IndexedDB prevents data loss if browser closes.

## User Personas
*   **Developers**: Love owning data in Git.
*   **Privacy Advocates**: Want offline-first, no-cloud solutions.
*   **Productivity Geeks**: Want fully customizable dashboards.
