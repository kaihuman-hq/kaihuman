# Repo file formats

Lifosy keeps all user data as plain text files in the user's own GitHub repository: Markdown for todos, logs, prompts and commands, `;`-separated CSV for events, habits and time tracking, and JSON for bookmarks, read-later lists and settings. A file's suffix, such as `.todos.md` or `.habit.csv`, decides which widget opens it. Parsing and serialising live in `packages/formats/src/` (`@lifosy/formats`), shared by the console, the browser extension and both command palettes, with a few widget formats in `packages/ui/src/LifeOS/Organisms/Widgets/*Logic.ts`.

## Which file suffix opens which widget
<!-- docspack: tags=file types,extensions,widgets,suffix -->

The console picks a widget by suffix (`MainApp.tsx` in `packages/ui`). New File creates these templates (`NewFileWizard.tsx`):

| Suffix | Widget | Parser module |
|---|---|---|
| `.todos.md` | Todo list, Board | `packages/formats/src/todos.ts` |
| `.actionlog.md` | Action log | `packages/formats/src/action-log.ts` |
| `.prompts.md` | Prompts | `packages/formats/src/prompts.ts` |
| `.commands.md` | Commands | `packages/formats/src/commands.ts` |
| `.events.csv` | Events | `packages/formats/src/events.ts` |
| `.habit.csv` | Habit tracker | `packages/formats/src/habits.ts` |
| `.timetracking.csv` | Time tracking | `packages/formats/src/time-tracking.ts` |
| `.readitlater.json` | Read it later | `packages/formats/src/read-later.ts` |
| `.timezones.json` | Timezones | `packages/formats/src/timezones.ts` |
| `.bookmarks.json` | Bookmarks | `packages/ui/.../BookmarksLogic.ts` |
| `.data-collection.csv` | Data collection | `packages/ui/.../DataCollectionLogic.ts` |
| `.consumption.csv` | Consumption tracker | `packages/ui/.../ConsumptionLogic.ts` |
| `.budget.csv` | Budget | `packages/ui/.../BudgetLogic.ts` |
| `.stocks.csv` | Stocks / portfolio | `packages/ui/.../StocksLogic.ts` |
| `.rss.json` | RSS reader | `packages/ui/.../RssLogic.ts` |
| `.board-overview.json` | Board overview tile | none (`{}`) |
| `.settings.json` | Command palette settings | `packages/formats/src/palette-settings.ts` |

A plain `.md` file is a note. Ticking "encrypt" in New File appends `.enc` to the name.

## Where Lifosy keeps files in the repository
<!-- docspack: tags=app folder,.kh,paths,location -->

Widget files can live in any folder; the console finds them by suffix. Fixed paths live in the app folder `.kh/` (legacy name `.lifeos/`):

| Path | Content |
|---|---|
| `.kh/.dashboard.config.json` | Dashboards, widget entries, theme, recent files, navbar |
| `.kh/inbox.todos.md` | Inbox todos from `/quick-todo` |
| `.kh/dump.md` | Quick notes from `/quick-note` |
| `.kh/command-palette.settings.json` | Palette search engines, assistants and tools |
| `.kh/browser.bookmarks.json` | Bookmarks synced into the browser extension |
| `.kh/browser.pinnedtabs.json` | Pinned-tab groups: `{ groups: [{ id, name, createdAt, tabs, favorite? }], updatedAt }` |
| `.kh/braindumps/<created-ms>.md` | Braindumps from the desktop palette |
| `.kh/raw/`, `.kh/wiki/`, `.kh/log.md` | Knowledge base, see the "Knowledge base" page |

`githubFileStore.appFolder` in `packages/core` resolves `.kh` or `.lifeos`. The browser extension and desktop palette still read quick-note targets from `.lifeos/.dashboard.config.json` and default notes to `.lifeos/dump.md`.

## Todo list format (`.todos.md`)
<!-- docspack: tags=todos,tasks,kanban,markdown checklist,milestones -->

A todo file is a flat Markdown checklist with inline metadata and optional milestones in frontmatter:

