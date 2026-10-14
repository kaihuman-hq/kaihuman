# Browser extension

The kaihuman browser extension lives in `apps/browser-extension` (package name `browser-extension`). It is a Chrome Manifest V3 extension built with TypeScript, Preact, Vite, Tailwind CSS and the CRXJS Vite plugin (`@crxjs/vite-plugin`). It reads and writes files in your active GitHub repository through the GitHub API, using the token the kaihuman console hands it. It has a toolbar popup, a replacement New Tab start page, a context menu clip, the shared command palette on every page, and a background service worker that caches and syncs everything.

## Loading the extension into Chrome for development
<!-- docspack: tags=install,unpacked,load unpacked,developer mode -->

The extension is not installed from a store in this repo. Build it and load the `dist` folder as an unpacked extension.

1. Run `pnpm install` from the monorepo root.
2. In `apps/browser-extension`, run `pnpm dev` (Vite dev server with HMR on port `5173`) or `pnpm build`.
3. Open `chrome://extensions/` and enable **Developer mode**.
4. Click **Load unpacked** and select `apps/browser-extension/dist`.

On first use Chrome asks you to confirm that the extension replaces the New Tab page (`chrome_url_overrides.newtab`). The `tabs` permission shows as "Read your browsing history" at install time. The `bookmarks` permission is optional and only requested when you import browser bookmarks.

In development the service worker creates a `swKeepAlive` alarm every 30 seconds. It keeps the MV3 worker awake so the Vite HMR port stays connected.

## Building and testing the extension

Scripts in `apps/browser-extension/package.json`:

| Command | What it does |
| --- | --- |
| `pnpm dev` | `vite` dev server with HMR (`strictPort` on `5173`) |
| `pnpm build` | `tsc -b && vite build`, output in `dist/` |
| `pnpm preview` | `vite preview` of the built extension |
| `pnpm test` | `vitest run` |

The manifest is written in TypeScript in `manifest.ts` with `defineManifest` from `@crxjs/vite-plugin`. `vite.config.ts` uses the `preact()` and `crx({ manifest })` plugins. Tests sit next to the source as `*.test.ts` and `*.test.tsx`, for example `src/background/service-worker.bookmarks.test.ts`, `src/background/service-worker.today.test.ts` and `src/newtab/StartPage.test.tsx`.

Runtime dependencies are `preact`, `@kaihuman/formats` (file formats and entry writers shared with the console) and `@kaihuman/palette` (the shared command palette).

## Where the extension's source code lives

| Path | Role |
| --- | --- |
| `manifest.ts` | MV3 manifest: popup `index.html`, New Tab `newtab.html`, command `toggle-command-palette`, permissions |
| `src/main.tsx`, `src/app.tsx` | Popup entry and root component |
| `src/components/` | Popup parts: `QuickActions.tsx`, `BookmarkPageForm.tsx`, `PinnedTabsPanel.tsx`, `ActionLogForm.tsx` |
| `src/newtab/` | Start page: `StartPage.tsx`, `Today.tsx`, `newtab.css`, bundled Noto Sans Mono fonts |
| `src/background/service-worker.ts` | Message router, GitHub I/O, alarms, context menu, palette relay |
| `src/background/bookmarks.ts` | Bookmark file parsing, cache and usage counting |
| `src/background/pinned-tabs.ts` | Pinned tab group file and window matching |
| `src/background/today.ts` | Start page data (todos, events, habits, timers, clocks, read later, braindumps) |
| `src/background/kb-capture.ts` | Knowledge base notes in `.kh/raw/` and images in `.kh/assets/` |
| `src/background/palette-modes.ts` | Prompts, commands, entry files, GitHub work, DeepL for palette modes |
| `src/background/repo-sync.ts` | Shares the active repo with the desktop palette over native messaging |
| `src/background/chrome-bookmarks.ts` | Flattens the browser's bookmark tree for import |
| `src/content/index.ts`, `src/content/extract.ts` | Content script: token bridge, palette host, page-to-Markdown extraction |
| `src/palette/port.ts` | `send()` and `workerPort`, the palette's link to the service worker |
| `src/types.ts` | The `Message` type listing every message type |
| `src/console.ts` | `CONSOLE_URL` and `consoleFileUrl()` deep links |

## Signing in: connecting the extension to the console
<!-- docspack: tags=login,auth,token,onboarding,log in -->

