# Progress

## 2026-09-28 — Desktop palette: `>w` Wi‑Fi; GitHub work moves to `>gw`

- **`>w` Wi‑Fi** (`wifiMode` in `packages/palette/src/wifi.ts`, desktop only; `src-tauri/src/wifi.rs`
  drives NetworkManager through `nmcli`). The first row shows whether Wi‑Fi is on, and ⏎ turns it on
  or off. The networks in range follow, one row per SSID: connected first, then by signal, each
  with its bars, security, and whether a profile is saved. ⏎ connects. A secured network with no
  saved profile first asks for its password, typed masked. The last scan shows at once, and a fresh
  one (`--rescan yes`) replaces it when it arrives. While Wi‑Fi is on, a **Refresh networks** row
  (second) scans again without leaving `>w`.
- New requests `LIST_WIFI { rescan? } → { enabled, networks }`, `SET_WIFI { enabled }` and
  `CONNECT_WIFI { ssid, password? }`. If a new profile fails to connect (for example, a wrong
  password), it is deleted, so the next try asks for the password again. `nmcli` takes the password
  as an argument, so it is visible in the process list while `nmcli` runs.
- `ModeItem.reloads`: choosing such an entry loads its mode's list again and then refreshes it,
  and the palette stays in the mode.
- `PromptStep.secret`: that step's input is a password field, and the note that lists the answers
  so far leaves it out.
- **GitHub work** moves from `>w` to `>gw` on both surfaces. `>g` now waits for a space, because
  `>gw` starts with it. `gw` joins `BUILT_IN_PALETTE_PREFIXES`.

## 2026-09-25 — Bookmarks widget: edit title and link

- Each row in the focused Bookmarks widget has an **Edit** (pencil) button next to pin and delete.
  It opens an inline form for the title and URL; ⏎ or **SAVE** writes, Esc or **CANCEL** discards.
  It works on the filtered list, so search, then edit or delete what matches.
- New `updateBookmark` in `BookmarksLogic.ts`: same URL rules as adding (http(s) only, no
  duplicate of another bookmark); keeps tags, pin state and usage counts; an empty title falls back
  to the URL. A rejected edit shows its message inline and the form stays open.

## 2026-09-24 — `>u`: pace for monthly budgets

- **Monthly spend** and **Extra credits** rows now show a pace too: how much of the calendar month
  has passed, in local time (`monthPace` in `packages/palette/src/claude-usage.ts`), since those
  budgets always run for the full month. Before, only windows with a `resets_at` had one.

## 2026-09-24 — Palette: `>q` knowledge capture

Follow-up to the knowledge-capture work (`cli capture`, `/quick-knowledge`): the browser and desktop
palettes capture too.
- **`>q` Capture** (`paletteModes`, both surfaces): ⏎ saves what is typed as
  `.kh/raw/<epoch>-<slug>.md` — first line as the title, the whole text as the body, the same
  frontmatter `cli capture` writes (`knowledgeNote` in `packages/palette/src/knowledge.ts`). It is a
  submitting mode, so any text typed into the main search is also offered as **Capture “…”**. The
  row left afterwards opens the new file in Kaihuman.
- New request `CAPTURE_KNOWLEDGE { path, content } → { url }`. The service worker and the desktop's
  Rust backend create the file without a `sha` (GitHub refuses to overwrite) and refuse any path but
  a file directly in `.kh/raw/` (`isKnowledgePath` / `is_knowledge_path`).
- `q` joins `BUILT_IN_PALETTE_PREFIXES`, so a settings tool can no longer take it.

## 2026-09-24 — Palette: lengths ⇄ pixels

- `10 cm to px` (any length unit) shows the pixels at 80, 150 and 300 dpi (`DPIS` in
  `packages/palette/src/units.ts`); `1000 px` shows cm at each, `1000 px to in` inches. Pixels
  only come up when `px` is typed, so `10 cm` alone still converts to inches.

## 2026-09-24 — Palette: metric ⇄ US units

- **Units** (`packages/palette/src/units.ts`), in the main search's Convert group and in `>k`:
  length, mass, volume (US measures), area, speed and temperature, each unit into the other
  system's closest ones (`5 km` → `3.1069 mi`, `1 l` → quarts and gallons), or into the unit named
  after `to`/`in` (`5 km in ft`). Heights read as `5'11"` or `5 ft 11 in` and a metric length
  under 10 ft is also shown in feet and inches. Five significant digits; a decimal comma works.

## 2026-09-24 — Palette: converters, `>w` GitHub work, prefixes that share a start

- **Converters** (`packages/palette/src/convert.ts`, both surfaces, no requests): a color
  (`#hex`, `rgb()`, `hsl()`), a `0x`/`0b`/`0o` number, arithmetic (own parser — `+ - * / % ^`,
  parentheses, no `eval`) or a timestamp typed into the main search shows a **Convert** group above
  Web; ⏎ copies. `>k` converts anything: plain integers into other bases, letter case for text,
  `lorem [n]` for filler.
- **`>s` symbols** (`symbols.ts`): arrows, math, currency, typography, keys, marks, emoji and
  kaomoji by name; ⏎ copies.
- **`>w` GitHub work**: pull requests waiting for your review, issues and pull requests assigned to
  you, and your pull requests with failing checks, grouped and each listed once. New request
  `LIST_GITHUB_WORK { filter }`; the backends (service worker, Rust `Client::work`) run the fixed
  issue search for the filter (`GITHUB_WORK_QUERIES`) and refuse any other.
- **Prefixes**: a prefix is entered as it is typed unless a longer one starts with it; then it
  waits for a space (`>l ` next to `>le`), and the hint says so.
- `w k s` join the palette's own prefixes, so a tool cannot take them.

## 2026-09-24 — Palette: `>a` asks an AI, more default link tools

- **`>a`** (both surfaces): the typed question, one row per assistant — ChatGPT, Claude, Gemini,
  GitHub Copilot and Perplexity by default. ⏎ opens a new chat with the question in the link and
  copies it too, since Gemini's and Copilot's web chats do not read a question from the URL. The assistants are a
  new `assistants` list in `.kh/command-palette.settings.json` (same shape as the search engines;
  `a` joins the palette's own prefixes). Palette modes gained a `links` kind for several entries
  per query.
- **Default engines**: Yahoo and Qwant join them.
- **Default tools**: `>e` LEO (German ⇄ English), `>m` Google Maps, `>n` npm, `>i` IMDb.
- **`{query}` in a URL path** is now percent-encoded (`%20`); the query string keeps the form's `+`.
- **Console widget**: an AI assistants section edited like the engines, and buttons to add back
  default tools a settings file no longer has.
- `doc/vicinae-recommendations.md`: what Vicinae's extensions suggest for the palette.

## 2026-09-24 — Palette settings: more default search engines, a plain Tsuga default

- **Default engines**: Bing, Brave Search, Startpage, Wikipedia, YouTube, GitHub and Stack Overflow
  join the defaults, after the ones the palettes had.
- **Default `>l` Tsuga logs**: now just Tsuga's explorer searching for what is typed — no team
  filter, extra columns or cluster id. Anything team-specific belongs in
  `.kh/command-palette.settings.json`.

## 2026-09-24 — Command palette settings: search engines and link tools from the repository

- **Settings file**: `.kh/command-palette.settings.json` sets the palettes' web search engines and
  their link tools behind a prefix (`>l`), in the order the palette shows them. Each is a URL with
  `{query}` for what is typed, plus parameters added in order — with an optional value for when
  nothing is typed, which is how Tsuga's `… AND "{query}"` link is expressed. Without the file, the
  palettes use the defaults: the engines they had, plus **Amazon.de**, and `>l` Tsuga logs.
  Format and checks live in `packages/formats/src/palette-settings.ts`.
- **Palettes** (extension pages, start page, desktop): `loadSettings` reads it on every open
  (`GET_PALETTE_SETTINGS`, cached for five minutes by the service worker and the Rust backend).
  Engines and tools that break a rule — no name, a non-http(s) URL, a prefix the palette already
  uses or one taken by an earlier tool — are left out. `SEARCH_ENGINES` and `tsugaUrl` are gone.
- **Console**: a **Command Palette Settings** template (suggests `.kh/command-palette`) and widget —
  a summary on the dashboard, and in focus an editor to add, remove and reorder engines and tools,
  edit their parameters, preview each link, and see what will be left out. Edits are a draft until
  **Save**, since the console commits every change.

## 2026-09-24 — Popup: read it later button

- **Browser extension popup**: a clock icon next to the pin and star adds the current tab to the
  repo's `.readitlater.json` (the same `READ_LATER_ADD` message the palette's *Read later: this
  page* sends). Unlike pinning, it stores only the link and title.
