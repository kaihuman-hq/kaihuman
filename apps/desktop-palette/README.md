# desktop-palette

The Lifosy command palette as a desktop overlay: press a key anywhere and the palette opens
**centered on the focused monitor**, above whatever is tiled there, with the keyboard in its input.
It is the same palette as the browser extension's (`@lifosy/palette`), answered by a Rust backend
instead of the extension's service worker.

Built for Wayland compositors with `wlr-layer-shell`: Hyprland, Sway, river, niri, KDE. On GNOME or
X11 it falls back to an ordinary window. See `doc/native-command-palette.md` for why it works this
way.

## What it can do

| In the palette | Desktop |
| --- | --- |
| Bookmarks from `.kh/browser.bookmarks.json`, searched as you type | ✓ (cached for an hour, refreshed in the background) |
| Web search: Google, DuckDuckGo, Ecosia, Amazon, Amazon.de, Reddit, Bing, Brave Search, Startpage, Wikipedia, YouTube, GitHub, Stack Overflow, Yahoo, Qwant — or the engines in `.kh/command-palette.settings.json` | ✓ |
| ⇥ Tab: GitHub code search in the repo, opened in the console | ✓ |
| Add a note… (dump, quick-note files, `.actionlog.md` with `#tags`) | ✓ |
| Recent, Switch repository…, Sync with GitHub now, Open the Lifosy console | ✓ |
| `>b` bookmarks only, without actions or web search | ✓ |
| `>p` prompts from the repo's `.prompts.md` files, ⏎ copies | ✓ (with `wl-copy`) |
| `>t` translate with DeepL into EN-US and DE (`>t fr: …` for one language), ⏎ copies | ✓ (key from `DEEPL_AUTH_KEY`, `~/.config/envvars/deepl.env` or the keyring) |
| `>x` commands from the repo's `.commands.md` files — fill in each `{{name}}`, then copy, run in ghostty, or run in the background | ✓ (running: desktop only) |
| `>d` braindumps, opened in the braindump window (its own key too); old local dumps below | ✓ desktop only |
| `>c` Claude Code — pick a repo, type a prompt, ⏎ opens a new session on claude.ai | ✓ desktop only |
| `>u` Claude usage — rate limits, pace, resets and spend per account; the last fetch shows at once with its age (green under 15 min, yellow up to an hour, red beyond), synced in the background once 5 min old | ✓ desktop only |
| `>r` GitHub repositories, ⇥ for issues, pull requests, actions… | ✓, and omarchy's `~/.config/eee/counts` ranks the ones you open most first |
| `>g` GitHub search — pick a repository, then issues or pull requests, then type the search term | ✓, repositories ranked as in `>r` |
| `>a` ask AI — the question to ChatGPT, Claude, Gemini, GitHub Copilot or Perplexity in a new chat, also copied for the ones that do not read it from the link; assistants from `.kh/command-palette.settings.json` | ✓ (copying with `wl-copy`) |
| `>e` LEO dictionary, `>m` Google Maps, `>n` npm, `>i` IMDb — default link tools like `>l` | ✓ |
| `>l` logs — Tsuga's log explorer, searching for what is typed; more link tools from `.kh/command-palette.settings.json` (see the extension's README, "Palette settings") | ✓ (settings cached in `$XDG_CACHE_HOME/lifosy/palette-settings.json` for five minutes) |
| Recent: each prefix lists the last 10 entries chosen in it first (kept in `$XDG_STATE_HOME/lifosy/mode-recents.json`) | ✓ |
| `>w` GitHub work — review requests, what is assigned to you, your PRs with failing checks | ✓ |
| `>k` convert — colors, number bases, arithmetic, timestamps, metric ⇄ US units (`5 km`, `350 °F`, `5'11"`, `5 km in ft`), lengths ⇄ pixels at 80/150/300 dpi (`10 cm to px`, `1000 px`), letter case, Lorem ipsum; also offered inline for a color, sum, `0x…`, timestamp or quantity typed into the main search | ✓ (copying with `wl-copy`) |
| `>s` symbols, emoji and kaomoji by name, ⏎ copies | ✓ |
| `>q` capture to the knowledge base — what is typed becomes `.kh/raw/<epoch>-<slug>.md` for `/kb-ingest`, as `cli capture` writes it; also offered as **Capture “…”** for any text in the main search | ✓ (pushes directly; no offline spool — `cli capture` has one) |
| A prefix that a longer one starts with (`>l` next to `>le`) is entered after a space | ✓ |
| `>f` files — todo lists, action logs, events, prompts, commands: open one in Kaihuman or add an entry as its widget does (also from ⇥ repo-search hits) | ✓ |
| `>o` files in your home directory — by name, `>o c: …` by contents too, `>o a: …` on the whole file system; ⏎ opens one with its default app, ⇥ opens its folder in the file manager or a terminal | ✓ desktop only (`fd` or `find`, `rg` or `grep`) |
| Pinned tab groups, Import the browser's bookmarks | — only the extension can reach the browser |
| Counting how often a bookmark is opened | — the extension counts; the desktop does not yet |

