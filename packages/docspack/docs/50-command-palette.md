# Command palette

The command palette is a keyboard launcher shared by the browser extension and the desktop app. It searches bookmarks, runs actions, searches the repository and the web, and switches into prefix modes such as `>p` prompts or `>k` conversions. The code lives in `packages/palette` (`@lifosy/palette`), plain TypeScript with no UI framework, rendered in a shadow root. Each surface answers its requests through an `ActionPort`: the extension's service worker, or the Rust backend of `apps/desktop-palette`.

## Where the command palette code lives

<!-- docspack: tags=source,files,package,architecture -->

`@lifosy/palette` holds the palette, its modes and the request contract. Each surface only wires it up.

| File in `packages/palette/src/` | Holds |
| --- | --- |
| `command-palette.ts` | `createCommandPalette`, the main search, keys, prefix parsing, `?` help, editor |
| `actions.ts` | `repoActions`, `paletteModes`, `portHandlers`, `commandsMode`, `dumpMode`, `claudeCodeMode`, `claudeUsageMode` |
| `convert.ts`, `units.ts` | `>k` conversions and inline answers (colors, math, bases, time, units, pixels) |
| `symbols.ts` | `>s` symbols, emoji and kaomoji |
| `translate.ts` | `>t` query parsing (`fr: …`) and the 20-text history |
| `knowledge.ts` | `>q` capture file name and front matter |
| `entries.ts` | `ENTRY_KINDS`: the widget files `>f` adds entries to |
| `local-files.ts` | `>o` local file search (desktop) |
| `braindump-window.ts` | `createBraindumpWindow` for the desktop braindump window |
| `protocol.ts` | `PaletteProtocol` and `ActionPort` |

Surfaces that use it:

- `apps/browser-extension/src/content/index.ts`: the palette on any page (`Ctrl+Shift+K`).
- `apps/browser-extension/src/newtab/StartPage.tsx`: the palette on the start page.
- `apps/desktop-palette/src/main.ts`: the desktop overlay, with extra modes `>d`, `>c`, `>u`, `>o`.

The settings format (`.kh/command-palette.settings.json`) lives in `packages/formats/src/palette-settings.ts`. Run the tests with `pnpm --filter @lifosy/palette test` (Vitest).

## What the main search shows as you type

<!-- docspack: tags=results,groups,order,search -->

With no prefix typed, the palette lists groups in a fixed order. ⏎ chooses the selected row.

1. **Recent**: the last ten things opened or run, filtered by what is typed. ⏎ on a fresh palette repeats the last one.
2. **Bookmarks**: a local search over the cached `.kh/browser.bookmarks.json`, by title, tags and URL. It costs no request.
3. **Repo**: GitHub code search hits, only after ⇥ (see below).
4. **Actions**: actions whose title matches, such as **Add a note…** or **Switch repository…**.
5. **Convert**: inline answers for a color, sum, `0x…` number, timestamp or quantity.
6. **Web**: one row per search engine, `Search Google for “…”`.
7. **Offers**: each mode that submits, applied to the text: **Translate “…”**, **Capture “…”**, and on the desktop **Search files “…”**.

Web rows come after actions, so typing an action's name and pressing ⏎ runs it. With nothing else matching, the first row is a search with the first engine. The empty palette's hint line lists every prefix. With no bookmarks cached, the list says `No bookmarks cached yet — open the console to sync.`

## Keys in the command palette

<!-- docspack: tags=shortcuts,keyboard,enter,tab,escape,arrow -->

| Key | Effect |
| --- | --- |
| ↑ ↓ | Move the selection (wraps around) |
| ⏎ | Choose the selected row; in a mode that submits, send the query first |
| ⇥ (Tab) | Main search: one GitHub code search for the typed text. In a mode: open the selected entry's children |
| → | In a mode, at the end of the input: open the selected entry's children, like ⇥ |
| ← or Backspace on an empty input | Leave a list of children |
| Backspace on an empty input | Leave the mode and give its prefix (`>p`) back as text |
| Esc | Back one step: a field, a child list, a mode, a submenu; then close the palette |
| ⌃⏎ | In the old dump editor: copy all and close |
| ⌃S | In the old dump editor: save the text to a path |

Children are, for example, a repository's issues and pull requests in `>r`, or **Open** and **Delete…** on a braindump in `>d`. A click outside the panel also closes the palette. Mouse clicks choose rows.

## Searching the repository with Tab

<!-- docspack: tags=code search,github,repo search -->

⇥ in the main search runs one GitHub code search for what is typed. It never runs while typing, because GitHub's code-search endpoint has a small rate budget. Hits appear under **Repo**. Typing again clears them.

