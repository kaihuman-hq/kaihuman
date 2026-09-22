# Lifosy Browser Extension

The official browser extension for Lifosy, designed to enhance your web experience and seamlessly integrate with your Lifosy console.

## Features

- **Read-it-later**: Quickly save web pages to your "read-it-later" list.
- **Save to Knowledge Base**: Add selected text or snippets directly to your knowledge base.
- **Quick Dump Notes**: Rapidly create notes without navigating away from your current tab.
- **Context Menu Integration**: Conveniently access Lifosy features directly from the browser's context menu.
- **Pinned Tabs Sync**: Save named groups of pinned tabs to your repo, and load any of them into the current window on any machine.
- **Bookmarks**: Your repo's bookmarks, mirrored into the browser and kept in sync in the background. Bookmark the current page from the popup or the palette.
- **Command Palette**: `Ctrl+Shift+Space` on any page to search those bookmarks — and, on request, your repo.

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

## Bookmarks

Bookmarks are maintained in the console as a **Bookmarks** file (`.bookmarks.json`) and read by
the extension from one fixed path in the active repo: `.kh/browser.bookmarks.json`. To create it,
pick **New File → Bookmarks** in the console, name it `browser` and put it in the `.kh` folder.
Bookmark files anywhere else in the repo work fine in the console but are not what the extension
mirrors.

```json
{
  "bookmarks": [
    {
      "id": "6f1c…",
      "title": "Vitest",
      "url": "https://vitest.dev/",
      "tags": ["testing"],
      "createdAt": "2026-09-22T10:00:00.000Z",
      "updatedAt": "2026-09-22T10:00:00.000Z"
    }
  ],
  "updatedAt": "2026-09-22T10:00:00.000Z"
}
```

Only `http`/`https` entries are ever shown or opened; any other scheme in the file is dropped.

### Bookmarking the current page

Two surfaces write to that same file, both committing through the GitHub API:

- **Popup → Bookmarks → Bookmark this page**, with optional comma-separated tags.
- **The palette → Actions → Bookmark this page**, with no tags — for when you want it saved in
  one keystroke. The palette stays open and confirms, so you can keep searching.

Both prefer the page's `<link rel="canonical">` over the address bar, so the same page saved from
either surface lands on one URL. A page already in the file is refused rather than duplicated
(compared canonically, so `https://x.com` and `https://x.com/` are the same page), and the new
entry goes straight into the cache — no waiting for the next sync to see it.

### Caching and sync

The extension never waits on GitHub to show you a bookmark:

- The list is cached in `chrome.storage.local` and served from there.
- A cache older than 15 minutes is still served, and refreshed in the background — so an edit in
  the repo shows up on the next use, not after a spinner.
- An alarm syncs every 15 minutes even if you never open the palette.
- Refreshes replay GitHub's own `ETag` as `If-None-Match`, so an unchanged file answers `304` —
  a response GitHub does not count against your rate limit.
- The cache records which repo it came from, so switching repos in the popup re-fetches. Logging
  in again drops it, because a new token can mean a different account.

A repo with no `.kh/browser.bookmarks.json` yet is an empty list, not an error.

## Command Palette

`Ctrl+Shift+Space` (`Command+Shift+Space` on macOS) opens a palette in the middle of the current
page. Rebind it at `chrome://extensions/shortcuts`. Chrome does not run extension content scripts
on its own pages (`chrome://…`, the New Tab page, the Web Store), so the palette cannot open
there — switch to a normal tab.

- **Type** to filter your bookmarks. This is a local search over the cache, so it costs nothing
  and does not touch the network. A title that starts with what you typed ranks above one that
  merely contains it, then tags, then the URL.
- **↑ / ↓** move the selection, **⏎** opens it in a new tab, **Esc** (or a click outside) closes.
- **Actions** hold **Bookmark this page**, listed below your bookmarks so `⏎` on an open palette
  opens a bookmark rather than writing one. Type `bookmark` to bring it to the top.
- **⇥ Tab** searches the *repo* for what you typed — one GitHub code search, only when you ask
  for it. GitHub's code-search endpoint has a small dedicated budget (~10 requests/minute) that
  penalizes bursts, so the palette never searches the repo while you type. Results appear under a
  **Repo** heading and open on GitHub. Typing again clears them, since they belong to the old
  query.

The palette renders inside a shadow root, so the page's styling cannot reach it and its styling
cannot reach the page.

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
