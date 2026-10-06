# Desktop palette

The desktop palette is the shared command palette as a Linux desktop overlay. A global hotkey opens it centred on the focused monitor, above tiled windows, with the keyboard in its input. It lives in `apps/desktop-palette`: a Tauri v2 app whose webview runs `@lifosy/palette` and whose Rust backend (`src-tauri/`) answers its requests. It targets Wayland compositors with `wlr-layer-shell` (Hyprland, Sway, river, niri, KDE) and also hosts the braindump window.

## Building and installing the desktop palette on Linux

<!-- docspack: tags=install,build,fedora,cargo,dnf -->

On Fedora, install the system libraries, then Rust via rustup. `src-tauri/rust-toolchain.toml` pins the Rust version.

```sh
sudo dnf install webkit2gtk4.1-devel gtk3-devel gtk-layer-shell-devel libsoup3-devel \
  librsvg2-devel openssl-devel dbus-devel
sudo dnf group install c-development

pnpm install                       # from the repo root
cd apps/desktop-palette
pnpm run build:desktop             # the UI, then both binaries
install -m 755 src-tauri/target/release/lifosy-palette \
  src-tauri/target/release/lifosy-palette-toggle ~/.local/bin/
```

- The two binaries must stay in the same directory. The toggle client starts the daemon from there.
- `pnpm run build` builds only the UI with Vite (what the monorepo build runs).
- `pnpm run test:desktop` builds the UI and runs the Rust tests (`cargo test`).
- There is no RPM or AppImage. Copying the two binaries is the install.

Runtime tools: `wl-copy` (package `wl-clipboard`) for copying, `xdg-open` for links, `ghostty` for terminals, `notify-send` for notifications. `fd` and `rg` make `>o` faster.

## Binding the global hotkey in Hyprland

<!-- docspack: tags=hotkey,shortcut,keybinding,hyprland,super space -->

The compositor owns the hotkey. Bind `lifosy-palette-toggle` to a key. Hyprland 0.55+ (Lua config):

```lua
hl.on("hyprland.start", function()
    hl.exec_cmd("lifosy-palette daemon")   -- optional: the first toggle starts it anyway
end)
hl.bind("SUPER + SPACE", hl.dsp.exec_cmd("lifosy-palette-toggle"))
hl.bind("SUPER + SHIFT + D", hl.dsp.exec_cmd("lifosy-palette-toggle braindump"))
```

Older hyprlang configs:

```
exec-once = lifosy-palette daemon
bind = SUPER, SPACE, exec, lifosy-palette-toggle
bind = SUPER SHIFT, D, exec, lifosy-palette-toggle braindump
```

The palette needs no window rule. It is a layer surface named `lifosy-palette` (see `hyprctl layers`); `hl.layer_rule` can match it to change its animation. The braindump window is a normal window and needs a float rule (see the braindump window section). On other compositors, bind the same command with their own syntax.

## How the daemon and the toggle client work

<!-- docspack: tags=daemon,socket,toggle,process,layer-shell -->

- **`lifosy-palette daemon`** keeps the palette loaded in a hidden window, so opening it only maps the window.
- **`lifosy-palette-toggle [toggle|show|hide|quit|braindump]`** writes one line, `<command> <ms>`, to `$XDG_RUNTIME_DIR/lifosy-palette.sock` and exits. It links only libc and takes a few milliseconds. With no daemon running, `toggle`, `show` and `braindump` start one.
- `lifosy-palette` itself accepts the same commands, but loads WebKitGTK and is slower.
- The palette window is created hidden, 620×420, undecorated, transparent and not resizable. `layer.rs` makes it a `wlr-layer-shell` overlay with exclusive keyboard mode, anchored to all edges of the focused output.
- Without layer-shell (GNOME, X11) it opens as an ordinary window.
- The daemon sets `GDK_BACKEND=wayland` when `WAYLAND_DISPLAY` is set.
- The palette hides itself on Esc, a click outside the panel, and after opening something.