- **Fix**: GitHub read/write failures said only `Failed to write <path>:` — GitHub answers over
  HTTP/2, which has no status text. The error now carries the status code and GitHub's own
  message, and a 404 on a write (GitHub's answer when a token may not write) says to check the
  token's write access.
- **Fix**: saving for later (and the start page's other writes) failed with `422 "sha" wasn't
  supplied` when GitHub read a file the synced tree lists back as 404: the write then went out as
  a new file. It now falls back to the synced copy's sha and content — if that is stale, GitHub
  answers 409 rather than the list being overwritten. Reads that feed a write also skip the
  browser's HTTP cache (GitHub marks them cacheable for a minute).

## 2026-09-24 — Read it later: clear the whole list

- **Console**: the Read it later widget's reading list has a **CLEAR ALL** button; it asks for
  confirmation, naming how many unread and read items go, then empties the list (`deleteAll` in
  `packages/formats/src/read-later.ts`). The Archive tab's **DELETE ALL** still removes only read
  items.
- **Fix**: opening a read-later file crashed the console (`Cannot read properties of undefined`)
  since `parseReadItLater` gained an empty-file check: the console hands a widget `undefined`
  until its file has loaded. It reads that as an empty list again.

## 2026-09-24 — Palette: recent entries per prefix, cached `>u` usage

- **Recent per prefix** (both palettes): every mode keeps the last 10 entries chosen in it and,
  while nothing is typed, lists them first under **Recent** — prompts copied in `>p`, commands in
  `>x`, repositories in `>r`/`>g`/`>c`, files in `>f`, dumps in `>d`, bookmarks in `>b`; a link
  mode (`>l`) keeps the terms searched. Listing an entry's children is not a use; opening one is.
  `>t` keeps its own 20-text history; `>u` opts out (`recents: false`).
- **Protocol**: `GET_MODE_RECENTS` / `ADD_MODE_RECENT`, kept by the extension in
  `chrome.storage.local.modeRecents` and by the desktop in `$XDG_STATE_HOME/lifosy/mode-recents.json`;
  `withModeRecent` (palette) and `with_mode_recent` (Rust) keep the same ten.
- **`>u` cached** (desktop): `GET_CLAUDE_USAGE { cached: true }` answers from
  `$XDG_CACHE_HOME/lifosy/claude-usage.json`; a fetch with any usage in it replaces the cache. The
  mode shows the cache at once with a status row — its age and a dot: green under 15 min, yellow
  up to 60, red beyond — and syncs in the background only when it is 5 min old or older, swapping
  in the fresh rows (“Usage synced just now”). A failed sync keeps the cached rows and says why.
  With no cache yet, the first load waits for the endpoint.
- **Palette core**: a loading mode may `refresh` behind what it loaded; a mode entry may carry a
  `tone` (good / warn / bad), drawn as a coloured dot before its title.

## 2026-09-24 — Start page reads and writes through `@lifosy/formats`

- **Moved** from `packages/ui` into `packages/formats` (history kept): the habit, time-tracking,
  timezone and read-later formats. `packages/formats` now holds every format the start page touches.
- **Start page** (`background/today.ts`): its own todo, milestone, event, habit, time-tracking,
  clock and read-later parsers are gone; it parses with `parseTodos`, `parseEvents`,
  `getUpcomingEvents`, `parseHabitData`/`calculateStats`, `parseTimeTracking`, `parseTimezones` and
  `parseReadItLater`, and keeps only what it shows (the 7-day window, today's closed minutes, clock
  labels, unread items). Its writes use `checkIn`, `toggleStartStop`, `markReadItLaterRead` and
  `addReadLaterEntry` — the console's own.
- **Shared functions gained a clock** where the start page needs one: `now` on `toggleStartStop`,
  `calculateStats`, `getUpcomingEvents` and `markAsRead`.
- **Fixes in the shared code**: `getUpcomingEvents` rounds day counts instead of ceiling them, so an
  event after the clocks go back is no longer a day further away; an empty read-later file reads as
  empty without a warning; `markReadItLaterRead` and `addReadLaterEntry` refuse to write over a
  list that is not valid JSON (the console's widget still reads such a list as empty).
- **Behaviour now matching the console**: a habit check-in drops `date;` rows that were not
  reached; a read-later write keeps only `items`; an event row with fewer than four columns is
  skipped.
- `packages/ui/src/utils/date.ts` removed — its only user moved.

## 2026-09-24 — `@lifosy/formats`: one implementation for adding widget entries, in every app

- **New package** `packages/formats` (no dependencies): the todo, action log, events, prompts and
  commands formats moved here from `packages/ui/src/LifeOS/Organisms/Widgets/*Logic.ts` (history
  kept), with their tests from `apps/console` and the palette.
- **One add per format** (`src/entries.ts`): `addTodoEntry`, `addActionLogEntry`, `addEventEntry`,
  `addPromptEntry`, `addCommandEntry` — file text in, file text out, the widget's parse and
  serialize in between. They take `#tags` typed into the text, and refuse what the file cannot hold
  (no text, a `;` in an event name, dates not `YYYY-MM-DD`, an end before the start).
- **Every app uses them**: the console's Add forms (MainApp todos and events, Action Log widget and
  view, Kanban, Prompts, Commands) and quick-add pages; the extension's popup and start page
  (`ADD_ACTION_LOG`, `ADD_TODO`); both palettes (`>f`, repo-search hits, **Add a note…** on a
  widget file).
- **Palette** reads prompts and commands through the package too; its own copies of the parsers
  are gone.
- **Behaviour changes**: the start page, popup and palettes now write entries exactly as the
  console does — a todo gets the `::updated::` stamp, and the file is re-serialized in the widget's
  format rather than only appended to. `ADD_ACTION_LOG` in the extension only writes
  `.actionlog.md` files inside the repository.
- **Desktop**: `ADD_ACTION_LOG` and its Rust formatter (`action_log_line`, and with it `chrono`)
  are gone; the palette writes action logs through `READ_ENTRY_FILE`/`WRITE_ENTRY_FILE`.

## 2026-09-24 — Palette: add entries to widget files (`>f`), as the console's Add forms do

- **Flow** (both palettes): ⏎ on a repo file whose widget has an Add form now lists **Open …
  in Kaihuman** and **Add a todo…** / an action / an event / a prompt / a command, instead of
  opening it at once. Files come from the ⇥ repo search or the new **`>f`** mode, which lists them
  all. Any other file still opens straight away.
- **Formats** (`packages/palette/src/entries.ts`): `.todos.md` (`- [ ] text #tags` +
  `::created::`), `.actionlog.md` (`- YYYY-MM-DD HH:mm:ss text #tags`), `.events.csv`
  (`name;type;start;end`, header for a new file, one-day birthdays), `.prompts.md` and
  `.commands.md` (`## Title #tags` sections, the command in a `sh` block). Each only appends, so the
  file is otherwise left as it was. The start page's `appendTodo` moved here.
- **Protocol**: `LIST_ENTRY_FILES`, `READ_ENTRY_FILE`, `WRITE_ENTRY_FILE`. The palette reads the
  file, adds the entry and writes over the `sha` it read, so a change made in the console
  meanwhile fails the write instead of being lost. Both backends only touch files with those
  endings inside the repository (`ENTRY_SUFFIXES`, mirrored in `src-tauri/src/entries.rs`).
- **Extension**: a write to a file the start page shows updates its cache too.
- **Desktop**: `github::Client::write`, which `add_lines` now uses; a 409 says the file changed.
- **Not covered yet**: bookmarks, timezones, budget, data collection, stocks and other widgets whose
  Add form needs a picker or computed columns.

## 2026-09-23 — Start page: today view, trackers, read later, clocks, capture targets, sync status

- **Worker** (`background/today.ts`): a `todayCache` of the repo's `.todos.md`, `.events.csv`,
  `.habit.csv`, `.timetracking.csv`, `.timezones.json` and `.readitlater.json` files, plus the
  action log paths. One tree listing replayed with its `ETag`, a read only for blobs whose sha
  changed; refreshed by the hourly `repoSync` alarm and by **Sync now**, served cache-first.
- **Messages**: `GET_TODAY` (the summary the page draws), `GET_SYNC_STATUS`, `TODAY_CHECK_IN`,
  `TODAY_TOGGLE_TIMER`, `READ_LATER_DONE`, `READ_LATER_ADD`, `ADD_TODO`. Each write re-reads the
  file, commits on top of it and answers with the new summary; a message may only write a file the
  page shows, of the kind the action is for.
- **Formats** mirror the console widgets: habit check-in and time-tracking start/stop serialize
  as `HabitTrackerLogic`/`TimeTrackingLogic` do; a todo is appended (`- [ ] text #tags` +
  `::created::`) rather than the file re-serialized.
- **Start page**: Coming up / Doing cards, Trackers, Read later, world clocks (ticking every 30 s),
  a Note / Todo / Log switch on the capture box, and the sync status under the repo name.
- **Palette** (content script): **Read later: this page**.

## 2026-09-23 — Palette: `{{name}}` command parameters, `>g` GitHub search, `>l` Tsuga logs

- **Commands** (`.commands.md`): parameters are `{{name}}`, asked for by name (`port`) in the
  palette and given a named field in the console, once per name in order of first use. Every `$` is
  now the shell's, which fixes `` sudo kill -9 `sudo lsof -t -i:\$1` ``: `\$1` was the escape for a
  literal `$1`, so nothing was asked for. Names only, so docker's `{{.Name}}` stays as written.
  `$1`…`$9` are no longer parameters — rewrite them as `{{…}}` (doc/commands-format.md).
- **`>g`** (both surfaces): the `>r` repositories; ⏎ lists Issues and Pull requests, ⏎ on one asks
  for the search term and opens `github.com/<repo>/issues?q=is:issue <term>` (or `pulls`, `is:pr`);
  no term opens the plain list. Remembered in Recent like any opened page.
- **`>l`** (both surfaces): one row for what is typed, opening Tsuga's explorer on
  `owner-team:console`, with `AND "<term>"` when there is one — the two links match the team's
  own exactly. (`>t` stays Translate.)
- **Palette core**: a third kind of mode, `link(query)`, whose one entry follows the input.

## 2026-09-23 — `.commands.md`: a command library, run from the desktop palette (`>x`)

- **Format** (`doc/commands-format.md`): `.prompts.md`'s grammar, the command being an entry's
  first fenced code block (or its text). `$1`…`$9` are parameters, filled in as typed; `\$1` is a
  literal `$1`.
- **Console**: New File → Commands; a Commands widget with search, tag filter, a field per
  parameter, a live preview (unfilled parameters stay `$n`) and Copy; ADD COMMAND appends one in a
  `sh` block. `CommandsLogic.ts` reuses PromptsLogic for reading and writing. Storybook story added.
- **Palette `>x`**: every `.commands.md` in the repository. ⏎ asks for each parameter with the
  command shown, then lists **Copy** (first, so a hasty ⏎ never runs), **Run in terminal**, **Run in
  the background**, and the finished command in full. The extension offers Copy only.
- **Desktop** (`commands.rs`): `RUN_COMMAND` runs `bash -c` from `$HOME` — in `ghostty -e` with the
  command passed as an argument (no quoting of its own), showing `$ command`, the output and the
  exit status until a key is pressed; or in the background, with a notification of how it ended.
  `LIST_COMMAND_FILES` shares the prompts' fetch and cache code, parameterised by suffix, on both
  backends (caches `commands.json` / `commandsCache`).
- **Palette core**: an action may end in `choices` (listed like a mode's entries), `closes` the
  palette after running, and opt out of Recent (`recent: false`); a pending action's subtitle shows
  under its first field.

Checks: palette tsc and biome clean, vitest 164/164 (16 new); extension tsc, vitest 216/216 (2
new); console tsc, vitest 123/123 (4 new); ui build green, biome clean on the touched files;
desktop `cargo test` 51 passed (4 new, including running bash for the notification text and the
terminal script's argument passing), clippy and fmt clean. `>x` driven in the built desktop UI and
the widget in Storybook, both in Chromium. Not run: a real ghostty window.

## 2026-09-23 — The palette's hint names the prefixes by letter only

The empty palette's hint wrapped to two lines on the desktop with eight prefixes. It now reads
`? help · >b >p >t >r >d >c >u`, and `?` says what each one is.

Checks: palette vitest 148/148, biome clean; checked in the built desktop UI.

## 2026-09-23 — Prefixes become `>p`, and `>b` lists bookmarks only

- **`>` and a letter** replace `p:`-style prefixes everywhere: `>p`, `>t`, `>r`, and on the desktop
  `>d`, `>c`, `>u`. The mode switches as soon as the letter is typed (`>p`), or with text after a
  space (`>p commit`); a longer word (`>prompt`) and the old `p:` stay plain search text.
  Backspace on an empty input gives `>p` back. The hint line, the `?` help and the
  "or type >t first" offer use the new form. `?` help and the `fr:` language prefix inside `>t`
  are unchanged.
- **`>b`** — bookmarks only, on both surfaces: no recents, actions, web search or translate offer,
  ranked by the main search's rules (title prefix, title, tags, URL) and opened the same way
  (counted, remembered, closed). It is built into the palette, since the bookmarks live there.

Checks: palette tsc and biome clean, vitest 148/148 (7 new); extension tsc and vitest; desktop
tsc, build and `cargo test`.

## 2026-09-23 — `c:` Claude Code and `u:` Claude usage in the desktop palette

Two more omarchy scripts move into the desktop palette.

- **`c:`** (`omarchy-claude-code`): the repositories in `~/.config/eee/history`
  (`$EEE_HISTORY_FILE`), most recent first, once each. ⏎ asks for the prompt in the input; ⏎ again
  opens `claude.ai/code?prompt=…&repo=…&branch=main` — encoded as the script does, `+` for spaces
  and the repo's slash kept — closes the palette and keeps it in **Recent**.
- **`u:`** (`omarchy-claude-usage`): per account from `~/.config/omarchy/claude-usage.conf`
  (default `~/.claude`), the OAuth usage endpoint's windows — the fullest first, with %, a bar, pace
  and reset time — then spend or extra credits, under a heading with the plan tier. One account
  failing shows its reason without hiding the others. An expired token is refreshed with Claude
  Code's client id and written back atomically with mode 600. ⏎ opens claude.ai's usage page.
- **Split**: Rust (`claude.rs`) reads the files, refreshes and fetches (`LIST_CLAUDE_CODE_REPOS`,
  `GET_CLAUDE_USAGE`); the palette formats (`claude-usage.ts`), so the numbers are tested in TS.
- **Palette core**: a `ModeItem` may carry an `action` (its prompts asked in the input), and an
  action may `opens` a page from its answers instead of `run` — opened, remembered as a recent,
  palette closed. The help's action rows now use `action` too. Row titles keep their spaces, so
  the usage meters line up.

Checks: palette tsc and biome clean, vitest 141/141 (15 new, also run with TZ set to
America/Los_Angeles and Asia/Kolkata); extension tsc and vitest 214/214; desktop `cargo test` 47
passed (6 new), clippy and fmt clean; `c:` and `u:` driven in the built desktop UI in Chromium
with a stubbed Tauri bridge.

## 2026-09-23 — `?` help in the command palette

- **`?`** at the start of the input opens **Help**, in three sections: the prefixes with a
  description each (⏎ switches to that mode), searching and keys (type to search, ⇥ repo search,
  web search, ↑↓⏎, ⇥/→, Esc, Backspace), and every action (⏎ runs it, prompts and submenus
  included). Typing after the `?` searches it, keeping each section under its heading; Backspace
  on an empty input gives the `?` back, as with any prefix. The empty palette's hint starts with
  `? help`.
- **Built from the handlers**, so each surface's help is exact: the desktop lists `d:` and
  "Log in with the Lifosy console", the extension its page and tab-group actions. `PaletteMode`
  gains a required `description`, so a new mode cannot arrive without its help line.
- **Palette core**: `ModeItem` gains `choose` (a custom action) and `group` (consecutive entries
  under one heading); help subtitles wrap instead of being cut off.
- **Fix**: ↑↓ now scrolls the selected row into view. Before, the selection could move below the
  visible rows of any long list — the help made it obvious.

Checks: palette tsc and biome clean, vitest 126/126 (10 new); extension tsc green, vitest 214/214;
desktop UI built and driven in Chromium with a stubbed Tauri bridge (`?`, scroll to the last
action, `? dump` → ⏎ switches to `d:`).

## 2026-09-23 — `d:` dumps: a scratch editor in the desktop palette

For text that only needs somewhere to sit for a moment — paste it, edit it, copy it on.

- **`d:`** lists **New dump**, then the last 25 dumps (most recently edited first, searched by
  their text). ⏎ opens one in an editor that takes the palette's list area.
- **Saving** happens as you type (400 ms after the last key, and on Esc or close), only when the
  text changed, one save at a time and in order — across dumps too, so reopening one while its
  save is on its way cannot write stale text. Clearing a dump deletes it; an untouched new dump is
  never created.
- **Keys**: Esc back to the list, ⌃⏎ copies everything and closes, ⌃S asks for a path (prefilled
  `~/Documents/dump-<date>.txt`) and writes a copy — directories created, existing files never
  overwritten.
- **Palette core**: a `ModeItem` may carry `edit`, an `EditableText` (title, text, `save`,
  optional `saveAs`) the palette opens in its editor; any mode can use it.
- **Desktop only**: `LIST_DUMPS`, `SAVE_DUMP`, `EXPORT_DUMP` in Rust (`dumps.rs`); files are
  `$XDG_DATA_HOME/lifosy/dumps/<created-ms>.txt`, ids are digits only, and the 26th least recently
  edited is removed on save. The extension does not offer `d:`.

Checks: palette tsc and biome clean, vitest 116/116 (18 new); desktop `cargo test` 41 passed (5
new), clippy and fmt clean; the built desktop UI driven in Chromium with a stubbed Tauri bridge
through new dump → type → autosave → ⌃S → Esc → list → ⌃⏎.

## 2026-09-23 — Desktop palette reads the DeepL key from `~/.config/envvars/deepl.env`

The daemon is started once, by the first toggle or by the compositor, so a key only in an
interactive shell never reached it. It now reads the omarchy env file itself, on every
translation, so editing the key takes effect without a restart:

1. `DEEPL_AUTH_KEY` in the environment, as before;
2. `$XDG_CONFIG_HOME/envvars/deepl.env` — `DEEPL_AUTH_KEY` or `DEEPL_API_KEY`, parsed like a
   shell would read it (`export`, quotes, comments, last assignment wins), never executed;
3. the Secret Service, as before. The "no key" message now names the file.

Checks: desktop `cargo test` 36 passed (1 new), clippy and fmt clean.

## 2026-09-23 — Translation history in the palette's `t:` mode

- `t:` with nothing typed lists the last 20 translated texts, newest first; ⏎ (or a click) puts one
  back in the input and translates it again. Texts are kept as typed, so `fr: …` asks for French
  again; translating a text again moves it to the top instead of listing it twice.
- Recorded after a successful translation only; a failure to record never hides the answer.
- Generic: a submitting `PaletteMode` may declare `history()`, read on entering the mode and again
  after each submit. The list rule is `withTranslationText` (`packages/palette/src/translate.ts`),
  mirrored in Rust.
- Persisted by each backend through two new requests, `GET_TRANSLATION_HISTORY` and
  `ADD_TRANSLATION_HISTORY`: extension local storage (`translationHistory`) and the desktop's
  `$XDG_STATE_HOME/lifosy/translations.json`.

Checks: palette tsc and biome clean, vitest 98/98 (10 new); extension tsc and build green, vitest
214/214 (2 new); desktop `cargo test` 35 passed (1 new), clippy and fmt clean; history listed and
re-submitted in the built desktop UI in Chromium with a stubbed Tauri bridge.

## 2026-09-23 — Palette prefix modes: prompts, translate, repos (from omarchy)

Follow-up to the desktop palette ([#124](https://github.com/lifosy/monorepo/pull/124)): three menus
from the omarchy dotfiles — `omarchy-show-prompts`, `translate_manager.py` and
`omarchy-show-repos` — now live in `@lifosy/palette`, so the desktop overlay and the browser
extension both have them.

- **Prefix modes** (`PaletteMode` in `command-palette.ts`): typing `x:` switches the input into a
  mode's own list, with a breadcrumb; Esc or Backspace on an empty input leaves it. A mode either
  *loads* its entries once and filters them locally, or *submits* on ⏎ only, for answers that cost a
  request. Entries open a URL, copy text (a new `copy` handler per surface), or list children on ⇥ /
  →. The empty palette's hint lists the prefixes.
- **`p:` prompts**: every `.prompts.md` on the repository's default branch (one tree listing, one
  read per file; cached five minutes, stale-while-refresh), parsed by the palette with the
  `doc/prompts-format.md` rules. ⏎ copies the body. Replaces omarchy's hard-coded path in a local
  clone.
- **`t:` translate**: DeepL, as `translate_manager.py`'s API mode — into EN-US and DE, dropping the
  language the text is already in (so German goes to English); `t: fr: …` asks for one language.
  Typed text outside any mode is offered as "Translate “…”". The key is set with the new
  **Set the DeepL API key…** action (extension storage; desktop keyring, or `DEEPL_AUTH_KEY`). The
  offline Argos mode is not carried over.
- **`r:` repos**: `GET /user/repos`, most recently pushed first; ⇥ lists the same GitHub sub pages
  omarchy offers. The desktop also reads omarchy's `~/.config/eee/counts` and lists those first —
  the browser has no such file.
- **Protocol**: `LIST_PROMPT_FILES`, `TRANSLATE`, `SET_TRANSLATION_KEY`, `LIST_GITHUB_REPOS`,
  answered by the extension's service worker (`background/palette-modes.ts`) and the desktop's Rust
  backend (`prompts.rs`, `translate.rs`, `repos.rs`). The desktop copies through a `copy_text`
  command (`wl-copy`); the extension through `navigator.clipboard`, with an `execCommand` fallback.

Checks: palette tsc and biome clean, vitest 88/88 (30 new); extension tsc and build green, vitest
212/212 (12 new); desktop `cargo test` 34 passed (7 new), clippy and fmt clean; the built desktop UI
driven in Chromium with a stubbed Tauri bridge through `p:`, `t:` and `r:`.

## 2026-09-23 — Knowledge base: closing the gaps with the LLM-wiki pattern

Measured against Karpathy's "LLM wiki" gist (raw sources → LLM-maintained wiki → schema, with
ingest / query / lint), the `.kh/` knowledge base already had the layers but not the compounding.

- **`/kb-ask --save`** files an answer as a `type: question` wiki page, links it from the pages it
  cites, adds it to the index and logs it. Without the flag the command offers to file any answer
  that compares or connects pages.
- **`/kb-digest [period]`** (new) reads the tracked personal data — action logs, `dump.md`, todos,
  habit / data-collection / consumption / events CSVs, read-later and bookmarks — read-only, and
  writes a `tags: [digest, personal]` raw source for the period (default: since the last digest).
- **Conventions**: one log heading format, `## [YYYY-MM-DD] <op> | <title>`, used by every command;
  five page types (`source`, `entity`, `concept`, `topic`, `question`) with `type` and `sources`
  frontmatter, in `CLAUDE.md`, the schema template and the seeded index. `CLAUDE.md` is upgraded in
  existing repos with the skills; `schema.md` stays the user's and only new repos get the new one.
- **`/kb-ingest`** now discusses each source (takeaways, planned page changes, contradictions) and
  waits before writing; `--batch` keeps the unattended run, a filename ingests one source. It writes
  a `source` page per file and marks contradictions instead of overwriting.
- **`/kb-lint`** adds stale claims, missing pages, frontmatter checks and data gaps, and ends with
  questions and sources worth pursuing.
- **Extension capture**: pinned pages are converted to Markdown from their main content (article /
  main, without nav, footers, share and comment blocks) instead of `innerText`; up to 10 images
  (≤ 2 MB each) are downloaded to `.kh/assets/<stamp>/` and linked from the repo root, so the links
  survive the move to `raw/processed/`. A popup checkbox, "Save page images with pinned pages"
  (`kb_download_images` in extension storage, on by default), turns the downloads off; the palette's
  pin follows the same setting. Selection clips become their own `.kh/raw/` notes rather
  than going to the legacy `.lifeos/clippings.md`, so ingest sees them.
- **Wiki view**: `[[wikilinks]]` are clickable (by filename, slug or frontmatter title; missing
  pages shown in red), a "Linked from" backlinks list, the page's type and tags, a tag filter in
  the sidebar, and repo-stored images loaded with the token.
- **`apps/kb-mcp`** (new): a stdio MCP server over a local clone — `kb_search`, `kb_read` (with
  backlinks), `kb_list`, `kb_index`, `kb_log`, `kb_add_raw` — so Claude Code or any MCP client can
  use the knowledge base as a tool.
- KB skills bumped to 1.6.0, so opening the Knowledge Base page upgrades existing repos.

Checks: console tsc clean, vitest 116/116 (22 new), biome clean in console and ui; ui build green;
extension tsc + build green, vitest 233/233 (14 new); kb-mcp build, tsc and biome clean, vitest 42/42.
## 2026-09-23 — CLI login checks the console's `state`

- **The gap:** `apps/cli` sent no `state` to `/auth/cli` and took any callback carrying a token. Any
  website open in the browser could post its own token to the waiting CLI and log it in to the
  attacker's account.
- **The fix:** it now picks 128 random bits with `getrandom` (already in the lockfile) and adds them
  to the console URL. It takes only a callback carrying that `state`.
  - A missing, empty or wrong `state` gets a 400 and leaves the one-shot channel untouched, so the
    CLI keeps waiting for its own login.
  - The route moved into `callback_route` so it can be tested.
- **Console:** unchanged. `/auth/cli` has always sent the `state` it was given back, in the old
  redirect and in the new form, so the fix works with the console that is deployed now.

Checks: CLI tests 6/6, 3 new: a forged state, an empty or missing state, and a route test where a
forged post gets a 400 without ending the login and the real one then completes it. No clippy
warnings in `auth.rs`; the CLI's other warnings are unchanged.

## 2026-09-23 — Console login hands the token over by POST, not in a URL

The console's `/auth/cli` used to redirect to `http://localhost:<port>/callback?token=…`, which put
the token into the browser's history. That affected both the CLI and the desktop palette.

- **Console**: `src/lib/cli-callback.ts` builds a hidden form with `token`, `state` and `repo` and
  POSTs it to `http://localhost:<port>/callback`. The port must be a number from 1 to 65535, since
  it ends up in the form's action. `AuthCli.tsx` uses it in place of the redirect.
- **CLI** (`apps/cli/src/auth.rs`): the callback route takes a POSTed form, with the body capped
  at 16 KB, or the old query.
- **Desktop palette** (`console_login.rs`): reads the request's headers and body, capped at 16 KB,
  and takes a POSTed form or the old GET query.
- Old and new sides work in any combination, so the console and the local programs can be updated
  in any order. The leak ends when the new console is deployed.

Checks:
- console vitest 97/97 (3 new), tsc clean after building `@lifosy/ui`;
- CLI tests 3/3 (new, with `warp::test`), no new clippy warnings;
- desktop Rust tests 27/27, among them loopback POST, legacy GET and oversize tests, each run three
  times; biome clean.

Tried end to end in Chromium 141 through Playwright. `app.kaihuman.com/auth/cli` was intercepted
and served a page running the console's real `submitCliCallback`, compiled from source. It posted
to a real `lifosy-palette login`, which checked the state, validated the token against a mock
GitHub and stored it in gnome-keyring. The https page's form to `http://localhost` went through
without a warning, and no history entry contains the token.

## 2026-09-23 — Desktop palette: log in through the console; spike removed

- **`apps/desktop-palette-spike` deleted.** The palette passed on Hyprland, and phase 2 carries
  everything the spike proved.
- **Console login**, reusing the console's existing `/auth/cli` page, which the CLI already uses,
  so the console is unchanged.
  - `src-tauri/src/console_login.rs` listens on `127.0.0.1` on a random port and opens
    `/auth/cli?port=…&state=…` with 128 random bits of state.
  - It serves requests until `/callback` arrives with that state: stray requests get a 404, a
    forged state a 400, and it gives up after five minutes.
  - The token is checked against the repository and kept in the Secret Service. The repository is
    the one from `--repo`, else the console's, else the current one.
- **Entry points:**
  - `lifosy-palette login` now uses the console; `--paste` keeps the typed or piped way.
  - The palette's desktop-only action **Log in with the Lifosy console** hides the overlay for the
    browser and reports the outcome with `notify-send`.
  - The "Not logged in" message points to both.

Checks: Rust tests 29/29, among them a loopback test with a stray request, a forged state and the
real grant, and the timeout. Clippy, fmt, tsc and biome are clean. Tried end to end under
`dbus-run-session` with a real gnome-keyring and a fake `xdg-open` playing the console's redirect:
- `login` stored the token, `secret-tool` read it back, and `logout` removed it;
- in headless Sway, the palette action logged in and the reopened palette loaded bookmarks with
  the stored token.

## 2026-09-23 — Desktop palette, phase 2: `apps/desktop-palette`

- **The app**: a Vite UI that mounts `@lifosy/palette`, and a Tauri v2 daemon with two binaries.
  - It keeps phase 0's model: a full-output wlr-layer-shell overlay with keyboard mode exclusive, a
    Unix socket, and the libc-only `lifosy-palette-toggle` that starts the daemon when needed.
  - It falls back to an ordinary window when the compositor has no layer-shell.
- **Backend** (`src-tauri/src/requests.rs`): `PaletteProtocol` answered in Rust, with the requests
  as a serde enum tagged by `type`.
  - Bookmarks come from `.kh/browser.bookmarks.json`, parsed like the extension (only http(s)
    entries). They are cached in `$XDG_CACHE_HOME/lifosy` for an hour; a stale cache is refreshed
    in the background with `If-None-Match`.
  - Code search opens the console deep link. Quick-note targets come from the dashboard config.
  - `DUMP_NOTE` and `ADD_ACTION_LOG` use the extension's line formats and placement. Paths that
    climb out of the repo are refused.
  - Recents live in `$XDG_STATE_HOME`, `GET_REPOS` and `SET_REPO` in `palette.json`, and
    `SYNC_NOW` refreshes the bookmarks.
  - `OPEN_URL` runs `xdg-open` for http(s) only.
  - Browser-only requests reject with a message, and their actions are hidden on the desktop.
- **`lifosy-palette login [--repo o/r]`**: the token is read without echo (or piped), checked with
  `GET /repos/o/r`, and stored in the Secret Service. `logout` removes it. `LIFOSY_GITHUB_TOKEN`
  and `LIFOSY_GITHUB_API` exist for tests.
- **`@lifosy/palette`** gains three things:
  - `open()`;
  - `PaletteOptions.onClose`, called once per close;
  - `placement: 'center'`, a fixed-height centered panel.
- **Fix, also in the extension**: the **Web** group moved below **Actions**. It had been above
  them, so typing an action's name and pressing Enter searched Google instead of running the action.
  With nothing else matching, Enter still searches the web.
- **CSP**: Tauri adds nonces to the page's CSP, which makes browsers ignore `'unsafe-inline'`, so
  the palette's shadow-root `<style>` was blocked. `dangerousDisableAssetCspModification:
  ["style-src"]` keeps the policy as written.
- **Root devDependencies**: `vite`, for the new app's UI build.

Checks: Rust tests 24/24, clippy and fmt clean; the toggle client links only libc and libgcc.
Palette vitest 58/58, extension 184/184; tsc and biome clean. Tried end to end under headless
Sway, against a mock GitHub and a fake `xdg-open`:
- the overlay is centered and dimmed over a tiled terminal, and loads bookmarks with the
  `javascript:` entry dropped;
- Enter on a bookmark runs `xdg-open` and hides the overlay;
- a note is PUT to `.lifeos/dump.md`;
- web search and Tab repo search open the right URLs;
- switching repository writes `palette.json`;
- a second sync sends `If-None-Match` and gets a 304;
- toggling hands focus back to the terminal.

`login` was checked up to the keyring: the container has no Secret Service.

## 2026-09-23 — Desktop palette, phase 1: `@lifosy/palette`

- **New package `packages/palette`** (`@lifosy/palette`), consumed from source like `@lifosy/core`.
  It holds `command-palette.ts`, `web-search.ts` and the shared actions, moved from the extension
  with `git mv`, plus the `Bookmark` type and `searchBookmarks`. Tests moved with them.
- **`ActionPort` and `PaletteProtocol`** (`src/protocol.ts`) replace the direct
  `chrome.runtime.sendMessage`.
  - Each request name lists its fields and the response fields the palette reads. This is the
    contract the desktop app will implement.
  - `repoActions(port)` and `portHandlers(port)`, formerly `workerHandlers()`, take the port.
  - The old `as` casts on responses are gone.
- **Extension**: `src/palette/port.ts` holds `send` and `workerPort`. `console.ts` and
  `background/bookmarks.ts` re-export `CONSOLE_URL`, `Bookmark` and `searchBookmarks`, so the rest
  of the extension is unchanged.
- **Root devDependencies**: `vitest` and `@biomejs/biome`, as CLAUDE.md asks, so the new package can
  run its tests and lint.

Checks: palette tsc clean, vitest 53/53 (9 new for the actions against a fake port), biome clean;
extension `tsc -b` and `vite build` clean, vitest 184/184. `turbo run` cannot spawn tasks in this
container ("Exec format error", also for untouched packages), so each script was run directly.

## 2026-09-23 — Desktop palette: phase 0 passed on Hyprland, tiny toggle client

- Every point of the spike's checklist passed on Hyprland (Fedora) in the default `layer` mode, with
  no compositor rules. The decision is recorded in `doc/native-command-palette.md`: a full-output
  layer surface.
- **`lifosy-palette-toggle`**: a second binary that links only the socket protocol. The protocol
  moved to a Tauri-free `src/lib.rs`. The client needs only libc and libgcc, is 366 KB, and takes
  4–9 ms per call against ~30 ms for the Tauri binary. With no daemon running it starts
  `lifosy-palette-spike` from its own directory. Request parsing now accepts a bare
  `toggle` line, so `nc -U` works too.

Checks: `cargo test` 7/7 (4 new protocol tests in place of the one they replace), clippy and fmt
clean; `ldd` confirms the client links no GTK or WebKit. Tried under headless Sway: cold start
spawns the daemon, warm calls take 4–9 ms, and `quit` removes the socket.

## 2026-09-23 — Desktop palette, phase 0: the Tauri spike

- **`apps/desktop-palette-spike`**: a throwaway Tauri v2 app, and not a pnpm package, so the
  repo's build never needs the WebKitGTK headers. One resident daemon keeps the webview hidden;
  `toggle`/`show`/`hide`/`quit` are one line on a Unix socket in `$XDG_RUNTIME_DIR`, carrying the
  sender's clock so the palette reports command-to-pixels latency. Three modes:
  - `layer`: a full-output gtk-layer-shell overlay with the card centered by CSS.
  - `layer-card`: an unanchored overlay that the compositor centers.
  - `float`: a plain window placed by compositor rules.
- **Tried under headless Sway 1.9 with software rendering; not yet on Hyprland.**
  - Both layer modes center over a tiled terminal, take the keyboard, and on Esc hand focus back.
  - Warm opens take 31–36 ms in a release build.
  - The client binary itself costs ~30 ms to start, because it loads the full Tauri library set.
  - wtype's fresh virtual keyboards drop the first key in GTK and close the float mode through a
    focus-out.
  - PSS is roughly 112 + 237 + 22 MB under software rendering.
- The README has the Fedora build steps, a Hyprland 0.55 Lua config, and the ten-point checklist to
  run on the real machine.

Checks: `cargo test` 4/4, `cargo clippy --all-targets` and `cargo fmt --check` clean.

## 2026-09-23 — Native palette plan revised for Hyprland

- `doc/native-command-palette.md` is rewritten for Fedora with Hyprland, a tiling compositor, and
  with the shortcut left to the user's own config. The palette becomes a layer-shell overlay (Tauri
  plus gtk-layer-shell), which the compositor centers on the focused monitor. The fallback is a
  floating window with compositor rules.
  - Dropped: the GNOME Shell extension and the mutter centering setting.
  - Added: running a Secret Service yourself, because Hyprland does not start one.
  - The single-instance plugin replaces the custom D-Bus service.
  - A dmenu-style pipe mode is an optional last phase.

## 2026-09-23 — Study: a native command palette for the desktop

- `doc/native-command-palette.md`: research and a phased plan for a palette that opens in the
  center of the screen from any app on Fedora with GNOME on Wayland. Tauri v2 draws the palette and
  reuses the extension's code. A GNOME custom shortcut provides the hotkey, the mutter setting
  `center-new-windows` provides the placement, and a small Shell extension is the fallback if focus
  fails. The dmenu family (rofi, fuzzel, wofi) was ruled out because GNOME has no layer-shell.
  Nothing implemented.

## 2026-09-23 — Web search in the command palette

- **`src/palette/web-search.ts`**: `SEARCH_ENGINES`, a list of `{ id, name, url(query) }` —
  Google, DuckDuckGo, Ecosia, Amazon (`amazon.com`), Reddit. No API: each entry only builds the
  results-page URL, with the query encoded by `URLSearchParams`. Adding an engine is one entry.
- **Palette**: a **Web** group between Repo and Actions, one row per engine once something is
  typed (never inside a submenu or while an action asks for input). Opening a row goes through the
  same `open` handler as bookmarks — so the worker's scheme check applies and the start page reuses
  its tab — and lands in Recent as `Engine: query`. The placeholder and the start page's search
  field mention the web.

Checks: extension tsc clean, vitest 228/228 (7 new), biome clean on the touched files.

## 2026-09-23 — Pinned tabs on the start page

- **Start page** (`apps/browser-extension/src/newtab/StartPage.tsx`): a **Pinned tabs** section
  above **Pinned & recently used**, listing the saved groups from `LIST_PINNED_TAB_GROUPS`, the
  same message and cache the popup's panel reads. Cards use the bookmark grid (2 / 3 columns) but
  are a single short row: name, then the tab count. The window's active group is outlined in the
  accent colour; clicking a card sends `LOAD_PINNED_TAB_GROUP` and refreshes the list, one load at a
  time. Errors show under the heading.

Checks: extension tsc clean, vitest 221/221 (2 new), biome clean.

## 2026-09-22 — Pinned bookmarks on the start page

- **`pinned` joins the bookmark format** (`BookmarksLogic.ts` in `packages/ui`, `bookmarks.ts` in the
  extension): optional, only a literal `true` counts. Both parsers carry it across every rewrite —
  the extension's hourly sync rewrites the whole file from its parse, and dropping the field there
  would silently unpin everything the console pinned. Covered by round-trip tests on both sides.
- **Console widget**: a pin toggle next to delete on each row (focus view), filled in the accent
  colour when pinned. `setBookmarkPinned` keeps the file's order and stamps the bookmark.
- **Start page**: `startPageBookmarks` puts every pinned bookmark first, in file order, then the
  twelve most recently used of the rest — a pin is never cut to fit. Each card has a pin button in
  its corner (beside the card's own button, since a button cannot hold one). Pinning is optimistic:
  the card moves at once, and a failed commit moves it back and says why. One pin commits at a time,
  so two cannot race each other for the file's sha.
- **Worker**: `SET_BOOKMARK_PINNED` takes the state to set rather than a toggle, commits through
  `commitBookmarks` (re-read first, counted opens ride along), and answers with the committed list.
  An id the file no longer has — deleted in the console since — is an error, not a silent no-op.

Checks: extension tsc clean, vitest 219/219 (11 new); console tsc clean, vitest 94/94 (4 new), biome
clean in ui and console; extension and ui builds green. Smoke-tested in Chromium: pinned cards lead
the grid, and a pin whose commit fails moves back with the error shown.

## 2026-09-22 — Extension start page (New Tab) + the title opens the app

Follow-up to #122, both items from its review:

- **The popup's `kaihuman` title opens the app** (`apps/browser-extension/src/app.tsx`): a button
  that opens `https://app.kaihuman.com` in a tab, since a popup cannot follow a link without
  navigating itself.
- **Start page** (`newtab.html`, `src/newtab/`): `chrome_url_overrides.newtab` replaces Chrome's New
  Tab page with one of ours, which is what makes the palette reachable there at all — Chrome runs no
  content script on its own New Tab page, so the shortcut used to badge the icon and do nothing. The
  page holds the palette (search field or the shortcut), the twelve most recently used bookmarks, and
  a note box writing to `.lifeos/dump.md`. Bookmarks come from the existing cache, so a new tab costs
  no GitHub request; the quick-note list is deliberately *not* fetched here, since a new tab opens far
  too often to spend a request on it — the palette's **Add a note…** still reads it.
- **`OPEN_URL` gained `reuse`** (`src/background/service-worker.ts`): with it the worker navigates the
  sender's own tab (`chrome.tabs.update`) instead of creating another one, so opening a bookmark from
  the start page takes over the blank tab rather than leaving it behind. The scheme check stays in the
  one place it already was.
- **The shortcut relay handles extension pages** (`openPaletteInTab`): the targeted relay reaches the
  start page directly; while its listener is still coming up — and nothing can be injected into an
  extension page to cover the gap — the worker broadcasts instead, and only the visible start page
  acts on it. No more red `!` badge on a page where the palette works.
- **Palette wiring extracted** (`src/palette/`): `command-palette.ts` moved out of `content/`, since
  it now has two surfaces, and `palette/actions.ts` holds the `send` helper, the worker-only handlers
  and every action that needs no page around it. The content script keeps the three that read the
  page (bookmark, pin, clip) and spreads the rest.
- **`recentlyUsedBookmarks`** (`src/background/bookmarks.ts`): most recently opened first, then the
  file's own order (newest first) via a stable sort, so a repo nobody has opened a bookmark from
  still shows something.

Checks: extension `tsc -b` clean, biome clean on the new and moved files, vitest 208/208 (11 new),
`pnpm build` green. Smoke-tested in Chromium with the unpacked build: the page renders logged out and
logged in, the palette opens from the search field and from a relayed shortcut, and a bookmark click
navigates the same tab without opening a second one.

## 2026-09-22 — sync on demand, and a bookmark you can correct before saving

**Sync now.** `SYNC_NOW` takes a `force` flag that skips the hourly budget — asking
outright is not background traffic. It fetches, pushes whatever has been counted, and
brings the pinned-tab groups along, since the point of asking is to be up to date with
the repo rather than with one file of it. It is a button in the popup header and an
action in the palette. Writing the test for it turned up a real fault: a hand-broken
`browser.pinnedtabs.json` made the whole forced sync fail, taking the bookmarks with
it. The groups are best-effort now.

**A bookmark can be corrected before it is saved.** Both surfaces prefill from the page
and neither is stuck with it — a tracking-laden url or a site's boilerplate title is
worth fixing first.

The popup's star view grew editable **URL** and **Title** fields above the tags, with
**Skip tags** saving what is in them. In the palette, `prompt?: string` became
`prompts?: PromptStep[]` and `run` now takes the values in order, which turns a single
question into a walk: URL, then title, then tags. Each step's `initial()` prefills the
input and selects it, so `⏎` keeps what is there and typing replaces it. The breadcrumb
names the field and the position (`Bookmark this page · Title (2/3)`) and the row area
lists what has been answered, so a long walk stays reviewable.

`Esc` gained a step: inside a walk it goes *back a field*, restoring what was typed
there, and only cancels from the first one. That is the whole reason to walk rather than
ask once — a typo two fields back is fixable without starting over. The hint line says
which of the two `Esc` will do.

That made the separate "Bookmark this page with tags…" action redundant, so it is gone:
one action, three fields, and a fast path is still one keystroke per field.

Verified in Chromium as well as jsdom. The walk on a real page prefilled the canonical
url and the document title, showed `URL (1/3)` → `Title (2/3)` → `Tags (3/3)`, listed
the answers as they accumulated, and stepped back into the title field with the edited
text intact. The tags label is deliberately short because it doubles as the breadcrumb's
field name — the long version read `Tags, separated by spaces or commas (3/3)` there.

Checks: `tsc -b` clean; biome clean; extension vitest 194 of 194 (8 new for the walk,
2 for the forced sync); extension build green.


## 2026-09-22 — which bookmarks get used, counted locally and merged hourly

**The `bookmarks` permission is optional now.** It moved to `optional_permissions`,
so nobody who never imports has to grant "Read and change your bookmarks" on
install. The popup asks with `chrome.permissions.request` when the button is
pressed, and the import refuses with a message pointing there until it is granted
— `chrome.permissions.request` needs a user gesture in an extension page, which a
message from the palette is not, so the popup is the only surface that can ask.

**Usage counting.** Every bookmark carries a `useCount` and a `lastUsedAt`, and the
console's widget sorts by least used, marks never-opened ones and says "opened 12×,
last 3 Sep" on each row — which is the point: finding what is safe to delete.

The sync follows the shape proposed, with one correction worth stating. Taking
"GitHub is the leading system" literally would mean a fetch *replaces* the counts,
which discards everything counted since the last sync and makes two machines clobber
each other. So GitHub leads on everything that identifies a bookmark — which ones
exist, title, url, tags — and counts are additive instead:

1. Fetch. GitHub's list replaces the cache wholesale, so a console edit or delete
   wins.
2. Add the deltas to what GitHub holds; `lastUsedAt` takes the later of the two. A
   delta for a bookmark GitHub no longer has is dropped with it.
3. Push, but only when there is something to push: an hour with nothing opened costs
   one conditional GET and no commit.
4. Settle by *subtracting* the pushed deltas rather than clearing them, so an open
   counted while the commit was in flight is not lost.

The cache holds GitHub's numbers and never a locally adjusted copy; deltas are added
when the list is read. Keeping the two apart is what makes double counting
impossible, and it is what the "reads are stable" test pins down.

**The hourly budget.** `CACHE_TTL_MS` is 60 minutes and the `repoSync` alarm matches.
Opening the popup sends `SYNC_NOW`, which checks GitHub only if the cache is past its
hour — so opening it ten times costs nothing. Explicit actions (saving a bookmark,
importing, any pinned-tab group change) still commit immediately, and those commits
carry the pending counts along for free rather than waiting for the hour.

One trap this change had to avoid: `parseBookmarks` rebuilds every entry field by
field, in both apps. Without carrying the two new fields across, the console
rewriting the file — adding or deleting a bookmark — would have silently wiped
everything the extension had counted. Both parsers carry them now, a file written
before this reads back as never opened, and a console round-trip test pins it.

Verified in Chromium under Playwright as well as jsdom: `bookmarks` is not granted at
install; three counted opens on top of GitHub's 5 and 0 read back as 7 and 1, the same
on a second read, with the cache still holding 5 and 0 and the deltas held separately;
`SYNC_NOW` inside the hour answers `{ synced: false, reason: 'fresh' }` without
touching the network; and the import without the permission answers "Allow access to
your browser bookmarks from the popup first".

Checks: `tsc` clean in both apps; biome clean; extension vitest 186 of 186 (21 new,
across the merge rules and the sync cycle), console vitest 90 of 90 (8 new, for the
carried fields and the sort); extension and console builds green.


## 2026-09-22 — the palette does everything the popup does, and remembers what you did

Six changes, all on the extension side bar the first.

**The deep link names its repository.** `consoleFileUrl` now appends
`?repo=owner/name`, and the console honours it: `Dashboard` reads the parameter at
first render — before `MainApp`'s URL sync can rewrite the location — selects that
repository once the list is in, then strips the parameter so a later repo switch is
not undone by a stale link. `ProtectedRoute` keeps the query string alongside the
path in `lifeos_redirect`, or the repository would be lost on the way through
login. A hit found while the extension points at one repo no longer opens the
console's other repo's file of the same name.

**Pinned-tab groups are cached like bookmarks.** Same shape, same 15-minute TTL,
same ETag replay, and one `repoSync` alarm now refreshes both. Listing and loading
take the cached copy; saving, renaming, reordering and deleting always re-read
first, because a commit goes against the `sha` the file had a moment ago and
committing against a cached one would overwrite whatever changed since.
`githubWriteFile` hands back the new blob sha so a write refreshes the cache
without a second round-trip.

**The browser's own bookmarks can be imported.** `flattenChromeBookmarks` walks
`chrome.bookmarks.getTree()` depth-first; a bookmark inside a folder the user made
carries that folder's name as its tag, while the built-in roots do not become tags.
The import reuses the same `addBookmark` rules, so pages already in the file are
skipped rather than duplicated and a second run is a no-op, and the imported block
is appended so the existing list stays on top. One commit, whatever the count. This
needs the `bookmarks` permission, which Chrome surfaces as "Read and change your
bookmarks" on update.

**The palette grew actions, submenus and arguments.** A `PaletteAction` either opens
a list (`children`), asks for a line of text (`prompt`), or runs. That covers
everything the popup and the context menu can do: notes into the dump or any
quick-note file, action-log entries with `#tags` picked out of the text, clipping
the selection, every pinned-tab group operation, switching repository, the import,
and opening the console. Esc unwinds one step at a time — out of the argument, back
out of each list, then closed. Deleting a tab group asks for `DELETE` first, since
it is otherwise one keystroke away.

**Recent actions.** The worker keeps the last ten things the palette did, newest
first, one entry per id, in `chrome.storage.local`. Anything with a url is reopened;
an action is replayed by id, so a recent survives the action list being rebuilt.
They sit above the bookmarks, which makes `⏎` on a freshly opened palette repeat the
last thing rather than doing something new.

**The popup opens on two icons.** Pin-to-Knowledge-Base and bookmark, as small icon
buttons over the page title, with the read-it-later card and the old inline bookmark
form gone. The star opens a view of its own: tags and **Save**, or **Skip** to save
without them, plus **Import all browser bookmarks**.

Verified in Chromium under Playwright as well as in jsdom: the palette lists recents
above bookmarks above the ten actions; a submenu shows its crumb and swaps `esc
close` for `esc back`; Esc leaves a submenu without closing the palette; an argument
prompt takes over the input and Esc restores the rows; and running an action records
it in `recentActions`. That run also caught a cosmetic bug — a submenu whose title
already ends in an ellipsis rendered "Search Switch repository……" — now fixed and
pinned by a test.

Checks: `tsc -b` clean in the extension and `tsc --noEmit` clean in the console;
biome clean on every file touched; extension vitest 165 of 165 (35 new, across the
flattener, both caches, the import, recents, repo switching and the palette's new
modes); extension and console builds green.


## 2026-09-22 — a letter-key shortcut, and repo hits that open in the console

Two follow-ups on the palette.

**`Ctrl+Shift+K`** (`Command+Shift+K` on macOS) replaces `Ctrl+Shift+Space`.
Chromium binds either — `chrome.commands.getAll()` confirms the new one, as it
confirmed the old — but `Ctrl+Shift+Space` is a common input-method-switcher chord
on Windows and Linux, and when the OS claims it Chrome never sees the press and no
code can help. A letter key sidesteps that whole class of conflict. Chrome does not
use `Ctrl+Shift+K` itself (its DevTools console is `Ctrl+Shift+J`).

**Repo hits open in the console, not on GitHub.** `searchRepo` mapped
`item.html_url`; it now builds `https://app.kaihuman.com/files/<path>` through a new
`consoleFileUrl`. That is the console's own deep link: `parseUrlState` in `MainApp`
reads `/files/<path>` and opens the file, which is exactly what `WikiView`'s edit
handler already routes to. Each segment is percent-encoded with the slashes left as
separators, matching what the console decodes on the other side — a round-trip test
pins that down, since the console decodes the whole remainder after `/files/` in one
go. The base URL moved into `src/console.ts`, which `app.tsx`'s login link now shares
rather than repeating the literal.

Worth knowing: the deep link carries the path only, so the file opens in whichever
repo the console currently has selected. Searching one repo in the extension while
the console sits on another opens the wrong repo's file — the console has no repo
parameter to pass yet, so this is a real limitation, and the README says so.

Checks: `tsc -b` clean; biome clean; extension vitest 127 of 127 (4 new for the deep
link, including the encoding round-trip); extension build green; and the built
extension loaded into Chromium under Playwright reports the command bound to
`Ctrl+Shift+K`.


## 2026-09-22 — the palette shortcut did nothing in tabs that were already open

Reported as "loaded the extension, nothing happens on the shortcut", and the
cause was in our relay, not in Chrome.

Chrome runs a declared content script only when a page *loads*, so every tab that
was open when the extension was installed, reloaded or updated has none. The
relay's `chrome.tabs.sendMessage` therefore rejected with "Receiving end does not
exist" straight into a bare `catch {}` — a press on any pre-existing tab was
silently dropped. Since loading an unpacked extension leaves every open tab in
exactly that state, the first press was always the broken case.

`openPaletteInTab` now injects the content script with
`chrome.scripting.executeScript` when nothing answers, then retries the relay
while the injected module starts up (crxjs's loader pulls the real script in
through a dynamic `import`, so the listener lands a tick or two later). The file
list comes from `chrome.runtime.getManifest().content_scripts`, so the bundler's
hashed filename is never hard-coded. No tab reloading needed.

Silence is gone from the remaining failure too: a page no extension may touch
(`chrome://…`, the Web Store, the PDF viewer) now flashes a red `!` on the toolbar
icon and logs the URL, rather than looking like a broken extension.

The binding itself is now self-reporting. Chrome drops a `suggested_key` it cannot
honour — the OS, an input-method switcher or another extension already owns the
combination — and leaves the command unbound without a word, which looks identical
to this bug. `onInstalled` reads `chrome.commands.getAll()` and logs either the
binding it got or a warning pointing at `chrome://extensions/shortcuts`. The
README's new "When the shortcut does nothing" section walks the same three checks.

`Ctrl+Shift+Space` is kept as the suggested default; it is worth knowing that this
combination is a common input-method-switcher binding on Windows and Linux, and if
the OS takes it Chrome never sees the press. The shortcuts page is one click away
and now the logs say which case you are in.

Verified in a real browser, not just in jsdom: the built extension was loaded into
Chromium under Playwright. `chrome.commands.getAll()` reports the command bound to
`Ctrl+Shift+Space`, so the manifest side was never the problem. Against a tab
deliberately left without a content script (the declared `matches` narrowed to a
domain the page is not on — the same state a tab is in after the extension
reloads), the bare relay fails with "Could not establish connection. Receiving end
does not exist." and no palette appears, reproducing the report exactly; with the
new path it injects, relays on the first retry, and the palette opens focused with
the page title on the Bookmark-this-page row. A second press closes it rather than
stacking a second one, and injecting into a tab that already has the script does
not duplicate the listener — crxjs's loader imports the real module, and ESM module
caching makes the re-injection a no-op.

Checks: `tsc -b` clean; biome clean on every file touched; extension vitest 123 of
123 (the shortcut suite grew from 3 cases to 7: injection on a tab with no content
script, the retry while the module starts, the badge on both refusal paths, and
clearing a stale badge); extension build green.


## 2026-09-22 — bookmarking the current page, from the popup and the palette

The bookmarks mirror was read-only; both browser surfaces can now write to it.

`ADD_BOOKMARK` reads `.kh/browser.bookmarks.json`, prepends the page and commits
through the Contents API with the sha it just read, so the write is not a blind
overwrite. The extension's `addBookmark` mirrors the console's rules — openable
url, no duplicate page compared canonically, newest first — because both write
the same file. The result goes straight into the cache with `etag: null`, so the
new entry is visible immediately and the next sync does a full read.

**Popup → Bookmarks → Bookmark this page**, with optional comma-separated tags,
next to the existing Read It Later block. **Palette → Actions → Bookmark this
page**, no tags, for a one-keystroke save. The action is listed *below* the
bookmark rows on purpose: `⏎` on a freshly opened palette should open what you
were looking for, not write a file. Typing `bookmark` filters everything else
away and brings it to the top. On success the palette stays open, shows the
confirmation and reloads its list — the write is the feedback, closing would hide
it.

Both surfaces prefer the page's `<link rel="canonical">` over the address bar,
matching what Read It Later already does, so one page saved from either surface
lands on one URL.

Checks: `tsc -b` clean in the extension; biome clean on every file touched;
extension vitest 119 of 119 (19 new — the write path against a stubbed Contents
API, and the action row in jsdom); extension build green.


## 2026-09-22 — bookmarks: a repo file type, a cached mirror, and a palette on a shortcut

Bookmarks now live in the repo as a first-class file type and reach the browser
through the extension's own cache, so the palette opens instantly and syncs
behind the user's back.

**Console — `.bookmarks.json`.** A new template in the New File wizard, wired the
same way every other widget type is: `BookmarksLogic` (parse/serialize plus
`addBookmark`, `deleteBookmark`, `filterBookmarks`, `collectTags`),
`BookmarksWidget` for the four tile modes, and `BookmarkAddForm` behind the focus
view's ADD BOOKMARK tab. The compound extension is registered in the three places
that derive one from a path — `layout.store.getChildren`, and `MainApp`'s
`dashboardTiles` and `computedActiveTile` — plus `Dashboard`'s `renderFile`
allow-list, so the file behaves identically on the dashboard, in Files view and
in focus mode. The file is a JSON object: `{ bookmarks: [{ id, title, url, tags,
createdAt, updatedAt }], updatedAt }`, all timestamps ISO strings, matching its
`browser.pinnedtabs.json` sibling.

Only `http(s)` entries survive parsing, in both apps. The file is remote input
that ends up as a clickable link and, in the extension, as a tab — a
`javascript:` entry must never get that far. `addBookmark` also rejects a page
already in the file, comparing canonical URLs so `https://x.com` and
`https://x.com/` are the same page.

**Extension — a cache, not a fetch.** `GET_BOOKMARKS` answers from
`chrome.storage.local` and only blocks on GitHub when there is no usable cache;
a cache older than 15 minutes is served anyway and refreshed in the background,
and an alarm syncs every 15 minutes regardless. GitHub's own `ETag` is replayed as
`If-None-Match`, so an unchanged file answers 304 — which GitHub does not bill
against the rate limit. The cache carries the repo it came from, which is what makes a repo switch
in the popup self-invalidating; a new token drops it outright, since that can
mean a different account.

**Extension — the palette.** `Ctrl+Shift+Space` (`Command+Shift+Space` on macOS)
is an extension command, which only the service worker can hear, so it relays to
the active tab and the content script toggles the palette there. The palette is
plain DOM in a shadow root rather than a Preact island: nothing of the page's CSS
reaches it and none of ours reaches the page. Bookmark titles are set as
`textContent`, never markup.

Searching bookmarks is local against the cached list and ranks a title prefix
above a title substring, then tags, then the URL. Searching the repo is a
separate, explicit act: `Tab` on the typed query fires exactly one
`search/code` request. That endpoint's ~10 req/min budget punishes bursts, and
the console's `SearchModal` already pays for debounce-and-retry around it, so the
palette never calls it while typing at all. Typing again drops the previous
query's repo results rather than showing them next to fresh bookmark matches.

Opening a result goes through the worker (`OPEN_URL`), which re-checks the scheme
before creating a tab — the palette runs in the page, so the URL it sends is
page-influenced.

Demo mode seeds `.kh/browser.bookmarks.json` on the Reading dashboard, so the
widget is visible without a repo, and `demo.test.ts` guards that file's shape
against the parser like it does the other widget formats.

Checks: `tsc --noEmit` clean in `@lifosy/core`, `@lifosy/ui` and
`@lifosy/app-console`, `tsc -b` clean in the extension; biome clean in all three
packages and on every file added here; console vitest 82 of 82 (19 new, for the
bookmarks logic), extension vitest 100 of 100 (45 new, across the cache/search
module, the worker messages and the palette in jsdom); `@lifosy/ui`, console and
extension builds green. `turbo` itself cannot spawn child processes in this
sandbox ("Exec format error"), which is why the per-package scripts were run
directly — it fails the same way on `@lifosy/config`'s `echo`.


## 2026-09-16 — cascivo 1.3.0: the editor gutter stops drifting

`@cascivo/{charts,core,editor,react}` 1.2.0 → 1.3.0, `@cascivo/tokens` 1.1.0 → 1.1.1
(`@cascivo/i18n` follows transitively). `@cascivo/themes` is already at its
latest, 1.0.0.

The fix is in `CodeEditor`'s gutter. Until 1.2.0 the line numbers were a
separate flex column next to the scrolling `<pre>`, kept in step by JS
scroll-sync — which is what drifted. 1.3.0 folds them into the highlight
layer's own CSS grid, as a `position: sticky` first column over a
`--cascivo-editor-gutter-width` backdrop, so the browser keeps them aligned
and there is nothing left to sync. The current-line highlight splits in two
(`currentLine` plus a `currentLineGutter` band) and now tracks soft-wrapped
rows via `grid-row`, not just a `1lh` transform.

The public API does not move: the only `index.d.ts` change is a doc comment on
the gutter ref. `Editor` (`packages/ui`) and `CodeMirrorEditor`
(`apps/console`) carried no workaround for the old behaviour, so neither
needed an edit — both drive the same `applyEdit` / `onValueChange` /
`onSave` seam as before.

One wrinkle in landing it: pnpm 12 defaults `minimumReleaseAge` to 1440
minutes and the 1.3.0 tarballs were minutes old, so a cold-cache
`pnpm install` refused the lockfile with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`
(reproduced against a fresh `XDG_CACHE_HOME` — the verification result is
cached globally, so a warm machine passes and hides it). `pnpm-workspace.yaml`
therefore carries a `minimumReleaseAgeExclude` list pinning those six exact
versions. It is dead weight once they age past the cutoff, on 2026-09-17 —
delete it then.

Checks: `tsc --noEmit` clean in `@lifosy/ui` and `@lifosy/app-console`; biome
clean in both; console vitest 63 of 63, plus the two cascivo spike suites
(5 of 5) that mount the real `CodeEditor` under Preact; `@lifosy/ui` and
console builds both green.

## 2026-09-16 — `apps/cli` gains a `fix` script

`fix` is `cargo fmt`, so the crate now takes part in the repo-wide `fix` task
instead of being skipped by it. The Rust toolchain has no equivalent of biome's
`--unsafe` lint fixes, so this is formatting only; `cargo clippy --fix` is a
different proposition and is not wired up.

This restores the symmetry with the JS packages across both entry points:

| | JS packages | `apps/cli` |
|---|---|---|
| `pnpm run lint` on drift | fails | fails |
| `pnpm run verify` on drift | `fix` repairs it, passes | `fix` repairs it, passes |

Before this, `verify` failed on unformatted Rust, because `fix` skipped the
crate and `lint`'s `cargo fmt --check` was the first step to see it. Verified
both ways against a deliberately unformatted function: standalone `lint` still
exits 1 and names the line, while `verify` exits 0 having rewritten the file.

Note that a `verify` run which repairs drift leaves the repair in the working
tree — the same as it has always done for the JS packages. Commit it.

## 2026-09-16 — `lint` checks Rust formatting

`apps/cli`'s `lint` is now `cargo fmt --check && cargo clippy`. `fmt --check`
runs first because it needs no compile, so drift is reported in well under a
second instead of after a clippy build. It names the offending file and line:
`Diff in apps/cli/src/main.rs:83`.

This is the piece that actually catches formatting drift — `cargo fmt` on its
own rewrites and exits 0. Together with the `rust-toolchain.toml` pin, the
check is meaningful: without a pinned rustfmt it would fail on contributors
whose stable formats differently.

Standalone `pnpm run lint` therefore fails on unformatted Rust. Inside
`pnpm run verify` it does not, because the `fix` step repairs it first — see
the entry above.

## 2026-09-16 — `cargo fmt` failures stop being swallowed

`apps/cli`'s `format` script was `cargo fmt || true`; it is now plain
`cargo fmt`, matching every other package, whose `format` is an unguarded
`biome check --write`.

What this does and does not buy: `cargo fmt` *writes*, so it exits 0 on
badly-formatted code — dropping `|| true` does not make `pnpm run verify` catch
formatting drift. What it catches is rustfmt failing outright: a parse error, a
missing component, a toolchain that will not resolve. Verified against a file
with an unclosed delimiter — `|| true` exits 0 and prints the error into the
void, without it the script exits 1.

Catching drift needs `cargo fmt --check` in `lint`, added in the entry above.

## 2026-09-16 — pin the Rust toolchain, normalise `cargo fmt`

`pnpm run verify` left nine `apps/cli/src/*.rs` files modified on every run: the
committed Rust had drifted from `cargo fmt`, and verify's `format` step
(`cargo fmt || true`) silently rewrote it each time. The files are now formatted,
so a clean tree stays clean.

The drift is only worth fixing alongside a pin. rustfmt's output changes between
releases and `apps/cli` had neither a `rustfmt.toml` nor a toolchain file, so the
formatting depended on whichever stable each contributor happened to have —
reformatting on one machine would just be undone on the next. `apps/cli/rust-toolchain.toml`
now pins `1.94.1` with the `rustfmt` and `clippy` components, which rustup
resolves and fetches automatically.

Formatting only; the diff is line-wrapping and `cargo test` passes unchanged.
## 2026-09-16 — `.prompts.md`: a prompt library in one searchable file

A new file type for storing reusable prompts. One file holds many prompts; each
has a title, tags and the prompt text. Format and the full search contract are
documented in [`doc/prompts-format.md`](prompts-format.md).

The format is one H2 per prompt with tags inline on the heading line:

```markdown
## Refactor to hooks #react #refactor

Convert the class component below into a function component using hooks.
```

The shape is driven by the requirement that a third-party service reading the
raw file can search it easily. Everything identifying a prompt — its title, its
tags, its position — sits on one line, so `grep -n '^## '` lists the whole
library in a single pass and `grep -n '^## .*#react'` filters by tag. No index
file, no JSON sidecar, no parser needed on the reading end. GitHub's code-search
API only reports *which file* matched, so an index-free line-greppable layout is
what actually makes the file searchable from outside.

Considered and rejected: a markdown table (one row per prompt greps perfectly,
but prompt bodies are multi-line and would need `<br>` and `|` escaping) and
fenced YAML blocks (needs a YAML parser, and smuggles a non-markdown format into
an `.md` file). Per-prompt YAML frontmatter is not an option at all — frontmatter
is document-scoped, so one file can only carry one block.

The single escaping rule: a body line starting with `## ` is written as `\## `,
a standard markdown escape that renders literally and round-trips losslessly.

- **`PromptsLogic.ts`** (`packages/ui`): `parsePrompts` / `serializePrompts` /
  `addPrompt`. Tags use the same `#([\w-]+)` convention as `.todos.md` and
  `.actionlog.md`, and are stripped from the title into a `tags` array on parse,
  then re-appended on serialize — the same split `TodoLogic` does.
- **`PromptsWidget.tsx`**: search across titles/bodies/tags, frequency-sorted
  tag cloud filter, click-to-expand bodies, and a copy button per prompt in
  every mode. `SMALL` lists the first 10, `FOCUS` is the full searchable view.
- **`PromptsAddForm.tsx`**: title, comma-separated tags, prompt body. Tags typed
  straight into the title are merged with the form's tags and deduplicated.
- Wired into the type-dispatch sites the other widget types use: the
  `NewFileWizard` template list, both extension ladders and the focused-tile
  flags in `MainApp`, the compound-extension mapping in `layout.store`, and the
  `renderFile` allowlist in the console's `Dashboard`.
- 20 parser tests in `apps/console/src/prompts-logic.test.ts` covering multi-line
  bodies, fenced code, CRLF, empty bodies, duplicate titles, the `\##` escape,
  and parse/serialize round-trip idempotence.

Scoped to the widget deliberately: no cross-file "Prompts" nav view, and the
existing one-file-per-prompt `ref:` link on todos (`TodoLogic`) is untouched.
## 2026-09-15 — cascivo 1.x

The six `@cascivo/*` packages move off 0.x: `core` 0.2.3, `react` 0.3.8,
`charts` 0.3.4 and `editor` 0.2.6 → **1.2.0**; `themes` 0.2.7 → **1.0.0**;
`tokens` 0.3.5 → **1.1.0**. `@cascivo/i18n` arrives as a new transitive
dependency of `react`, `charts` and `editor`.

Nothing this repo imports changed shape. The four wrappers in `@lifosy/ui`
(`Button`, `Input`, `StackedBarChart`, `DonutChart`) and the two `CodeEditor`
call sites compile and render untouched: `ButtonProps`, `InputProps`,
`StackedRow`, `PieChartDatum`, `toStackedSeries` and `CodeEditorProps` are all
additive across the jump (mostly new `ariaLabel`/`label` aliases and a `tooltip`
prop on `PieChart`). The two renames 1.x does ship — `Calendar*` →
`CalendarHeatmap*`, `Text`/`TextProps` → `ChartText`/`ChartTextProps`, and
`BarChart`'s `xTicks`/`yTicks` → `valueAxisTicks`/`categoryAxisTicks` — land on
exports the repo never used.

The Preact bridge survives intact, which was the real risk. `@cascivo/core`
still takes `signal`/`computed`/`effect`/`batch`/`useSignal`/`useComputed`/
`useSignalEffect` from `@preact/signals-react` and `useSignals` from
`@preact/signals-react/runtime`, so the alias onto `@preact/signals` plus the
no-op `useSignals` shim still covers the whole surface. Both spike suites pass
unchanged. The peer range tightened to `@preact/signals-react >=3.0.0`; the
console already pins `^3.10.2`.

**The one thing that did need a fix: `cascivo.reset`.** 1.x publishes a
canonical layer order (`@cascivo/tokens/src/layers.css`) and, for the first
time, ships content in its lowest layer — `box-sizing: border-box` on `*` and
`body { margin: 0 }`. Cascade layers rank by first appearance, and the console's
guard in `index.html` named only four cascivo layers, so the newcomer was being
appended *last*: the layer Cascivo documents as "the floor" was outranking
Tailwind's utilities and `cascivo.component`. Both the authoritative declaration
in `apps/console/index.html` and its mirror in `apps/console/src/index.css` now
name `cascivo.reset` first. No live regression today — the reset's two
declarations match Preflight's, and nothing in the app uses `box-content` — but
the next utility that fought it would have lost silently.

The rest of the CSS contract is unchanged: no `--cascivo-*` token was removed
(207 → 228, purely additive), `@cascivo/themes/dark.css` still wraps in
`@layer cascivo.theme`, and every stylesheet entry point the repo imports still
resolves. The brand bridge in `packages/ui/src/cascivo.css` is unlayered, so it
keeps winning regardless.

Verified: `@lifosy/ui` and `@lifosy/app-console` build, `tsc --noEmit` clean
across the workspace, Biome clean on the console, 43 unit tests and 5 spike
tests green.

## 2026-09-13 — turbo 2.10.12

`turbo` moves from `^2.9.18` to `^2.10.12`. The floor was the only thing that
moved: `^2.9.18` already resolved to 2.10.12, so the lockfile changes by exactly
the one specifier line.

`@turbo/codemod migrate` reports **no required codemods** for the jump. The one
transform it runs anyway rewrites `$schema` in `turbo.json` to the version-pinned
`https://v2-10-12.turborepo.dev/schema.json` — the form turbo has published the
schema in since 2.7.5. An editor now validates the file against the exact version
the repo pins rather than against whatever is current, which is the point: a key
that only exists in a later turbo stops reading as valid here.

Nothing else in the 2.7 → 2.10 notes reaches this repo. The daemon 2.9 removed
from `turbo run` and `turbo watch` was never configured; `--parallel`,
`turbo-ignore` and the web UI mode 2.10 dropped appear nowhere in the workspace
or in CI.

## 2026-09-13 — pnpm 12: install it before the first `pnpm install`

The pin alone is not enough, and the README prerequisites now say so. pnpm 12.4.1 cannot
be provisioned by an older pnpm: the bootstrap runs
`pnpm add pnpm@12.4.1 --allow-build=@pnpm/exe`, but the `preinstall`/`postinstall`
scripts belong to the `pnpm` package rather than to `@pnpm/exe`, so the allowance misses
the thing that actually builds. A pnpm that enforces build approval then refuses it and
the install dies with `ERR_PNPM_IGNORED_BUILDS` — reproduced verbatim against pnpm 10.11.0.

Verified working: `corepack enable` (fetches the pinned binary directly, no `pnpm add`
step) and `npm install -g pnpm@12.4.1`.

## 2026-09-13 — pnpm 12

`packageManager` moves from pnpm 10.28.0 to 12.4.1, and two things had to move
with it.

- **`onlyBuiltDependencies` → `allowBuilds`.** pnpm 11 removed the allowlist
  form. The replacement asks for an explicit `true`/`false` per dependency, and
  an unanswered build script now fails the install rather than being silently
  skipped. `@biomejs/biome`, `esbuild` and `sharp` all become `true`, so
  nothing that used to build stopped building.
- **turbo floor `^2.7.4` → `^2.9.18`** (resolving to 2.10.12). pnpm 12 writes
  the pinned package manager into the lockfile as a second YAML document
  holding `packageManagerDependencies` and the `@pnpm/exe.*` platform binaries.
  The locked turbo 2.8.x cannot read that: `deserializing from YAML containing
  more than one document is not supported`, after which it carries on with
  change detection and `turbo prune` degraded. It is a warning, never a
  failure, so it would have rotted unnoticed.

The dependency graph itself is untouched — no resolution moved.

Checks: `turbo build` 6 of 6; `pnpm check` (lint + check-types) 8 of 8 from a
cold cache; `pnpm format` 5 of 5. The workflows read the pnpm version from
`packageManager`, so `template-deploy-to-cloudflare.yaml` needed no edit.

## 2026-09-13 — Pinned tab groups: edit mode, full-height Load button

- **Load / Update** now fills the row: a fixed 96px wide button stretched to the card's content
  height (44px inside the card's `p-2`), instead of a 10px label in `py-1 px-2`. Verified in a
  headless render of the popup at its real 350px width.
- **Edit mode**: an Edit/Done toggle in the section header. By default a group row is only its
  name and that button. Rename, Delete, ↑/↓ and the `3 tabs · Sep 1, 2026` line are rendered
  only in edit mode, where the Load/Update button is not — the two sets never compete for the
  same row. Leaving edit mode also drops a half-finished rename or delete confirmation.
  **Save current** stays visible in both modes, since it creates a group rather than editing one.
- The delete confirmation moved from a second line inside the row to replacing the row, like the
  rename field already did; at 350px a name plus "Delete?" plus two buttons did not fit.
- **Tests**: 55 (was 51) — the first component tests in this app, rendering the panel against a
  stubbed `chrome.runtime` and asserting what each mode shows. `vitest.config.ts` gained explicit
  `esbuild.jsx` settings because vitest does not read `tsconfig.app.json`'s preact JSX config.

## 2026-09-09 — Fix "message port closed" on rename; reorder tab groups

- **Bug**: renaming a group failed with *"The message port closed before a response was
  received."*
  - **Root cause**: not the handler. A new `service-worker.test.ts` drives the real
    `onMessage` listener against a mocked `chrome`/`fetch` and shows it responds on every
    path — success, a failing GitHub read, a rejected fetch, an empty name. The failure is
    MV3 collecting the idle service worker (~30s) and the waking message losing the port in
    the teardown race. Rename is the flow that exposes it because it is the only one with a
    long human pause — click Rename, read, type a name — between the popup's previous
    message and the write.
  - **Fix**: the popup opens a `chrome.runtime.connect` port on mount and disconnects on
    unmount, and the worker accepts it via `onConnect`. An open port keeps the worker alive
    for the popup's lifetime, so no request can race its teardown.
  - Also fixed: pressing Enter in the rename field bypassed the emptiness check that
    disables the Save button, so it round-tripped to the worker just to fail validation.
- **Reorder**: each row gained ↑/↓ buttons; order is the group order in the repo file.
  `moveGroup` swaps with the neighbour and deliberately returns the *same config object* at
  either end of the list, which lets the worker skip the write and avoid an empty commit.
  The buttons are disabled at the ends, so that path is defensive only.
- **Tests**: 51 cases (was 37) — six for `moveGroup` (both directions, `updatedAt` stamping,
  the no-op identity return, non-mutation of the input, missing group) and seven driving the
  service worker's message listener end to end.

## 2026-09-09 — Pinned tab groups: rename and delete

- **Rename** edits a group's name in place from the popup row, keeping its id, tabs and
  `createdAt`. It reuses `putGroup`, so no new write path was needed.
- **Delete** removes the group from `.kh/browser.pinnedtabs.json` behind an inline two-step
  confirmation — the row turns into "Delete this group?" rather than firing on one click,
  since the write is destructive and lands in the repo. Deleting only forgets the entry; the
  window keeps whatever it currently has pinned.
- Deleting the group a window was running needs no extra cleanup: the session-stored active
  group is already validated against the group list before use, so it falls straight through
  to `matchGroup` on the next read.
- **New pure helpers**: `removeGroup` (throws, naming the group, when it is already gone) and
  `normalizeGroupName`, which now backs both "save as new" and rename so the two cannot drift
  on whitespace or empty-name handling. Tests grew from 34 to 37 cases.

## 2026-09-09 — Pinned tabs: multiple named groups per repo

- **Feature**: `.kh/browser.pinnedtabs.json` now holds *many* named groups instead of one
  flat list. The popup renders each group with its name, tab count and creation date, and
  marks the one the current window is running.
  - **Load** makes the window's pinned set *equal* the group — it opens what is missing and
    **unpins** (never closes) pinned tabs the group does not contain. Without this, switching
    from one group to another left the union pinned, which broke detection and made the next
    save write both groups' tabs into one.
  - **Update** writes the window's pinned tabs back into the loaded group, keeping its id,
    name and `createdAt`.
  - **Save current** stores the window's pinned tabs as a new, named group.
- **Detecting the loaded group** uses two tiers, because neither alone is sufficient:
  - `chrome.storage.session` remembers which group each window loaded. Chrome clears session
    storage on restart — the same lifetime as the window ids it is keyed by — so a remembered
    entry can never survive into a *reused* window id and point at the wrong group.
  - When there is no memory (after a restart, or a window loaded into by hand), `matchGroup`
    scores each group by the share of its tabs currently pinned and claims the best above 50%.
    This still identifies the group after the user has edited a pinned tab, which is exactly
    when the "update the correct group" requirement bites.
- **Migration**: `parsePinnedTabs` still accepts the previous `{ tabs: [...] }` shape and folds
  it into a single group (`id: "default"`, name "Pinned tabs"), so files written by the first
  release keep working untouched.
- **Schema**: groups carry `id` (a `crypto.randomUUID()`), `name`, `createdAt` and `tabs`; the
  file keeps a top-level `updatedAt`. Malformed groups throw an error naming the offending
  entry rather than being silently dropped.
- **Tests**: `pinned-tabs.test.ts` grew from 15 to 30 cases, covering v1 migration, group
  put/find, unpin selection, and the match scoring (including tie-breaking and empty groups).

## 2026-09-03 — Chrome pinned tabs synced through the GitHub repo

- **Feature**: the browser extension popup gained a **Pinned Tabs** section with
  *Load* and *Save current*, backed by `.kh/browser.pinnedtabs.json` in the active
  repo (matching the existing `.kh/<name>.<type>.<ext>` data-file convention).
  - *Save current* snapshots the pinned tabs of the current window and **replaces**
    the file, so unpinning a tab and saving again drops it.
  - *Load* opens every stored tab pinned in the current window, skipping URLs that
    are already open — repeated loads are a no-op rather than a duplicate storm.
- **Implementation**:
  - `src/background/pinned-tabs.ts` holds the pure logic (parse/serialize, tab
    projection, already-open de-duplication) so it is unit-testable without Chrome;
    `pinned-tabs.test.ts` covers it (15 cases, run under the extension's vitest).
  - `service-worker.ts` gained `LOAD_PINNED_TABS` / `SAVE_PINNED_TABS` handlers plus
    `githubReadFile` / `githubWriteFile`. The existing `githubUpsertFile` *appends*,
    which is wrong for a snapshot document, so the new helpers replace file contents
    whole. They also base64 round-trip through `TextEncoder`/`TextDecoder` instead of
    the deprecated `escape`/`unescape` pair, keeping non-ASCII tab titles intact.
  - `manifest.ts` adds the `tabs` permission — `activeTab` only exposes the URL of the
    tab the popup was opened from, not every pinned tab.
- **Safety**: the repo file is remote input, so `isOpenableUrl` restricts restored tabs
  to `http`/`https`; a `javascript:` or `file:` entry committed to the repo is dropped
  rather than navigated to.

## 2026-07-18 — `/kb-agent-capture`: agent-driven capture, auto-scaffolded into the KB repo

The payoff of the native-sdk automation server, delivered through the **same
scaffold mechanism as the other `/kb-*` commands** so it lives in the user's KB
repo (not this one) and auto-updates on version bump.

- **kb-skills.ts → v2.1.0**: new `KB_AGENT_CAPTURE_SKILL` added to both
  `getScaffoldFiles` and `getSkillOnlyFiles` as
  `.claude/commands/kb-agent-capture.md`, so `updateSkillsIfNeeded` writes it into
  every initialised KB repo. Teaches a Claude session to capture by *driving the
  `kh-capture` window* via the automation server (`native automate
  wait/assert/snapshot/widget-click`) — open, type, submit, assert `captured ✓` —
  framed as both an agent action and the app's end-to-end acceptance test.
  Self-contained; falls back to `cli capture`. Tests + KBCommandsModal +
  Cheatsheet Slash-Commands tab updated to match.
- **`apps/kh-capture-native/scripts/agent-capture.sh`**: the local reference
  driver / acceptance-test harness for the app, degrading gracefully to
  `cli capture` on any missing/failed automate step (each call `timeout`-guarded).
- Removed the earlier hand-placed `.claude/skills/kb-agent-capture/SKILL.md`
  (single source of truth is now the scaffold).
- Experimental: depends on the app compiling with `native build -Dautomation=true`;
  input-dispatch subcommand + assertion regex flagged `VERIFY(api)`.

## 2026-07-18 — Native-sdk capture app: self-contained (drop the `cli` dependency)

Next step for the native-sdk experiment: make it stand alone instead of shelling
out to `cli capture`.

- **Direct GitHub API** (`src/main.zig` rewritten): `initEffects` reads the CLI's
  `~/.config/cli/auth.json` via `fx.readFile` (path resolved from `$HOME` /
  `$XDG_CONFIG_HOME`, token + `active_repo` extracted with a small allocator-free
  JSON scanner); submit builds the OKF markdown + base64 JSON body and PUTs it to
  the contents API via `fx.fetch`. Capture builders (slug, `std.time.epoch` date,
  base64) are plain Zig std.
- **Offline interop**: on a failed push the note is written as markdown into the
  **CLI's own spool dir** (`fx.writeFile`), so `cli capture`'s existing flush
  picks it up next run — the two capture paths rescue each other; nothing is lost.
- **app.zon**: dropped `command` (no more spawn); added placeholder `net`/`fs`
  permissions (VERIFY — the docs don't publish exact strings for network/file
  effects).
- **README**: rewritten for the self-contained architecture; documents enabling
  the **automation server** (`native build -Dautomation=true` + `native automate`)
  as the differentiator, and refreshed the `VERIFY(api)` reconciliation table.
- Still doc-derived / not compiled here; the previous `fx.spawn` thin-shell
  variant remains in git history.

## 2026-07-18 — Experiment: native-sdk capture app (`apps/kh-capture-native`)

Stage 2, running in parallel with the shipped `cli capture` + wofi overlay — a
place to evaluate [native-sdk](https://native-sdk.dev) (Zig core).

- **Thin GUI over the tested CLI**: a native-sdk window (`src/app.native` markup +
  `src/main.zig` Zig core) that, on submit, spawns `cli capture <text>` via the
  `spawn` effect. The Rust CLI keeps ownership of auth + offline spool + retry, so
  the app inherits offline-safety and duplicates no push logic. Manifest in
  `app.zon`; always-on-top/float/center delegated to Hyprland window rules.
- **Honest status**: doc-derived, **not compiled** against a live toolchain (no
  Zig/native CLI in the environment). Uncertain symbol names are flagged inline
  with `VERIFY(api)` and tabulated in the app README with a one-command way to
  reconcile against `native init --template zig-core`.
- No workspace impact: Zig-core app has no `package.json`, so pnpm/turbo ignore
  it. Documented upgrade path: drop the CLI dependency by calling the GitHub API
  via `fx.fetch` + reading `auth.json` via `fx.readFile`; the automation server is
  the reason to prefer native-sdk over Tauri if it graduates.

## 2026-07-18 — Desktop quick-capture: `cli capture` + Hyprland overlay (offline-safe)

Stage 1 of OS-level capture on Linux/Hyprland — reuses the CLI's auth + push
instead of a new app (on Wayland the compositor owns the hotkey, so a native
framework wouldn't have helped the hard part anyway).

- **`cli capture` subcommand** (`apps/cli/src/capture.rs`, wired in `main.rs`):
  resolves text from args → piped stdin → `$EDITOR`. **Spools every capture to a
  local file _before_ pushing**, so an offline/failed push never loses a thought;
  the next capture flushes the whole spool to `.kh/raw/`, oldest first, with
  retry + backoff.
- **github.rs refactor**: extracted `build_kb_note(text) -> (filename, content)`
  (freezes capture-time timestamp/date so offline captures keep their real time)
  and a generic `put_file`; `create_kb_note` now composes them (TUI `k` behaviour
  unchanged).
- **Overlay** (`apps/cli/scripts/`): `kh-capture` (wofi → fuzzel → zenity, returns
  typed text and pipes to `cli capture`), `hyprland-kh-capture.conf` (`Super+K`
  bind + optional floating-terminal multi-line variant with window rules), and a
  `README.md` setup guide.
- Docs: README (subcommands, desktop-capture section, spool dir), documentation.md
  (`cli capture` usage), Cheatsheet Quick-Capture tab.

## 2026-07-18 — Knowledge base: capture-everywhere + journal-as-derived-artifact + cheatsheet

Reworked the knowledge base around low-friction capture and an auditable,
re-buildable wiki. Concept summary in the "How it works" section of the
Cheatsheet page (`/cheatsheet`).

- **Pipeline (KB skills → v2.0.0, `apps/console/src/lib/kb-skills.ts`)**:
  - `/kb-ingest` now appends every capture **verbatim** to a monthly journal
    `.kh/journal/YYYY-MM.md` (single `# YYYY-MM` heading, one
    `## [YYYY-MM-DD HH:MM] Title` section per capture) in addition to compiling
    the deduplicated wiki. The journal is the human-readable log; the wiki is the
    synthesized view.
  - **Raw captures are immutable**; ingestion only flips `processed` and copies
    the body into the journal — a bad compile is recoverable from git.
  - **Provenance**: every wiki page carries a `## Sources` section linking claims
    back to their journal entry / raw file. `/kb-lint` now flags missing sources
    and topic drift (near-duplicate pages).
  - **Canonical Topics** list in `schema.md` steers ingest toward merging rather
    than fragmenting. Schema frontmatter is OKF-aligned (`type` field on captures
    and wiki pages). Added `.kh/journal/.gitkeep` to the scaffold; refreshed
    `CLAUDE.md` template and documented running ingest/index on a routine.
- **Capture everywhere** (all write to `.kh/raw/` with `type` frontmatter):
  - CLI: new `k` — "New knowledge note" menu item + `create_kb_note`
    (`apps/cli/src/github.rs`, `app.rs`) writing an OKF-aligned file to
    `.kh/raw/`, zero required structure.
  - Console: `/quick-knowledge` page (`QuickKnowledgePage.tsx`) + PWA manifest +
    home-screen shortcut (QUICK_ROUTES, vite `shortcuts`). Free-text only; the
    first line becomes the title.
  - Extension `PIN_ARTICLE` and console `addRawNote` now stamp `type:`
    (`article` / `note`); `/kb-session` stamps `type: session`.
- **Cheatsheet page** (`CheatsheetPage.tsx`, `/cheatsheet`): tabbed reference —
  Knowledge Base (how the wiki works, required), Quick Capture, CLI Keys, Slash
  Commands. Reachable from the Magic Menu (`onCheatsheetClick` plumbed through
  `packages/ui/.../MainApp.tsx`).

## 2026-07-12 — Fix persistent cmd+k search CORS failures by cutting request volume

- **Root cause (confirmed)**: `SearchModal.tsx` fired two concurrent
  `/search/code` requests per debounced keystroke against GitHub's code-search
  endpoint, whose dedicated limit is ~10 req/min even when authenticated. Its
  limiter rejections arrive without CORS headers, so the browser reports an
  opaque "Failed to fetch" / CORS error instead of a 403. #113's trailing-space
  theory was invalid — the Fetch spec strips trailing whitespace from header
  values, so auth was never broken.
- **Fix**:
  - New pure `matchFilenames()` (`packages/ui/src/LifeOS/Organisms/search-filename-matcher.ts`)
    resolves filename matches locally from the already-loaded `githubFileStore`
    tree — zero API calls, instant, works while throttled. Prefix matches rank
    above substring matches.
  - `SearchModal.tsx` now issues a **single** content-search request per
    debounce (down from two), aborts the in-flight request when the query
    changes or the modal closes (via `AbortController`), and no longer needs
    `Promise.allSettled`. Removed the dangling trailing `%20` from the query.
  - Unit tests in `apps/console/src/search-filename-matcher.test.ts` (run under
    console's vitest, importing the matcher via relative path like
    `navbar-config.test.ts`).

## 2026-07-11 — Investigation + fix plan for persistent cmd+k search CORS failures

- **Symptom**: after both #112 and #113 the cmd+k search still fails — the
  content `/search/code` request returns data while the parallel
  `filename:` request is blocked by CORS ("No 'Access-Control-Allow-Origin'
  header").
- **Finding**: #113's premise was wrong — the Fetch spec strips
  leading/trailing whitespace from header values before sending
  (`new Headers({Authorization: 'Bearer abc '})` → `'Bearer abc'`), so the
  trailing space never reached the wire and auth was never broken. The real
  root cause is request volume: two concurrent `/search/code` requests per
  debounced keystroke against the code-search endpoint's dedicated
  10 req/min (authenticated) limit; GitHub's limiter rejections arrive
  without CORS headers and surface as opaque CORS errors.
- **Plan**: `docs/superpowers/plans/2026-07-11-searchmodal-cors-fix.md` —
  replace the `filename:` API request with local matching against the
  already-loaded `githubFileStore` tree, keep a single content-search
  request per debounce, and abort in-flight searches on query change.

## 2026-07-11 — Fix real root cause of cmd+k search failures: malformed auth header

- **Symptom**: after PR #112 the cmd+k GitHub code search still failed with the
  same CORS / "Failed to fetch" errors.
- **Root cause**: `SearchModal.tsx` built the auth header as
  `` `Bearer ${githubToken} ` `` — with a **trailing space** after the token.
  That makes the credential invalid, so GitHub ignores the token and treats
  every search request as *unauthenticated*. The Search API's unauthenticated
  quota is only ~10 requests/minute, but the modal fires two requests per
  debounced keystroke, so it exhausts the quota almost immediately and gets
  `403` secondary-rate-limit responses — which arrive without CORS headers and
  surface as the opaque CORS error. PR #112's `Promise.allSettled` + retry
  treated the symptom but couldn't help, because auth was permanently broken and
  every retry burned more of the tiny unauthenticated quota. Every other GitHub
  call in the repo (e.g. `apps/console/src/lib/github-kb.ts`) uses
  `` `Bearer ${token}` `` with no trailing space.
- **Fix**: `packages/ui/src/LifeOS/Organisms/SearchModal.tsx` — removed the
  trailing space so the token is sent correctly and requests use the
  authenticated Search API rate limit, eliminating the throttling that produced
  the CORS errors.

## 2026-07-07 — Harden cmd+k GitHub code search against CORS/rate-limit failures

- **Symptom**: the cmd+k search modal's GitHub code search (e.g.
  `filename:devto repo:urbanisierung/life-os`) started failing in the browser
  with a CORS error ("missing allow origin header").
- **Root cause**: `SearchModal.tsx` fires two direct `fetch()` calls per
  keystroke straight to `api.github.com/search/code` (content search + filename
  search) via `Promise.all`. GitHub's Search API sits behind a stricter
  abuse/rate-limit layer than the rest of the REST API (which the app's other
  GitHub calls go through via Octokit and don't hit this problem); throttled
  responses from that layer can come back without CORS headers, which the
  browser surfaces as an opaque CORS failure rather than a readable 403. Since
  the two searches were joined with `Promise.all`, one failing request wiped
  out both result sets.
- **Fix**: `packages/ui/src/LifeOS/Organisms/SearchModal.tsx` — switched to
  `Promise.allSettled` so a failure on one query no longer discards the other,
  and added `fetchGithubSearchWithRetry`, a single retry with backoff
  (honoring `Retry-After` on 403s, exponential backoff on network/CORS
  failures) before giving up on that query.

## 2026-06-26 — Configurable desktop bottom navbar

- **What**: the desktop bottom navbar items are now configurable from Settings
  instead of being hardcoded. Users choose which destinations appear and in what
  order; the choice is persisted to the repo's internal `.kh` settings file
  (`.kh/.dashboard.config.json`) alongside the rest of the dashboard config.
- **Config**: added `navbar?: NavItemId[]` to `DashboardConfig`
  (`packages/core/src/models/types.ts`) plus the `NavItemId` union. When unset it
  defaults to the historical items — Dashboard, Files, Board, Shortcuts.
- **Catalog**: `packages/ui/src/LifeOS/navbar-items.ts` defines `NAVBAR_ITEMS`
  (id/label/icon) and `DEFAULT_NAVBAR`. Beyond the four defaults it offers the
  other magic-menu destinations: Wiki, Knowledge Base, Action Log, Graph,
  Commits.
- **UI**: `StatusBar` now renders the desktop nav links from a resolved `navbar`
  prop; `MainApp` builds that list from config (mapping each id to its existing
  navigation handler and skipping unwired destinations); `SettingsView` gained a
  "Bottom Navbar" section with enable/disable + reorder controls that write back
  through the standard `onConfigChange` → GitHub persistence path.
- **Tests**: `apps/console/src/navbar-config.test.ts` covers the catalog
  invariants and the default set.

## 2026-06-25 — Fix editor padding/active-line drift (robustly) + per-file language

- **Symptom (recurrence)**: the markdown editor again rendered with no inner
  padding — text/line-numbers flush to the border, no gutter→text gap — and the
  active-line highlight sat one `space-3` (12px) below its row. Exactly the
  cascade-layer bug the 2026-06-24 fix targeted, but back in the production
  build.
- **Root cause**: cascade-layer priority is set by *first appearance*. The
  bundler hoists Cascivo's `@layer cascivo.component` CSS (pulled in as a
  component dependency of the editor) to the very top of the bundle — *before*
  the `@layer …` order declaration that lived in `index.css` (which landed
  ~60 KB later). So `cascivo.component` resolved as the **lowest**-priority
  layer and Tailwind's Preflight (`* { padding: 0 }` in `@layer base`) won,
  collapsing the editor's `padding`/`padding-inline`/`padding-block`. The
  active-line overlay positions via `top: var(--cascivo-space-3)` (a `top`, not
  padding — so *not* reset), while the text lost its matching `padding-block`,
  dropping the highlight by `space-3`. Verified against the real bundle: pre
  padding computed `0px` (broken) → `12px` (fixed).
- **Fix**: declare the cascade order in an inline `<style>` in
  `index.html`'s `<head>` — guaranteed to precede the bundled stylesheet, so it
  wins regardless of how the bundler orders the CSS. The `index.css` statement
  is kept as a (non-authoritative) mirror with an updated comment.
- **Per-file language**: the editor hardcoded `language="markdown"` for every
  file. Added `languageForPath` (`apps/console/src/components/editor/language.ts`)
  and wired it into `CodeMirrorEditor` so the grammar is derived from the file
  extension — `.md`/`.markdown` → `markdown` (so markdown highlighting is
  reliably set), plus `json`/`javascript`/`typescript`/`css`/`html`/`bash` using
  Cascivo's **registered** grammar names (short aliases like `ts`/`js` silently
  fall back to plaintext, so the long names are used); unknown/extension-less
  files default to `markdown` (this app is markdown-centric).
- *Verified*: console `tsc` + Biome clean; `vite build` green; full console
  suite 31/31 (incl. new `language.test.ts`); padding/highlight fix confirmed in
  a browser against the actual production CSS bundle (0px → 12px).

## 2026-06-25 — Nextgen is the default landing page + "try the demo" link

- Added a **"▶ Try the live demo — no signup"** call-to-action next to the
  screencast on both landing pages, linking to
  `https://app.kaihuman.com/demo` (the console's `/demo` deep link that seeds
  the in-memory demo) so visitors can play around themselves.
- **Made the nextgen landing page the production default.** The
  `[PROD] Deploy Landing Page` workflow (`deploy-landing.yml`, which targets the
  `lifosy-landing` Cloudflare Pages project) now builds and deploys
  `apps/landing-page-nextgen` and triggers on `apps/landing-page-nextgen/**`.
  The redundant `deploy-landing-nextgen.yml` (which deployed nextgen to the
  separate `kh-landingpage-nextgen` preview project) was removed. The old
  `apps/landing-page` app remains in the repo but is no longer auto-deployed.

## 2026-06-25 — Auto-generated product screencast on the landing pages

- The **nextgen landing page** demo section previously held a hand-built
  terminal mock + three placeholder "screenshot" panels marked *PLACEHOLDER*.
  Replaced them with a **real, auto-generated screencast** of the app, framed
  as an app window (title bar + `DEMO` badge), autoplaying muted on loop with a
  poster frame. The same player was added to the **original landing page**
  (`apps/landing-page`) right below the hero. Both consume the same asset.
- **Recorder (`apps/landing-page-nextgen/scripts/record-screencast.mjs`):** a
  Playwright script that drives the console's **demo mode** through a scripted
  storyline and records it to each landing page's `public/screencast.webm`
  (+ a first-frame `screencast-poster.jpg`). Run with
  `pnpm --filter @lifosy/landing-page-nextgen screencast` (it reuses a running
  dev server on :4300 or starts one itself).
- **Storyline:** Overview dashboard → Finance → Reading workspaces → Kanban
  board → todo analytics → action log → wiki → files browser + markdown editor
  → back to Overview. A synthetic on-screen cursor (the recorded video has no
  real pointer) glides and pulses on clicks for legibility.
- **Seamless loop:** the clip is recorded so it begins *and* ends on the exact
  same Overview frame (cursor centred, held a beat); ffmpeg then trims off the
  leading `/demo` load and re-encodes (VP8), so wrapping from the last frame
  back to the first is invisible. ffmpeg is auto-discovered (Playwright's
  bundled binary, `FFMPEG_PATH`, or `ffmpeg` on PATH); without it the raw clip
  is shipped un-trimmed.
- **Key constraint:** demo data lives only in memory and is wiped by a full
  page reload, so every transition after the initial `/demo` load is done
  client-side via `history.pushState` + a `popstate` event (which
  preact-router listens to) — never a fresh navigation.
- **Format:** VP8 WebM (≈3.7 MB, 1440×900, ~51 s). The poster image is the
  graceful fallback for browsers without WebM support.
- Added `playwright` as a root devDependency.
- *Verified*: both landing-page builds bundle the video + poster into `dist/`
  with correct `<video>`/`<source>` references and zero remaining placeholder
  markup; first and last video frames are the same Overview view; both built
  pages render the screencast playing in its frame.

## 2026-06-25 — Demo mode (in-memory, seeded data)

- Added a **demo mode** so the console can be shown (e.g. for a screen
  recording) with realistic data and no GitHub account. Entered via a **"View
  demo"** button on the login screen or the **`/demo`** deep link. All data is
  generated, lives only in memory, and disappears on refresh — edits and saves
  during the session operate on the temporary in-memory store.
- **Mechanism (no store/widget changes):** every read/write already funnels
  through the `githubService` singleton. It is now a small `Proxy` façade that
  routes each call to either the real Octokit-backed service or a new
  `InMemoryGithubService` (a seeded `Map<path,{content,sha}>` returning
  Octokit-shaped responses), based on a global `demoMode` signal
  (`packages/core/src/demo-mode.ts`).
- **Ephemerality:** durable writes are skipped while `demoMode` is on — the
  auth/profile persistence effects early-return, and the file store's
  IndexedDB handle is wrapped so `put`/`delete`/`get`/`getKey` become no-ops.
  No fake token or repo ever touches localStorage/IndexedDB.
- **Seed (`packages/core/src/demo/seed.ts`):** a fake repo + user and a virtual
  filesystem dated relative to "now", including a `.kh/.dashboard.config.json`
  wiring three workspaces (Overview / Finance / Reading) to one of every widget
  (todos + Kanban inbox, time-tracking, habits, events, action log, timezones,
  board overview, budget, stocks, consumption, data-collection, read-it-later,
  RSS) plus plain notes for the file browser.
- **Orchestration:** `enterDemoMode()` / `exitDemoMode()` in
  `stores/demo.store.ts`; console wires the login button and a `/demo` route
  (`pages/DemoEntry.tsx`).
- *Verified*: 28 console tests pass (seed integrity, format contracts,
  in-memory service round-trip); Overview, Finance, Board and Analytics all
  render via the real app with zero console errors. Added `fake-indexeddb`
  (root devDependency) so store-importing tests run under jsdom.

## 2026-06-25 — Switch to @cascivo/react 0.3.7 (per-component CSS, no monolith)

- `@cascivo/react@0.3.7` ships each component prebuilt with its CSS co-located
  (`button/button.js` → `button.module.js` → `import './button.css'`) and
  `sideEffects: ["**/*.css"]`. Importing a component now pulls in only that
  component's CSS automatically — the 252KB aggregate `styles.css` is only needed
  for no-bundler/CDN setups (per the library's own README).
- Reverted the interim copy-paste vendoring: deleted
  `packages/ui/src/components/cascivo/{button,input}.tsx` and
  `cascivo-components.css`, and pointed the `@lifosy/ui` Button/Input wrappers
  back at `@cascivo/react` (re-added as a `@lifosy/ui` dependency, `^0.3.7`).
  Dropped the corresponding `cascivo-components.css` imports (console
  `index.css` + Storybook) and the `./cascivo-components.css` package export.
- `InputProps` now extends `JSX.InputHTMLAttributes` (was `HTMLAttributes`) so
  `placeholder`/`value`/etc. type-check; still omits the numeric `size` (collides
  with Cascivo's `'sm'|'md'|'lg'`). Fixes a pre-existing story type error that
  the dts build never surfaced. The `Input` wrapper drops the unused `forwardRef`
  (no caller forwards a ref to it).
- Also bumped `@cascivo/editor` 0.2.1→0.2.2 and `@cascivo/charts` 0.3.0→0.3.1.
- **Bundle impact** (console, gzip): CSS still ~17KB (per-component tree-shaking
  matches the hand-vendored result), monolith gone.
- *Verified*: full build green (6/6); bundled CSS carries `_button_`/`_input_`
  and none of the monolith-only classes (accordion/carousel/data-table/dropdown
  = 0); `tsc` clean (ui + console); spikes (5/5) + console suite (20/20) green;
  Biome clean.

## 2026-06-25 — Drop the 252KB @cascivo/react CSS monolith (copy-paste model)

- `@cascivo/react/styles.css` shipped the CSS for all 254 component class-groups
  (252KB raw / ~33KB gzip) but we only used `Button` + `Input` from it.
- Switched those two to Cascivo's **copy-paste model**: vendored the components
  (`npx cascivo add button input`) into
  `packages/ui/src/components/cascivo/{button,input}.tsx`, adapted them to Preact
  types, and flattened their per-component CSS-modules into
  `packages/ui/src/cascivo-components.css` (~6KB, stable class names, kept in
  `@layer cascivo.component`). The `@lifosy/ui` Button/Input wrappers now point at
  the vendored components.
- Removed the `@cascivo/react` dependency (console + `@lifosy/ui`) and its
  `styles.css` import (main.tsx + Storybook); added `@cascivo/core` as a direct
  `@lifosy/ui` dep (the vendored components use `cn`/`Slot`/`useMachine`).
  Editor + charts (separate, already-small packages) are unchanged.
- **Bundle impact** (console, gzip): CSS **48.6KB → 17.1KB (−31.5KB)**; JS
  ~unchanged (345→342KB). Initial JS+CSS now ~359KB gz — **−33% vs the original
  pre-Cascivo `main`** (was 539KB gz), realizing the earlier "future win".
- *Verified*: console build green; no `@cascivo/react` refs remain; bundled CSS
  carries `cascivo-btn`/`cascivo-field` and none of the monolith classes; `tsc`
  clean; spikes (5/5) + suite (20/20) green; Biome clean.

## 2026-06-24 — Fix white active-line number in the editor gutter

- **Symptom**: the active line's gutter cell rendered as a solid white box over
  the line number.
- **Cause**: the previous theme fix set `--cascivo-editor-gutter-active:
  var(--los-fg)`, but that token is the *background* of the active gutter line
  (not the number's text color); `--los-fg` is near-white, so it painted a white
  block.
- **Fix** (`packages/ui/src/cascivo.css`): remove the override so the editor's
  own fallback applies — `var(--cascivo-editor-gutter-active,
  var(--cascivo-editor-current-line))` → the subtle
  `rgba(--los-accent-rgb, 0.06)` tint, matching the code area's active line.
- *Verified*: console build green; the white override is gone from the bundled
  CSS; suite (20/20) green; Biome clean.

## 2026-06-24 — Fix Cascivo editor layout (gutter gap + active-line drift)

- **Symptom**: vs the official demo, the editor had too much gutter→text gap and
  the active-line highlight sat ~half a line too low.
- **Root cause**: a cascade-layer ordering problem. Cascivo wraps its component
  CSS in `@layer cascivo.component`, which was imported *before* Tailwind in
  `main.tsx`, so it appeared first in the cascade — *earlier* layers lose. Thus
  Tailwind's Preflight (`* { margin:0; padding:0 }` in `@layer base`) overrode
  the editor's `padding-block`/`padding-inline`. The active-line/gutter overlays
  position via `top: var(--cascivo-space-3)` (a `top`, not padding — so *not*
  reset), while the text lost its matching `padding-block` → the highlight
  dropped by `space-3` and the gutter spacing collapsed.
- **Fix**: declare the cascade order so Cascivo's layers come *after* Tailwind's
  (`@layer theme, base, components, utilities, cascivo.tokens, cascivo.base,
  cascivo.theme, cascivo.component;` at the top of `index.css`) and import
  `index.css` *before* the Cascivo CSS in `main.tsx` so that order takes effect.
  Verified in the bundled CSS: `@layer base` now precedes `@layer
  cascivo.component`, so Cascivo's component styles win over Preflight.
- *Note for the library*: any Tailwind app that imports Cascivo CSS before
  Tailwind gets its components silently reset by Preflight. Worth documenting the
  required layer order (or shipping a guard).
- *Verified*: console build green; bundled layer order corrected; spikes (5/5) +
  suite (20/20) green; Biome clean.

## 2026-06-24 — Fix Cascivo editor rendering on a light background

- **Symptom**: the markdown editor rendered on a near-white background with a
  washed-out active-line band, despite the dark app theme.
- **Root cause**: `@cascivo/tokens` declares every `--cascivo-editor-*` at
  `:root` with a *light* fallback (e.g.
  `--cascivo-editor-bg: var(--cascivo-color-surface, oklch(0.985 …))`). The
  LifeOS bridge sets `--cascivo-color-*` on `.life-os-root` (and Cascivo's dark
  theme keys off `[data-theme="dark"]`, also on `.life-os-root`), so at `:root`
  those references are undefined → the editor tokens compute to their light
  fallbacks and inherit down. `.life-os-root` never re-declared them, so the
  editor stayed light.
- **Fix** (`packages/ui/src/cascivo.css`): re-declare the `--cascivo-editor-*`
  tokens (bg/fg/gutter/current-line/selection/border + the syntax palette) on
  `.life-os-root` so they re-resolve against the dark `--los-*` / accent / chart
  tokens. Active line is now a subtle `rgba(--los-accent-rgb, 0.06)` tint.
- *Note for the library*: editor tokens declared at `:root` referencing
  `--cascivo-color-*` will mis-resolve for any consumer that scopes the theme to
  a sub-element via `data-theme` (a documented pattern) — worth defining them
  alongside the theme tokens, or with theme-aware fallbacks.
- *Verified*: console build green; bundled CSS carries the `.life-os-root`
  editor-token overrides; spikes (5/5) + suite (20/20) green; Biome clean.

## 2026-06-24 — Cascivo charts migrated (DonutChart/StackedBarChart → @cascivo/charts)

- The charts feedback shipped in **`@cascivo/charts@0.3.0`** (a standalone
  package — `@cascivo/react` bundles only components; editor/icons/charts are
  separate). It ships a real `dist/` with per-datum/series `color`,
  `centerValue`/`centerLabel`/`thickness`/`size`/`emptyLabel`/`tooltipFormat`
  (pie) and `xLabelEvery`/`tooltip` + `toStackedSeries` (bar).
- Re-implemented `packages/ui/src/LifeOS/Charts/DonutChart.tsx` and
  `StackedBarChart.tsx` as thin wrappers over Cascivo's `PieChart`/`BarChart`,
  preserving their exact APIs so `TodoAnalytics` is unchanged: semantic per-slice
  / per-series colors, donut center value/label + size/thickness, `toStackedSeries`
  pivot (per-segment color preserved), the app's grid/axis colors applied via
  `--cascivo-chart-*` tokens, `plain`/`legend={false}` (callers own the legend).
- Wired `@cascivo/charts/styles.css` into `main.tsx` + Storybook; added a
  `Cascivo/Charts` story for visual verification. Added `@cascivo/charts` to
  `@lifosy/ui` (charts live there) and the console (for the CSS import).
- *Verified*: console production build green (full chain TodoAnalytics → wrappers
  → @cascivo/charts compiles/bundles); `tsc` clean; spikes (5/5) + console suite
  (20/20) green; Biome clean. **This completes the Phase 3 primitive migration.**

## 2026-06-24 — Cascivo Phase 4 DONE: CodeMirror → Cascivo CodeEditor

- `@cascivo/editor@0.2.1` shipped its build (prior empty-publish blocker fixed).
  Validation gate (`apps/console/src/spikes/cascivo-editor.spike.test.tsx`)
  mounts the real `CodeEditor` under Preact and verifies the imperative handle:
  markdown language, `onValueChange`, and `applyEdit`/`getSelection`/`undo`/
  `redo`/`openFind`/`focus` (selection-preserving sync confirmed).
- Ported both editors to Cascivo's `CodeEditor`:
  - `apps/console/src/components/editor/CodeMirrorEditor.tsx` — same external API;
    uncontrolled `defaultValue` + `ref.applyEdit` for store/prop external sync
    (echo-guarded); native `onSave` (Mod-S); `theme` for Zen mode; `.md` wrap;
    auto-save + save-button preserved. `bracketMatching` on; `virtualize` (auto)
    handles large docs.
  - `packages/ui/src/components/editor/Editor.tsx` (used by `DumpView`).
- Removed orphaned `docSync.ts` + `docSync.test.ts`; dropped all seven
  `@codemirror/*` deps from the console and `@lifosy/ui` (−24 packages). Wired
  `@cascivo/editor/styles.css` into `main.tsx` + Storybook preview.
- *Verified*: console build green; `tsc` clean; gates (5/5) + console suite
  (20/20, was 28 — the 8 docSync tests were removed with the helper) green;
  Biome clean; 0 CodeMirror source references remain.

## 2026-06-24 — Cascivo Phase 4 blocked (editor publish) + charts feedback

- **Phase 4 (editor swap) blocked**: `@cascivo/editor@0.1.1` ships no `dist/`
  (the published tarball contains only package.json/README/LICENSE despite
  `files: ["dist"]`), and the registry's `editor/code-editor` has `files: []` —
  so neither the npm package nor the copy-paste source is importable. The Preact
  bridge + migration target are ready; the swap can land once the package ships
  its build. Wrote `doc/cascivo-editor-package-feedback.md` with the root cause
  and fix.
- **Charts feedback**: wrote `doc/cascivo-charts-feedback.md` — a per-chart gap
  analysis (DonutChart→PieChart, StackedBarChart→BarChart) listing exactly what
  Cascivo's chart components need for a zero-downside swap. Headline blocker:
  per-datum/per-series `color` overrides (both charts encode meaning in color);
  plus donut center label/value, thickness, and tooltip/empty-state parity.
- No app code changed this round (investigation + docs only).

## 2026-06-23 — Cascivo migration Phase 3: remove unused Panel/Sidebar/SplitView/FileTree

- Confirmed `Panel`, `Sidebar`, `SplitView` (ResizablePanelGroup/Panel/Handle),
  and `FileTree` are unused exports (0 references anywhere). Removed the four
  component files + their `index.ts` exports, consistent with the earlier
  Dialog/DropdownMenu decision.
- Dropped the now-orphaned `react-resizable-panels` (SplitView's only dependency).
  `@dnd-kit` kept — still used by `MainApp`.
- Remaining Phase 3 item: the charts (DonutChart/StackedBarChart), the only
  *used* primitives, deferred for careful visual migration.
- *Verified*: console build green; `tsc` clean; spike (2/2) + console suite
  (28/28) green; Biome clean.

## 2026-06-23 — Cascivo migration Phase 3: remove unused Radix Dialog/DropdownMenu

- `@lifosy/ui`'s `Dialog` and `DropdownMenu` were full Radix-based compound
  components (10–12 sub-exports each) with **no consumers** anywhere in the repo.
  Rather than speculatively re-wrap 24 unused sub-components over Cascivo, they
  were removed: deleted `components/Dialog.tsx` + `components/DropdownMenu.tsx`,
  dropped their `index.ts` exports, and removed `@radix-ui/react-dialog` +
  `@radix-ui/react-dropdown-menu` (−39 packages) and the Radix `external` entry
  from the lib build. A Cascivo-backed Modal/Dropdown can be added when a real
  consumer needs one.
- *Verified*: console build green; `tsc` clean; spike (2/2) + console suite
  (28/28) green; Biome clean; 0 Radix references remain.

## 2026-06-23 — Cascivo migration Phase 3 (start): Button + Input primitives

- **Button** (`packages/ui/src/components/Button.tsx`): re-implemented as a thin
  wrapper over Cascivo's `Button`, preserving the existing `@lifosy/ui` API —
  `variant` (`outline`→ghost, `danger`→destructive), `size` (`icon`→md), and the
  `label` convenience. Console call sites (e.g. `AuthCli.tsx`) unchanged.
- **Input** (`packages/ui/src/components/Input.tsx`): wraps Cascivo's `Input`;
  `error` widened to `boolean | string` (the string form supplies Cascivo's
  message). Drops the bespoke Tailwind input styling.
- **Build wiring**: `@lifosy/ui` lib build now externalizes `@cascivo/*` and
  `@preact/signals-react[/runtime]`; the console app build aliases
  `@preact/signals-react → @preact/signals` and the `/runtime` `useSignals` to a
  no-op shim, so Cascivo runs under Preact in the real app (not just the spike).
  React-typed Cascivo components are bridged with an
  `as unknown as (props) => h.JSX.Element` cast (same pattern as the Radix
  wrappers).
- Fixed a latent type error in the Phase 2 `CascivoBridge` story (same cast).
- *Verified*: console production build green; `tsc` clean (no new errors beyond
  the pre-existing `packages/core` baseline); spike (2/2) + console suite (28/28)
  green; Biome clean.

## 2026-06-23 — Cascivo migration Phase 2: theme/token bridge

- **Bridge stylesheet** (`packages/ui/src/cascivo.css`, exported as
  `@lifosy/ui/cascivo.css`): remaps Cascivo's semantic color/font tokens
  (`--cascivo-color-*`, `--cascivo-font-*`) onto the live LifeOS palette
  (`--los-*`), so Cascivo components automatically follow the active LifeOS
  theme (nexus / light / amethyst). Declared unlayered to win over Cascivo's
  layered theme values.
- **data-theme**: LifeOS themes live on `<html>`; Cascivo's `dark.css` keys off
  `[data-theme='dark']`. Set `data-theme="dark"` on the inner `.life-os-root`
  (`apps/console/src/App.tsx`) so Cascivo's structural tokens (radius, shadow,
  ring, status, chart, fonts) apply without colliding with LifeOS switching.
- **CSS import order** (components → tokens+theme → brand overrides): wired in
  `apps/console/src/main.tsx` (+ `index.css` for the brand layer) and
  `packages/ui/.storybook/preview.ts`.
- **Storybook bridge** (`packages/ui/src/CascivoBridge.stories.tsx` +
  signals-react alias/shim in `.storybook/main.ts`): renders raw Cascivo
  Button/Input/Badge/Card under the bridge for visual verification.
- **Deps**: added `@cascivo/react` / `@cascivo/themes` / `@cascivo/tokens` to
  `@lifosy/ui`.
- *Verified*: console production build resolves+bundles the full Cascivo CSS
  chain; spike (2/2) and console suite (28/28) green; Biome clean.

## 2026-06-23 — Cascivo UI migration: plan + Phase 0 integration spike

- **Plan** (`doc/cascivo-migration.md`): full plan to migrate the console's UI
  (which lives in `@lifosy/ui`) onto Cascivo — a CSS-native, signal-driven,
  AI-first React design system. Includes the `@lifosy/ui` → Cascivo component
  mapping derived from the live registry (181 components), a phased rollout, and
  risks. Decisions: own the source (copy-paste model), Tailwind coexistence,
  editor migrated to `@cascivo/editor`.
- **AI tooling wired** (`.mcp.json`): added the Cascivo MCP server
  (`npx -y @cascivo/mcp`) so the migration is driven by `list_components` /
  `select_component` / `get_component` / `add_to_project`.
- **Phase 0 integration spike (green)**: proved Cascivo's React/`signals-react`
  components mount under Preact. Cascivo imports `@preact/signals-react` +
  `@preact/signals-react/runtime`; the bridge aliases `@preact/signals-react →
  @preact/signals` and stubs `useSignals` as a no-op
  (`apps/console/src/shims/signals-react-runtime.ts`). Spike test
  `apps/console/src/spikes/cascivo-preact.spike.test.tsx` (run via
  `vitest.spike.config.ts`) mounts a real Cascivo `<Button>` under Preact and
  confirms signal-driven re-render. Spikes excluded from the default suite.
- **Editor re-validated**: the upgraded `editor/code-editor` manifest now covers
  the previously-missing capabilities (markdown highlighting, find/replace, real
  undo/redo, `applyEdit`/`getSelection` for selection-preserving sync, `onSave`,
  live `theme`). Open item: large-document performance, to be measured before
  retiring CodeMirror.

## 2026-06-22 — Restore habit-tracker streak stats on the dashboard

- **Missing stats row** (`HabitTrackerWidget.tsx`): on the desktop dashboard, `.habit.csv` tiles render in `SMALL` mode, which showed the heat map and a line of muted motivational text but no icon-with-number stats — unlike the mobile views (`MOBILE_COLLAPSED`/`MOBILE_EXPANDED`), which display a `Flame` icon plus streak numbers. The dashboard tile was therefore "missing the icons with numbers below the heat map".
- **Fix**: added a compact stat row directly below the heat map in the shared `SMALL`/`FOCUS` render, showing `Flame` → current daily streak (days), `CalendarCheck` → weekly streak (weeks), and `Trophy` → total completions. Reuses the already-computed `stats` (`currentStreak`, `weekStreak`, `totalCount`) and the existing `--los-accent`/`--los-muted` styling; the motivational `streakText` line is unchanged.

## 2026-06-19 — Wiki previews for JSON, CSV, and plain-text files

- **JSON preview** (`WikiView.tsx`): `.json` files render syntax-highlighted via `highlight.js` (imported as `highlight.js/lib/core` + the `json` language only, to avoid pulling the full bundle). Falls back to raw text if highlighting throws.
- **CSV preview** (`WikiView.tsx`): `.csv` files render as a table. Added a minimal RFC-4180-style `parseCsv` (handles quoted fields with embedded commas, escaped `""` quotes, and CRLF/LF) instead of reusing the heavier `CsvTableView` widget, which carries sort/filter/pagination and the app's `--los-*` theme rather than the wiki's GitHub-dark palette.
- **Plain-text fallback**: all other non-binary files render their content as-is in a `<pre>`. Binary files (detected via NUL bytes or a high ratio of U+FFFD replacement characters) keep the "no preview / open in editor" message.
- The Markdown branch is unchanged; preview selection now keys off `isLoaded` (file present in `openFiles`) so empty files no longer show a perpetual "Loading…".

## 2026-06-19 — Wiki collapsed-by-default tree and edit-navigation fix

- **Lazy sidebar tree** (`WikiView.tsx`): `WikiTreeItem` now defaults `expanded` to `false` instead of `true`. The sidebar renders only the root folders/files on load; expanding a folder reveals just its direct children (each still collapsed), instead of rendering the entire repo tree fully expanded.
- **Edit navigation fix** (`WikiPage.tsx`): clicking "Edit" called `layoutStore.navigate(path)` then `route('/')`. Routing to `/` remounts `MainApp`, whose URL→State resolver reads pathname `/` and resets `activeTileId` to `null`, discarding the focus — so the editor never opened. Now routes to `/files/<encoded path>` so the resolver detects the file and opens it in the editor. Removed the now-unused `layoutStore` import.

## 2026-06-19 — Wiki magic menu link and empty-view fix

- **Wiki in magic menu** (`MainApp.tsx`): added an `onWikiClick` prop and a "Wiki" item to the `StatusBar` menu, following the same conditional-prop pattern as Knowledge Base / Board. Wired from `Dashboard.tsx` as `onWikiClick={() => route('/wiki')}`. The `/wiki` route existed but was unreachable from the app UI.
- **Empty Wiki view fix** (`WikiPage.tsx`): `WikiView` renders from `githubFileStore.tree`, which was only populated by the Dashboard. Direct navigation to `/wiki` left the tree empty, so no files rendered. Added a mount effect that calls `githubFileStore.loadTree()` when the tree is empty — the same pattern used by `QuickNotePage`/`QuickLogPage`/`QuickTodoPage`.

## 2026-06-14 — Fix editor cursor jumping to the top

- **Root cause** (`apps/console/src/components/editor/CodeMirrorEditor.tsx`): the store-sync paths replaced the whole document (`{ from: 0, to: doc.length, insert: content }`) whenever store content differed from the editor. Because `githubFileStore.openFiles` is mutated by background work (`openFile` network revalidation, `saveFile`), the store-connected `useSignalEffect` re-ran mid-edit and the full-document replace collapsed the caret to position 0 — the cursor "jumping to the top" on desktop and mobile.
- **`docSync.ts`** (new): `computeMinimalChange(current, next)` derives the smallest replacement by preserving the shared prefix/suffix, and `syncDocPreservingSelection(view, content)` dispatches only that minimal change so CodeMirror maps the existing cursor/selection through a localized edit instead of resetting it.
- **`CodeMirrorEditor`**: the late-`initialContent` sync and the same-path external-update sync now call `syncDocPreservingSelection`. The path-change branch keeps a full replace (a new file should reset the caret to the top).
- **`docSync.test.ts`** (new): regression tests for the minimal-diff logic and, via `EditorState` selection mapping, that an external content update keeps the caret in place rather than collapsing it to 0.

## 2026-05-05 — Board Overview dashboard widget

- **`BoardOverviewWidget`** (`packages/ui/src/LifeOS/Organisms/Widgets/BoardOverviewWidget.tsx`): new widget that reads all `.todos.md` files from `githubFileStore` and `layoutStore` (same file resolution as `KanbanBoard`) and displays three stats: inbox (backlog count), in-progress count, and overdue count (in-progress items with `updatedAt`/`createdAt` older than 7 days). Clicking any part of the widget calls `onNavigate` to jump to the Board view.
- **`MainApp` wired** (`renderRawTileContent`): added `.board-overview.json` extension case; passes `onBoardClick` through as `onNavigate`.
- **`Dashboard` wired** (`renderFile` isWidget check): `.board-overview.json` treated as a widget so it renders via `FileViewer` rather than the plain editor.
- **`NewFileWizard` template**: added "Board Overview" entry with `Kanban` icon and `.board-overview.json` extension; default content `{}`.

## 2026-04-21 — Knowledge Base navigation, 404 fix, and KB commands modal

- **`/knowledge` in command palette**: added "Open Knowledge Base" command (`SearchModal.tsx`); dispatched via `onOpenKnowledge` callback chain → `MainApp` → `Dashboard` → `route('/knowledge')`
- **`/knowledge` in magic menu**: added "Knowledge Base" item to `StatusBar` menu in `MainApp.tsx`; follows the same conditional-prop pattern as Board / Action Log / Shortcuts
- **Scaffold 404 fix** (`github-kb.ts`): `scaffoldKB` now calls `githubService.saveFile` directly (no SHA) instead of `upsertRepoFile`; eliminates 11 pre-check GET requests that all 404'd on first-time setup since none of the files exist yet
- **KB commands modal** (`KBCommandsModal.tsx`): new modal in `apps/console` showing the general flow and all four KB slash commands (`/kb-ingest`, `/kb-lint`, `/kb-ask`, `/kb-session`) with descriptions; triggered from command palette via "Knowledge Base Commands" entry

## 2026-04-11 — Quick Dump view modes (JSON, JSONL, CSV)

- **`DumpView` component** (`packages/ui/src/LifeOS/Organisms/DumpView.tsx`): replaces the plain editor in Quick Dump (`/new`) with auto-detecting view modes
- **Format detection**: detects `json_array`, `jsonl`, `csv`, or `raw` from pasted content; auto-switches to TABLE on first structured detection
- **TABLE mode**: per-column live filters, sortable columns, pagination (50 rows/page); reuses `CsvTableView` for CSV; converts JSON/JSONL objects to rows
- **LOG mode** (JSONL only): global search bar, reverse-chron order, level coloring (error/warn/info/debug), timestamp column first
- **`CsvTableView`**: extended with optional `data` prop for pre-parsed input
- **`LogView` component** (`packages/ui/src/LifeOS/Organisms/LogView.tsx`): standalone log table for JSONL entries

## 2026-04-02 — Board card inline editing + URL rendering

- **KanbanBoard / KanbanCard**: added EDIT button (pencil icon) on each card; clicking it opens an inline textarea pre-filled with the todo's current text; SAVE commits the change, CANCEL discards it; drag-and-drop is disabled while editing
- **TodoLogic**: added `updateTodoText` helper (same pattern as `setStatus`)
- **KanbanBoard**: todo card text now detects URLs (`http://`/`https://`) and renders them as clickable links that open in a new tab

- **KanbanBoard**: todo card text now detects URLs (`http://`/`https://`) and renders them as clickable anchor tags opening in a new tab

## 2026-03-28 — Action Log view, inbox, quick-log route

- **`ActionLogView` template** (`packages/ui`): single-column combined view of all `.actionlog.md` files from dashboard config; always includes `inbox.actionlog.md` if it exists; search input; clickable tag cloud (frequency-sorted); date separators (sticky, formatted); entry rows show file source + MOVE dropdown on hover; add-entry panel (collapsible) with file selector, description textarea, tags — creates inbox on first use; footer stats
- **Move between files**: removes from source, inserts into target maintaining chronological order; saves sequentially
- **`/action-log` route** + `ActionLogViewPage.tsx` wrapper
- **`inbox.actionlog.md`**: lives in `.kh/`, always surfaced on the view if it exists in the tree; add panel always offers it even if not yet created
- **`/quick-log` route** + `QuickLogPage.tsx`: focused quick capture to inbox; same pattern as quick-todo/quick-note
- **Shortcuts page**: added "Quick Log" (`/quick-log`) entry
- **Android manifest**: added "Quick Log" shortcut
- **Magic menu**: "Action Log" item wired via `onActionLogClick` prop
- **Command palette**: "Open Action Log" command added

## 2026-03-28 — Shortcuts in magic menu + command palette, /new route added

- **Magic menu**: added "Shortcuts" item (between Search and Board); routes to `/shortcuts`; conditional on `onShortcutsClick` prop being provided
- **Command palette** (`Ctrl+K`): added "Open Shortcuts" command to static commands list
- **`/new` added to shortcuts page** as "New File" entry with suggested name "KH New"
- Wired `onShortcutsClick` and `onOpenShortcuts` through `MainApp` → `SearchModal` → `Dashboard`

## 2026-03-28 — Shortcuts page, quick-note route, Android manifest shortcuts

- **`/quick-note` route**: new page for fast note capture to `.kh/dump.md`; prepends dated entries (`- YYYY-MM-DD text`) to the top of the file, auto-creates on first use
- **`/shortcuts` page**: platform-aware guide listing all quick-capture routes; auto-detects iOS/Android/desktop; shows step-by-step instructions per route and per platform; platform can be toggled manually; explains iOS icon limitation; notes Android long-press shortcut
- **Android manifest shortcuts**: `shortcuts` array added to `vite.config.ts` manifest so Android users get long-press shortcuts on the installed app icon without needing extra home screen icons
- `QUICK_ROUTES` registry in `ShortcutsPage.tsx` — single place to add future quick routes

## 2026-03-28 — Inbox todos, quick-todo route, move between files

- **`/quick-todo` route** (`apps/console`): new focused page for fast todo capture into `.kh/inbox.todos.md`; auto-focuses input, parses tags from space/comma-separated input, creates the inbox file if it doesn't exist yet
- **Inbox always on board** (`KanbanBoard`): `.kh/inbox.todos.md` is always included in the board's file pool if it exists in the repo tree, regardless of dashboard config entries
- **Move todo between files** (`KanbanBoard`): each card shows a "MOVE" dropdown on hover (only when ≥2 todo files exist); selecting a target file removes the item from the source and appends it to the target, preserving all fields (tags, timestamps, milestone, prompt)
- **`TodoLogic` exported** from `@lifosy/ui` so console app pages can use `parseTodos` / `addTodo` / `serializeTodos` directly

## 2026-03-19 — Setup64: CLI enhancements

- Added `git.rs`: clone / pull active repo into `~/.config/com/lifosy/cli/repos/` before any file action
- Added `files.rs`: recent-files list (`recent_files.json`), `dashboard.config.json` parser, flat repo file listing
- Extended `auth.rs`: exposed `config_dir()` helper
- New TUI screens in `app.rs` / `ui.rs`:
  - **AI Prompt** (`a`) — pipe a multi-line prompt to Claude, Copilot, or Gemini CLI via `-p`; Tab cycles provider; Ctrl+Enter submits
  - **AI Response** — scrollable response view; Esc/Enter returns to prompt
  - **File Browser** (`f`) — syncs repo, lists files with recently-used files (★) at top; Enter opens nano-like editor
  - **File Editor** — full `tui-textarea` editor; Ctrl+S saves to disk; Esc closes
  - **Dashboard View** (`d`) — syncs repo, parses `dashboard.config.json`, shows workspaces + primary files; Enter opens any file in editor
- Main screen shortcut bar updated to reflect new keys
