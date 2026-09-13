# Lifosy Browser Extension

The official browser extension for Lifosy, designed to enhance your web experience and seamlessly integrate with your Lifosy console.

## Features

- **Read-it-later**: Quickly save web pages to your "read-it-later" list.
- **Save to Knowledge Base**: Add selected text or snippets directly to your knowledge base.
- **Quick Dump Notes**: Rapidly create notes without navigating away from your current tab.
- **Context Menu Integration**: Conveniently access Lifosy features directly from the browser's context menu.
- **Pinned Tabs Sync**: Save named groups of pinned tabs to your repo, and load any of them into the current window on any machine.

## Pinned Tabs

The **Pinned Tabs** section of the popup stores named groups of pinned tabs in the active repo
at `.kh/browser.pinnedtabs.json`. By default each group is one row: its name and a single large
button, so loading a group is one quick click. The group the current window is running is marked
and shows **Update** instead of **Load**. **Edit** in the section header swaps those buttons for
the management controls and reveals each group's tab count and creation date; **Done** leaves
edit mode.

- **Load** — makes the window's pinned tabs match the group: opens what is missing and
  **unpins** (never closes) pinned tabs the group does not contain, so switching between groups
  leaves a clean window and nothing is lost. Loading the same group twice is a no-op.
- **Update** — writes the window's current pinned tabs back into the loaded group, keeping its
  id, name and creation date. This is how you add or remove a tab from a saved group.
- **Save current** — types a name and stores the window's pinned tabs as a new group.
- **Rename** *(edit mode)* — edits the group's name in place, keeping its tabs and creation date.
- **↑ / ↓** *(edit mode)* — reorders the group in the list; the order is stored in the repo file.
- **Delete** *(edit mode)* — forgets the group after an inline confirmation. It only removes the
  entry from the repo; whatever is pinned in the window stays pinned.

Only `http`/`https` entries are ever opened; any other scheme in the file is dropped.

```json
{
  "groups": [
    {
      "id": "6f1c…",
      "name": "Work",
      "createdAt": "2026-09-03T10:00:00.000Z",
      "tabs": [{ "url": "https://example.com/", "title": "Example" }]
    }
  ],
  "updatedAt": "2026-09-09T08:00:00.000Z"
}
```

### How the loaded group is detected

The extension remembers which group each window loaded in `chrome.storage.session`, which Chrome
clears on restart — the same lifetime as the window ids it is keyed by, so a remembered entry can
never point at the wrong group. After a restart, or in a window the extension has not loaded into,
it falls back to matching the window's pinned tabs against each group and picks the one with more
than half its tabs present. That combination keeps **Update** pointed at the right group both after
you edit a pinned tab and after you restart the browser.

Reading the URL of every tab requires the `tabs` permission, which Chrome surfaces as
"Read your browsing history" when the extension is installed or updated.

## Development

The extension is built with TypeScript, Preact, and Vite, using Tailwind CSS for styling.

### Prerequisites

Ensure you have Node.js and `pnpm` installed. Run `pnpm install` from the monorepo root to install all dependencies.

### Available Scripts

Navigate to the `apps/browser-extension` directory to run these commands:

- `pnpm dev`: Starts the Vite development server with Hot Module Replacement (HMR).
- `pnpm build`: Compiles TypeScript and builds the production-ready extension.
- `pnpm preview`: Previews the built extension.

### Loading the Extension Locally

1. Run `pnpm dev` or `pnpm build`.
2. Open your browser's extension management page (e.g., `chrome://extensions/` in Chrome).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `apps/browser-extension/dist` directory.
