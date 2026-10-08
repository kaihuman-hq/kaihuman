# Native command palette for the desktop — study and plan

Status: phases 0–2 are done (2026-09-23); `apps/desktop-palette` is the app. Phase 3 is optional. Revised 2026-09-23 for the actual setup: Fedora with
**Hyprland**, a tiling Wayland compositor. The palette must also behave on other tiling compositors.
You bind the shortcut yourself.

Everything below comes from documentation, issue trackers and similar projects. None of it was tried
on a Hyprland machine, so phase 0 is a spike that checks the risky parts first.

## Goal

Your own app, `kaihuman-palette`. Running `kaihuman-palette toggle` opens a palette **centered on the
focused monitor**, over whatever is tiled there, with the keyboard in its input. It has the same
content as the extension's palette: bookmarks, repo search, web search and notes. Pinned tab groups
come later, through the extension.

## What changes compared with the GNOME version

| Topic | GNOME (earlier draft) | Hyprland |
| --- | --- | --- |
| Hotkey | GNOME custom shortcut; portal broken on GNOME 50 | Yours: `bind = SUPER, SPACE, exec, kaihuman-palette toggle` (Lua config since Hyprland 0.55) |
| Centering | mutter's `center-new-windows`, recreate the window every time | **layer-shell**: a surface with no anchors is centered by the compositor. Or a floating window with a `center` rule |
| Tiling | not a concern | a normal window would be **tiled**; it must be a layer surface or a floating window |
| Focus stealing | biggest risk | small: a layer surface with exclusive keyboard mode takes the keyboard |
| GNOME Shell extension (old phase 3) | fallback for focus | **dropped** |
| dmenu family (rofi 2, fuzzel, wofi, walker) | do not run on GNOME | run fine. Not chosen, since you want your own app, but useful as a comparison |
| Token storage | gnome-keyring always running | **no Secret Service by default**; you have to run one (gnome-keyring or KeePassXC) |
| Opening URLs | GNOME's default apps | `xdg-open` reads `mimeapps.list`; set the default browser with `xdg-settings` |

## Two ways to put a Tauri window on top of a tiling layout

### A. Layer-shell surface (recommended; what launchers do)

`wlr-layer-shell` lets a client say "I am an overlay on the top layer". Anchoring on no edges means
the compositor centers the surface. Leaving the output unset means the compositor picks the focused
monitor. With keyboard mode *exclusive* the surface takes the keyboard until it closes.

The same code then works on Hyprland, Sway, river, niri, KDE and COSMIC, with no window rules and
nothing to configure except the key.