Links open with `xdg-open`, so they go to your default browser (`xdg-settings set
default-web-browser …`). Copying runs `wl-copy`, so install `wl-clipboard`.

Type `?` for the help: every prefix, how searching and the keys work, and every action.

The prefix modes stand in for omarchy's `omarchy-show-prompts`, `omarchy-show-repos` and
`translate_manager.py`; see the extension's README ("Prefix modes") for how each one behaves.

- **`>p`** reads every `.prompts.md` on the repository's default branch — for example
  `Resources/ai/useful-prompts.prompts.md` — through GitHub rather than a local clone.
- **`>t`** needs a DeepL key. It is looked up on every translation, first match wins:
  1. `DEEPL_AUTH_KEY` in the daemon's environment;
  2. `~/.config/envvars/deepl.env` (`$XDG_CONFIG_HOME/envvars/deepl.env`), the omarchy env file —
     a `DEEPL_AUTH_KEY=…` (or `DEEPL_API_KEY=…`) line, `export` and quotes allowed;
  3. the Secret Service, where **Set the DeepL API key…** stores it.

  Because the file is read at translation time, editing it needs no daemon restart, and the
  toggle does not need to load anything.
- **`>x`** lists the commands in the repository's `.commands.md` files (format:
  `doc/commands-format.md`). ⏎ asks for each `{{name}}` — values go in as typed — then offers
  **Copy**, **Run in terminal** (a `ghostty` window that stays open until a key is pressed) and
  **Run in the background** (a notification says how it ended), with the finished command shown in
  full. Nothing runs until Run is chosen. Commands run with `bash -c` from your home directory.
- **`>d`** lists braindumps: **New braindump** first, then the ones in the active repository,
  most recently edited first, searchable by their text. ⏎ hides the palette and opens the choice in
  the **braindump window** (below). **⇥** (or **→**) on one offers **Open in the braindump window**
  and **Delete…**. Delete asks you to type `DELETE`, removes the braindump here, and syncs at once,
  so the repo follows. Offline, it says so, and the repo follows on the next sync. As with every
  sync, only the version this machine last saw is deleted: an edit made elsewhere since comes
  back. Dumps from before braindumps are listed underneath under *Old dumps — on this machine
  only*. They still open in the palette's editor to copy (⌃⏎), save as a file (⌃S) or clear, and
  **⇥ → Delete…** removes one. No new ones are made, and none are ever sent to GitHub.
- **`>c`** (from `omarchy-claude-code`) lists the repositories in `$EEE_HISTORY_FILE` or
  `~/.config/eee/history`, most recent first. ⏎ asks for the prompt; ⏎ again opens
  `https://claude.ai/code?prompt=…&repo=owner/name&branch=main` and closes the palette. The
  session lands in **Recent**, so it can be started again from there.
- **`>u`** (from `omarchy-claude-usage`) reads the accounts in `$OMARCHY_CLAUDE_USAGE_CONF` or
  `~/.config/omarchy/claude-usage.conf` (`name = /path/to/.claude` per line; without the file,
  `~/.claude`) and shows each account's usage: every rate-limit window with its percentage, a bar,
  the pace (how much of the window has passed) and when it resets, then spend or extra credits.
  An expired OAuth token is refreshed as Claude Code does it and written back to that account's
  `.credentials.json` (mode 600), so `claude` keeps working. ⏎ opens claude.ai's usage page.
- **`>o`** searches your home directory on ⏎ — not as you type, since every search walks the
  disk. What is typed is matched anywhere in a file or folder name, ignoring case; `c: …` also
  searches inside the files and lists those hits under **Contents**, after the names, with the
  first matching line. `a: …` searches the whole file system instead — every top-level folder but
  `/proc`, `/sys`, `/dev` and `/run`, skipping what you may not read — and may take up to 30 s.
  The two combine: `>o a: c: listen 443`. Hidden files and folders (`~/.cache`, `~/.config`…), `node_modules` and,
  with `fd` and `rg`, anything a `.gitignore` excludes are left out. Each search lists at most 25
  names (and 25 content hits) and stops after 10 s (30 s with `a:`) with what it has. ⏎ opens a file with
  `xdg-open`, so with its default app, and a folder in the file manager; **⇥** (or **→**) offers
  the folder it is in in the file manager (`xdg-open`) or in a new `ghostty` window. Names are
  found with `fd` when installed, else `find`; contents with `rg`, else `grep -r`. On Fedora,
  `sudo dnf install fd-find ripgrep` makes both faster. Any text typed in the main search is also
  offered as **Search files “…”**.
