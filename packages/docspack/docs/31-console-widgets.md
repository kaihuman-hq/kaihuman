# Console widgets

Widgets are the interactive views the web console (`apps/console`) shows for repo files with a known file suffix, such as `.todos.md` or `.bookmarks.json`. Each widget is a Preact component in `packages/ui/src/LifeOS/Organisms/Widgets/`, and each change it makes is committed to your GitHub repo at once. Files are placed as tiles on a dashboard through `.kh/.dashboard.config.json`; the shared parsers for most formats live in `packages/formats`.

## Which file types get a widget
<!-- docspack: tags=file extensions,suffix,tile,widget map -->

`Dashboard.tsx` and `MainApp.tsx` pick a widget by the end of the file name. Any of these may also end in `.enc` (encrypted).

| Suffix | Widget |
|--------|--------|
| `.todos.md` | Todo list (`TodoWidget`) |
| `.actionlog.md` | Action log (`ActionLogWidget`) |
| `.prompts.md` | Prompt library (`PromptsWidget`) |
| `.commands.md` | Command library (`CommandsWidget`) |
| `.bookmarks.json` | Bookmarks (`BookmarksWidget`) |
| `.readitlater.json` | Read it later (`ReadItLaterWidget`) |
| `command-palette.settings.json` | Command palette settings (`CommandPaletteSettingsWidget`) |
| `.board-overview.json` | Board overview (`BoardOverviewWidget`) |
| `.habit.csv` | Habit tracker (`HabitTrackerWidget`) |
| `.events.csv` | Events (`EventsWidget`) |
| `.timetracking.csv` | Time tracking (`TimeTrackingWidget`) |
| `.budget.csv` | Budget (`BudgetWidget`) |
| `.data-collection.csv` | Data collection (`DataCollectionWidget`) |
| `.consumption.csv` | Consumption (`ConsumptionWidget`) |
| `.stocks.csv` | Stocks (`StocksWidget`) |
| `.timezones.json` | Timezones (`TimezoneWidget`) |
| `.rss.json` | RSS reader (`RssWidget`) |

Other files show "No widget available for this file extension" as a tile and open in the editor. A focused tile switches between a **WIDGET** view and a **CODE** view (the raw file). CSV files also get a **TABLE** view (`CsvTableView`).

## Creating a new widget file
<!-- docspack: tags=new file wizard,template,create file,encrypt -->

The **New File** wizard (`NewFileWizard` in `packages/ui/src/LifeOS/Organisms/NewFileWizard.tsx`) opens at `/new` or `/files/new`, or by **Create new File** in Ctrl+K. You pick a template, a file name and a folder. The suffix is added for you.

| Template | Suffix | Starts with |
|----------|--------|-------------|
| Note | `.md` | empty |
| Action Log | `.actionlog.md` | `# Action Log` |
| Prompts | `.prompts.md` | `# Prompts` |
| Commands | `.commands.md` | `# Commands` |
| Todo List | `.todos.md` | `- [ ] New Task` |
| Data Collection | `.data-collection.csv` | a column header |
| Habit Tracker | `.habit.csv` | `id,title,frequency,target,history` |
| RSS Reader | `.rss.json` | |
| Events | `.events.csv` | `id,title,date,type,description` |
| Consumption Tracker | `.consumption.csv` | `created` |
| Stocks / Portfolio | `.stocks.csv` | empty |
| Timezones | `.timezones.json` | `[]` |
| Read It Later | `.readitlater.json` | |
| Bookmarks | `.bookmarks.json` | `{ "bookmarks": [], "updatedAt": "" }` |
| Command Palette Settings | `.settings.json` | suggests `.kh/command-palette` |
| Board Overview | `.board-overview.json` | `{}` |

**Encrypt Content** with a password adds `.enc` to the name. The wizard rejects a path that already exists.

## Adding a file to a dashboard
<!-- docspack: tags=add to dashboard,tiles,workspace entries -->

A file becomes a dashboard tile when it is an entry in `.kh/.dashboard.config.json`:

```json
{ "path": ".kh/inbox.todos.md", "dashboard": "default" }
```