The extension has no login form of its own. It takes a GitHub token from the kaihuman console at `https://app.kaihuman.com` (`CONSOLE_URL`).

- Without a token, the popup shows **Open Console**. It opens `https://app.kaihuman.com/extension-onboarded`.
- The start page also shows only an **Open Console** button until you have logged in.
- The console renders `ExtensionAuthBridge` (`apps/console/src/components/ExtensionAuthBridge.tsx`). It sets `data-kaihuman-auth`, `data-kaihuman-repo` and `data-kaihuman-repos` on `document.body` and fires a `kaihuman-auth-update` window event.
- The content script (`src/content/index.ts`) reads these and sends `AUTH_TOKEN_UPDATE` with `token`, `repo` and `repos` to the worker. It then dispatches `EXTENSION_ONBOARDED` back to the page.
- The worker stores `lifeos_token`, `lifeos_repo` and `lifeos_repos` in `chrome.storage.local`.

Each new token drops `bookmarksCache` and `todayCache`, because a new token can mean a different account. Requests made without a token fail with "No token found" or "Not logged in — open the kaihuman console to connect the extension".

## Switching the active repository
<!-- docspack: tags=repo,repository,switch repo,native messaging -->

Every file the extension reads or writes is in one active repository, stored as `lifeos_repo` in `chrome.storage.local`. The default is `kaihuman-hq/kaihuman`.

- The popup header has a repository `<select>`. On open, the popup fetches `GET /user/repos?per_page=100&sort=updated` and saves the list as `lifeos_repos`. If the stored repo is not in that list, the first one becomes active.
- The palette action **Switch repository…** picks from the repositories the console shared (`GET_REPOS`, `SET_REPO`).
- The caches record their repo, so a switch makes them refetch on the next read.

### Sharing the repository with the desktop palette

Run `kaihuman-palette native-host install <this extension's id>` once. After that, switching the repository in the extension or the desktop palette switches the other too. The newer choice wins.

`src/background/repo-sync.ts` talks to the native host `com.kaihuman.palette` with a `SYNC_REPO` message. It stamps each change of `lifeos_repo` in `lifeos_repo_changed_at`. It asks the desktop hourly and when a start page opens, at most every 30 seconds. Without the host installed, the extension keeps its own choice.

## What the toolbar popup contains
<!-- docspack: tags=popup,toolbar,action button -->

The popup (`index.html`, `src/app.tsx`) is 350px wide. From top to bottom:

- **Header**: the **kaihuman** title opens the console in a new tab. **↻ Sync now** forces a sync. A green **● Connected** marker and the repository selector.
- **Quick actions** (`QuickActions.tsx`), three icon buttons: **Pin this page to the Knowledge Base**, **Bookmark this page** (star) and **Read this page later**.
- **Save page images with pinned pages**: a checkbox, stored as `kb_download_images`.
- **Pinned Tabs** panel (`PinnedTabsPanel.tsx`).
- **Dump Note**: a note box with a target file selector.

The star switches the popup to a bookmark view (`BookmarkPageForm.tsx`) with editable URL, title and tags. That view also has **Import all browser bookmarks**.

Opening the popup sends `SYNC_NOW` without `force`, so the worker checks GitHub only if the cache is older than an hour. Every popup feature is also a palette action.

## Pinning a page to the knowledge base
<!-- docspack: tags=kb,knowledge base,save article,clip page,raw note -->

**Pin this page to the Knowledge Base** saves the whole page as a Markdown note for `/kb-ingest`. It is in the popup and in the palette.

1. The content script runs `extractArticle()` (`src/content/extract.ts`). It drops navigation, headers, footers, forms, ads and other boilerplate and converts the rest to Markdown. Tabs without the content script fall back to plain `innerText`.
2. The worker handles `PIN_ARTICLE`. It writes `.kh/raw/<epoch-ms>-<slug>.md`, where the slug comes from the URL.
3. The note has front matter: `title`, `url`, `date`, `processed: false` and `tags: [general]`.

Images are downloaded into `.kh/assets/<epoch-ms>-<slug>/<n>.<ext>` and the Markdown links point to `/.kh/assets/...`. The limits are 10 images and 2 MB per image. An image that fails keeps its remote URL. Turn downloads off with the popup checkbox **Save page images with pinned pages** (`kb_download_images` in `chrome.storage.local`).

## Clipping selected text with the context menu
<!-- docspack: tags=context menu,right click,selection,clipping -->