```markdown
---
milestones:
  - id: v1.0
    name: Version 1.0
    dueDate: 2026-04-15
---

- [ ] backlog task #tag1 #tag2
::updated:: 1758600000000 ::created:: 2026-09-23T08:00:00.000Z
- [>] in-progress task #tag !v1.0
- [x] done task #tag
- [-] rejected task
  > Prompt text line 1
  > ref:path/to/prompts.md
```

| Marker | Status |
|---|---|
| `[ ]` | `backlog` |
| `[>]` | `in-progress` |
| `[x]` or `[X]` | `done` |
| `[-]` | `rejected` |

- `#tag` tokens become `tags`; `!id` links a milestone.
- The optional line right after a task holds `::updated::` (Unix ms) and `::created::` (ISO).
- Lines indented 2+ spaces starting with `> ` are the task's prompt; `> ref:<path>` points at a prompt file.
- Legacy files with `# Group` headings are detected (`isLegacyFormat`); each group becomes a tag, and `migrateLegacyFormat` rewrites the file flat.

## How the inbox and the kanban board use todo files
<!-- docspack: tags=inbox,board,kanban,quick todo -->

`.kh/inbox.todos.md` is the inbox. The console's `/quick-todo` page adds to it with `addTodoEntry`, and the Board (`/board`, `KanbanBoard.tsx`) always includes it when it exists.

The Board and `BoardOverviewWidget` collect todo files this way:

1. The `entries` in `.kh/.dashboard.config.json` whose `path` ends in `.todos.md`.
2. If there are none, every `*.todos.md` in the repository tree.

Board columns are the four statuses `Backlog`, `In Progress`, `Done` and `Rejected`. In the todo widget, clicking an item's status marker cycles through `NEXT_STATUS`: backlog → in-progress → done → backlog; rejected → backlog. `getVisibleTodos` hides done and rejected items updated more than one hour ago in the small dashboard view. `getUpcomingMilestone` returns the milestone with the nearest future `dueDate`.

## Action log format (`.actionlog.md`)
<!-- docspack: tags=action log,activity log,journal,timestamp -->

An action log is a Markdown list of timestamped entries in local time:

```markdown
---
---

# Action Log

- 2025-03-19 19:20:03 Fixed the bike #repair #outdoor
- 2025-03-19 21:02:11 Read 30 pages #reading
```

- `parseActionLog` reads optional `key: value` frontmatter and every list item that starts with `YYYY-MM-DD HH:mm:ss`. Other lines are ignored.
- `description` is the text after the timestamp, tags included. `tags` lists every `#tag` (characters `[\w-]`).
- `serializeActionLog` always writes the frontmatter fences, the `# Action Log` heading and the entries in file order.
- `appendAction` stamps the current local time and appends tags passed separately as `#tag` unless the description already contains them.

## Quick notes in `dump.md`
<!-- docspack: tags=dump,quick note,scratch,notes -->

`dump.md` in the app folder is a running list of quick notes, newest first. The console's `/quick-note` page prepends a line with the date:

```markdown
- 2026-09-23 Call the plumber about the boiler
- 2026-09-22 Idea: weekly review template
```

The browser extension's note action (`DUMP_NOTE`) also inserts `- <note>` at the top, without a date. Its default target is `.lifeos/dump.md`; other targets come from `files.quickNotes` in the dashboard config. When a quick-note target is a widget file (`.todos.md`, `.actionlog.md`, `.events.csv`, `.prompts.md`, `.commands.md`), the palette adds a proper entry with the `@lifosy/formats` entry helpers instead.

## Events format (`.events.csv`)
<!-- docspack: tags=events,calendar,birthdays,csv -->

Events are `;`-separated rows with no quoting:

```csv
name;type;start iso date;end iso date
Team offsite;general;2026-10-12;2026-10-14
Anna;birthday;1990-05-02;1990-05-02
```