The socket protocol (`Command`, `parse_request`) is in `src-tauri/src/lib.rs`. The daemon, windows and Tauri commands are in `src-tauri/src/main.rs`.

## Logging in the desktop palette

<!-- docspack: tags=login,token,keyring,secret service,logout -->

The palette needs a GitHub token from the Lifosy console. Log in either way:

- From the palette: run the action **Log in with the Lifosy console**.
- From a terminal: `lifosy-palette login`.

```sh
lifosy-palette login                          # through the console
lifosy-palette login --repo owner/name        # and work on this repository
lifosy-palette login --paste                  # type a token instead (not echoed)
pass github/palette | lifosy-palette login --paste
lifosy-palette logout
```

Both open `app.kaihuman.com/auth/cli`. The console POSTs `token`, `state` and `repo` to `http://localhost:<port>/callback`. The palette listens only on `127.0.0.1`, on a random port, for five minutes, and accepts only its own `state`. The token is checked against the repository, then stored in the Secret Service (gnome-keyring, or KeePassXC). Hyprland starts no Secret Service, so run one, for example `gnome-keyring-daemon --start --components=secrets`. **Switch repository…** lists every repository you logged in with.

## What only the desktop palette can do

<!-- docspack: tags=desktop only,differences,extension -->

The desktop palette has all shared prefixes plus these (`apps/desktop-palette/src/main.ts`):

| Prefix or feature | Desktop behaviour |
| --- | --- |
| `>d` | Braindumps, opened in the braindump window |
| `>c` | New Claude Code session on claude.ai |
| `>u` | Claude usage per account |
| `>o` | Search local files; `c:` contents, `a:` whole file system |
| `>x` | Also **Run in terminal** (ghostty) and **Run in the background** |
| `>r`, `>g` | Ranked by omarchy's `~/.config/eee/counts` |
| Copy | Through `wl-copy` |
| Links | Through `xdg-open`, so the default browser |

The extension-only actions (pinned tab groups, importing browser bookmarks) are hidden. Their requests reject with `… needs the browser extension`. Opening a bookmark is not counted on the desktop.

## Searching local files with >o

<!-- docspack: tags=file search,fd,ripgrep,find,grep,SEARCH_LOCAL_FILES -->

`>o` searches your home directory on ⏎, not while typing. Any text in the main search is also offered as **Search files “…”**.

| Query | Searches |
| --- | --- |
| `>o invoice` | File and folder names in `~` containing `invoice`, ignoring case |
| `>o c: listen 443` | Names, then file contents (under **Contents**, with the first matching line) |
| `>o a: nginx.conf` | Names on the whole file system |
| `>o a: c: listen 443` | Both; flags combine in either order |

- Names use `fd` when installed, else `find`. Contents use `rg`, else `grep -r`. On Fedora: `sudo dnf install fd-find ripgrep`.
- Hidden files and folders, `node_modules` and, with `fd`/`rg`, `.gitignore`d paths are left out.
- At most 25 names and 25 content hits are listed.
- A search stops after 10 s, or 30 s with `a:`, and shows what it found.
- `a:` skips `/proc`, `/sys`, `/dev` and `/run`, and what you may not read.

The request is `SEARCH_LOCAL_FILES { query, contents, everywhere }`; the answer is `{ home, hits }`. Code: `local-files.ts` (`parseLocalFileQuery`) and `src-tauri/src/files.rs`.

## Opening a found file, its folder or a terminal

<!-- docspack: tags=OPEN_LOCAL_FILE,xdg-open,file manager,ghostty -->

On a `>o` hit:

- ⏎ opens a file with its default app (`xdg-open`), or a folder in the file manager.
- ⇥ or → offers **Open with the default app**, **Open `<folder>` in the file manager** and **Open `<folder>` in a terminal**.
- The terminal is a new `ghostty` window started in that folder.

The request is `OPEN_LOCAL_FILE { path, with }`, where `with` is `app`, `file-manager` or `terminal` (`OpenWith` in `files.rs`). Only absolute paths that still exist are opened; otherwise the palette says `<path> is not there any more`. The palette closes after opening.

