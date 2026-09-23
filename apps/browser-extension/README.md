# Lifosy Browser Extension

The official browser extension for Lifosy, designed to enhance your web experience and seamlessly integrate with your Lifosy console.

## Features

- **Read-it-later**: Quickly save web pages to your "read-it-later" list.
- **Save to Knowledge Base**: Add selected text or snippets directly to your knowledge base.
- **Quick Dump Notes**: Rapidly create notes without navigating away from your current tab.
- **Context Menu Integration**: Conveniently access Lifosy features directly from the browser's context menu.
- **Pinned Tabs Sync**: Save named groups of pinned tabs to your repo, and load any of them into the current window on any machine.
- **Bookmarks**: Your repo's bookmarks, mirrored into the browser and synced at most once an hour. Bookmark the current page from the popup or the palette, or import the ones this browser already has. Opens are counted so you can find the ones you never use.
- **Command Palette**: `Ctrl+Shift+K` on any page to search those bookmarks, repeat what you did last, run any of the extension's actions — and, on request, search your repo.
- **Start Page**: a New Tab page of your own — the bookmarks you reach for, a box for a dump note, and the palette (which Chrome's own New Tab page cannot host).

## Popup

The popup opens on two icon buttons — **pin this page to the Knowledge Base** and **bookmark this
page** — followed by the pinned-tab groups and the note box. The star opens a view of its own where
you can add comma-separated tags and **Save**, or **Skip** to save the page without any. That view
also holds **Import all browser bookmarks**.

The **kaihuman** title in the header opens the app at <https://app.kaihuman.com> in a new tab.

Everything here is also a palette action, so none of it needs the popup.

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

### Caching

Groups are cached and refreshed the same way bookmarks are (see below), so the popup lists them
without waiting on GitHub. Saving, renaming, reordering and deleting always re-read the file first:
a commit goes against the `sha` the file had a moment ago, and committing against a cached one
would overwrite whatever changed in the repo since.

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
      "updatedAt": "2026-09-22T10:00:00.000Z",
      "pinned": true
    }
  ],
  "updatedAt": "2026-09-22T10:00:00.000Z"
}
```

Only `http`/`https` entries are ever shown or opened; any other scheme in the file is dropped.
`pinned` is optional and only a literal `true` counts; both apps carry it across every rewrite, so
a sync never unpins what the console pinned.

### Bookmarking the current page

Two surfaces write to that same file, both committing through the GitHub API:

- **The popup's star**, which opens a view with the **URL**, **title** and **tags** all editable —
  **Save**, or **Skip tags** to save what is there without any.
- **The palette → Bookmark this page…**, which walks you through the same three fields: URL, then
  title, then tags. Each is prefilled and selected, so `⏎` keeps it and typing replaces it; `Esc`
  steps back a field rather than throwing the lot away. The palette stays open and confirms, so
  you can keep searching.

Both prefill from the page but neither is stuck with it: a tracking-laden URL or a site's
boilerplate title is worth fixing before it is saved.

Both prefer the page's `<link rel="canonical">` over the address bar, so the same page saved from
either surface lands on one URL. A page already in the file is refused rather than duplicated
(compared canonically, so `https://x.com` and `https://x.com/` are the same page), and the new
entry goes straight into the cache — no waiting for the next sync to see it.

### Importing this browser's bookmarks

**Import all browser bookmarks** — in the popup's bookmark view, or as a palette action — copies
every `http(s)` bookmark this browser holds into the repo file in a single commit. A bookmark
inside a folder you made carries that folder's name as its tag; the browser's own roots
("Bookmarks bar", "Other bookmarks") are not turned into tags, since they say nothing.

Pages already in the file are skipped rather than duplicated, so running it twice is safe, and the
imported block is appended so whatever the file already had stays where it was.

Reading the browser's bookmarks needs the `bookmarks` permission, which is **optional**: the
extension does not ask for it on install, so nobody who never imports has to grant "Read and change
your bookmarks". The popup asks the first time you press the button. That is also why the import
has to start there — `chrome.permissions.request` needs a user gesture in an extension page, which
a message from the palette is not, so the palette's version of the action points you at the popup
until the permission is granted.

### Caching and sync

The extension never waits on GitHub to show you a bookmark, and it talks to GitHub at most once
an hour on its own:

- The list is cached in `chrome.storage.local` and served from there.
- A cache older than an hour is still served, and refreshed in the background — so an edit in
  the repo shows up on the next use, not after a spinner.