Select text on a page, right-click and choose **Add to Knowledge Base**. The context menu item has the id `kaihuman-save-knowledge` and appears only for a selection. It is created in `chrome.runtime.onInstalled`.

The palette action **Add the selected text to the Knowledge Base** does the same from the keyboard. It sends `SAVE_SELECTION`.

Each clip becomes its own file, `.kh/raw/<epoch-ms>-<slug>.md`, with the slug from the page title (or `clipping`). The note has:

- the title `Clipping: <page title>`;
- `tags: [clipping]` and `processed: false` in the front matter;
- a body `Clipped from [title](url):` followed by the selection as a `>` block quote.

An empty selection fails with "Select some text first".

## Saving a page to read later
<!-- docspack: tags=read it later,reading list,readitlater -->

The popup's **Read this page later** button and the palette action **Read later: this page** send `READ_LATER_ADD` with the page URL and title. Only `http`/`https` pages are accepted.

The entry is added with `addReadLaterEntry` from `@kaihuman/formats` to the first `.readitlater.json` file in the repo. If there is none, the worker creates `<app folder>/reading.readitlater.json` (the app folder is `.kh`, or `.lifeos` in older repos).

The start page's **Read later** card shows the three oldest unread items and the total unread count. **✓ read** sends `READ_LATER_DONE`, which marks the item read with `markReadItLaterRead`.

## Writing a dump note or action log entry from the popup
<!-- docspack: tags=quick note,dump,note,action log -->

The popup's **Dump Note** section writes to `.lifeos/dump.md` by default.

- The target selector lists `.lifeos/dump.md` plus the quick-note files from `files.quickNotes` in `.lifeos/.dashboard.config.json` (fetched with `FETCH_QUICK_NOTES`).
- A plain note sends `DUMP_NOTE`. The worker prepends `- <text>` at the top of the file, separated by a blank line.
- If the target ends in `.actionlog.md`, the box becomes `ActionLogForm` with a description and tags. It sends `ADD_ACTION_LOG`, written with `addActionLogEntry` from `@kaihuman/formats`. The fallback action log is `.lifeos/dump.actionlog.md`.

The palette action **Add a note…** offers the same targets. On an `.actionlog.md` target it takes `#tags` inside the text.

## Saving and loading pinned tab groups
<!-- docspack: tags=pinned tabs,tab groups,workspace,sessions -->

The popup's **Pinned Tabs** panel stores named groups of pinned tabs in the repo. Each group row has its name and one button.

- **Load**: makes the window's pinned tabs match the group. It opens missing tabs and **unpins** (never closes) pinned tabs not in the group. Loading the same group twice does nothing.
- **Update**: replaces the loaded group's tabs with the window's current pinned tabs. It keeps the id, name and creation date. It shows instead of **Load** on the group the window is running.
- **☆ / ★**: marks or unmarks a favourite. Favourites come first and are green.
- **Save current**: stores the window's pinned tabs as a new named group.
- **Edit** shows **Rename**, **↑ / ↓** reorder, **Delete** (with an inline confirmation), tab counts and creation dates. **Done** leaves edit mode.

The palette has **Pinned tab groups…** and **Save this window's pinned tabs as a new group…**. Deleting from the palette asks you to type `DELETE`. The start page shows the groups as cards; a click loads one.

### How the running group is detected

The worker remembers which group each window loaded in `chrome.storage.session` under `activeGroups`, keyed by window id. Chrome clears it on restart. After a restart, it matches the window's pinned tabs and picks the group with more than half its tabs present.

## Format of the pinned tab groups file

Groups are stored in `.kh/browser.pinnedtabs.json` (`PINNED_TABS_PATH`):

```json
{
  "groups": [
    {
      "id": "6f1c…",
      "name": "Work",
      "createdAt": "2026-09-03T10:00:00.000Z",
      "favorite": true,
      "tabs": [{ "url": "https://example.com/", "title": "Example" }]
    }
  ],
  "updatedAt": "2026-09-09T08:00:00.000Z"
}
```

- `favorite` is written only when it is `true`.
- Group order in the array is the display order.
- Only `http`/`https` tab URLs are opened. Other schemes are dropped.

The list is cached in `chrome.storage.local` as `pinnedTabsCache` and refreshed like bookmarks. Save, rename, move, favourite and delete always re-read the file first, so the commit uses the current `sha` and does not overwrite changes made in the repo.