**Tauri has no built-in support for this.** The Linux window underneath Tauri is a GTK3 window,
and people apply `gtk-layer-shell` (Rust crate `gtk-layer-shell`) to it. Wield
([Tauri + layer-shell command palette](https://github.com/DhanushSantosh/Wield/pull/10)) does exactly
this. It reports these problems on Hyprland:

- The window must be set up as a layer surface *before* it is shown. In Tauri that means creating
  it hidden (`visible: false`) and calling `gtk_layer_init_for_window` on `window.gtk_window()`
  first.
- `resizable: true` broke transparency on Hyprland 0.56.2, so keep it `false`.
- Set a namespace of your own (`kaihuman-palette`). The default `gtk-layer-shell` namespace can pick
  up layer rules meant for other tools.
- Exclusive keyboard mode means a click outside does not close the palette. Only Esc does, unless
  you handle it with the *on-demand* mode plus closing on focus loss.

### B. Normal window made to float with compositor rules (fallback)

A plain Tauri window, with the class set to `kaihuman-palette`, plus a rule in your config: float,
center, pin, stay focused, no animations. This takes no special code. The downsides:

- Every compositor needs its own rules (Hyprland rules, Sway's `for_window`, and so on).
- The rule syntax changes: Hyprland moved from `windowrulev2` to Lua `hl.window_rule()` in 0.55.

The phase 0 spike builds both A and B. A is kept if it behaves; B is the fallback we ship.

## Is Tauri still the right choice?

**Yes, and more so than on GNOME.**

- Hyprland is the compositor that works *with* launcher-style overlays, so the Wayland limits that
  made Tauri awkward on GNOME mostly disappear.
- The remaining gap is layer-shell, and it is a known, small integration (option A above).
- Tauri keeps the Preact UI and palette logic we already have. `command-palette.ts` and
  `web-search.ts` make no `chrome.*` calls, and `actions.ts` only needs its `send()` replaced.

The only real alternative is GTK4 with `gtk4-layer-shell` in Rust (as
[hyprlaunch](https://github.com/azzuriel/hyprlaunch) does). It has better native support for
layer-shell, but the UI would be written again and the TypeScript logic could not be reused. Keep it
as the fallback if the WebKitGTK + layer-shell combination turns out unreliable.

## Plan

### Phase 0 — spike (1–2 days, throwaway) → decides A or B

**Done.** Built as `apps/desktop-palette-spike`, removed once phase 2 had taken over its window
code. Every check passed on Hyprland with the default
full-output layer surface, and the decision is **A (layer-shell)**. It led to two changes for
phase 2:
- A tiny client binary, `kaihuman-palette-toggle`, is what the key runs. It sends one line over a
  Unix socket and links only libc, 4–9 ms per call. The Tauri binary took ~30 ms per call because
  it loads WebKitGTK.
- The single-instance plugin is replaced by that socket (below).

1. Build a minimal Tauri v2 app: one 620×420 undecorated, transparent, non-resizable window with an
   input field.
2. Build it as a layer surface (A) and as a floating window with rules (B).
3. Bind `kaihuman-palette toggle` in `hyprland.conf` yourself.
4. Verify:
   - It opens centered on the *focused* monitor with two monitors, including a monitor with scaling.
   - It opens above a fullscreen window.
   - Typing goes into the input straight away.
   - Esc closes it and gives focus back to the previous window.
   - It opens in under 100 ms with the daemon running.
   - Transparency and rounded corners render correctly (WebKitGTK; test NVIDIA if you have one).
5. Test a Wayland build only. Force `GDK_BACKEND=wayland`, since some Tauri bundles fall back to
   X11.

### Phase 1 — share the palette (extension-only refactor, shippable by itself)

1. Move `command-palette.ts`, `web-search.ts` and the bookmark search into `packages/palette`, with
   their tests.
2. Replace the `chrome.runtime.sendMessage` in `actions.ts` with an `ActionPort` interface. The
   extension implements it with messaging.
3. Verify: the extension's tests and build pass unchanged.

**Done.** `@kaihuman/palette` holds the palette, web search, the bookmark type and search, and the
shared actions (`repoActions(port)`, `portHandlers(port)`).
- `src/protocol.ts` is the contract phase 2 implements: `PaletteProtocol` maps each request name to
  its fields and the response fields the palette reads.
- The extension's `ActionPort` (`src/palette/port.ts`) forwards requests to its service worker.
- The desktop app answers the same names from Rust. A backend that cannot serve a request (pinned
  tab groups before native messaging) rejects it, and the palette shows the message.

### Phase 2 — `apps/desktop-palette` (Tauri v2, Preact frontend)

1. **Process model.** Take this from the spike.
   - One resident daemon, started from Hyprland's autostart or a systemd user unit.
   - It listens on `$XDG_RUNTIME_DIR/kaihuman-palette.sock`.
   - The key runs the tiny `kaihuman-palette-toggle` client, which starts the daemon if none is
     running.
   - No single-instance plugin: it would put the Tauri binary's startup cost back on every key
     press.
2. **Window.** A layer surface (or a floating window if phase 0 picks B). It is created once and
   then shown and hidden, since the compositor centers it again each time it is mapped. It closes on
   Esc and after opening a result.
3. **ActionPort for the desktop.** Commands go through Tauri `invoke` to Rust.
   - The GitHub REST calls (bookmarks file, code search, note commits) move to `reqwest`, so there
     is no CORS and the token stays out of the webview.
   - The bookmark cache lives in `$XDG_CACHE_HOME/lifosy/`, with the same hour-long budget as the
     extension.
4. **Token.** Stored in the Secret Service with the `keyring` crate, and set once with
   `kaihuman-palette login`.
   - On Hyprland you must run a Secret Service yourself, for example `gnome-keyring-daemon` from
     `exec-once` or KeePassXC with its Secret Service integration.
   - If none is running, the palette says so and exits. It does not fall back to a plain-text file.
5. **Opening URLs.** Use `tauri-plugin-opener` (xdg-open). Bookmarks and web searches open in your
   default browser, and Hyprland focuses that browser's window.
6. **Config.** A small `$XDG_CONFIG_HOME/lifosy/palette.toml` for the repo and theme. The shortcut
   stays in your compositor config and is documented, not installed.
7. **Packaging.** An RPM from the Tauri bundler, or a plain `cargo install` for your own machine.
   Avoid AppImage: its GTK hook forces X11, and Wayland crashes have been reported.
8. **Verify.** Vitest for the shared logic, Rust unit tests for the GitHub client, and the phase 0
   checklist after each Hyprland update.

**Done** in `apps/desktop-palette`; its README covers building, `login`, the Hyprland binding and
what the desktop can and cannot do. Where it differs from the list above:
- **URLs** open through a plain `xdg-open` rather than `tauri-plugin-opener`, which spares a plugin
  and a capability for one call.
- **Settings** live in `palette.json`: the repository and the ones used before. There is no theme
  setting yet.
- **No RPM yet**: `pnpm run build:desktop` and copying the two binaries is the install.
- **Browser-only actions** (pinned tab groups, importing the browser's bookmarks) are hidden on the
  desktop, and their requests reject with a message.
- **Opening a bookmark is not counted** on the desktop yet; the extension still counts its own.

### Phase 3 — optional: talk to Chrome through native messaging

A native messaging host (`~/.config/google-chrome/NativeMessagingHosts/com.lifosy.palette.json`)
lets the desktop palette list and load pinned tab groups and open a URL in the current Chrome
window.

- Chrome must start the connection (`connectNative` from the service worker); the host then relays
  to the daemon over a Unix socket in `$XDG_RUNTIME_DIR`.
- This does not work with Flatpak Chrome without extra sandbox setup.

### Phase 4 — optional: a pipe mode like dmenu

Once there is an app, `kaihuman-palette --dmenu` (read choices from stdin, print the pick to stdout)
costs little. With it the palette can replace fuzzel or wofi in your own scripts.

## Risks to re-check

- The WebKitGTK + gtk-layer-shell combination is used by few projects. If phase 0 shows rendering or
  input bugs, use option B, or fall back to GTK4 + gtk4-layer-shell in Rust.
- Hyprland changes quickly: the move to a Lua config, and rule-name changes. Pin the rules you rely
  on in the README and re-run the checklist after each update.
- WebKitGTK and NVIDIA quirks. Keep `WEBKIT_DISABLE_DMABUF_RENDERER=1` ready as a workaround.
- Nothing starts a Secret Service on Hyprland by default. That is the most likely "works on my
  machine" failure.

## If this ever has to run on GNOME

GNOME has no layer-shell. There the palette falls back to option B, with mutter's
`center-new-windows` setting doing the centering and a custom shortcut calling
`kaihuman-palette toggle`. Focus-stealing prevention may show an "is ready" notification instead of
focusing the window. A small GNOME Shell extension would be needed to guarantee focus.