## Running commands from .commands.md in ghostty

<!-- docspack: tags=>x,RUN_COMMAND,terminal,background,notification -->

On the desktop, `>x` offers two ways to run a filled-in command, besides **Copy**:

- **Run in terminal**: opens a `ghostty` window that prints `$ <command>`, runs it, and waits for a key with `[exit <status>] Press any key to close`.
- **Run in the background**: runs detached; a notification shows `✓ <first line>` or `✗ <first line> — exit N: <last stderr line>`.

Both run with `bash` from your home directory. Values typed for `{{name}}` parameters go in as typed. Nothing runs until a Run choice is picked.

The request is `RUN_COMMAND { command, where }`, with `where` `terminal` or `background`. Code: `src-tauri/src/commands.rs`. If ghostty is missing, the palette says `Could not start ghostty … — is it installed?`.

## Opening and using the braindump window

<!-- docspack: tags=braindump,window,notes,scratch,ctrl+n,ctrl+o -->

The braindump window is a plain text window for getting thoughts down fast. Open it with `lifosy-palette-toggle braindump` (bound to a key) for a new braindump, or from `>d` in the palette.

| Key | Effect |
| --- | --- |
| Esc | Hide the window, saving and syncing |
| ⌃N | New braindump (the toggle key does the same unless the current one is empty) |
| ⌃O | The window's own list of braindumps: type to filter, ⏎ opens, Esc goes back |
| ⌃⏎ | Copy all and hide |

It is a normal window, not an overlay, so other windows stay usable. Its title is always `lifosy-braindump`. To float it in Hyprland ≤ 0.54: `windowrule = float, title:^(lifosy-braindump)$`, plus `center` and `size 760 520`. Check the rule syntax for Lua configs (0.55+). The status line shows the title and `saved here`, `synced 10:42`, or why a sync failed.

Code: `packages/palette/src/braindump-window.ts` (`createBraindumpWindow`), `apps/desktop-palette/src/braindump.ts`, `braindump.html`.

## How braindumps are saved and synced to GitHub

<!-- docspack: tags=sync,conflict,offline,kh/braindumps -->

Braindumps save locally first, then sync to the active repository.

- **Local save**: 400 ms after the last key (`SAVE_BRAINDUMP`). Clearing the text deletes the braindump. An untouched new one is never created.
- **Repo file**: `.kh/braindumps/<created-ms>.md`, plain Markdown, one file each.
- **Sync** (`SYNC_BRAINDUMPS`): when the window hides or switches braindumps, after 30 s without typing, at least every 2 minutes while typing, when the daemon starts, and a minute after a failed sync.
- A sync also takes braindumps created, edited or deleted elsewhere (another machine, the start page).
- **Conflict**: if both sides edited, both versions survive; the other one becomes its own braindump.
- **Offline**: nothing is lost; unsent changes go out on the next sync.
- A delete removes only the version this machine last saw; an edit made elsewhere comes back.

Local copies live in `$XDG_DATA_HOME/lifosy/braindumps/<owner>/<name>/`: `<id>.md` is the text, `<id>.json` holds GitHub's last `{ sha, text }`. Only the active repository syncs. Code: `src-tauri/src/braindumps.rs`; design in `doc/braindump.md`.

## Listing and deleting braindumps with >d

<!-- docspack: tags=>d,delete braindump,old dumps,OPEN_BRAINDUMP -->

`>d` lists **New braindump** first, then the active repository's braindumps, most recently edited first. They are searchable by their text. Unsynced ones say `not synced yet`.

- ⏎ hides the palette and opens the choice in the braindump window (`OPEN_BRAINDUMP { id? }`).
- ⇥ or → offers **Open in the braindump window** and **Delete…**.
- **Delete…** asks you to type `DELETE`. It removes the braindump here (`SAVE_BRAINDUMP` with empty text) and syncs at once. Offline, it says the repo follows on the next sync.