- The header is skipped when the first line starts with `name;`.
- `type` is one word, lowercased; `general` and `birthday` have meaning.
- A missing end date falls back to the start date.
- A `birthday` repeats every year. `getUpcomingEvents` returns its next occurrence.
- A `general` event is hidden once its end date has passed.
- `getUpcomingEvents` labels events `TODAY`, `TOMORROW` or `IN N DAYS` and returns at most 8 by default.

`addEventEntry` validates input: the name cannot contain `;`, dates must be `YYYY-MM-DD`, and the end cannot be before the start.

## Habit tracker format (`.habit.csv`)
<!-- docspack: tags=habits,streak,check in,csv -->

A habit file tracks one habit, one row per day:

```csv
iso date;goal reached
2026-09-21;x
2026-09-22;
2026-09-23;x
```

- `x` in the second column means the goal was reached; anything else means not reached.
- A first line containing `iso date` is treated as the header.
- `serializeHabitData` sorts rows by date ascending.
- `checkIn(content, date)` marks a day reached, adding the row if needed. `isCheckedIn` tests a day.
- `calculateStats` returns `currentStreak` (consecutive days ending today or yesterday), `weekStreak` (consecutive Sunday-start weeks with a check-in) and `totalCount`.

## Time tracking format (`.timetracking.csv`)
<!-- docspack: tags=time tracking,work hours,start stop,csv -->

Each row is a day with a comma-separated list of `HH:MM` times. Times pair up as start and end:

```csv
iso date;time
2019-12-02;07:54,12:59,13:29,18:34
2019-12-03;08:10
```

- An odd last time is an interval still running.
- The header is skipped when the first line starts with `iso`.
- Rows are written newest first.

Functions in `packages/formats/src/time-tracking.ts`:

| Function | Does |
|---|---|
| `toggleStartStop` | Starts a new interval today, or closes the open one |
| `addPause(data, minutes)` | Splits today's last long-enough interval around a pause |
| `isRunning` | True when today's last interval has no end |
| `calculateDurationMinutes` | Work minutes for a day, counting a running interval up to now |
| `getChartData` | Daily work and break hours, weekly and monthly totals, last 365 days |

## Prompt library format (`.prompts.md`)
<!-- docspack: tags=prompts,prompt library,ai prompts -->

One H2 section per prompt, with tags on the heading line:

```markdown
# Prompts

## Refactor to hooks #react #refactor

Convert the class component below into a function component using hooks.

## Commit message #git

Write a conventional-commit message for the staged diff.
```

1. A prompt starts at a line beginning with `## ` at column 0.
2. `#tag` tokens on that line are tags; the rest is the title.
3. The body runs to the next `## ` heading or the end of the file.

Everything before the first `## ` is ignored. A body line that starts with `## ` is written as `\## `, the only escape. Titles are not unique. A heading such as `Fix issue #42` yields the tag `42`. The format stays greppable: `grep -n '^## ' my.prompts.md` lists every prompt. Full rules are in `doc/prompts-format.md`.

## Command library format (`.commands.md`) and `{{name}}` parameters
<!-- docspack: tags=commands,shell commands,parameters,placeholders,snippets -->

`.commands.md` uses the `.prompts.md` grammar. The command is the entry's first fenced code block; text around it is a note. An entry without a code block is its whole text. An entry with neither is skipped.

````markdown
# Commands

## Free a port #network
```sh
sudo kill -9 `sudo lsof -t -i:{{port}}`
```

## Wi-Fi on #network
nmcli radio wifi on
````

Parameters:

- `{{name}}` or `{{ name }}` is a parameter; a name starts with a letter or `_`, then letters, digits, `_` or `-`.
- `commandParameters` lists names once each, in first-appearance order.
- `fillCommand` inserts values as typed; a parameter without a value stays `{{name}}`.
- Every `$` belongs to the shell. Go templates such as `{{.State.Status}}` are left alone.
- Parameters were `$1`…`$9` until 2026-09-23; rewrite those as `{{name}}`.

`addCommand` appends the command in a `sh` block under its note and titles the file `# Commands`. Details are in `doc/commands-format.md`.

## Bookmarks format (`.bookmarks.json`)
<!-- docspack: tags=bookmarks,links,browser.bookmarks.json -->