- ⏎ on a hit opens the file in the Lifosy console (`https://app.kaihuman.com/files/<path>`), not on GitHub.
- A hit that a widget can add to offers two choices instead: **Open … in Kaihuman** and **Add a todo…** (or an action, event, prompt, command).
- The widget files are the suffixes in `ENTRY_KINDS`: `.todos.md`, `.actionlog.md`, `.events.csv`, `.prompts.md`, `.commands.md`.

The request is `SEARCH_REPO`. The choices come from `fileChoices` in `packages/palette/src/actions.ts`.

## How prefix modes work

<!-- docspack: tags=prefix,mode,greater than,shadowing -->

A `>` and a prefix at the start of the input switch the palette into a list of its own. `>p` is entered as soon as the `p` is typed. A longer word such as `>prompt` stays plain search text.

- **Shadowed prefixes**: when a longer prefix starts with the typed one (`>l` next to a tool `>le`), the shorter one waits for a space. The hint says `space enters >l …`.
- The breadcrumb above the input names the mode.
- **Esc**, or **Backspace** on an empty input, leaves the mode.
- Text after the prefix becomes the query: `>t Guten Morgen` enters `>t` with that text.
- Typing `?` opens the help: every prefix (⏎ switches to it), searching and keys, and every action (⏎ runs it). The help is built per surface, so it lists only what that surface has.

Modes come in four kinds in `PaletteMode`: `load` (a list filtered as you type), `submit` (asked on ⏎), `link` (one link for the text) and `links` (several links). Up to 50 rows are shown.

## Which prefixes the palette has

<!-- docspack: tags=prefixes,list,modes,reference -->

| Prefix | Mode | Surfaces |
| --- | --- | --- |
| `?` | Help | all |
| `>b` | Bookmarks only, without actions or web search | all |
| `>p` | Prompts from `.prompts.md` files; ⏎ copies | all |
| `>t` | Translate with DeepL | all |
| `>r` | Your GitHub repositories; ⇥ for issues, pull requests… | all |
| `>g` | GitHub search: repository, then issues or pull requests, then term | all |
| `>w` | GitHub work waiting on you | all |
| `>f` | Widget files: open in Kaihuman or add an entry | all |
| `>q` | Capture to the knowledge base (`.kh/raw/`) | all |
| `>k` | Convert colors, numbers, sums, times, units, case, Lorem ipsum | all |
| `>s` | Symbols, emoji, kaomoji | all |
| `>x` | Commands from `.commands.md`; copy (extension) or run (desktop) | all |
| `>a` | Ask an AI assistant | all, while assistants are set |
| `>l` `>e` `>m` `>n` `>i` | Default link tools: Tsuga logs, LEO, Google Maps, npm, IMDb | all |
| `>d` | Braindumps | desktop |
| `>c` | Claude Code session | desktop |
| `>u` | Claude usage | desktop |
| `>o` | Local files; `c:` contents, `a:` whole disk | desktop |

The built-in prefixes that settings tools cannot take are in `BUILT_IN_PALETTE_PREFIXES`: `b p t r g f x d c u a w q k s`. `>o` is not in that list; a tool with prefix `o` is dropped on the desktop because the desktop mode claims it. The desktop-only modes are described in the desktop palette docs.

## Copying prompts and filling in commands

<!-- docspack: tags=>p,>x,prompts.md,commands.md,parameters -->

`>p` lists every prompt in the repository's `.prompts.md` files. Every typed word must appear in the title, tags or body. ⏎ copies the prompt body and closes the palette. Titles show `#tags` and the first line of the body.

`>x` lists commands from the repository's `.commands.md` files (format: `doc/commands-format.md`).

1. ⏎ on a command asks for each `{{name}}` parameter, one field at a time. Esc goes back a field.
2. Then it lists the choices under **Choose**: **Copy**, and on the desktop **Run in terminal** and **Run in the background**.
3. The filled-in command is shown in full under **The command**.

Nothing runs until a Run choice is picked. The extension can only copy (`commandsMode(port, { canRun: false })`). Both lists are fetched with `LIST_PROMPT_FILES` and `LIST_COMMAND_FILES` and cached for five minutes. With no files, the mode says `No .prompts.md files in this repository yet`.

## Translating text with >t

<!-- docspack: tags=deepl,translate,language,fr: -->

`>t` translates with DeepL on ⏎, never while typing.

