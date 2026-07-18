# KH Capture (native-sdk) — experimental

A native desktop quick-capture window built with [native-sdk](https://native-sdk.dev)
(Zig core). It runs *in parallel* with the shipped `cli capture` + wofi overlay —
a place to evaluate native-sdk without touching the shipped flow.

## What it is — self-contained (no `cli` dependency)

A small window with a text field that, on submit, **POSTs the note directly to
the GitHub contents API** (`.kh/raw/<ts>-<slug>.md`). It reuses the CLI's saved
login rather than asking you to manage a token:

1. **Boot** — `initEffects` resolves `~/.config/cli/auth.json` (via `$HOME` /
   `$XDG_CONFIG_HOME`) and reads it with `fx.readFile`, extracting `token` and
   `active_repo`.
2. **Submit** — builds the OKF markdown + base64 JSON body and PUTs it with
   `fx.fetch` (`authorization: Bearer …`).
3. **On failure** — writes the note as markdown into the CLI's **own spool dir**
   (`~/.config/cli/spool/`) with `fx.writeFile`. The next `cli capture` / overlay
   run flushes it to GitHub — so the two capture paths rescue each other and no
   thought is lost, even offline.

This exercises the native-sdk surfaces that matter for the trial: markup UI, the
effects channel (file read/write + HTTP), and window lifecycle.

> Earlier this app shelled out to `cli capture` via `fx.spawn`. That simpler
> variant is in git history if you'd rather run the thin-shell version.

## ⚠️ Status: doc-derived, not yet compiled

Written from the published native-sdk docs; **not** compiled against a live
toolchain (no Zig/native CLI in the authoring environment). The plain-Zig std
parts (env, base64, epoch date, string scanning, JSON extraction) are idiomatic
and self-contained; the native-sdk symbols are inferred and marked `VERIFY(api)`.
Expect to reconcile a few names on first build. Fastest way:

```sh
npm install -g @native-sdk/cli
native init _scratch --template zig-core   # reference scaffold
# diff _scratch/src/main.zig + app.zon against this app's files
```

### Points to verify against the scaffold

| Where | Assumption to confirm |
|-------|----------------------|
| `main.zig` | `Effects` import path; effect-**key** type (string assumed) |
| `main.zig` | `canvas.TextBuffer(N)` / `canvas.TextInputEvent` names |
| `main.zig` | `fx.readFile` / `fx.writeFile` result type (`FileResult`, `.outcome`, `.bytes`) |
| `main.zig` | `fx.fetch` `.method = .put`, header struct shape, `Response` (`.outcome`, `.status`, `.body`) |
| `main.zig` | `std.time.epoch` field/method names for your Zig version |
| `main.zig` | `.init_fx` / `.update_fx` fields on `canvas.UiApp` |
| `app.zon` | permission strings for network + filesystem effects (`"net"`/`"fs"` are placeholders) |

## Build & run

```sh
cd apps/kh-capture-native
native dev            # hot-reloading dev window
native build          # release binary → zig-out/bin/kh-capture
native dev --core     # run the core under node, no window (logic only)
native check          # typecheck + validate .native / app.zon
```

Prerequisite: log in once with the CLI so `auth.json` exists —
`cargo build --release` in `apps/cli`, run `cli`, press `l` (log in) and `s`
(select your `.kh/` repo). The native app reads that file; it needs no separate
setup.

## Hyprland integration

The app doesn't declare always-on-top; Hyprland handles the overlay behaviour, so
it stays portable. Bind the binary and pin/float/center it:

```ini
# ~/.config/hypr/hyprland.conf
bind = SUPER SHIFT, K, exec, ~/.local/bin/kh-capture

windowrulev2 = float,  class:^(kh-capture)$
windowrulev2 = center, class:^(kh-capture)$
windowrulev2 = pin,    class:^(kh-capture)$
windowrulev2 = size 560 160, class:^(kh-capture)$
```

Run this on `Super+Shift+K` next to the script overlay on `Super+K` and compare.

## Automation server — the reason to pick native-sdk

native-sdk can expose the running window to an external agent (read the a11y
tree, dispatch input, assert on widget state) — the feature that would justify
this over Tauri for an AI-native setup. It's a **build flag**, not app code:

```sh
native build -Dautomation=true
# then drive it via the file-based protocol dir / the CLI:
native automate snapshot
native automate assert 'role=button name="Save"'
native automate widget-click canvas 1
```

A Claude Code skill does exactly this: **`kb-agent-capture`**
([`.claude/skills/kb-agent-capture/SKILL.md`](../../.claude/skills/kb-agent-capture/SKILL.md))
drives this window through the automation server — opens it, types a note,
clicks Save, and asserts `captured ✓` — so a Claude session can capture as an
agent action, and the same sequence serves as the app's end-to-end acceptance
test. Its driver is [`scripts/agent-capture.sh`](scripts/agent-capture.sh),
which falls back to `cli capture` when automation isn't available.