- **`>r`** reads `$EEE_COUNTS_FILE` or `~/.config/eee/counts` (`owner/repo count` per line), lists
  those repositories by count, then the rest of your GitHub repositories. Without a login or a
  network, the counted ones still show.

## Braindump window

For thoughts you need to get out of your head right now: `lifosy-palette-toggle braindump` (bind it
to a key, below) or `>d` in the palette opens a plain text window with the cursor in it.

- **Saved as you type**, 400 ms after the last key, on this machine — typing never waits for the
  network. Clearing the text deletes the braindump; an untouched new one is never created.
- **In the repository** as `.kh/braindumps/<created-ms>.md`, one file each, synced when the window
  hides or switches braindumps, after 30 s without typing, at least every 2 minutes while typing,
  and when the daemon starts. The status line says `saved here`, `synced 10:42`, or why a sync
  failed (it is tried again a minute later). A sync also takes braindumps changed or deleted on
  GitHub, by another machine or the extension's start page. Edited in two places at once, both
  versions are kept, the other one as a braindump of its own. See `doc/braindump.md`.
- **Keys**: **Esc** hides (and syncs), **⌃N** new braindump (the key does the same, unless the one
  showing is still empty), **⌃O** the window's own list of braindumps (type to filter, ⏎ opens,
  Esc goes back), **⌃⏎** copies all and hides, **⌃F** finds in the text (every match highlighted,
  ⏎ / ⇧⏎ next / previous, Esc back to the text with the match selected).
- It is a normal window, not an overlay, so other windows stay usable while you write. Its title is
  always `lifosy-braindump` for your window rules (below).

## Build and install (Fedora)

```sh
sudo dnf install webkit2gtk4.1-devel gtk3-devel gtk-layer-shell-devel libsoup3-devel \
  librsvg2-devel openssl-devel dbus-devel
sudo dnf group install c-development
# Rust via rustup; src-tauri/rust-toolchain.toml pins the version.

pnpm install                       # from the repo root
cd apps/desktop-palette
pnpm run build:desktop             # the UI, then both binaries
install -m 755 src-tauri/target/release/lifosy-palette \
  src-tauri/target/release/lifosy-palette-toggle ~/.local/bin/
```

