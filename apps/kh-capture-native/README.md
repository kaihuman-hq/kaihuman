# KH Capture (native-sdk) — experimental

A native desktop quick-capture window built with [native-sdk](https://native-sdk.dev)
(Zig core). It's the **Stage 2 experiment** that runs *in parallel* with the
working `cli capture` + wofi overlay — a place to evaluate native-sdk without
touching the shipped flow.

## What it is (and the deliberate design choice)

A **thin GUI over the tested `cli capture`**: a small window with a text field;
on submit it spawns `cli capture <text>` via native-sdk's `spawn` effect. The
Rust CLI keeps ownership of everything that's hard and already tested — GitHub
auth, the offline-safe local spool, retry/backoff — so this app:

- inherits offline-safety for free,
- never duplicates auth/push logic, and
- only exercises the native-sdk surfaces that matter for the trial: markup UI,
  the effects channel (`spawn`), and window lifecycle.

If the experiment graduates, the obvious next step is to drop the CLI dependency
and call the GitHub API directly from Zig via `fx.fetch`, reading the token from
the CLI's `auth.json` with `fx.readFile` (both are documented native-sdk
effects). The **automation server** — native-sdk lets an agent see and drive the
running window — is the feature that would make this worth choosing over Tauri.

## ⚠️ Status: doc-derived, not yet compiled

This app was written from the published native-sdk docs and has **not** been
compiled against a live toolchain (no Zig/native CLI in the authoring
environment). It's a faithful ~90% sketch. Expect to reconcile a few exact
symbol names on first build — every such spot is marked `VERIFY(api)` in
`src/main.zig` and `app.zon`.

The fastest way to reconcile: scaffold a throwaway app and diff the glue.

```sh
npm install -g @native-sdk/cli
native init _scratch --template zig-core   # reference scaffold
# compare _scratch/src/main.zig + app.zon against this app's files
```

### Points to verify against the scaffold

| Where | Assumption to confirm |
|-------|----------------------|
| `main.zig` | `Effects` import path (`canvas.Effects`?) |
| `main.zig` | Effect **key** type — string assumed; may be int/enum |
| `main.zig` | `canvas.TextBuffer(N)` / `canvas.TextInputEvent` names |
| `main.zig` | `spawn` exit payload type + `.code` field (`canvas.ProcessExit`?) |
| `main.zig` | `.update_fx` field on `canvas.UiApp` |
| `app.zon` | permission strings for subprocess spawn (`"command"`) + window |

## Build & run

```sh
cd apps/kh-capture-native
native dev            # hot-reloading dev window
native build          # release binary → zig-out/bin/kh-capture
native dev --core     # run the core under node with no window (logic only)
native check          # typecheck + validate .native / app.zon without building
```

Prerequisite: the `cli` binary must be on `PATH` and logged in once
(`cargo build --release` in `apps/cli`, install to `~/.local/bin`, run `cli`,
press `l` to log in and `s` to select your `.kh/` repo). See
[`../cli/scripts/README.md`](../cli/scripts/README.md).

## Hyprland integration

The app doesn't declare always-on-top; Hyprland handles the overlay behaviour, so
it stays portable. Bind the binary to a key and pin/float/center it:

```ini
# ~/.config/hypr/hyprland.conf
bind = SUPER SHIFT, K, exec, ~/.local/bin/kh-capture

windowrulev2 = float,  class:^(kh-capture)$
windowrulev2 = center, class:^(kh-capture)$
windowrulev2 = pin,    class:^(kh-capture)$
windowrulev2 = size 560 160, class:^(kh-capture)$
```

Run this on `Super+Shift+K` next to the script overlay on `Super+K`, and compare
the two side by side — that's the whole point of shipping it in parallel.