- By default the text goes into `EN-US` and `DE` (`TRANSLATION_TARGETS`). The translation into the language the text is already in is dropped.
- `>t fr: bonjour` asks for one language. Only real DeepL target codes count, so `re: the offer` is translated as typed.
- ⏎ on a result copies it.
- With nothing typed, `>t` lists the last 20 texts translated; ⏎ translates one again.
- Any text in the main search is also offered as **Translate “…”**.

The key is set with the **Set the DeepL API key…** action (free keys at deepl.com/pro-api); an empty value forgets it. Requests: `TRANSLATE`, `GET_TRANSLATION_HISTORY`, `ADD_TRANSLATION_HISTORY`, `SET_TRANSLATION_KEY`.

## GitHub repositories, search and work: >r, >g, >w

<!-- docspack: tags=github,issues,pull requests,review requests -->

- **`>r`** lists your GitHub repositories (`LIST_GITHUB_REPOS`). ⏎ opens one. ⇥ or → lists its pages: Issues, Pull requests, Actions, Releases, Discussions, Commits, Branches, Tags, Wiki, Projects, Insights, Settings (`GITHUB_REPO_VIEWS`).
- **`>g`** lists the same repositories. ⇥ or ⏎ offers **Issues** or **Pull requests**; ⏎ asks for a search term, then opens GitHub's search with `is:issue …` or `is:pr …`. No term opens the plain list.
- **`>w`** lists what waits on you, in three groups: **Review requested**, **Assigned to you**, **Your pull requests with failing checks**. Each item appears once. It sends `LIST_GITHUB_WORK` with filters `review-requested`, `assigned` and `failing`. With nothing found it says `Nothing on GitHub is waiting on you`.

On the desktop, `>r` and `>g` rank repositories from omarchy's `~/.config/eee/counts` first.

## Adding a todo or log entry with >f

<!-- docspack: tags=todos,actionlog,events,widget,entry -->

`>f` lists the repository's files that a console widget can add to (`LIST_ENTRY_FILES`). ⏎ on one offers **Open … in Kaihuman** or **Add …**.

| Suffix | Add asks for |
| --- | --- |
| `.todos.md` | `What needs to be done? #tags` |
| `.actionlog.md` | `What happened? #tags` |
| `.events.csv` | Name, type (`general` or `birthday`), start date, end date |
| `.prompts.md` | `Title #tags`, then the prompt |
| `.commands.md` | `Title #tags`, then the command with `{{name}}` parameters |

The entry is written with the same `@lifosy/formats` functions as the console's Add forms. The palette reads the file (`READ_ENTRY_FILE`) and writes it back over that version (`WRITE_ENTRY_FILE` with `sha`). A change made elsewhere meanwhile fails the write instead of being overwritten.

The **Add a note…** action does the same for `.lifeos/dump.md` and the quick-note files; plain files get a `- text` line (`DUMP_NOTE`).

## Capturing a thought to the knowledge base with >q

<!-- docspack: tags=capture,kb-ingest,raw,knowledge base -->

`>q` saves what is typed as its own file in the knowledge base inbox. ⏎ saves it. ⏎ on the result row opens the new file in Kaihuman.

- The path is `.kh/raw/<epoch-ms>-<slug>.md`. The slug comes from the first line, at most 40 characters.
- The file has front matter: `title`, `url: ''`, `date`, `processed: false`, `tags: [general]`, then the text.
- It is the same file `cli capture` writes, so `/kb-ingest` processes it.
- Blank text is refused with `Nothing to capture`.
- Any text in the main search is also offered as **Capture “…”**.

The request is `CAPTURE_KNOWLEDGE`. Backends only allow paths matching `isKnowledgePath` (`.kh/raw/<name>.md`). The desktop writes directly and has no offline spool.

## Converting colors, numbers, sums and timestamps with >k

<!-- docspack: tags=calculator,color,hex,rgb,hsl,epoch,base,lorem,case -->

`>k` converts what is typed without any request. ⏎ copies the result. The same answers appear inline in the main search under **Convert**.

| Input | Result |
| --- | --- |
| `#ff8800`, `rgb(…)`, `hsl(…)` | The other two color forms |
| `12*7`, `2^10`, `(3+4)%5`, `×`, `÷` | The value, 12 significant digits |
| `0x1f`, `0b101`, `0o17` | Decimal, hex, binary, octal |
| `42` (only in `>k`) | Hex, binary, octal |
| `1790208000` (10 digits) or 13 digits | ISO 8601 UTC and local time |
| `2026-09-24T10:00Z` | Unix seconds and milliseconds |
| `5 km`, `350 °F` | Units (next section) |
| `lorem`, `lorem 5` (only in `>k`) | A sentence, a paragraph, N paragraphs |
| other text (only in `>k`) | camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, Title Case, Sentence case, lower, UPPER |