Below them, under *Old dumps — on this machine only*, are dumps from before braindumps (`$XDG_DATA_HOME/lifosy/dumps/*.txt`). They open in the palette's own editor: ⌃⏎ copies all, ⌃S saves to a path (`EXPORT_DUMP`), and clearing the text deletes it. **⇥ → Delete…** removes one. No new old dumps are made, and none are sent to GitHub.

## Starting a Claude Code session with >c

<!-- docspack: tags=claude code,claude.ai,eee history,omarchy -->

`>c` lists repositories from `$EEE_HISTORY_FILE`, or `~/.config/eee/history`, most recent first (`LIST_CLAUDE_CODE_REPOS`). It replaces omarchy's `omarchy-claude-code`.

1. Pick a repository and press ⏎.
2. Type the prompt and press ⏎.
3. The palette opens `https://claude.ai/code?prompt=…&repo=owner/name&branch=main` and closes.

An empty prompt is refused with `Type a prompt for Claude Code`. The session lands in **Recent**, so it can be started again from there. The URL is built by `claudeCodeUrl` in `packages/palette/src/actions.ts`, which encodes spaces as `+` as omarchy does.

## Checking Claude usage with >u

<!-- docspack: tags=rate limit,usage,claude usage,spend,omarchy -->

`>u` shows each Claude account's usage: every rate-limit window with its percentage, a bar, the pace and the reset time, then spend or extra credits. ⏎ opens claude.ai's usage page.

- Accounts come from `$OMARCHY_CLAUDE_USAGE_CONF` or `~/.config/omarchy/claude-usage.conf`, one `name = /path/to/.claude` per line. Without the file, `~/.claude` is used.
- The last fetch shows at once with its age: green under 15 minutes, yellow up to an hour, red beyond.
- Once the cache is 5 minutes old, it syncs in the background and replaces the rows.
- An expired OAuth token is refreshed and written back to that account's `.credentials.json` (mode 600).

Requests: `GET_CLAUDE_USAGE` and `GET_CLAUDE_USAGE { cached: true }`. The cache is `$XDG_CACHE_HOME/lifosy/claude-usage.json`. Code: `src-tauri/src/claude.rs`, `packages/palette/src/claude-usage.ts`.

## Setting the DeepL key for >t on the desktop

<!-- docspack: tags=deepl,api key,DEEPL_AUTH_KEY,translate -->

The desktop looks up the DeepL key on every translation. The first match wins:

1. `DEEPL_AUTH_KEY` in the daemon's environment.
2. `~/.config/envvars/deepl.env` (`$XDG_CONFIG_HOME/envvars/deepl.env`), a `DEEPL_AUTH_KEY=…` or `DEEPL_API_KEY=…` line. `export` and quotes are allowed.
3. The Secret Service, where the **Set the DeepL API key…** action stores it.

Editing the env file needs no daemon restart. The last 20 translated texts are kept in `$XDG_STATE_HOME/lifosy/translations.json`. Code: `src-tauri/src/translate.rs` and `config.rs`.

## Keeping the same repository as the browser extension

<!-- docspack: tags=native messaging,SYNC_REPO,active repository -->

The palette and the extension each remember an active repository. Register the palette as the extension's native messaging host to keep them in step:

```sh
lifosy-palette native-host install <extension id>   # the id is on chrome://extensions
```

- It writes `com.lifosy.palette.json` into `NativeMessagingHosts/` of every Chrome, Chromium, Brave, Edge or Vivaldi profile under `$XDG_CONFIG_HOME`, allowing only that extension.
- Reload the extension afterwards.
- Each side records when its repository changed; the newer choice wins.
- The extension asks when a start page opens (at most every 30 s) and hourly, and tells the palette when you switch there.
- Chrome starts `lifosy-palette` per message (`SYNC_REPO`), so the daemon need not run.
- Flatpak and Snap browsers cannot start host programs without extra sandbox setup.

Code: `src-tauri/src/native_host.rs`.

## Tauri commands and palette requests

<!-- docspack: tags=invoke,tauri,requests.rs,palette_request,events -->

The webview talks to Rust through `window.__TAURI__.core.invoke`. Commands registered in `main.rs`:

| Tauri command | Purpose |
| --- | --- |
| `palette_request` | Every `PaletteProtocol` request; handles `OPEN_BRAINDUMP` itself, the rest in `requests::handle` |
| `console_login` | **Log in with the Lifosy console**; hides the overlay, reports by notification |
| `copy_text` | Copies with `wl-copy` |
| `hide_palette`, `hide_braindump` | The page hid itself |
| `webview_ready`, `braindump_ready` | The page is listening; replays a cold-start command |

Events from Rust: `palette:show`, `palette:hide`, `braindump:open` (`{ id }`), `braindump:hidden`.

`Request` in `src-tauri/src/requests.rs` mirrors the protocol. Desktop-only requests: `RUN_COMMAND`, `SEARCH_LOCAL_FILES`, `OPEN_LOCAL_FILE`, `LIST_CLAUDE_CODE_REPOS`, `GET_CLAUDE_USAGE`, `LIST_DUMPS`, `SAVE_DUMP`, `EXPORT_DUMP`, `LIST_BRAINDUMPS`, `SAVE_BRAINDUMP`, `SYNC_BRAINDUMPS`, `OPEN_BRAINDUMP`. Unknown request types fall into `BrowserOnly` and are rejected. For tests, `LIFOSY_GITHUB_TOKEN` replaces the keyring and `LIFOSY_GITHUB_API` points at a stand-in for `https://api.github.com`.

## Files the desktop palette stores

<!-- docspack: tags=xdg,cache,config,state,paths -->

| Path | Holds |
| --- | --- |
| `$XDG_CONFIG_HOME/lifosy/palette.json` | Current repository, when it changed, repositories used |
| `$XDG_CACHE_HOME/lifosy/bookmarks.json` | `.kh/browser.bookmarks.json` as last fetched, with its ETag (one hour) |
| `$XDG_CACHE_HOME/lifosy/commands.json` | `.commands.md` files (five minutes) |
| `$XDG_CACHE_HOME/lifosy/prompts.json` | `.prompts.md` files (five minutes) |
| `$XDG_CACHE_HOME/lifosy/palette-settings.json` | `.kh/command-palette.settings.json` (five minutes) |
| `$XDG_CACHE_HOME/lifosy/claude-usage.json` | Last `>u` fetch |
| `$XDG_STATE_HOME/lifosy/recents.json` | The main search's last ten actions and opens |
| `$XDG_STATE_HOME/lifosy/mode-recents.json` | Last 10 choices per prefix |
| `$XDG_STATE_HOME/lifosy/translations.json` | Last 20 `>t` texts |
| `$XDG_DATA_HOME/lifosy/dumps/*.txt` | Old dumps from before braindumps |
| `$XDG_DATA_HOME/lifosy/braindumps/<owner>/<name>/` | Braindumps (`<id>.md`, `<id>.json`) |

The token is never written to a file; it is in the Secret Service. Paths are built in `src-tauri/src/config.rs`, falling back to `~/.config`, `~/.cache`, `~/.local/state` and `~/.local/share`.

## Troubleshooting the desktop palette

<!-- docspack: tags=errors,not logged in,tiled window,keyring,debug -->

- **"Not logged in"** in the status line: run **Log in with the Lifosy console**, or `lifosy-palette login`.
- **Keyring errors**: no Secret Service is running. Start `gnome-keyring-daemon --start --components=secrets` or enable KeePassXC's Secret Service.
- **It opens as a normal, tiled window**: the compositor has no layer-shell (GNOME), or GTK picked X11. Check that `WAYLAND_DISPLAY` is set.
- **Copy fails**: install `wl-clipboard` for `wl-copy`.
- **Run in terminal fails**: install `ghostty`.
- **Daemon output**: run `lifosy-palette daemon` in a terminal instead of from the compositor.
- **NVIDIA or rendering glitches**: `WEBKIT_DISABLE_DMABUF_RENDERER=1` is the documented workaround to try.
- **Stop the daemon**: `lifosy-palette-toggle quit`.
