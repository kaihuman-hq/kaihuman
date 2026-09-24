# What Vicinae's extensions suggest for the palette

[Vicinae](https://github.com/vicinaehq/vicinae) is a Raycast-like launcher for Linux with a store of
community extensions. This note looks at its extension list (Sep 2026) and asks which ideas fit the
Lifosy palettes: the browser extension's and the desktop one on Omarchy/Hyprland. None of this is
implemented unless its heading says done; it is input for `doc/roadmap.md`.

## What the list covers

Grouped from about 100 extensions:

| Group | Vicinae extensions |
| --- | --- |
| System and desktop | Bluetooth, Wifi Commander, PulseAudio, Power profile, Systemd, Process Manager, Podman, Hyprland monitors / keybinds, GNOME and KDE settings, GNOME Extensions, Do Not Disturb, Coffee (keep awake), GPU Screen Recorder, KDE Connect, Mullvad / Proton VPN, wallpaper switchers (Wallhaven, awww) |
| Packages | Arch Packages, pacman updates, Flathub, Nix, npm, Nerd Fonts, ProtonDB |
| Projects and files | Fuzzy Files, zoxide recent directories, VS Code recent, JetBrains recent projects, Git-based projects, ssh hosts |
| Secrets | Bitwarden (rbw), KeePassXC, pass, OTP, SuperGenPass |
| Converters and text | Color, Number and Case converters, Lorem Ipsum, HTML Symbol Finder, Kaomoji, SpongeBob text, Clean Keyboard |
| Lookup | Wikipedia, Wiktionary, Dashboard Icons, IT Tools, FreeTube / YouTube |
| Media | Player Pilot (MPRIS), Spotify |
| Time | Timer, Reminders, Agenda |
| AI and prompts | PromptDeck, Ollama Wordsmith, Bedrock Chat, Agent Skills |
| Own commands | Custom Commands, Simple Bookmarks, Chromium bookmarks |
| Browser | Firefox, Chromium bookmarks, Manage Google containers |

The palette already covers several of these: `>p` prompts (PromptDeck), `>x` commands (Custom
Commands), bookmarks (Simple / Chromium Bookmarks), `>a` and the search engines (Wikipedia,
YouTube), `>n` npm, `>r` / `>g` GitHub.

## Recommendations

Ordered by value for the effort. The first group needs no new surfaces or permissions.

### 1. Converters that work offline, on both surfaces — done

Color (`#ff8800` ⇄ `rgb()` ⇄ `hsl()`), number bases (`0x1f` ⇄ `31` ⇄ `0b11111`), case
(`camelCase`, `snake_case`, `kebab-case`, Title), timestamps (epoch ⇄ ISO, in the local zone), a
calculator, Lorem Ipsum, and a symbol / emoji / kaomoji finder. Each one is a pure function in
`packages/palette`. ⏎ copies, as `>t` does, and there are no requests or keys. Two ways to offer
them:
- inline, like the Translate offer: typing `#ff8800` or `12*7` shows the result above Web;
- behind prefixes, for example `>k` case and `>#` symbols. The prefixes that are left are getting
  scarce (see 6).

### 2. GitHub work that needs you — done (`>w`)

The extension already has a GitHub token and `>r` / `>g`. A `>`-mode for review requests, PRs
assigned to you, and failing checks on your PRs would be one search request
(`is:open review-requested:@me` …). That is the most useful part of Vicinae's GitHub extension.

### 3. Recent projects (desktop)

VS Code / JetBrains recent projects, zoxide directories and the git repositories under `~/code` in
one list. ⏎ opens the project in the editor, and ⇥ offers "open a terminal there" and "open on
GitHub". The desktop already opens ghostty for `>x`. Rank the list with the same counts as `>r`.

### 4. Omarchy desktop controls: delegate, don't rebuild

Bluetooth, Wi-Fi, audio output, power profile, monitors, Do Not Disturb, keep awake, screen
recording and VPN are already in Omarchy's menus and scripts (`omarchy-*`). Vicinae writes an
extension for each one. The palette can instead ship a default `.commands.md` (or a `>o` mode) that
runs those scripts, so `>x` already covers them. A **Hyprland keybinds** list, parsed from the
config, is the one worth building: "which key was that?" is a real launcher question.

### 5. Live results for link tools

Wikipedia, Wiktionary and dictionary extensions show the answer in the launcher. Today `>e` LEO and
the Wikipedia engine only open a page. An optional `results` endpoint in a tool's settings
(JSON: title, subtitle, URL) would let a tool list hits, as `>g` does. That only works for APIs
with CORS or through the service worker / Rust backend, so keep it opt-in per tool.

### 6. More room for prefixes — done

`b p t r g f x d c u a` plus `l e m n i` left few letters, and a longer prefix was shadowed as soon
as its first letter was a mode (`>le` never got past `>l`). Now a prefix is entered as it is typed
unless a longer prefix starts with it; then it waits for a space (`>l ` next to `>le`), and the
hint says so.

### 7. Secrets: a separate decision

Bitwarden (rbw), `pass`, KeePassXC and OTP are popular in Vicinae and would make the desktop
palette a daily tool. They put secrets on the clipboard, so they need to be desktop only, clear the
clipboard after a timeout, never go through the extension or the repository, and come after a
security review. Recommended only as `rbw` / `pass` wrappers on the desktop.

### 8. Tool packs in the settings widget

Vicinae's store installs extensions. Lifosy's link tools are data, so the equivalent is a curated
gallery in the Command Palette Settings widget: one-click packs such as "Arch" (Arch packages, AUR,
Arch Wiki), "Dev" (MDN, crates.io, pkg.go.dev, Docker Hub) and "German" (LEO, dict.cc, DWDS). The
"add back a default" buttons are the first step toward this.

### Not recommended

Wallpaper switchers, GNOME / KDE settings, SpongeBob text, Google containers, ProtonDB and Nerd
Fonts browsing are either desktop-environment specific (Omarchy is Hyprland) or too niche for the
palette. Media control (MPRIS / Spotify) is borderline: `playerctl` in a `.commands.md` covers it.