Inline in the main search, plain decimal numbers, Lorem ipsum and letter case are left out; those go to web search. The code is `conversionItems` in `convert.ts`.

## Converting units and pixels

<!-- docspack: tags=metric,imperial,feet,inches,celsius,fahrenheit,dpi,px -->

`unitItems` in `packages/palette/src/units.ts` converts metric ⇄ US customary, in `>k` and inline.

- **Length**: `mm cm m km` ⇄ `in ft yd mi`. Heights as `5'11"` or `5 ft 11 in` give cm and m. A metric length between 1 and 10 feet also shows feet and inches.
- **Mass**: `mg g kg` ⇄ `oz lb`.
- **Volume**: `ml cl dl l` ⇄ `tsp tbsp fl oz cup pt qt gal` (US measures).
- **Area**: `cm² m² ha km²` ⇄ `in² ft² yd² acres mi²`.
- **Speed**: `m/s km/h` ⇄ `mph`.
- **Temperature**: `°C K` ⇄ `°F`.

A quantity goes into the other system's closest unit: `5 km` into miles. `to`, `in`, `as`, `into`, `=` or `→` names one unit: `5 km in ft`, `3 m to cm`. A decimal comma works (`1,5 kg`).

Pixels use the resolutions in `DPIS` (80, 150, 300 dpi). `10 cm to px` gives pixels at each. `1000 px` gives cm at each; `1000 px to in` gives inches.

## Finding symbols, emoji and kaomoji with >s

<!-- docspack: tags=emoji,unicode,arrow,currency,kaomoji -->

`>s` lists symbols by name and copies the chosen one on ⏎. The list is static in `packages/palette/src/symbols.ts` (`symbolItems`), so it needs no request.

- Groups: arrows, math, currency, typography, keys, marks, emoji and kaomoji.
- Each entry has a name and extra words to find it by: `→` is found by `right arrow`, `to` or `next`.
- Every typed word must appear in the name or keywords.

Example: `>s not equal` finds `≠`; ⏎ copies it and closes the palette. On the desktop the copy goes through `wl-copy`.

## Asking an AI assistant with >a

<!-- docspack: tags=chatgpt,claude,gemini,copilot,perplexity,ai -->

`>a` lists one row per AI assistant for the typed question. ⏎ opens a new chat with the question in the link and also copies the question.

Default assistants (`DEFAULT_PALETTE_SETTINGS.assistants`):

| Assistant | URL |
| --- | --- |
| ChatGPT | `https://chatgpt.com/?q={query}` |
| Claude | `https://claude.ai/new?q={query}` |
| Gemini | `https://gemini.google.com/app?q={query}` |
| GitHub Copilot | `https://github.com/copilot?q={query}` |
| Perplexity | `https://www.perplexity.ai/search?q={query}` |

Gemini and Copilot open an empty chat, so paste the copied question there. The list comes from `assistants` in `.kh/command-palette.settings.json`. With an empty list, `>a` is not offered. `>a` keeps no recent entries.

## Link tools: >l logs, >e LEO, >m maps, >n npm, >i IMDb

<!-- docspack: tags=tsuga,leo,google maps,npm,imdb,tools -->

Link tools are prefixes from the `tools` list in `.kh/command-palette.settings.json`. Each one shows a single row that opens a link built from the typed text. No request is made.

| Prefix | Tool | Link |
| --- | --- | --- |
| `>l` | Tsuga logs | `https://app.tsuga.com/explorer?query=…` |
| `>e` | LEO | `https://dict.leo.org/german-english/{query}` |
| `>m` | Google Maps | `https://www.google.com/maps/search/{query}` |
| `>n` | npm | `https://www.npmjs.com/search?q={query}` |
| `>i` | IMDb | `https://www.imdb.com/find/?q={query}` |

With nothing typed, a tool lists the terms you searched in it recently. A tool whose prefix a built-in mode claims is left out (`toolMode` and `applySettings` in `command-palette.ts`).

## Configuring search engines, assistants and link tools

<!-- docspack: tags=settings,json,search engines,command-palette.settings.json -->

Both palettes read `.kh/command-palette.settings.json` from the active repository (`GET_PALETTE_SETTINGS`), cached five minutes. Create and edit it in the console with **New File → Command Palette Settings**.

