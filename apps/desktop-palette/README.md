# desktop-palette

The Lifosy command palette as a desktop overlay: press a key anywhere and the palette opens
**centered on the focused monitor**, above whatever is tiled there, with the keyboard in its input.
It is the same palette as the browser extension's (`@lifosy/palette`), answered by a Rust backend
instead of the extension's service worker.

Built for Wayland compositors with `wlr-layer-shell`: Hyprland, Sway, river, niri, KDE. On GNOME or
X11 it falls back to an ordinary window. See `doc/native-command-palette.md` for why it works this
way, and `apps/desktop-palette-spike` for the phase 0 test it builds on.

## What it can do

| In the palette | Desktop |
| --- | --- |
| Bookmarks from `.kh/browser.bookmarks.json`, searched as you type | ✓ (cached for an hour, refreshed in the background) |
| Web search: Google, DuckDuckGo, Ecosia, Amazon, Reddit | ✓ |
| ⇥ Tab: GitHub code search in the repo, opened in the console | ✓ |
| Add a note… (dump, quick-note files, `.actionlog.md` with `#tags`) | ✓ |
| Recent, Switch repository…, Sync with GitHub now, Open the Lifosy console | ✓ |
| Pinned tab groups, Import the browser's bookmarks | — only the extension can reach the browser |
| Counting how often a bookmark is opened | — the extension counts; the desktop does not yet |

Links open with `xdg-open`, so they go to your default browser (`xdg-settings set
default-web-browser …`).

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

```sh
lifosy-palette login --repo owner/name     # prompts for the token without echoing it
pass github/palette | lifosy-palette login  # or pipe it in
lifosy-palette logout
```

- The token needs read/write access to the repository's contents. `login` checks that it can read
  the repository before storing anything.
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
| `$XDG_CONFIG_HOME/lifosy/palette.json` | the current repository and the ones you have used |
| `$XDG_CACHE_HOME/lifosy/bookmarks.json` | GitHub's bookmarks file as last fetched, with its ETag |
| `$XDG_STATE_HOME/lifosy/recents.json` | the palette's last ten actions |

For development and tests, `LIFOSY_GITHUB_TOKEN` takes the place of the keyring and
`LIFOSY_GITHUB_API` points the backend at a stand-in for `https://api.github.com`.

## Troubleshooting

- **"Not logged in"** in the palette's status line: run `lifosy-palette login`.
- **Keyring errors:** no Secret Service is running (see Log in).
- **It opens as a normal, tiled window:** the compositor has no layer-shell (GNOME), or GTK picked
  X11. The daemon sets `GDK_BACKEND=wayland` when `WAYLAND_DISPLAY` is set; check that it is.
- **Daemon output:** run `lifosy-palette daemon` in a terminal instead of from the compositor.
