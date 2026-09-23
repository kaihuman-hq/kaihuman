# desktop-palette-spike (phase 0)

A **throwaway** Tauri v2 app. It answers one question before we build the real desktop palette:
can a Tauri window open centered on the focused monitor, above a tiled layout, with the keyboard
in its input, fast enough to bind to a key, on Hyprland? See `doc/native-command-palette.md` for
the plan it serves.

It has no real content: eight fixed rows filtered as you type. The footer shows the mode, the GDK
backend (it should say `GdkWaylandDisplay`) and how long the last open took.

It is not a pnpm workspace package on purpose. The repo's `pnpm run build` would otherwise try to
compile it, and that needs the WebKitGTK headers.

## How it works

- `lifosy-palette-spike daemon` starts one resident process that keeps the webview loaded but
  hidden. Opening the palette is then only showing a window, never a cold start.
- **`lifosy-palette-toggle [toggle|show|hide|quit]` is what you bind to a key.** It connects to
  `$XDG_RUNTIME_DIR/lifosy-palette-spike.sock`, writes one line and exits.
  - It links only libc: 4–9 ms per call, where the full binary took ~30 ms.
  - If no daemon is running, `toggle` and `show` start `lifosy-palette-spike` from the same
    directory, and it opens the palette itself.
- `lifosy-palette-spike toggle` and the other commands still work too, just slower.
- `--mode` picks how the window reaches the screen. It is read when the daemon starts, so run
  `quit` before switching modes.

| Mode | What it is |
| --- | --- |
| `layer` (default) | wlr-layer-shell overlay covering the focused output; the card is centered by CSS; clicking outside the card closes it |
| `layer-card` | layer-shell overlay the size of the card, anchored to no edge, so the compositor centers it |
| `float` | ordinary window; floating and centering come from your compositor rules (below); it closes when it loses focus |

`--force-commit` applies Wield's workaround for layer surfaces that map but never paint. Use it only
if you see an empty or invisible palette. It exists so the spike can show whether we need it.

## Build on Fedora

```sh
sudo dnf install webkit2gtk4.1-devel gtk3-devel gtk-layer-shell-devel libsoup3-devel \
  librsvg2-devel openssl-devel
sudo dnf group install c-development
# Rust via rustup; rust-toolchain.toml pins the version used in apps/cli
cd apps/desktop-palette-spike
cargo build --release
cargo test
```

Both binaries land in `target/release/`: `lifosy-palette-spike` (the daemon) and
`lifosy-palette-toggle` (the client). Keep them in the same directory.

## Hyprland config

Hyprland 0.55 and later use a Lua config:

```lua
hl.on("hyprland.start", function()
    hl.exec_cmd("~/path/to/lifosy-palette-spike daemon")          -- add --mode … to try another
end)
hl.bind("SUPER + SPACE", hl.dsp.exec_cmd("~/path/to/lifosy-palette-toggle"))

-- Only for --mode float. app_id is the binary name; confirm with `hyprctl clients`.
hl.window_rule({
    match = { class = "^lifosy-palette-spike$" },
    float = true, center = true, size = {620, 420}, pin = true,
    stay_focused = true, no_anim = true, dim_around = true,
})

-- Optional for the layer modes: `hyprctl layers` lists the namespace lifosy-palette-spike.
hl.layer_rule({ match = { namespace = "^lifosy-palette-spike$" }, no_anim = true })
```

On an older hyprlang config the same things are `exec-once = …`, `bind = SUPER, SPACE, exec, …`
and `windowrule` lines. Check the 0.54 wiki for the exact rule names.

## Checklist (run each mode: `layer`, `layer-card`, `float`)

| # | Check | How |
| --- | --- | --- |
| 1 | Opens centered on the **focused** monitor | two monitors; focus each one and toggle |
| 2 | Correct with fractional scaling | set one monitor to 1.25 or 1.5 |
| 3 | Opens above a fullscreen window | fullscreen a browser, then toggle |
| 4 | Keys go straight into the input | press the key and type at once; nothing should reach the window behind |
| 5 | Esc closes and focus returns to the previous window | type after Esc |
| 6 | Click outside closes (`layer`, `float`) | |
| 7 | Warm open under 100 ms | footer number, or `journalctl`/terminal output of the daemon |
| 8 | Transparency and rounded corners render | no black box around the card |
| 9 | Never an invisible or empty palette in 50 toggles | if one happens, retry with `--force-commit` |
| 10 | Memory | `grep Pss /proc/$(pgrep -f 'lifosy-palette-spike daemon')/smaps_rollup`, plus the WebKit processes |

## Result on Hyprland (Fedora, 2026-09-23)

You ran the checklist on your own Hyprland machine: **everything passed**. That run used the default
`layer` mode, without the Lua rules; `layer` needs none, which is the point.
**Decision: phase 2 uses the full-output layer surface**, driven over the socket by a tiny client.
`float` stays documented as the fallback for compositors without layer-shell.

## Earlier results: headless Sway 1.9, software rendering

These runs were in the dev container: Sway with the headless backend and pixman rendering, a
`foot` terminal tiled full-screen behind the palette, and keys sent with `wtype`. Sway implements
the same layer-shell protocol as Hyprland, so the layer-shell mechanics carry over. Anything
specific to Hyprland is still open.

| Check | `layer` | `layer-card` | `float` |
| --- | --- | --- | --- |
| Centered on the output, above the tiled terminal | yes | yes (compositor-centered) | yes (with a Sway rule) |
| GDK backend | Wayland | Wayland | Wayland |
| Keys reach the input, none reach the terminal | yes | yes | see below |
| Esc closes, focus returns to the terminal | yes | yes | not reached |
| Warm open, release build (command sent → second frame) | 31–36 ms | ~same | — |
| Cold first open (daemon start → painted) | ~150 ms release, 3.7 s debug | | |
| Client process wall time | 30–48 ms | | |

Findings:

- **The client was slow to start.** It took ~30 ms because it was the full Tauri binary, which
  loads about 130 shared libraries just to write one line to a socket. Fixed by
  `lifosy-palette-toggle` (4–9 ms). `printf 'toggle\n' | nc -U …` works as well; a line without a
  timestamp is timed from when the daemon receives it.
- **wtype drops the first key.** Each `wtype` run creates a new virtual keyboard, and GTK drops the
  first key it sends. The terminal did not drop it. With a short pause first (`wtype -s 600 …`)
  every key arrives. A physical keyboard does not change device per key, so this is a test
  artifact, but confirm check 4 by hand.
- **`float` closed itself under the same device switch.** The swap produces a focus-out, and
  float mode hides on focus loss. On Hyprland with a real keyboard this is probably fine. If it
  flickers closed, that is the cause.
- **The browser's focus check is wrong here.** `document.hasFocus()` reads false inside a layer
  surface even while it holds the keyboard, so the future palette must not rely on it.
- **Memory is high.** PSS was ~112 MB for the daemon, ~237 MB for the WebKit web process and
  ~22 MB for the network process. Software rendering inflates these numbers; measure on your GPU
  (check 10).
- A key pressed in the ~30 ms before the surface maps still goes to the previous window. Human
  reaction time is longer, but fast typists may notice.