The two binaries must stay in the same directory: the toggle client starts the daemon from there.
`pnpm run build` builds only the UI (what the monorepo's own build runs); `pnpm run test:desktop`
runs the Rust tests.

## Log in

Either way below takes the token from the Lifosy console, the same way the CLI's login does:

- **From the palette:** run **Log in with the Lifosy console**.
- **From a terminal:** run `lifosy-palette login`.

Both open `app.kaihuman.com/auth/cli` in your browser. Once you are logged in there, which is usually
already the case, the page hands the token to the palette and the tab closes itself. From the
palette, the overlay steps aside for the browser, and a notification (mako, dunst…) says how it
went.

```sh
lifosy-palette login                          # through the console, as above
lifosy-palette login --repo owner/name        # …and work on this repository
lifosy-palette login --paste                  # type a token instead (not echoed)
pass github/palette | lifosy-palette login --paste
lifosy-palette logout
```

- **How the token arrives:** the console posts a form with `token`, `state` and `repo` to
  `http://localhost:<port>/callback`. It is a POST, so the token is in the request body, never in a
  URL, and so never in the browser's history.
- The palette listens only on `127.0.0.1`, on a random port, for five minutes, and accepts only the
  random `state` it sent.
- The query-string redirect of older console builds is still read.
- **Before anything is stored**, the token is checked against the repository. The repository is the
  one given with `--repo`, else the one selected in the console, else the one in use.
- It is stored in the **Secret Service** (gnome-keyring, or KeePassXC with Secret Service turned on)
  and never written to a file. Hyprland does not start one for you, so start one from your config,
  for example `gnome-keyring-daemon --start --components=secrets`.
- `--repo` is optional; without it the palette uses the repository from the last login, or
  `lifosy/monorepo`. **Switch repository…** in the palette lists every repository you have logged
  in with.

## Hyprland

Bind the toggle client to a key of your choice. Hyprland 0.55+ (Lua):

```lua
hl.on("hyprland.start", function()
    hl.exec_cmd("lifosy-palette daemon")   -- optional: the first toggle starts it anyway
end)
hl.bind("SUPER + SPACE", hl.dsp.exec_cmd("lifosy-palette-toggle"))
```

Older hyprlang configs: `exec-once = lifosy-palette daemon` and
`bind = SUPER, SPACE, exec, lifosy-palette-toggle`. No window rules are needed: the palette is a
layer surface named `lifosy-palette` (`hyprctl layers`), which `hl.layer_rule` can match if you want
to change its animation.

The braindump window gets a key of its own, for example
`hl.bind("SUPER + SHIFT + D", hl.dsp.exec_cmd("lifosy-palette-toggle braindump"))`
(hyprlang: `bind = SUPER SHIFT, D, exec, lifosy-palette-toggle braindump`). It is an ordinary
window, so Hyprland tiles it unless a window rule floats it. Match its title, `lifosy-braindump`,
and make it float, centred, at about 760×520 — in hyprlang up to 0.54
`windowrule = float, title:^(lifosy-braindump)$` plus the same with `center` and
`size 760 520`. The rule syntax changed with the Lua config in 0.55, so check it against your
version's wiki page; the title to match stays the same.

## Same repository as the browser extension

The palette and the extension each remember a repository. To keep them on the same one, register
the palette as the extension's native messaging host — once, from the installed binary:

```sh
lifosy-palette native-host install <extension id>   # the id is on chrome://extensions
```

It writes `com.lifosy.palette.json` into `NativeMessagingHosts/` of every Chrome, Chromium, Brave,
Edge or Vivaldi profile under `$XDG_CONFIG_HOME`, allowing only that extension. Then reload the
extension. From then on, switching the repository in either one switches the other: each side
records when its repository changed, and the newer choice wins. The extension asks when a start
page opens (at most every 30 s) and once an hour, and tells the palette at once when you switch
there. Chrome starts `lifosy-palette` for each message, so the daemon does not need to run.
Flatpak and Snap browsers cannot start host programs without extra sandbox setup.

## How it works

- **`lifosy-palette daemon`** keeps the palette loaded in a hidden overlay, so opening it only maps
  a window.
- **`lifosy-palette-toggle [toggle|show|hide|quit]`** writes one line to
  `$XDG_RUNTIME_DIR/lifosy-palette.sock` and exits. It links only libc and takes a few
  milliseconds. If no daemon is running, it starts one.
- **The palette hides itself** on Esc, on a click outside the panel, and after opening something.
- **Each request** the palette makes (`PaletteProtocol` in `packages/palette/src/protocol.ts`) goes
  to `palette_request` in `src-tauri/src/requests.rs`.

| Path | Holds |
| --- | --- |
| `$XDG_CONFIG_HOME/lifosy/palette.json` | the current repository, when it last changed, and the ones you have used |
| `$XDG_CACHE_HOME/lifosy/bookmarks.json` | GitHub's bookmarks file as last fetched, with its ETag |
| `$XDG_CACHE_HOME/lifosy/commands.json` | the repository's `.commands.md` files as last fetched (five minutes) |
| `$XDG_CACHE_HOME/lifosy/prompts.json` | the repository's `.prompts.md` files as last fetched (five minutes) |
| `$XDG_STATE_HOME/lifosy/recents.json` | the palette's last ten actions |
| `$XDG_DATA_HOME/lifosy/dumps/*.txt` | old dumps from before braindumps, listed under `>d` until cleared |
| `$XDG_DATA_HOME/lifosy/braindumps/<owner>/<name>/` | braindumps (`<id>.md`) and what GitHub last had of each (`<id>.json`); see `doc/braindump.md` |
| `$XDG_STATE_HOME/lifosy/translations.json` | the last 20 texts translated with `>t` |

For development and tests, `LIFOSY_GITHUB_TOKEN` takes the place of the keyring and
`LIFOSY_GITHUB_API` points the backend at a stand-in for `https://api.github.com`.

## Troubleshooting

- **"Not logged in"** in the palette's status line: run **Log in with the Lifosy console**, or `lifosy-palette login`.
- **Keyring errors:** no Secret Service is running (see Log in).
- **It opens as a normal, tiled window:** the compositor has no layer-shell (GNOME), or GTK picked
  X11. The daemon sets `GDK_BACKEND=wayland` when `WAYLAND_DISPLAY` is set; check that it is.
- **Daemon output:** run `lifosy-palette daemon` in a terminal instead of from the compositor.