The bookmarks widget and the browser extension share this shape; the extension reads `.kh/browser.bookmarks.json`:

```json
{
  "bookmarks": [
    {
      "id": "…",
      "title": "Rust book",
      "url": "https://doc.rust-lang.org/book/",
      "tags": ["rust"],
      "createdAt": "2026-09-22T10:00:00.000Z",
      "updatedAt": "2026-09-22T10:00:00.000Z",
      "useCount": 3,
      "lastUsedAt": "2026-09-23T08:00:00.000Z",
      "pinned": false
    }
  ],
  "updatedAt": "2026-09-23T08:00:00.000Z"
}
```

- Only `http:` and `https:` URLs are accepted (`isBookmarkUrl`), so a `javascript:` link never becomes clickable.
- `normalizeBookmarkUrl` compares URLs so the same page is not stored twice.
- New bookmarks are added at the top. `useCount` and `lastUsedAt` are updated by the extension; `pinned` keeps a bookmark at the top of its start page.

The logic is in `packages/ui/src/LifeOS/Organisms/Widgets/BookmarksLogic.ts`.

## Read-later list format (`.readitlater.json`)
<!-- docspack: tags=read later,reading list,articles -->

```json
{
  "items": [
    {
      "id": "…",
      "url": "https://example.com/post",
      "name": "Post title",
      "status": "new",
      "tags": [],
      "createdAt": 1758600000000,
      "updatedAt": 1758600000000
    }
  ]
}
```

- `status` is `new` or `read`. Timestamps are Unix milliseconds.
- `parseReadItLater` returns an empty list for invalid JSON, for display.
- `parseReadItLaterForWrite` throws on invalid JSON, so a write never replaces a list it could not read.
- `addReadLaterEntry` refuses a URL that is already on the list unread, with `Already on the read-later list`.
- Other helpers: `markAsRead`, `markAsNew`, `markReadItLaterRead`, `deleteItem`, `deleteAllRead`, `deleteAll`.

## Command palette settings format (`command-palette.settings.json`)
<!-- docspack: tags=palette settings,search engines,assistants,link tools,prefix -->

Both command palettes read `.kh/command-palette.settings.json` (`PALETTE_SETTINGS_PATH`):

```json
{
  "searchEngines": [{ "name": "Google", "url": "https://www.google.com/search?q={query}", "params": [] }],
  "assistants": [{ "name": "Claude", "url": "https://claude.ai/new?q={query}", "params": [] }],
  "tools": [
    {
      "prefix": "l",
      "name": "Tsuga logs",
      "description": "Tsuga’s log explorer, searching for what is typed",
      "url": "https://app.tsuga.com/explorer",
      "params": [{ "key": "query", "value": "{query}" }]
    }
  ]
}
```

- `{query}` is replaced by the typed text. A param's optional `empty` value is used when nothing is typed.
- The first search engine is the one ⏎ uses. List order is palette order.
- A missing list uses `DEFAULT_PALETTE_SETTINGS`; an empty list stays empty.
- URLs must be `http(s)`. A tool prefix is lowercase letters or digits, unique, and not a built-in prefix (`b p t r g f x d c u a w q k s`).
- `usablePaletteSettings` drops invalid entries; `paletteSettingsProblems` lists the reasons for the widget.

## Dashboard config format (`.dashboard.config.json`)
<!-- docspack: tags=dashboard config,workspaces,navbar,theme,quick notes -->

The console reads `.kh/.dashboard.config.json` (type `DashboardConfig` in `packages/core/src/models/types.ts`):

```json
{
  "version": 1,
  "dashboards": [{ "id": "default", "name": "Main" }],
  "entries": [{ "path": ".kh/inbox.todos.md", "dashboard": "default", "skipOnMobile": false }],
  "theme": "nexus",
  "files": {
    "selected": ".kh/dump.md",
    "opened": [],
    "recentlyOpened": [],
    "quickNotes": [".kh/dump.md"]
  },
  "navbar": ["dashboard", "files", "board", "shortcuts"]
}
```

