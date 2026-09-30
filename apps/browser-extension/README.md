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
- **Start Page**: a New Tab page of your own — what is coming up and in progress, habit and time trackers, the read-later queue, world clocks, the bookmarks you reach for, a box for a note, todo or log entry, and the palette (which Chrome's own New Tab page cannot host).

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
- **☆ / ★** — marks the group as a favourite, or takes that back. Favourites have a green
  background and name here and come first on the start page. The mark is stored in the repo file
  as `"favorite": true` (left out when unset).
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
- **Convert** shows what a color, a sum, a `0x`/`0b`/`0o` number, a timestamp or a quantity you
  typed converts to — `12*7` gives `84`, `#ff8800` its `rgb()` and `hsl()`, `5 km` `3.1069 mi` —
  above **Web**, so `⏎` copies the result. Plain numbers and text are left to the web search; `>k` converts those too.
- **Web** lists one row per search engine for what you typed — by default Google, DuckDuckGo,
  Ecosia, Amazon, Amazon.de, Reddit, Bing, Brave Search, Startpage, Wikipedia, YouTube, GitHub,
  Stack Overflow, Yahoo and Qwant — below everything else, so typing an action's name still
  runs the action. `⏎` opens that engine's results page in a new tab; nothing is fetched by the
  extension itself, it only builds the URL. So when nothing else matches, typing and pressing `⏎`
  searches the first engine. The searches you run land in **Recent** like any other open. Which
  engines, and in what order, is set in the repository — see **Palette settings** below.
- **⇥ Tab** searches the *repo* for what you typed — one GitHub code search, only when you ask
  for it. GitHub's code-search endpoint has a small dedicated budget (~10 requests/minute) that
  penalizes bursts, so the palette never searches the repo while you type. Results appear under a
  **Repo** heading, and `⏎` opens the file in the console — `https://app.kaihuman.com/files/<path>`,
  the same deep link the console uses internally — rather than on GitHub. Typing again clears them,
  since they belong to the old query.

  The link names the repository too, so a hit found while the extension points at one repo opens
  that repo's file and not the console's other one — the console selects it and drops the
  parameter again.

  A hit the console shows as a widget you can add to — a `.todos.md`, `.actionlog.md`,
  `.events.csv`, `.prompts.md` or `.commands.md` — does not open straight away: `⏎` offers
  **Open … in Kaihuman** and **Add a todo…** (an action, an event…). `>f` lists those files
  without a search; see **Adding to a widget's file** below.

### Palette settings

The search engines, the AI assistants (`>a`) and the link tools (`>l` and any you add) come from
`.kh/command-palette.settings.json` in the repository, which the desktop palette reads too. Without
the file, the palettes use the defaults above. Create it in the console with **New File → Command
Palette Settings**; its widget lists the engines, assistants and tools, and in focus edits them —
add, remove, reorder, add parameters, add back a default the file no longer has — with a preview of
each link. Edits are saved with **Save**.

```json
{
  "searchEngines": [
    { "name": "Amazon.de", "url": "https://www.amazon.de/s?k={query}", "params": [] }
  ],
  "assistants": [
    { "name": "ChatGPT", "url": "https://chatgpt.com/?q={query}", "params": [] }
  ],
  "tools": [
    {
      "prefix": "l",
      "name": "Tsuga logs",
      "description": "Errors in Tsuga’s log explorer, filtered by what is typed",
      "url": "https://app.tsuga.com/explorer",
      "params": [
        { "key": "query", "value": "level:error AND \"{query}\"", "empty": "level:error" }
      ]
    }
  ]
}
```

- **`{query}`** is what is typed: in a URL's query string form-encoded (`a+b`), in its path
  percent-encoded (`a%20b`, since a `+` there is a plus), and as is in a parameter value.
- **`params`** are added to the URL in order, after any it already has. `empty` is used instead of
  `value` when nothing is typed.
- **Order** is the palette's order; the first engine is the one `⏎` searches.
- A list the file leaves out is the default one; an empty list stays empty.
- A tool's **prefix** is lowercase letters or digits, and cannot be one of the palette's own
  (`b p t r g f x d c u a w k s`). It may be longer than one letter and may start like another
  one: with `>l` and `>le`, `>le` is entered as it is typed and `>l` once a space follows it (see
  **Prefix modes**). An entry that breaks a rule — no name, a URL that is not http(s), a prefix
  taken — is left out, and the widget says which and why.
- The file is cached like the prompts: a change reaches the palette within five minutes.

### Help

Type **`?`** to see everything the palette can do here: each prefix with what it is for (⏎
switches to it), how searching and the keys work, and every action (⏎ runs it). Type after the
`?` to search the help. It is built from what this palette actually offers, so the desktop's help
lists `>d` and its own actions, and the extension's lists the browser-only ones.

### Prefix modes

`>` and a letter at the start of the input switch the palette into a list of its own — `>p` as
soon as the `p` is typed, while a longer word (`>prompt`) stays plain search text. A prefix that a
longer one starts with waits for a space: with tools `>l` and `>le`, typing `>l` shows “space
enters >l …” in the hint, `>l ` enters it, and `>le` is entered as soon as the `e` is typed. The
breadcrumb names the mode; **Esc**, or **Backspace** on an empty input, leaves it again. The empty
palette's hint line lists the prefixes.

| Prefix | Lists | ⏎ | Source |
| --- | --- | --- | --- |
| `>b` | Your bookmarks only, ranked as the main search ranks them — no actions, web search or translate offer | opens the bookmark (counted, and kept in Recent) | the cached bookmarks |
| `>p` | Prompts, filtered as you type (every word must appear in the title, tags or text) | copies the prompt's text and closes | every `.prompts.md` in the repository (`doc/prompts-format.md`), cached for five minutes |
| `>t` | Translations of what you typed into English (US) and German, minus the language the text is already in; `>t fr: …` asks for one language | the first ⏎ translates, the next copies the selected translation | DeepL, one request per language — never while typing |
| `>x` | Commands from the repository's `.commands.md` files (`doc/commands-format.md`) | asks for each `{{name}}`, then copies the filled-in command — running it is the desktop palette's | every `.commands.md` in the repository, cached for five minutes |
| `>r` | Your GitHub repositories, most recently pushed first | opens the repository; **⇥** (or **→**) lists its issues, pull requests, actions, releases… | `GET /user/repos` with the extension's token |
| `>g` | The same repositories, to search one | lists **Issues** and **Pull requests**; ⏎ on one asks for the search term, then opens GitHub's search there (`is:issue …` / `is:pr …`, any state) — no term opens the plain list | `GET /user/repos` with the extension's token |
| `>a` | One row per AI assistant for the question typed — by default ChatGPT, Claude, Gemini, GitHub Copilot and Perplexity (see **Palette settings**) | opens a new chat with the question filled in, and copies the question: Gemini and Copilot do not read it from the link, so paste it there | a link only, no request |
| `>l` | One row: Tsuga logs, for what is typed (a default tool — see **Palette settings**) | opens Tsuga's explorer searching for the typed text | a link only, no request |
| `>e` `>m` `>n` `>i` | One row: LEO's German ⇄ English dictionary, Google Maps, npm, IMDb — for what is typed (default tools) | opens the page for the typed text | a link only, no request |
| `>w` | What waits on you on GitHub: pull requests requesting your review, issues and pull requests assigned to you, your pull requests with failing checks — grouped in that order, each once | opens it on GitHub | three `GET /search/issues` with the extension's token, on entering the mode |
| `>k` | Conversions of what you type: colors (`#ff8800`, `rgb()`, `hsl()`), number bases (`0x1f`, `0b101`, `0o17`, `42`), arithmetic (`12*7`, `2^10`, `(3+4)%5`), timestamps (`1790208000`, `2026-09-24T10:00Z`), metric ⇄ US units (see below), letter case for any other text, `lorem` / `lorem 5` for filler text | copies the result | none — worked out in the palette |
| `>s` | Symbols, emoji and kaomoji by name — arrows, math, currency, typography, keys, marks | copies it | none |
| `>q` | One row once saved: the capture you typed, as its own `.kh/raw/<epoch>-<slug>.md` for `/kb-ingest` (first line is the title) — the same file `cli capture` writes. Typing into the main search also offers **Capture “…”** at the bottom | the first ⏎ saves, the next opens the new file in Kaihuman | one `PUT` with the extension's token, create-only |
| `>f` | The repository's files a widget can add to — todo lists, action logs, events, prompts, commands | offers **Open … in Kaihuman** or **Add a todo…** (an action, an event…) | one tree listing per visit |

**Units** convert between metric and US customary: length (`mm cm m km` ⇄ `in ft yd mi`, and
heights as `5'11"` or `5 ft 11 in`, shown back as feet and inches), mass (`mg g kg` ⇄ `oz lb`),
volume (`ml cl dl l` ⇄ `tsp tbsp fl oz cup pt qt gal`, US measures), area (`cm² m² ha km²` ⇄
`in² ft² yd² acres mi²`), speed (`m/s km/h` ⇄ `mph`) and temperature (`°C K` ⇄ `°F`). A quantity
goes into the other system's closest unit — `5 km` into miles, `180 cm` into inches and
`5 ft 10.9 in`; `to` or `in` names the unit instead: `5 km in ft`, `3 m to cm`. A decimal comma
works too (`1,5 kg`). **Pixels**: `10 cm to px` (any length unit) gives the pixels at 80, 150 and
300 dpi; `1000 px` gives the length in cm at each of them, `1000 px to in` in inches.

With nothing typed, every mode but `>t`, `>u`, `>a`, `>k` and `>q` lists the last 10 entries you chose in it first,
under **Recent** — the prompts you copied in `>p`, the repositories you opened in `>r`, the terms
you searched in `>l`. Choosing an entry again moves it back to the top; an entry that has since
gone from the repository drops out. They are kept per prefix in the extension's local storage.

With nothing typed, `>t` lists the last 20 texts you translated, newest first — **⏎** translates
one again (kept as typed, so `fr: …` asks for French again). Translating a text again moves it to
the top rather than listing it twice.

Any text typed outside a mode is also offered as **Translate “…”**, the last row (**↑** from the top
row reaches it). Translation needs a DeepL API key — free ones at
[deepl.com/pro-api](https://www.deepl.com/pro-api) — set with the **Set the DeepL API key…** action;
it is kept in the extension's local storage.

### Adding to a widget's file

The console's widgets have an **Add** form for their files; the palette adds the same entries,
from any page. Choose a file from `>f` or a repo search, then **Add …**, and answer the fields:

| File | Fields | What is added |
| --- | --- | --- |
| `.todos.md` | the todo, `#tags` anywhere in it | `- [ ] text #tags` with its `::updated:: ::created::` line, at the end |
| `.actionlog.md` | what happened, `#tags` anywhere in it | `- YYYY-MM-DD HH:mm:ss text #tags` (local time), at the end |
| `.events.csv` | name, type (`general` prefilled, or `birthday`), start date (today prefilled), end date (empty: the same day; a birthday is always one day) | a `name;type;start;end` row; a new file gets the header first |
| `.prompts.md` | title with `#tags`, the prompt | a `## Title #tags` section at the end |
| `.commands.md` | title with `#tags`, the command (`{{name}}` for a parameter) | a `## Title #tags` section with the command in a `sh` block |

Every app adds entries with the same functions — `addTodoEntry`, `addActionLogEntry`,
`addEventEntry`, `addPromptEntry`, `addCommandEntry` in `packages/formats/src/entries.ts` — which
the console's Add forms and quick-add pages, the popup, the start page and both palettes all call.
A change to a format there reaches every app. Like the console, they parse the file and write it
back in the widget's format, so a file is tidied up (a legacy todo list migrated, say) the first
time an entry is added to it from anywhere.

The file is read, the entry added in the palette, and written back over the version read — if the
file changed in between, the write fails and nothing is lost; try again. The worker only reads
and writes files with these endings, inside the repository.

### Actions

Everything the extension can do is here, so the popup is never the only way in:

| Action | What it does |
| --- | --- |
| Bookmark this page… | Walks through URL, title and tags, each prefilled from the page |
| Read later: this page | Adds it to the repo's `.readitlater.json` list (a new `reading.readitlater.json` if there is none) |
| Pin this page to the Knowledge Base | Saves the page text as a note to process later |
| Add the selected text to the Knowledge Base | The context menu's clipping, from the keyboard |
| Add a note… | Pick the dump or any quick-note file, then type; an `.actionlog.md` target takes `#tags` in the text |
| Pinned tab groups… | Pick a group, then load, update, rename, reorder or delete it |
| Save this window's pinned tabs as a new group… | Asks for the name |
| Import the browser's bookmarks | Copies them into the repo file (grant access from the popup first) |
| Switch repository… | Pick from the repositories the console shared |
| Sync with GitHub now | Fetches and pushes immediately, ignoring the hourly budget |
| Set the DeepL API key… | For `>t` translations; an empty key forgets it |
| Open the Lifosy console | |

The four page actions at the top — bookmark, read later, pin, clip — need a page to read, so the palette on
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
Chrome asks you to confirm the first time. The page is dark, set in Noto Sans Mono (bundled with
the extension, since Manifest V3 blocks remote fonts), and uses the full width of the screen: a
header, the search bar, then two columns. Below about 920px wide the right column moves under the
left one.

**Header**

- **Logo and title** — the kaihuman logo and name; a click opens the console.
- **Date** — `Wed 30 Sept · W40`, with the ISO week number.
- **World clocks** — every zone in the repo's `.timezones.json` files, labelled by its first city.
  Edit that file to change the cities.
- **Sync status** — under the repo name: how old the cached data is (`synced 12m ago`), how many
  bookmark opens are still waiting to be pushed, and **sync**, which does what the palette's
  **Sync with GitHub now** does and reloads the page's data.

**Search** — typing filters the pinned and recently used bookmarks as you type (title or host, any
case). **⏎** hands the text to the command palette, which searches the repo and the web and lists
every action. **/** puts the cursor in the field. The extension shortcut (**Ctrl+Shift+K**) opens
the palette directly. Chrome keeps the focus in the address bar on an override page, so nothing is
focused for you: click into the page first, or use the shortcut.

**Left column**

- **Pinned** — every pinned bookmark, in the order the repo file holds them, as a card with a
  number. **1**–**9** open the first nine (when no text field has the focus). **●** unpins.
- **Tab groups** — the saved pinned-tab groups, the same list the popup's **Pinned Tabs** panel
  shows. The group this window is running is outlined in green. A click loads the group exactly as
  the popup's **Load** does — pins what is missing, unpins what the group does not have — and leaves
  the start page where it is. **☆** beside a group makes it a favourite: it moves to the front
  and is filled in green, and **★** takes that back. The mark is committed to the group in
  `.kh/browser.pinnedtabs.json` (`"favorite": true`), so every browser sees it. The popup's
  **Pinned Tabs** panel has the same star. Saving, renaming
  and reordering groups stay in the popup and the palette.
- **Recently used** — the twelve other bookmarks you opened most recently. A repo whose bookmarks
  have never been opened still shows its latest ones. Each row has an environment tag:
  **DEV**, **INT** or **PROD**. Set it by hand with a `dev`, `int` or `prod` tag on the bookmark;
  otherwise the page takes the word from the title ("Control PROD", "[DEPLOY/DEV] Unified").
  Rows without one show `—`. **○** pins.
- **Read later** — the three oldest unread items of the `.readitlater.json` files, with the total
  unread count. A click opens the page, **✓ read** marks it read. Pages get onto the list with the
  palette's **Read later: this page**.

Opening a bookmark is counted exactly as it is in the palette, and **takes this tab over** rather
than leaving a blank start page behind. Pinning or unpinning moves the link between the two lists
at once and commits `"pinned"` to the bookmark in the repo file — the same field the console's
Bookmarks widget sets, so a pin made in either place shows up in both. If the commit fails
(offline, or the bookmark was deleted in the console meanwhile) the link goes back and the page
says why.

**Right column**

- **Doing** — every in-progress (`[>]`) todo, open todos whose milestone is past due (marked `!`),
  and how many are waiting in the inbox (`<app folder>/inbox.todos.md`). Every line opens its file
  in the console. Below them, today's total of each `.timetracking.csv` (`working-time today`) with
  **▶ start** / **■ stop** to clock in or out. While it runs, the total is green and counts seconds.
- **Coming up** — the next seven days of `.events.csv` (birthdays in their next year, a multi-day
  event while it runs) and the next milestone due in a `.todos.md`, with its open todos.
- **Trackers** — a row per `.habit.csv`: a box to check in for today, the last seven days (oldest
  on the left) and the streak. A check-in stays for the day: the console's habit files have no
  undo either.
- **Note / Todo / Log** — one box, three targets: a note goes to `.lifeos/dump.md`, a todo is
  added to the inbox the console's quick-todo page uses (`#tags` move to the end), and a log
  entry goes to the repo's action log (the app folder's first `.actionlog.md`), `#tags` and all —
  both written by the same shared functions as the console's own (`packages/formats`).
  **Ctrl+Enter** (**⌘+Enter** on a Mac) saves. The last five saved entries of each kind are listed
  under the box and kept in `chrome.storage.local`, so the next tab shows them too.
  Other note targets are one palette action away (**Add a note…**), which is also the only place
  that reads the repo's quick-note list: a new tab is opened far too often to spend a GitHub
  request on it.

**Esc** leaves a text field.

Bookmarks and tab groups come from the same caches the popup and the palette read, so a new tab costs no GitHub
request of its own — a cache past its hour is refreshed in the background, as everywhere else. The
rest comes from one more cache, refreshed on the same hourly alarm: one listing of the repo's tree,
replayed with its `ETag` so an unchanged repo answers 304, and a read only of the event, todo,
habit, time-tracking, timezone and read-later files whose content changed since. Doing and
Trackers are not shown when no file is behind them. Each click that writes (check-in, clock, read, todo) re-reads its file
first and commits on top of it, so an edit made in the console since the last sync is kept.

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