## Where browser bookmarks are stored and how to bookmark a page
<!-- docspack: tags=bookmarks,favorites,favourites,star -->

The extension mirrors one file: `.kh/browser.bookmarks.json` (`BOOKMARKS_PATH`). Create it in the console with **New File → Bookmarks**, name it `browser`, in the `.kh` folder. Other `.bookmarks.json` files are not mirrored. A repo without the file is an empty list.

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

Each bookmark also carries `useCount` and `lastUsedAt`. `pinned` counts only as a literal `true`. Only `http`/`https` entries are shown or opened.

Two surfaces add a bookmark with `ADD_BOOKMARK`:

- the popup star, with editable **URL**, **title** and **tags**, then **Save** or **Skip tags**;
- the palette action **Bookmark this page…**, which asks for URL, title and tags in turn.

Both prefill from the page's `<link rel="canonical">` before the address bar. A URL already in the file is refused, compared canonically. The new entry goes into the cache at once.

## Importing the browser's own bookmarks

**Import all browser bookmarks** (popup bookmark view) or the palette action **Import the browser's bookmarks** sends `IMPORT_CHROME_BOOKMARKS`. It copies every `http(s)` bookmark into `.kh/browser.bookmarks.json` in one commit.

- A bookmark in a folder you made gets the folder name as a tag. Browser roots such as "Bookmarks bar" and "Other bookmarks" do not become tags.
- URLs already in the file are skipped, so running it twice is safe.
- Imported entries are appended after the existing ones.

The import needs the optional `bookmarks` permission. `chrome.permissions.request` needs a user gesture in an extension page, so the popup must ask for it the first time. Until it is granted, the palette action points you to the popup.

## How bookmark and tab group sync works
<!-- docspack: tags=sync,cache,etag,rate limit,hourly,how often,github requests,refresh -->

The extension serves bookmarks and tab groups from caches and contacts GitHub on its own at most once an hour.

- Caches live in `chrome.storage.local` (`bookmarksCache`, `pinnedTabsCache`).
- A cache older than an hour (`CACHE_TTL_MS`) is still served and refreshed in the background.
- The `repoSync` alarm runs every 60 minutes. It syncs the repo choice with the desktop, bookmarks, pinned tabs and the start page data.
- Opening the popup sends `SYNC_NOW`. A cache still within its hour is left alone.
- **Sync now** (popup header, start page header, or the palette action **Sync with GitHub now**) sends `SYNC_NOW` with `force: true`. It ignores the hourly budget, pushes pending counts and refreshes tab groups.
- Refreshes send the stored `ETag` as `If-None-Match`. An unchanged file answers `304`, which GitHub does not count against the rate limit.

Your own actions (saving a bookmark, importing, any tab group change) commit at once instead of waiting for the hour.

## How bookmark open counts are synced

Opening a bookmark from the palette or start page sends `RECORD_BOOKMARK_USE`. It costs no GitHub request. The open is counted locally as a delta in `chrome.storage.local` under `bookmarkUsage`.

On each sync:

1. **Fetch first.** GitHub's file replaces the cached list, so console edits and deletions win.
2. **Add the counts.** Each delta is added to GitHub's `useCount`. `lastUsedAt` takes the later value. Deltas for deleted bookmarks are dropped.
3. **Push back** only when there is something to push.
4. **Settle.** Pushed deltas are subtracted, not cleared, so opens counted during the commit survive.

The cache always holds GitHub's numbers; deltas are added on read. The console's Bookmarks widget uses `useCount` to sort by least used.

## Opening the command palette in the extension
<!-- docspack: tags=shortcut,ctrl+shift+k,hotkey,keyboard -->

The command palette is the shared `@kaihuman/palette` package; its modes and prefixes are documented with the palette. This section covers only the extension side.

- Press `Ctrl+Shift+K` (`Command+Shift+K` on macOS). The manifest command is `toggle-command-palette`. Rebind it at `chrome://extensions/shortcuts`.
- On normal pages the palette runs in the content script inside a shadow root, so page styles do not leak in or out.
- On the start page, the worker broadcasts `TOGGLE_COMMAND_PALETTE`. Pressing **⏎** in the start page search also hands the text to the palette.
- If a tab has no content script (it was open before install or update), the worker injects it with `chrome.scripting.executeScript` and retries.
- `>x` commands are copy-only in the extension; the browser cannot run them.