The **ADD TO DASHBOARD** modal (`AddToDashboardModal.tsx`) adds the entry for the open file to a chosen workspace. The console saves the config and pre-loads the new file. Deleting a file also removes its entries and its place in `files.recentlyOpened`. Workspaces are edited in Settings → **DASHBOARDS (WORKSPACES)**.

## Managing todos in the todo widget
<!-- docspack: tags=todos,tasks,todo list,milestones,priorities -->

A `.todos.md` file opens in `TodoWidget` (`Widgets/TodoWidget.tsx`). The widget shows **TASKS** and **TOP PRIORITIES**.

- Add a task with `TodoAddForm`; it uses the shared `addTodoEntry` from `@kaihuman/formats`.
- Add, assign and delete milestones; edit due dates.
- A task can carry an AI prompt and a `ref:` to a prompts file.
- A file in an old format shows a button to migrate it.

The same files feed `/board` and `/analytics`. `.kh/inbox.todos.md` is the inbox that `/quick-todo` and the palettes write to. The `.todos.md` line format is documented with the file formats.

## Keeping bookmarks in the console
<!-- docspack: tags=bookmarks,browser.bookmarks.json,pin bookmark,least used -->

A `.bookmarks.json` file opens in `BookmarksWidget` (`Widgets/BookmarksWidget.tsx`, logic in `BookmarksLogic.ts`).

- **Search bookmarks...** matches title, URL and tag; a tag chip narrows the list.
- Sort: **NEWEST** (file order), **LEAST USED** (never-opened first) or **MOST USED**.
- Each row can be opened, pinned or unpinned, edited (rename and change the link, also in search results) or deleted.
- Add a bookmark with `BookmarkAddForm`. Only `http`/`https` URLs are accepted, and a duplicate URL is rejected.
- Usage counts are written by the browser extension's sync; the console keeps them when it rewrites the file.

The browser extension mirrors `.kh/browser.bookmarks.json`. Pinned bookmarks come first on its start page. Tests: `apps/console/src/bookmarks-logic.test.ts` and `bookmarks-widget.test.tsx`.

## Saving articles to read later
<!-- docspack: tags=read it later,reading list,.readitlater.json,archive -->

A `.readitlater.json` file opens in `ReadItLaterWidget` (`Widgets/ReadItLaterWidget.tsx`) as the **READING LIST**.

- Each item can be opened or deleted.
- Read items move to an **ARCHIVED ITEMS** view.
- **CLEAR ALL** empties the reading list after a confirmation.

The console's own "add to read it later" handler in `Dashboard.tsx` writes to `<appFolder>/.readitlater.json` (normally `.kh/.readitlater.json`). It parses with `parseReadItLater`, skips a URL that is already there, puts the new item first, and creates the file if needed. The browser extension's **Read later: this page** also adds to the repo's `.readitlater.json`.

## Using the prompt library
<!-- docspack: tags=prompts,prompt library,.prompts.md,copy prompt -->

A `.prompts.md` file opens in `PromptsWidget` (`Widgets/PromptsWidget.tsx`) as **PROMPTS**.

- **Search prompts...** and tag chips (sorted by how often they are used) filter the list.
- **Copy prompt** copies the prompt text.
- New prompts are added with `PromptsAddForm`.

The palettes' `>p` mode lists prompts from the repo's `.prompts.md` files and copies one on `⏎`. The `.prompts.md` format is documented with the file formats.

## Using the command library
<!-- docspack: tags=commands,shell commands,.commands.md,parameters -->

A `.commands.md` file opens in `CommandsWidget` (`Widgets/CommandsWidget.tsx`) as **COMMANDS**.

- **Search commands...** and tag chips filter the list.
- In the focused view, each command with `{{name}}` parameters gets one field per parameter. **Copy command** copies it with the values filled in.
- Outside the focused view a command copies as written, `{{name}}` and all.
- New commands are added with `addCommandEntry` from `@kaihuman/formats`.

The desktop palette runs these commands with `>x`; the extension copies them. The `.commands.md` format is documented with the file formats.