- `entries` places widget files on a dashboard workspace.
- `theme` is `nexus`, `light` or `amethyst`.
- `files.quickNotes` lists the targets the extension and palettes offer for notes.
- `navbar` orders the desktop bottom navbar. Allowed ids are `dashboard`, `files`, `board`, `shortcuts`, `wiki`, `knowledge`, `actionLog`, `graph` and `commits` (`NAVBAR_ITEMS` in `packages/ui/src/LifeOS/navbar-items.ts`).

Without the file, the console uses one `Main` dashboard. The Rust CLI looks for `.dashboard.config.json`, `.kh/.dashboard.config.json`, `.lifeos/.dashboard.config.json` or `dashboard.config.json`, then scans for any file ending in `dashboard.config.json`.

## Formats of the other widget files
<!-- docspack: tags=data collection,consumption,budget,stocks,rss,timezones -->

These formats are parsed in `packages/ui` or `packages/formats`:

| File | Format |
|---|---|
| `.data-collection.csv` | Header columns separated by `;`, attributes by `,` as `key::value`, e.g. `name::created,type::auto:date;name::Value,type::number,unit::#`. Types: `text`, `number`, `date`, `auto:date`, `auto:date:yesterday`, `auto:number:sum`, `auto:number:avg` |
| `.consumption.csv` | Meter readings per day; header `created,ColA[title:Display;unit:kWh;yearlyTarget:3500],...`. Legacy files start `Zeitstempel,Datum,...` |
| `.budget.csv` | `name;account;category;date;value`; header lines starting `name;` are skipped |
| `.stocks.csv` | `timestamp,current value,invest`, with `invest` the amount added at that entry; legacy `;` files store a cumulative total |
| `.rss.json` | `{ "feedOptions": [{ "id", "url", "read": [] }], "readLater": [] }` |
| `.timezones.json` | `{ "timezones": [{ "id", "name", "offset", "cities", "createdAt", "updatedAt" }] }` |
| `.board-overview.json` | `{}`; the tile counts inbox, in-progress and overdue todos |

Stocks and data-collection timestamps accept German `DD.MM.YYYY` dates as well as ISO.

## How `@lifosy/formats` reads and writes files
<!-- docspack: tags=parse,serialize,round trip,formats package -->

Each module pairs a parser with a serialiser, for example `parseTodos`/`serializeTodos` or `parseEvents`/`serializeEvents`. Writes rewrite the whole file from parsed data. Mutations such as `setStatus`, `addTodo` or `markAsRead` return new objects and do not touch the input.

`packages/formats/src/entries.ts` holds one "add an entry" function per writable widget. The console, the extension popup and start page, and both palettes all use them:

| Function | Adds |
|---|---|
| `addTodoEntry` | A backlog todo |
| `addActionLogEntry` | A timestamped action |
| `addEventEntry` | An event row |
| `addPromptEntry` | A `## Title #tags` prompt |
| `addCommandEntry` | A command in a `sh` block |
| `addReadLaterEntry` | A read-later item |

Each takes the file text and returns the new text, or throws a message to show, such as `Nothing to add`. `splitInlineTags` turns `Call #admin the bank` into text `Call the bank` and tags `['admin']`. The palettes write back with the file's `sha`, so a change made elsewhere meanwhile fails instead of being overwritten.

## Encrypted files (`.enc`)
<!-- docspack: tags=encryption,password,aes,secure notes -->

A file created with "encrypt" gets `.enc` after its normal suffix, for example `secrets.md.enc`. `encrypt(text, password)` in `packages/core/src/utils/crypto.ts` derives an AES-GCM 256-bit key with PBKDF2 (SHA-256, 100,000 iterations, 16-byte random salt) and a 12-byte random IV.

The stored content is base64 of `saltHex:ivHex:cipherHex`. `decrypt` also accepts the older raw `salt:iv:ciphertext` hex form. The console's password store can remember the password, and `EncryptedTileWrapper` in `packages/ui` shows the tile after unlocking.