Extension-only palette actions: **Bookmark this page…**, **Read later: this page**, **Pin this page to the Knowledge Base**, **Add the selected text to the Knowledge Base**. These four need a page, so the start page palette starts at **Add a note…**. Shared actions come from `repoActions(workerPort)`. Palette requests go to the worker through `send()` in `src/palette/port.ts`.

## When the palette shortcut does nothing
<!-- docspack: tags=troubleshooting,shortcut not working,palette not opening -->

Check these in order:

1. **The binding.** Open `chrome://extensions/shortcuts`. If "Open the kaihuman command palette" is empty, Chrome could not take `Ctrl+Shift+K` and left it unbound. Set another combination. Avoid combinations with `Space`, which input-method switchers often claim.
2. **The page.** The palette cannot run on `chrome://…` pages, the Chrome Web Store, the PDF viewer or `view-source:`. The toolbar icon then shows a red `!` badge.
3. **The service worker console.** On `chrome://extensions`, click "service worker" under the extension. On install or update it logs `command palette bound to <shortcut>`, or a warning that no shortcut is bound. It also names the URL that refused the palette.

You do not need to reload old tabs; the worker injects the content script on demand.

## Start page header, search and world clocks
<!-- docspack: tags=new tab,newtab,start page,homepage,clocks,timezones -->

The start page (`newtab.html`, `src/newtab/StartPage.tsx`) replaces Chrome's New Tab page. It is dark, uses bundled Noto Sans Mono (MV3 blocks remote fonts) and has two columns. Below about 920px the right column moves under the left.

**Header**

- Logo and **kaihuman** title: opens the console.
- Date with ISO week, for example `Wed 30 Sept · W40`.
- **World clocks**: every zone in the repo's `.timezones.json` files, labelled by the first city.
- **Sync status**: the repo name, the age of the cached data (`synced 12m ago`), the number of bookmark opens waiting to be pushed, and a **sync** button. It uses `GET_SYNC_STATUS` and `SYNC_NOW` with `force: true`.

