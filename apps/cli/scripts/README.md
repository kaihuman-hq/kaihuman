# Desktop quick-capture (Hyprland / wlroots)

A `Super+K` overlay that captures a thought straight into your knowledge base
inbox (`.kh/raw/`). It reuses the CLI's auth and push logic — no separate app.

On Wayland the compositor owns global shortcuts, so the hotkey is bound in
`hyprland.conf` and just launches the overlay; the overlay pipes your text into
`kaihuman capture`, which spools it locally (offline-safe) and pushes to GitHub.

## Setup

1. **Build & install the CLI** so `cli` is on your `PATH`:

   ```sh
   cd apps/cli
   cargo build --release
   install -Dm755 target/release/kaihuman ~/.local/bin/kaihuman
   ```

   Log in and select a repo once by running `cli` (`l` to log in, `s` to select
   the repo that holds your `.kh/` knowledge base).

2. **Install the overlay script:**

   ```sh
   install -Dm755 scripts/kh-capture ~/.local/bin/kh-capture
   ```

   It uses `wofi`, falling back to `fuzzel`, then `zenity` — install whichever
   you prefer (`wofi` matches the classic overlay look on wlroots).

3. **Bind the hotkey** — append `scripts/hyprland-kh-capture.conf` to
   `~/.config/hypr/hyprland.conf`, or `source` it, then reload Hyprland
   (`hyprctl reload`). Default bind: `Super+K`.

## Usage

- `Super+K` → type a line → Enter. Done. A notification confirms the capture.
- **Multi-line**: uncomment the floating-terminal bind in the config — it runs
  `kaihuman capture` with no input, which opens `$EDITOR` for a full note. Hyprland's
  window rules float and center it like an overlay.
- **Headless / scripting**: `kaihuman capture "some text"`, or pipe:
  `echo "text" | kaihuman capture`.

## Offline behaviour

Every capture is written to a local spool (next to `auth.json` in the CLI's
config dir) **before** the network push. If you're offline or GitHub is
unreachable, the note is safe on disk; the next capture flushes the whole
backlog to `.kh/raw/`, oldest first. You never lose a thought.

Run `/kb-ingest` in Claude Code to fold captured notes into the monthly journal
and wiki (see the repo's Cheatsheet page).
