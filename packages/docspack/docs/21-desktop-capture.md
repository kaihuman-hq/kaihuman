# Desktop quick capture

Desktop quick capture puts a thought into the knowledge base inbox `.kh/raw/` from a global hotkey, without opening a terminal. There are two implementations. The shipped one is a Bash overlay script, `apps/cli/scripts/kh-capture`, bound to `Super+K` in Hyprland, which pipes the text into `cli capture`. The experimental one is `apps/kh-capture-native`, a small native-sdk (Zig core) window that pushes to GitHub directly and is meant for `Super+Shift+K`. Both reuse the terminal CLI's login and active repo.

## Setting up the Super+K capture overlay on Hyprland
<!-- docspack: tags=install,hotkey,keybind,wayland,wlroots -->

On Wayland the compositor owns global shortcuts, so `hyprland.conf` binds the key and launches the overlay script.

1. Build the CLI and put it on `PATH`, then run `cli` once: press `l` to log in and `s` to select the repo that holds `.kh/`.

   ```sh
   cd apps/cli
   cargo build --release
   install -Dm755 target/release/cli ~/.local/bin/cli
   ```

2. Install the overlay script:

   ```sh
   install -Dm755 scripts/kh-capture ~/.local/bin/kh-capture
   ```

3. Append `apps/cli/scripts/hyprland-kh-capture.conf` to `~/.config/hypr/hyprland.conf`, or `source` it. Then run `hyprctl reload`. The default bind is:

   ```ini
   bind = SUPER, K, exec, ~/.local/bin/kh-capture
   ```

## How the kh-capture overlay script works
<!-- docspack: tags=wofi,fuzzel,zenity,notify-send,prompt -->

`kh-capture` shows a one-line prompt labelled `learned:` and pipes the result into `cli capture`. It uses the first prompt tool it finds:

1. `wofi --dmenu`
2. `fuzzel --dmenu`
3. `zenity --entry`

If none is installed, it sends a notification asking you to install one. Pressing `Esc` cancels and exits 0. Empty or whitespace-only input is ignored. On success, `notify-send` shows "Captured to knowledge base"; on failure it shows "kh-capture failed". Notifications are skipped when `notify-send` is missing.

Set `KH_CLI=/path/to/cli` when the `cli` binary is not on `PATH`.

## Capturing a multi-line note from a hotkey
<!-- docspack: tags=editor,floating terminal,kitty -->

The single-line overlay cannot take several lines. `hyprland-kh-capture.conf` has a commented-out alternative that runs `cli capture` with no input in a floating terminal, which opens `$EDITOR` for a full note:

```ini
bind = SUPER SHIFT, K, exec, kitty --class kh-capture -e cli capture
windowrulev2 = float,  class:^(kh-capture)$
windowrulev2 = center, class:^(kh-capture)$
windowrulev2 = size 720 320, class:^(kh-capture)$
```

Replace `kitty` with your terminal and keep `--class kh-capture` so the window rules match. Uncomment the lines to use it. This bind uses the same keys as the native app's suggested bind, so choose one.

## What happens to a desktop capture when offline

The overlay calls `cli capture`, which writes each note to the `spool/` directory in the CLI config directory (`~/.config/cli/spool/` on Linux) before pushing. If GitHub is not reachable, the note stays on disk. The next capture pushes the whole backlog to `.kh/raw/`, oldest first. The native app writes failed pushes into the same `spool/` directory, so either tool flushes the other's backlog. Run `/kb-ingest` in Claude Code to fold captured notes into the monthly journal and wiki.

## What the native kh-capture app is
<!-- docspack: tags=native-sdk,zig,experimental,kh-capture-native -->

`apps/kh-capture-native` is an experimental capture window built with native-sdk (Zig core). It runs next to the shipped `cli capture` overlay so native-sdk can be evaluated without changing the shipped flow. It does not call `cli`.

| File | Contents |
|---|---|
| `app.zon` | Manifest: id `com.kaihuman.kh-capture`, name `kh-capture`, one `main` window 560×160, permissions `view`, `window`, `net`, `fs`, capability `shortcuts` |
| `src/app.native` | Markup: title text, an autofocused input bound to `{draft}`, **Save** and **Dismiss** buttons, a `{status}` text |
| `src/main.zig` | Model, messages, effects and capture builders |
| `scripts/agent-capture.sh` | Automation driver and acceptance test |

The code has not been compiled against a live toolchain. native-sdk names that were inferred from docs are marked `VERIFY(api)` in the source and listed in the app's `README.md`. The `net`/`fs` permission strings are placeholders.

## How the native capture app saves a note
<!-- docspack: tags=github api,auth.json,fetch,spool -->

1. On boot, `initEffects` finds `$XDG_CONFIG_HOME/cli/auth.json`, or `~/.config/cli/auth.json`, and reads `token` and `active_repo`. Without them the status shows `no auth — run cli to log in and select a repo` or `auth.json has no active repo — run cli, press s`.
2. On submit (`Enter` or **Save**), it builds the same `<epoch-ms>-<slug>.md` file and frontmatter as `cli capture`.
3. It PUTs the base64 content to `https://api.github.com/repos/<owner>/<repo>/contents/.kh/raw/<file>` with commit message `note: capture via kh-capture`.
4. On HTTP 200 or 201, the status shows `captured ✓` and the window closes.
5. On failure, it writes the markdown to `<config dir>/spool/<file>` and shows `offline — saved locally, will sync via cli`.

The draft holds up to 280 characters. **Dismiss** closes the window.

## Building and running the native capture app

The app needs the native-sdk CLI (`npm install -g @native-sdk/cli`) and a prior `cli` login so `auth.json` exists.

```sh
cd apps/kh-capture-native
native dev            # hot-reloading dev window
native build          # release binary: zig-out/bin/kh-capture
native dev --core     # run the core under node, no window
native check          # typecheck and validate .native / app.zon
```

To reconcile the inferred API names, scaffold a reference app with `native init _scratch --template zig-core` and diff its `src/main.zig` and `app.zon`. Build output (`zig-out/`, `.zig-cache/`) is git-ignored.

## Binding the native capture app in Hyprland

The app does not declare always-on-top. Hyprland window rules float, center and pin it, so the app stays portable across compositors.

```ini
bind = SUPER SHIFT, K, exec, ~/.local/bin/kh-capture
windowrulev2 = float,  class:^(kh-capture)$
windowrulev2 = center, class:^(kh-capture)$
windowrulev2 = pin,    class:^(kh-capture)$
windowrulev2 = size 560 160, class:^(kh-capture)$
```

This path is the same as the overlay script's install path. Install the native binary under another name if you keep both.

## Letting an agent capture through the native window
<!-- docspack: tags=automation,kb-agent-capture,acceptance test,native automate -->

native-sdk can expose the running window to an agent when built with `native build -Dautomation=true`. `apps/kh-capture-native/scripts/agent-capture.sh` uses this to capture by driving the window:

```sh
agent-capture.sh "note text"
echo "note text" | agent-capture.sh
```

It launches `zig-out/bin/kh-capture` if needed, then runs `native automate wait`, asserts a `Save` button exists, types the text, clicks Save and asserts the status matches `captured`. Each step has a 15-second `timeout`. If `native`, the binary or any step fails, it falls back to `printf '%s\n' "$text" | cli capture`.

The `/kb-agent-capture` Claude Code command does the same from a knowledge-base repo. It is defined in `apps/console/src/lib/kb-skills.ts` and scaffolded into `.kh`-enabled repos as `.claude/commands/kb-agent-capture.md`.