- An alarm checks hourly, and **opening the popup checks too** — but a cache still inside its hour
  is left alone, so opening the popup ten times costs nothing.
- **Sync now** — the button in the popup header, or the palette action — ignores that budget. Asking
  outright is not background traffic: it fetches, pushes whatever has been counted, and brings the
  pinned-tab groups along. Reach for it when you have just changed something in the console and
  want it here now.
- Refreshes replay GitHub's own `ETag` as `If-None-Match`, so an unchanged file answers `304` —
  a response GitHub does not count against your rate limit.
- The cache records which repo it came from, so switching repos in the popup re-fetches. Logging
  in again drops it, because a new token can mean a different account.

A repo with no `.kh/browser.bookmarks.json` yet is an empty list, not an error.

Saving a bookmark, importing, or any pinned-tab group change is *your* action, not a background
one, so it commits straight away rather than waiting for the hour.

### Which bookmarks you actually use

Every bookmark carries a `useCount` and a `lastUsedAt`, so the console's widget can sort by
**least used** and show you what is safe to delete. Opening one from the palette costs no GitHub
request at all: the open is counted locally, as a *delta* on top of whatever the file holds, and
the deltas ride along with the next sync or the next commit.

The merge, when a sync does happen, is deliberate about who wins:

1. **Fetch first.** GitHub's file replaces the cached list wholesale, so a bookmark edited or
   deleted in the console wins — the extension never pushes a stale copy over it.
2. **Add the counts.** A delta is *added* to the count GitHub holds rather than replacing it, and
   `lastUsedAt` takes the later of the two. Two machines counting at the same time therefore sum
   instead of overwriting each other, and a delta for a bookmark that GitHub no longer has is
   dropped along with it.
3. **Push back**, but only when there is something to push. An hour in which you opened nothing
   costs one conditional `GET` and no commit.
4. **Settle.** The pushed deltas are *subtracted* rather than cleared, so an open counted while the
   commit was in flight survives for the next round.

The cache always holds GitHub's numbers, never locally adjusted ones — the deltas are added when
the list is read. That separation is what makes it impossible for a sync to count anything twice.

## Command Palette

`Ctrl+Shift+K` (`Command+Shift+K` on macOS) opens a palette in the middle of the current page.
Rebind it at `chrome://extensions/shortcuts`. Chrome does not run extension content scripts
on its own pages (`chrome://…`, the Web Store), so the palette cannot open there — switch to a
normal tab. The New Tab page used to be on that list; the start page below is the answer to it.

- **Recent** holds the last ten things you did here — a bookmark you opened, a repo file, an
  action you ran — newest first, so `⏎` on a freshly opened palette repeats the last one. Repeating
  something moves it back to the top rather than listing it twice.
- **Type** to filter your bookmarks. This is a local search over the cache, so it costs nothing
  and does not touch the network. A title that starts with what you typed ranks above one that
  merely contains it, then tags, then the URL.
- **↑ / ↓** move the selection, **⏎** opens it in a new tab, **Esc** (or a click outside) closes.
- **Actions** are everything the popup and the context menu can do, listed below your bookmarks so
  `⏎` opens what you were looking for rather than writing something. Type part of an action's name
  to bring it to the top.
- **⇥ Tab** searches the *repo* for what you typed — one GitHub code search, only when you ask
  for it. GitHub's code-search endpoint has a small dedicated budget (~10 requests/minute) that
  penalizes bursts, so the palette never searches the repo while you type. Results appear under a
  **Repo** heading, and `⏎` opens the file in the console — `https://app.kaihuman.com/files/<path>`,
  the same deep link the console uses internally — rather than on GitHub. Typing again clears them,
  since they belong to the old query.

  The link names the repository too, so a hit found while the extension points at one repo opens
  that repo's file and not the console's other one — the console selects it and drops the
  parameter again.

### Actions

Everything the extension can do is here, so the popup is never the only way in:

| Action | What it does |
| --- | --- |
| Bookmark this page… | Walks through URL, title and tags, each prefilled from the page |
| Pin this page to the Knowledge Base | Saves the page text as a note to process later |
| Add the selected text to the Knowledge Base | The context menu's clipping, from the keyboard |
| Add a note… | Pick the dump or any quick-note file, then type; an `.actionlog.md` target takes `#tags` in the text |
| Pinned tab groups… | Pick a group, then load, update, rename, reorder or delete it |
| Save this window's pinned tabs as a new group… | Asks for the name |
| Import the browser's bookmarks | Copies them into the repo file (grant access from the popup first) |
| Switch repository… | Pick from the repositories the console shared |
| Sync with GitHub now | Fetches and pushes immediately, ignoring the hourly budget |
| Open the Lifosy console | |