**Search**: typing filters pinned and recently used bookmarks by title or host. **⏎** passes the text to the command palette. **/** focuses the field. **Esc** leaves a text field. Chrome keeps focus in the address bar on override pages, so click the page first or use the shortcut.

## Start page bookmarks, tab groups and read later cards

The left column of the start page:

- **Pinned**: every pinned bookmark as a numbered card, in file order. Keys **1**–**9** open the first nine when no text field is focused. **●** unpins.
- **Tab groups**: the saved pinned tab groups. The running group is outlined in green. A click loads it (`LOAD_PINNED_TAB_GROUP`). **☆ / ★** toggles a favourite (`FAVORITE_PINNED_TAB_GROUP`). Rename, reorder and save stay in the popup and palette.
- **Recently used**: the twelve other bookmarks opened most recently. Each has an environment tag **DEV**, **INT** or **PROD**, from a `dev`/`int`/`prod` bookmark tag or a word in the title, else `—`. **○** pins.
- **Read later**: the three oldest unread items and the unread total.

Opening a bookmark here is counted and sends `OPEN_URL` with `reuse: true`, so the page takes over the current tab. Pinning sends `SET_BOOKMARK_PINNED` and commits `"pinned"` to the repo file. If the commit fails, the link moves back and the page shows why.

## Start page today view: todos, events, habits and timer
<!-- docspack: tags=today,doing,coming up,habits,trackers,time tracking,timer -->

The right column shows data from the repo's widget files (`Today.tsx`, built by `buildToday` in `src/background/today.ts`):

- **Doing**: every in-progress `[>]` todo, open todos whose milestone is past due (marked `!`), and the inbox count (`<app folder>/inbox.todos.md`). Each line opens its file in the console. Below, today's total of each `.timetracking.csv` (`working-time today`) with **▶ start** / **■ stop** (`TODAY_TOGGLE_TIMER`). A running timer is green and counts seconds.
- **Coming up**: the next seven days of `.events.csv` (birthdays in their next year, multi-day events while they run) and the next due milestone in a `.todos.md` with its open todos.
- **Trackers**: one row per `.habit.csv` with a check-in box for today (`TODAY_CHECK_IN`), the last seven days and the streak. A check-in cannot be undone.

Doing and Trackers are hidden when no file is behind them. Every write re-reads its file and commits on top of it, so console edits since the last sync are kept.

## Braindumps on the start page
<!-- docspack: tags=braindump,brain dump -->

The **Braindumps** card lists the ten newest files in `.kh/braindumps/` (named `<created-ms>.md`). The desktop palette's braindump window writes them; see `doc/braindump.md`.

- Each row shows the title, the next two lines and how long it has waited.
- A click opens the whole text. **open** opens it in the console.
- **delete** asks once more (**delete?**), then sends `DELETE_BRAINDUMP` with the `path` and the `sha` shown. Only that version is deleted. If the desktop wrote more since, nothing is deleted and the new text is shown.
- A failed delete puts the row back with the reason. Git history keeps deleted braindumps.

A start page that opens on data older than a minute sends `REFRESH_TODAY` to check the repo (a `304` when nothing changed).

## Start page capture box for notes, todos and log entries
<!-- docspack: tags=capture,quick add,inbox,note box -->

The capture box has three targets:

| Target | Message | Where it goes |
| --- | --- | --- |
| Note | `DUMP_NOTE` | Prepended as `- text` to `.lifeos/dump.md` |
| Todo | `ADD_TODO` | `<app folder>/inbox.todos.md` via `addTodoEntry`; `#tags` move to the end |
| Log | `ADD_ACTION_LOG` | The app folder's first `.actionlog.md`, else `.lifeos/dump.actionlog.md` |

**Ctrl+Enter** (**⌘+Enter** on a Mac) saves. The last five entries of each kind are listed under the box and kept in `chrome.storage.local` under `startPageCaptures`, so new tabs show them too.

The box does not read the repo's quick-note list, to avoid a GitHub request per new tab. Other targets are in the palette action **Add a note…**.

## Work streams
<!-- docspack: tags=work,streams,side panel,inbox,pin,alt+shift+p,github notifications,work token -->

The side panel (the **Open work panel** button in the popup, or the work card on the start page) shows what needs you and what you work on. **Waiting on you** lists PRs where your review is requested, items assigned to you, and your own PRs with failing CI, changes requested, or approved and green (ready to merge); **New activity** lists unread GitHub notifications you take part in (mentions, comments and so on); **My open PRs** lists your open pull requests. Pinned items sit in **streams** with labels, and show CI and review chips. A merged or closed pinned item moves to **Done** by itself and is removed after 14 days. ✕ hides an inbox row until the item changes, and removes it from github.com/notifications. The toolbar badge shows the Waiting-on-you count. Everything happens inside the panel: Chrome blocks `window.prompt` and `window.confirm` there, so a new stream is named, labels are edited and a stream delete is confirmed in place. Each row has a colour rail (red: failing CI, conflict or changes requested; amber: pending CI or review requested; green: approved or green CI), and long titles are cut at two lines with the whole title on hover.

`Alt+Shift+W` opens the panel from any page (change it at chrome://extensions/shortcuts), and so does **Open work panel** in the command palette, on a page or on the start page.

There are three ways to pin a page to a stream: `Alt+Shift+P` pins the current tab to the last used stream, right-click **Pin to stream ▸** lists the streams, and the This-tab bar in the panel pins the tab you are on. Slack threads and Claude sessions are pinned the same way as any other page.

Streams are stored in `.kh/browser.streams.json` in the active repository, so they are the same in every browser. Collapsed streams, dismissed rows and the work token stay on the device.

GitHub organisations that restrict OAuth apps hide their PRs. The panel then shows an org-access banner with a link to `https://github.com/settings/applications` to request approval, or to `https://github.com/orgs/<org>/sso` when SSO is the cause. An optional work token is a classic personal access token with the `repo` and `notifications` scopes (SSO-authorised if the org needs it), set in the panel. Use it when an org blocks the kaihuman OAuth app and approval is not possible; it is used for reading only, and saving to the repo still uses the console sign-in.

## Service status lights on the start page
<!-- docspack: tags=status,traffic light,outage,github status,aws health,cloudflare,gcp,statuspage -->

A strip under the start page header shows one light per watched service: green operational, amber degraded, red outage, blue maintenance, grey unknown. Hover for the provider's description; a click opens the service's status page in the tab. A dimmed light is the last known answer because the latest check failed.

The services are listed in `.kh/browser.status.json` (`STATUS_CONFIG_PATH`, `src/background/service-status.ts`). Without that file the start page watches GitHub, Claude, AWS (`eu-central-1`, `us-east-1`), Cloudflare and GCP:

```json
{
  "services": [
    { "name": "GitHub", "type": "statuspage", "url": "https://www.githubstatus.com" },
    { "name": "Cloudflare", "type": "statuspage", "url": "https://www.cloudflarestatus.com", "components": ["CDN/Cache"] },
    { "name": "AWS", "type": "aws", "regions": ["eu-central-1", "us-east-1"] },
    { "name": "GCP", "type": "gcp", "products": ["Compute Engine"] }
  ]
}
```

| `type` | Source | Options |
| --- | --- | --- |
| `statuspage` | Any Atlassian Statuspage (`<url>/api/v2/status.json`), e.g. GitHub, Claude (`https://status.claude.com`), Cloudflare | `url` (https, required); `components`: only these components count, read from `summary.json` |
| `aws` | `health.aws.amazon.com/public/currentevents` (UTF-16) | `regions`: region codes; `global` events always count |
| `gcp` | `status.cloud.google.com/incidents.json`, open incidents only | `products`: product names; a `high` severity is red |

The page sends `GET_SERVICE_STATUS` when it opens and every five minutes. The worker answers from `serviceStatusCache` when it is under five minutes old (`STATUS_CACHE_TTL_MS`) and checks the same services; otherwise it checks every service at once. A failed check keeps the last answer for up to 30 minutes, then shows unknown. The config file is read with the start page's own repo sync, so it costs no GitHub request; an invalid file is shown as an error under the header.

No proxy is needed: the extension's `host_permissions` (`<all_urls>`) exempt its pages and worker from CORS, which matters for AWS, the one provider that sends no CORS header.

## How the start page data is cached

Bookmarks and tab groups come from the same caches as the popup and palette. The rest is in `todayCache` in `chrome.storage.local`, refreshed by the hourly `repoSync` alarm.

- One request lists the repo tree: `GET /repos/<repo>/git/trees/HEAD?recursive=1`, sent with the stored `ETag`. An unchanged repo answers `304`.
- Only changed files with these suffixes are read (`TODAY_SUFFIXES`): `.todos.md`, `.events.csv`, `.habit.csv`, `.timetracking.csv`, `.timezones.json`, `.readitlater.json`. Braindumps in `.kh/braindumps/` and `.kh/browser.status.json` are read too.
- `.actionlog.md` paths are only listed, not read.
- The cache records `repo`, `appFolder` (`.kh`, or `.lifeos` in older repos), `files` with `sha` and `content`, `etag` and `fetchedAt`.
- An empty repository (`404` or `409`) is an empty cache, not an error.

`GET_TODAY` serves the cache. `REFRESH_TODAY` re-checks the repo.

## Message types handled by the background service worker
<!-- docspack: tags=chrome.runtime.sendMessage,messages,api,worker -->

Popup, start page, content script and palette talk to `src/background/service-worker.ts` with `chrome.runtime.sendMessage`. Replies are `{ success: true, ... }` or `{ error }`. The list is in `src/types.ts`.

| Area | Message types |
| --- | --- |
| Auth and repo | `AUTH_TOKEN_UPDATE`, `GET_REPOS`, `SET_REPO`, `SYNC_REPO_WITH_DESKTOP` |
| Notes and KB | `DUMP_NOTE`, `ADD_ACTION_LOG`, `FETCH_QUICK_NOTES`, `PIN_ARTICLE`, `SAVE_SELECTION`, `CAPTURE_KNOWLEDGE` |
| Pinned tabs | `LIST_PINNED_TAB_GROUPS`, `LOAD_PINNED_TAB_GROUP`, `SAVE_PINNED_TAB_GROUP`, `RENAME_PINNED_TAB_GROUP`, `MOVE_PINNED_TAB_GROUP`, `FAVORITE_PINNED_TAB_GROUP`, `DELETE_PINNED_TAB_GROUP` |
| Bookmarks | `GET_BOOKMARKS`, `ADD_BOOKMARK`, `IMPORT_CHROME_BOOKMARKS`, `RECORD_BOOKMARK_USE`, `SET_BOOKMARK_PINNED`, `SYNC_NOW` |
| Palette | `GET_RECENTS`, `ADD_RECENT`, `GET_MODE_RECENTS`, `ADD_MODE_RECENT`, `SEARCH_REPO`, `OPEN_URL`, `LIST_PROMPT_FILES`, `LIST_COMMAND_FILES`, `LIST_ENTRY_FILES`, `READ_ENTRY_FILE`, `WRITE_ENTRY_FILE`, `GET_PALETTE_SETTINGS`, `LIST_GITHUB_REPOS`, `LIST_GITHUB_WORK`, `TOGGLE_COMMAND_PALETTE` |
| Translation | `TRANSLATE`, `GET_TRANSLATION_HISTORY`, `ADD_TRANSLATION_HISTORY`, `SET_TRANSLATION_KEY` |
| Start page | `GET_TODAY`, `REFRESH_TODAY`, `GET_SERVICE_STATUS`, `DELETE_BRAINDUMP`, `GET_SYNC_STATUS`, `TODAY_CHECK_IN`, `TODAY_TOGGLE_TIMER`, `READ_LATER_DONE`, `READ_LATER_ADD`, `ADD_TODO` |

The worker also sends `EXTRACT_ARTICLE` and `TOGGLE_COMMAND_PALETTE` to content scripts. Input from pages is checked: `OPEN_URL` only opens safe schemes, `READ_ENTRY_FILE`/`WRITE_ENTRY_FILE` only touch widget file types, and `CAPTURE_KNOWLEDGE` only creates files under the knowledge path. Popups hold a `chrome.runtime.connect` port open to keep the worker alive during long edits.

## What the extension keeps in local browser storage
<!-- docspack: tags=chrome.storage,local storage,settings,keys -->

`chrome.storage.local` keys:

| Key | Content |
| --- | --- |
| `lifeos_token`, `lifeos_repo`, `lifeos_repos` | GitHub token, active repo, repo list from the console |
| `lifeos_repo_changed_at` | When the repo choice last changed (desktop sync) |
| `bookmarksCache` | Bookmark list, repo, `ETag`, fetch time |
| `bookmarkUsage` | Local open-count deltas not yet pushed |
| `pinnedTabsCache` | Pinned tab groups |
| `todayCache` | Start page files from the repo |
| `serviceStatusCache` | Start page service status lights and the services they were checked for |
| `paletteSettingsCache` | Cached `.kh/command-palette.settings.json` |
| `recentActions`, `modeRecents` | Palette **Recent** list, and recents per prefix |
| `translationHistory`, `deepl_key` | `>t` history and DeepL API key |
| `kb_download_images` | Whether pinned pages save their images |
| `startPageCaptures` | Last five capture-box entries per kind |

`chrome.storage.session` holds `activeGroups`, the tab group each window loaded. Everything else lives in the GitHub repository.

## Repository files the extension reads and writes

| Path | Used for |
| --- | --- |
| `.kh/browser.bookmarks.json` | Bookmarks, pins, use counts |
| `.kh/browser.pinnedtabs.json` | Pinned tab groups |
| `.kh/browser.status.json` | Services shown as status lights on the start page (read only) |
| `.kh/raw/<epoch-ms>-<slug>.md` | Pinned pages and clips for `/kb-ingest` |
| `.kh/assets/<stamp>/<n>.<ext>` | Images of pinned pages |
| `.kh/braindumps/<created-ms>.md` | Braindumps on the start page |
| `.kh/command-palette.settings.json` | Palette search engines, assistants, tools |
| `.lifeos/dump.md` | Dump notes |
| `.lifeos/.dashboard.config.json` | `files.quickNotes` targets for the popup |
| `*.actionlog.md` | Action log entries (fallback `.lifeos/dump.actionlog.md`) |
| `<app folder>/inbox.todos.md` | Todos from the capture box |
| `*.readitlater.json` | Read later list (new: `<app folder>/reading.readitlater.json`) |
| `*.todos.md`, `*.events.csv`, `*.habit.csv`, `*.timetracking.csv`, `*.timezones.json` | Start page today view |

Formats are parsed and written with `@kaihuman/formats`, the same code as the console widgets.

## Permissions the extension requests

Declared in `manifest.ts`:

- `permissions`: `contextMenus`, `storage`, `activeTab`, `scripting`, `alarms`, `tabs`, `nativeMessaging`, `sidePanel`.
- `optional_permissions`: `bookmarks`, requested from the popup only for the import.
- `host_permissions`: `<all_urls>`.
- `content_scripts`: `src/content/index.ts` on `<all_urls>`.

`tabs` reads tab URLs for pinned tab groups. `scripting` injects the content script into old tabs. `nativeMessaging` reaches the desktop palette host `com.kaihuman.palette`. `sidePanel` opens the work side panel.