```json
{
  "searchEngines": [{ "name": "Amazon.de", "url": "https://www.amazon.de/s?k={query}", "params": [] }],
  "assistants": [{ "name": "ChatGPT", "url": "https://chatgpt.com/?q={query}", "params": [] }],
  "tools": [{
    "prefix": "l", "name": "Tsuga logs", "description": "Errors in Tsuga",
    "url": "https://app.tsuga.com/explorer",
    "params": [{ "key": "query", "value": "level:error AND \"{query}\"", "empty": "level:error" }]
  }]
}
```

- `{query}` is the typed text: form-encoded in a query string, percent-encoded in a path.
- `params` are appended in order. `empty` replaces `value` when nothing is typed.
- Order in the file is order in the palette. The first engine is the one ⏎ searches.
- A missing list means the default list. An empty list stays empty.
- A tool prefix is lowercase letters or digits and not a built-in prefix.
- Invalid entries (no name, non-http URL, duplicate prefix) are dropped (`usablePaletteSettings`).

Default engines: Google, DuckDuckGo, Ecosia, Amazon, Amazon.de, Reddit, Bing, Brave Search, Startpage, Wikipedia, YouTube, GitHub, Stack Overflow, Yahoo, Qwant.

## Recent entries in each prefix mode

<!-- docspack: tags=history,recents,mode recents,last chosen -->

With nothing typed, each prefix mode lists the last 10 entries chosen in it first, under **Recent** (`MODE_RECENTS_LIMIT`). Choosing an entry again moves it to the top. An entry that has gone from the repository drops out.

- In a link tool such as `>l`, the recent entries are the terms you searched.
- `>a`, `>k`, `>q`, `>u` and `>o` keep no recents (`recents: false`).
- `>t` shows its own history instead: the last 20 texts translated.
- Requests: `GET_MODE_RECENTS { prefix }` and `ADD_MODE_RECENT { prefix, id }`.
- The extension keeps them in its local storage. The desktop keeps them in `$XDG_STATE_HOME/lifosy/mode-recents.json`.

The main search's **Recent** group is separate: the last ten opens and actions (`GET_RECENTS`, `ADD_RECENT`). The desktop keeps those in `$XDG_STATE_HOME/lifosy/recents.json`.

## Actions the palette offers

<!-- docspack: tags=actions,switch repository,sync,deepl key,note -->

Actions are listed under **Actions** in the main search and in the `?` help. Shared ones come from `repoActions(port)` in `actions.ts`.

| Action | What it does |
| --- | --- |
| **Add a note…** | Adds a line to `.lifeos/dump.md` or a quick-note file, or an entry to a widget file |
| **Pinned tab groups…** | Load, update, rename, move, delete a saved tab group (extension only) |
| **Save this window’s pinned tabs as a new group…** | Extension only |
| **Import the browser’s bookmarks** | Extension only |
| **Switch repository…** | Lists repositories you have used; marks the current one |
| **Sync with GitHub now** | Ignores the hourly budget and syncs bookmarks |
| **Set the DeepL API key…** | Stores the `>t` key; empty forgets it |
| **Open the Lifosy console** | Opens `https://app.kaihuman.com` |
| **Log in with the Lifosy console** | Desktop only |

Deleting a tab group asks you to type `DELETE`. Actions with fields walk through them one at a time; the breadcrumb shows `field (1/3)`, and Esc goes back a field.

## The ActionPort and PaletteProtocol

<!-- docspack: tags=protocol,requests,backend,port,developer -->

The palette never calls `chrome.*` or Tauri directly. Every backend call goes through an `ActionPort`:

```ts
export interface ActionPort {
  send<K extends PaletteRequestType>(request: PaletteRequest<K>): Promise<PaletteResponse<K>>;
}
```

`PaletteProtocol` in `packages/palette/src/protocol.ts` maps each request `type` to its fields and response. Examples: `GET_BOOKMARKS`, `SEARCH_REPO`, `LIST_PROMPT_FILES`, `TRANSLATE`, `LIST_GITHUB_WORK`, `CAPTURE_KNOWLEDGE`, `GET_PALETTE_SETTINGS`, `LIST_BRAINDUMPS`, `SEARCH_LOCAL_FILES`.

- The extension forwards requests to its service worker (`src/palette/port.ts`).
- The desktop sends them to the Tauri command `palette_request`, answered in `apps/desktop-palette/src-tauri/src/requests.rs`.
- A backend that cannot serve a request rejects it, and the palette shows the message in its status line.

To add a mode: write a `PaletteMode` in `actions.ts`, add its requests to `PaletteProtocol`, handle them in each backend, and add the prefix to `BUILT_IN_PALETTE_PREFIXES` in `@lifosy/formats`.