The three page actions at the top — bookmark, pin, clip — need a page to read, so the palette on
the start page starts at **Add a note…**. Everything below it is the same list.

An action that needs arguments takes over the input and walks through them one at a time, with the
breadcrumb showing which field and how far along (`Bookmark this page · Title (2/3)`) and the row
area showing what you have answered so far. An action ending in `…` opens a list instead of
running. **Esc** unwinds one step at a time — back a field, then out of the argument, back out of
each list, and only then closes the palette. Deleting a tab group asks you to type `DELETE`, since
it is otherwise one keystroke away.

The palette renders inside a shadow root, so the page's styling cannot reach it and its styling
cannot reach the page.

### When the shortcut does nothing

The palette lives in a content script, and Chrome only runs declared content scripts when a page
*loads*. So every tab that was already open when you installed, reloaded or updated the extension
has no content script in it. The extension handles that by injecting the script on demand when the
relay finds nothing listening — you do not need to reload your tabs.

If a press still does nothing, work through these in order:

1. **Check the binding.** Open `chrome://extensions/shortcuts`. If the row for "Open the Lifosy
   command palette" is empty, Chrome could not honour the suggested `Ctrl+Shift+K` — the
   combination is already taken by the OS or another extension — and silently left it unbound.
   Click the field and set any combination you like; `Ctrl`/`Alt` plus an optional `Shift` and a
   letter is the safest shape, and combinations involving `Space` are worth avoiding because
   input-method switchers on Windows and Linux commonly claim them before Chrome sees the press.
   The service worker also logs the binding it ended up with (or a warning that there is none) when
   the extension is installed or updated.
2. **Check the page.** The palette cannot run on pages no extension may touch: `chrome://…`, the
   Chrome Web Store, the PDF viewer, `view-source:`. The toolbar icon shows a red `!` badge when a
   press lands on one of those, and the service worker console names the URL. The start page is not
   one of them: it is a page of the extension's own, so the shortcut is relayed straight to it.
3. **Check the service worker.** On `chrome://extensions`, "service worker" under the extension
   opens its console — the two messages above appear there.

## Start Page

The extension replaces Chrome's New Tab page with its own (`chrome_url_overrides.newtab`), which
Chrome asks you to confirm the first time. It holds four things:

- **Search** — opens the command palette, with the whole action list and your bookmarks in it.
  Chrome keeps the focus in the address bar on an override page, so nothing here is focused for you
  and typing still goes to the omnibox: press the shortcut, or click the field.
- **Pinned tabs** — the saved pinned-tab groups, the same list the popup's **Pinned Tabs** panel
  shows, as compact cards in the bookmark grid. The group this window is running is outlined in the
  accent colour. Clicking a card loads it exactly as the popup's **Load** does — pins what is
  missing, unpins what the group does not have — and leaves the start page where it is. Saving,
  renaming and reordering groups stay in the popup and the palette.
- **Pinned & recently used** — every pinned bookmark first, in the order the repo file holds them,
  then the twelve you opened most recently. A repo whose bookmarks have never been opened still
  shows its latest ones instead of an empty grid. Opening one is counted exactly as it is in the
  palette, and **takes this tab over** rather than leaving a blank start page behind.

  Each card has a **pin** in its corner. Pinning moves the card to the top at once and commits
  `"pinned": true` to the bookmark in the repo file — the same field the console's Bookmarks widget
  sets, so a pin made in either place shows up in both. A pin is never cut to fit the twelve. If the
  commit fails (offline, or the bookmark was deleted in the console meanwhile) the card goes back
  and the page says why.
- **Dump note** — writes to `.lifeos/dump.md`. Any other target is one palette action away
  (**Add a note…**), which is also the only place that reads the repo's quick-note list: a new tab
  is opened far too often to spend a GitHub request on it.

Bookmarks and tab groups come from the same caches the popup and the palette read, so a new tab costs no GitHub
request of its own — a cache past its hour is refreshed in the background, as everywhere else.

The **kaihuman** title opens the app, like the popup's.

Everything on the page needs a token, so before you have logged in through the console it is a
single **Open Console** button.

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