## Editing command palette settings
<!-- docspack: tags=command-palette.settings.json,search engines,ai assistants,link tools,>a -->

`.kh/command-palette.settings.json` opens in `CommandPaletteSettingsWidget` (`Widgets/CommandPaletteSettingsWidget.tsx`). The browser extension and the desktop palette read it; the console only edits it. Create it with New File → **Command Palette Settings**, which suggests the folder `.kh` and the name `command-palette`.

| Section | Holds |
|---------|-------|
| **SEARCH ENGINES** | Offered for anything typed, in order. `⏎` with nothing else matching searches the first. |
| **AI ASSISTANTS** | What `>a` offers the question to, in order. |
| **TOOLS** | A link behind a prefix, like `>l` then a term. |

- `{query}` in a URL or parameter value is replaced by what is typed.
- A parameter has a name, a value, and an optional value used when nothing is typed.
- Entries can be added, removed, moved up or down, and restored from the defaults.
- A tool cannot use a built-in prefix (`BUILT_IN_PALETTE_PREFIXES`). Invalid entries are listed under "Left out of the palette until fixed".
- Edits are a draft: **Save** commits, **Revert** drops them.
- If the file cannot be read, the widget says so, and the palettes use the defaults.

The format and defaults (`DEFAULT_PALETTE_SETTINGS`, `PALETTE_SETTINGS_PATH`) are in `packages/formats/src/palette-settings.ts`. Tests: `apps/console/src/palette-settings-widget.test.tsx`.

## Showing board counts on the dashboard
<!-- docspack: tags=board overview,inbox count,overdue,in progress -->

A `.board-overview.json` file opens in `BoardOverviewWidget` (**BOARD OVERVIEW**). It shows counts from the todo files: inbox, in progress and overdue. A click opens `/board`. The JSON holds its options; missing keys use these defaults:

```json
{
  "showBacklog": true,
  "showInProgress": true,
  "showDone": false,
  "showRejected": false,
  "showOverdue": true,
  "overdueDays": 7,
  "minAgeDays": 0
}
```

## Tracking habits, time, money and other data
<!-- docspack: tags=habit tracker,time tracking,budget,stocks,consumption,events,timezones,rss,data collection -->

These widgets are in `packages/ui/src/LifeOS/Organisms/Widgets/`, each with a `*Logic.ts` parser where it has one:

| Widget | File | Purpose |
|--------|------|---------|
| `HabitTrackerWidget` | `.habit.csv` | Daily habits and streaks |
| `TimeTrackingWidget` | `.timetracking.csv` | Start/stop time tracking, with charts |
| `EventsWidget` | `.events.csv` | Upcoming events and schedule (`EventAddForm`) |
| `BudgetWidget` | `.budget.csv` | Budget entries (`BudgetAddForm`) |
| `DataCollectionWidget` | `.data-collection.csv` | Custom metrics with typed columns and a chart |
| `ConsumptionWidget` | `.consumption.csv` | Meter readings (electricity, gas, water, solar), monthly and yearly reports |
| `StocksWidget` | `.stocks.csv` | Portfolio value and investment over time, with forecast |
| `TimezoneWidget` | `.timezones.json` | World clocks (`TimezoneAddForm`) |
| `RssWidget` | `.rss.json` | News feeds |
| `ActionLogWidget` | `.actionlog.md` | Tagged action log entries (`ActionLogAddForm`) |

Demo mode seeds one file of each kind under `.kh/` (see `packages/core/src/demo/seed.ts`).

## Encrypting a file in the console
<!-- docspack: tags=encryption,.enc,password,encrypted tile -->

A file whose name ends in `.enc` is stored encrypted in the repo. Create one by ticking **Encrypt Content** in the New File wizard and setting a password.

- The tile asks for the password before it shows the content (`EncryptedTileWrapper` in `packages/ui/src/LifeOS/Molecules/EncryptedTileWrapper.tsx`).
- The suffix before `.enc` still picks the widget, for example `budget.budget.csv.enc`.
- Saving encrypts the content again and commits it.
- The password is kept by `passwordStore` (`packages/core/src/stores/password.store.ts`).
