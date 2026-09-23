# Native command palette for the desktop — study and plan

Status: research only, nothing implemented. Written 2026-09-23 for Fedora with GNOME on Wayland.
Everything below comes from documentation and issue trackers. None of it was tried on a Fedora
machine, so each phase starts with a spike that checks the risky assumptions first.

## Goal

A global shortcut opens the palette at the **center of the current monitor**, from any app, not only
from Chrome. It has the same content as the extension's palette: bookmarks, repo search, web search,
notes, and (through the extension) pinned tab groups.

## What constrains the design on Fedora

- **Wayland only.** Fedora 44 ships GNOME 50, which removed the X11 session. X11 apps still run
  through XWayland, but X11 key grabs there only fire while an X11 window has focus.
- **An app cannot register a global shortcut itself.**
  - `tauri-plugin-global-shortcut` (v2.3.x, on the `global-hotkey` crate) is X11-only on Linux.
    Wayland support through the portal is an open, unmerged PR (`global-hotkey` #162, #172).
  - GNOME has had the XDG `GlobalShortcuts` portal since GNOME 48. On GNOME 50 an app that is not a
    Flatpak must first register an app id (`host.portal.Registry.Register`). Electron and Chromium
    currently fail at that step (electron#51875).
  - What does work: a **custom keyboard shortcut in GNOME Settings** that runs a command. GNOME
    Shell handles that key itself. Ulauncher, Albert and Vicinae all rely on this.
- **An app cannot position its own window.** Wayland has no protocol for it. In Tauri,
  `center()`, `set_position()` and `always_on_top` silently do nothing on Wayland (tauri#10775,
  #14913). Centering is the compositor's decision. On GNOME:
  `gsettings set org.gnome.mutter center-new-windows true` centers *new* windows on the active
  monitor. So the window must be created again, or at least unmapped and remapped, each time the
  palette opens.
- **No layer-shell on GNOME.** `wlr-layer-shell` is what rofi 2.0, fuzzel, wofi, tofi, walker and
  anyrun need, and mutter does not implement it. rofi exits with "requires layer shell"; `rofi -x11`
  starts but gets no keyboard input. dmenu is X11-only. **So the dmenu family is not an option on
  GNOME.** It would only work on KDE or Sway.
- **Focus-stealing prevention.** Mutter focuses a new window only when it comes with a valid
  `XDG_ACTIVATION_TOKEN`. Otherwise the user gets an "*App* is ready" notification and the palette
  opens without focus. GNOME's own blog names "launched from a custom shortcut" as a case that hits
  this. **This is the biggest risk for any option that is not a GNOME Shell extension.**

## Options compared

| Option | Global key | Centered and focused | Reuses our TS | Weight | Effort |
| --- | --- | --- | --- | --- | --- |
| **Tauri v2 daemon + GNOME custom shortcut** | shortcut runs a CLI | mutter setting; focus is a risk | high (Preact UI and palette logic) | ~80–150 MB (estimate) | medium |
| GTK4 app (GJS/TS or Rust) | shortcut runs a CLI | best without an extension (GApplication forwards the token) | logic only, UI rewritten | low | medium–high |
| GNOME Shell extension (GJS + TS types) | native keybinding | exact center, guaranteed focus | logic only, no DOM | tiny | medium; breaks between GNOME versions |
| Vicinae (existing launcher) + our TS extension | its GNOME extension | good | high (React/TS extensions) | low–medium | **low**, but a young project from a personal COPR |
| rofi / fuzzel / dmenu + script | shortcut runs a CLI | **does not run on GNOME** | script only | tiny | low (KDE/Sway only) |
| Electron | portal broken on GNOME 50; shortcut | same as Tauri | highest | high | low–medium |

## Is Tauri the right choice?

**Yes, as the app that draws the palette, but not for its shortcut or window placement.** The UI is
a web page we already have: `command-palette.ts` and `web-search.ts` make no `chrome.*` calls, and
`actions.ts` only needs its `send()` replaced. Tauri keeps that code at a fraction of Electron's size
and runs fine on Fedora (WebKitGTK 4.1). The parts Tauri cannot do on Wayland are covered by GNOME:
the custom shortcut provides the hotkey, `center-new-windows` provides the placement, and a small
Shell extension can take over if focus proves unreliable.

## Plan

### Phase 0 — spike (1–2 days, throwaway) → decides go or no-go

1. Build a minimal Tauri v2 app that is one undecorated 620×420 window with an input field.
2. Add a GNOME custom shortcut (`Super+Space`) that runs `lifosy-palette toggle`.
3. Verify, on GNOME 49 and 50, with one and with two monitors:
   - The window opens centered on the monitor the pointer or focus is on.
   - The input has keyboard focus immediately, with no "is ready" notification.
   - It opens in under 150 ms while the daemon is running.
4. If focus fails, try forwarding `XDG_ACTIVATION_TOKEN` from the CLI to the daemon. If that fails
   too, go to phase 3 early.

### Phase 1 — share the palette (extension-only refactor, shippable by itself)

1. Move `command-palette.ts`, `web-search.ts` and the bookmark search into
   `packages/palette`, with their tests.
2. Replace the `chrome.runtime.sendMessage` in `actions.ts` with an `ActionPort` interface. The
   extension implements it with messaging.
3. Verify: the extension's tests and build pass unchanged.

### Phase 2 — `apps/desktop-palette` (Tauri v2, Preact frontend)

1. **Process model.** A daemon runs as a systemd user unit (`lifosy-palette.service`) and keeps the
   webview warm. The CLI `lifosy-palette toggle` talks to the daemon over D-Bus
   (`com.lifosy.Palette`) and passes the activation token along.
2. **Window.** Undecorated, no taskbar entry. It is created (or remapped) on every toggle so mutter
   centers it, and it closes on Esc or when it loses focus.
3. **ActionPort for the desktop.** Commands go through Tauri `invoke` to Rust.
   - The GitHub REST calls (bookmarks file, code search, note commits) move to `reqwest` in Rust, so
     there is no CORS and the token stays out of the webview.
   - The bookmark cache lives in `~/.cache/lifosy/`, with the same hour-long budget as the
     extension.
4. **Token.** Stored in the Secret Service (gnome-keyring) with the `keyring` crate. It is set once
   with `lifosy-palette login` (paste a token, or a later device-flow login). It is never written
   to disk in plain text.
5. **Opening URLs.** Use `tauri-plugin-opener` (xdg-open), so bookmarks and web searches open in
   the default browser.
6. **Setup script.** `lifosy-palette install` writes the gsettings custom keybinding, sets
   `center-new-windows`, and enables the user unit.
7. **Packaging.** RPM from the Tauri bundler. Avoid AppImage (reported Wayland crashes) and Flatpak
   (the single-instance plugin's D-Bus naming has caused Flathub rejections).
8. **Verify.** Vitest for the shared logic, Rust unit tests for the GitHub client, and a manual
   checklist from phase 0 on each GNOME release.

### Phase 3 — only if focus or centering is unreliable: a tiny GNOME Shell extension

About 50 lines of GJS. It owns the keybinding (`Main.wm.addKeybinding`), calls the daemon over
D-Bus, and then activates and centers the palette window on the monitor under the pointer. This is
the pattern Vicinae uses. The cost is re-testing it on every GNOME major version.

### Phase 4 — optional: talk to Chrome through native messaging

A native messaging host (`~/.config/google-chrome/NativeMessagingHosts/com.lifosy.palette.json`)
lets the desktop palette load pinned tab groups and open a URL in the current Chrome window.

- Chrome must start the connection (`connectNative` from the service worker); the host then relays
  to the daemon over a Unix socket.
- This does not work with Flatpak Chrome without extra sandbox setup.

## The lower-effort alternative

If owning an app is not the point, use **Vicinae** (COPR `scottames/vicinae`) together with its GNOME
extension, and write a Vicinae TypeScript extension that imports `packages/palette`. That gives
centering and focus on GNOME today, for about a week of work. The cost is depending on a young
project and a personal COPR.

## Risks to re-check

- The GlobalShortcuts portal on GNOME 50 and later, and Tauri's portal PR. Once they work, the
  custom shortcut can become an in-app setting.
- Fedora 45 / GNOME 51 is due around October 2026. Re-run the phase 0 checklist on it.
- WebKitGTK rendering and NVIDIA quirks. Keep `WEBKIT_DISABLE_DMABUF_RENDERER=1` ready as a
  workaround.
