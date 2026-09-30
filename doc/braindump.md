# Braindumps — study and plan

Status: phase 1 (the shared file format) is done (2026-09-30). Revised the same day: braindumps
are **not part of the command palette**. They get a dedicated window with its own key and its own
list.

## Goal

One key opens a small editor window with the cursor already in it. You type, then press Esc, and the
text is in the active GitHub repo. You do not open a new tab, the console or a separate text
editor. Open braindumps are listed on the extension's new tab page, where they can be read and
deleted.

**Success criteria**
- Key to typing in under 100 ms while the palette daemon runs.
- Nothing typed is lost: not offline, not when the window closes, not after a crash, not on a
  GitHub conflict.
- Within a minute of the last keystroke the text is a file in the repo.
- Opening a new tab after that shows the braindump, and one delete removes it everywhere.

## What exists today (and why none of it is this yet)

There are already six capture paths. The design must not add a seventh that does the same thing.

| Existing | Where it writes | Why it is not a braindump |
| --- | --- | --- |
| Desktop palette `>d` dumps (`dumps.rs`, `dumpMode` in `packages/palette/src/actions.ts`) | `$XDG_DATA_HOME/lifosy/dumps/<ms>.txt`, local, last 25 kept | **Closest match**: autosaving editor, one file each, list and reopen. But it is local only and lives inside the 620×420 overlay, which grabs the keyboard exclusively. |
| Palette "Add a note…", console `/quick-note`, start-page note box | Prepends `- text` to `.lifeos/dump.md` | One line into a shared file. No multi-line editing, and the file cannot be reopened. |
| `>q` capture, `cli capture`, `kh-capture`, `kh-capture-native` | `.kh/raw/<ms>-<slug>.md` | Create-only, with no later editing. `/kb-ingest` processes it into the wiki, which is a different lifecycle. |
| Console `/new` (DumpView) | Save wizard → `.kh/quicknotes/` | This is the main app in a tab: the friction you want to avoid. |

**Recommendation: braindumps are a dedicated window, not part of the command palette.** The
window reuses what `>d` already proved (autosave while typing, one file each, an empty one is never
created) and its local store (it becomes the offline copy). The files end up in the repo. The
palette gets no braindump action or mode. `>d` stays as it is for now; whether to retire it once the
window ships is open question 3.

## Decision 1 — one file per braindump, not one shared file

The recommendation is **multiple files**. The deciding reason is not the risk of overwriting.
Autosave to GitHub on one shared file breaks in several ways:

| | One file (`braindump.md`) | One file each (recommended) |
| --- | --- | --- |
| Autosave | Every save rewrites the whole shared file. Each save needs the latest sha, and two windows or devices keep producing 409s. | Each file has one writer. A conflict needs the same braindump edited in two places, which is rare. |
| Create | Read, prepend, write (sha needed) | A PUT with no sha: **create-only**, so it never overwrites anything |
| Delete from the new tab | Parse the file, cut out one section, rewrite, and race with the desktop autosave | `DELETE /contents/{path}` with that file's sha |
| Reopen and edit one | Find its section by some marker, which breaks when you edit the marker | Open the file by its id |
| Listing | Parse the file | The tree listing the new tab already syncs (`today.ts`) |
| Reading in GitHub or an editor | One long file | A folder of small files, ordered by name |

A single file only wins on "everything in one place". A folder gives you that on GitHub, and the new
tab list gives it to you in the browser.

**Layout**

```
.kh/braindumps/<created-ms>.md
```

- The **id is the creation time in ms**, the same id `dumps.rs` already uses. So the local copy and
  the repo file share a name, and the id check stays `digits only` (`is_dump_id`).
- **No slug in the name.** The first line changes while you type, and a rename is a delete plus a
  create (two commits, and a window in which the new tab can see neither file). The title is the
  first non-empty line, worked out when listing, just as `dumpTitle` does now.
- **Plain markdown, no frontmatter.** It is a scratch pad; the creation date is in the name.
  Frontmatter would be written on every autosave and would get in the way while typing.
- **`.kh/braindumps/`, not `.kh/raw/`.** `raw/` is `/kb-ingest`'s input, and ingesting is meant to
  be deliberate. A later "Promote to knowledge" action can move a braindump into `raw/` with the
  frontmatter from `knowledgeNote`.
- `.kh` is used even for repos that still have `.lifeos`, like `>q` does; `migrateAppFolder` moves
  the rest.

## Decision 2 — the window: a second Tauri window in the palette daemon

You suggested Chrome opening the console's editor. Here are the options side by side:

| Option | Time to typing | Friction and risk | Verdict |
| --- | --- | --- | --- |
| **A. `chrome --app=https://app.kaihuman.com/new`** (console PWA window with the Cascivo editor) | 0.3–0.5 s with Chrome running; 1–2 s cold. It loads the **whole console bundle** plus the auth store and repo tree every time. | It *is* the main app, with its sidebar and the save wizard. It is a browser window, tiled by Hyprland unless a rule floats it. It needs network access or the PWA cache. The URL has no "new braindump" route yet. | No: it is exactly what you want to avoid, only in a smaller frame |
| **B. `chrome.windows.create({type:'popup'})` from the extension** | Fast once asked | The desktop palette **cannot ask**: there is no native messaging, socket or localhost link to the extension. It only works from inside Chrome (Ctrl+Shift+K). | No as the main path. Maybe later as a browser-side entry. |
| **C. A second window in the resident `lifosy-palette` daemon** | **Under 50 ms**: the window is created hidden at start-up and only shown, the same trick as the palette | Token (keyring), repo setting, GitHub client (`github.rs`) and local dump store are already in this process. No network is needed to start typing. | **Yes** |
| D. `kh-capture-native` (Zig) | Unknown | Experimental and "not yet compiled"; a separate token file; create-only | No |

**C, in detail**

- **Window type: a normal toplevel, floated by a Hyprland rule, not a layer surface.** The palette
  is an overlay with *exclusive* keyboard focus. That is right for a 2-second launcher and wrong for
  a braindump: while writing you want to look at, copy from and click into other windows, then come
  back. A toplevel with the class `lifosy-braindump` stays in alt-tab and focus-follows. One rule
  makes it float, centred, at about 760×520:
  ```lua
  hl.window_rule({ class = "lifosy-braindump", float = true, center = true, size = { 760, 520 } })
  ```
  (This is option B from `native-command-palette.md`, which is the right option for *this* window.
  The README documents the rule the same way it documents the key binding.) Layer-shell with
  `KeyboardMode::OnDemand` is the fallback if you want no rule.
- **One window, reused.** It is created hidden at daemon start and shown and hidden after that, like
  the palette. It shows one braindump at a time. The window itself switches between them (see
  keys), so there is never a pile of windows to close.
- **Editor: a plain `<textarea>`, not `@cascivo/editor`.** The palette's own dump editor is already
  a textarea. Cascivo's `CodeEditor` is a textarea with a highlight layer over it, and it is
  React-first: the desktop app would need Preact, `preact/compat`, the signals aliases and Cascivo's
  CSS, in an app that has no framework at all today. Markdown highlighting adds little to prose you
  are typing in a hurry. If you still want it, it can be added later behind the same
  `EditableText`-like interface.
- **How it opens: only by its own key.** Add `Command::Braindump` to `lib.rs` and let
  `lifosy-palette-toggle braindump` show the window with a *new* empty braindump:
  `bind = SUPER SHIFT, D, exec, lifosy-palette-toggle braindump`.
  This is the no-friction path: one chord, a 4–9 ms client, and the window already exists. The
  palette is not involved. The window only shares the daemon process with it, for the token, the
  repo setting and the GitHub client.
- **Switching is inside the window.** ⌃O swaps the text area for a list of the open braindumps
  (repo and local, newest first, filtered as you type); ⏎ opens one, Esc goes back to the text.
- **Keys in the window**

  | Key | Action |
  | --- | --- |
  | Esc | Flush the save and hide the window. The text stays; nothing asks "save?" |
  | ⌃N | New braindump |
  | ⌃O | The window's own list of braindumps, to switch |
  | ⌃⏎ | Copy all and hide, as in the dump editor now |
  | ⌃⌫ on an empty text | Delete this braindump |

  The window title shows the braindump's title and its sync state (`saved locally`,
  `synced 12:04`, `offline — will retry`).

## Decision 3 — saving: local first, repo shortly after

Two stages, because "never lose a keystroke" and "don't make a commit per keystroke" pull in
opposite directions:

1. **Locally, every 400 ms** (what `>d` does today) to
   `$XDG_DATA_HOME/lifosy/dumps/<id>.txt`. This is the source of truth while you type.
2. **To GitHub**, one braindump at a time, in order:
   - when the window hides (Esc, ⌃⏎) or you switch braindumps;
   - after **30 s without typing**;
   - at most **once every 2 minutes** while you keep typing.

   Typical cost: one or two commits per braindump. The commit message is
   `braindump: <title>`.

**Sync rules**, run in Rust next to `dumps.rs` (a new `braindumps.rs`). A small sidecar
`<id>.json` stores `{ sha, syncedHash }` per dump.

| Situation | What happens |
| --- | --- |
| First push | PUT with no sha (create-only), then keep the returned sha |
| Later push | PUT with the stored sha, then keep the new sha |
| Text is empty and was never pushed | Nothing is created (as today) |
| Text cleared by you | DELETE with the sha, then remove the local file |
| **409 / 422** (changed elsewhere) | Read the remote copy. If it equals what we last synced, retry with its sha. Otherwise the local text is written as a **new** braindump (`… (conflict copy)`), so both versions survive |
| **404 on update** (deleted on the new tab) | If the local text has not changed since the last sync, accept the delete and drop the local copy. If it has, push it again as a new file, because you typed after deleting |
| Offline / 5xx | Keep the file dirty and retry with backoff on the next save, show and daemon start (the same idea as the CLI spool) |
| Repo switched | Braindumps are tied to the repo that was active when they were created (stored in the sidecar), so switching repos never moves a half-written dump |

**The local limit.** Today the 26th dump is deleted. With the repo holding the history, only keep
local copies that are *unsynced* or among the 25 most recent. **Never** delete an unsynced one.

## Decision 4 — the new tab page

- **Listing.** Extend the worker's tree sync (`background/today.ts`): add the folder prefix
  `.kh/braindumps/` next to `TODAY_SUFFIXES`, so the conditional `git/trees/HEAD` request and the
  "read only changed blobs" logic apply as they are. The cache gains `braindumps: { path, sha, title,
  text, createdAt }[]`. No new GitHub request is needed for a new tab.
- **Freshness.** The cache refreshes once an hour; a braindump written a minute ago would be
  missing. When the new tab opens and the cache is older than about 60 s, refresh just the tree with
  `If-None-Match`. An unchanged tree returns 304, which GitHub does not count against the rate
  limit. The page renders from the cache first and updates when that returns.
- **Widget.** A **Braindumps** section in the right column above the capture box, built from
  `SectionHead` plus the `ReadLater` list pattern in `Today.tsx`. Each row shows the title, a
  relative age and the first two lines. A click expands the full text read-only. Two buttons:
  - **Delete** (click → "Delete?" → click). It removes the row at once, sends
    `DELETE_BRAINDUMP { path }` and puts the row back with the error if the commit fails (as
    `togglePin` does).
  - **Open in console** (`consoleFileUrl(path, repo)`) for editing in the browser. The new tab
    cannot open the desktop window, because there is no channel to it (see Phase 3 of
    `native-command-palette.md`).
- **Worker.** Add `githubDeleteFile(token, repo, path, sha)` next to `githubWriteFile`.
  `DELETE_BRAINDUMP` re-reads the sha (a desktop autosave may have changed it) and deletes. The path
  is checked against `^\.kh/braindumps/\d{1,20}\.md$` because it comes from a page.
- **"Open" braindumps** means every file in the folder. Deleting is how you say you are done.
  (Git history keeps them, so a delete is not a loss.)

## Plan

Each phase ships and is checked on its own.

1. **Shared file format** (`packages/formats/src/braindumps.ts`). **Done.**
   - `BRAINDUMP_FOLDER`, the branded `BraindumpId`, `braindumpPath(id)`, `braindumpIdOf(path)`
     (the only way from a path to an id; anything outside the folder, in a subfolder or not all
     digits is `null`), `braindumpCreatedAt(id)` and `braindumpTitle(text)`.
   - It lives in `@lifosy/formats`, next to the other repo file formats, because the new tab page
     and the braindump window both need it and the palette does not. The palette is unchanged.
   - → verified: vitest (paths, refused paths, titles), tsc and biome clean; the palette,
     extension, desktop and console typecheck against it.
2. **Desktop sync** (`apps/desktop-palette/src-tauri`)
   - `github.rs`: `delete(path, sha, message)`.
   - `braindumps.rs`: the local store (from `dumps.rs`) plus the sidecar, the push queue and the
     rules table above.
   - The window's requests (`LIST_BRAINDUMPS`, `SAVE_BRAINDUMP`, `DELETE_BRAINDUMP`) in a small
     protocol of its own, not in `PaletteProtocol`, routed next to `requests.rs`. The path check is
     mirrored in Rust with the same cases as `braindumps.test.ts`. Local `>d` dumps keep working.
   - → verify: Rust tests against a stand-in API (`LIFOSY_GITHUB_API`) for create, update, 409 with
     an unchanged remote, 409 with a changed remote (conflict copy), 404 with and without local
     edits, and offline then retry. `cargo clippy` and `fmt` clean.
3. **Desktop window**
   - A second `WebviewWindowBuilder` (`braindump`, class `lifosy-braindump`, hidden, decorated or
     not, resizable) and a `braindump.html` Vite input with a small TS entry (textarea, status line,
     keys).
   - Add the label to `capabilities/default.json`. Add `Command::Braindump` and the toggle client
     argument. If the palette happens to be open, it is hidden first (it holds the keyboard).
   - Document the key binding and the window rule in the README.
   - → verify: Rust tests for the new `Command` parsing; the built UI driven in Chromium with the
     stubbed Tauri bridge (new → type → Esc → reopen from ⌃O → delete). The Hyprland checklist:
     opens floating and centred on the focused monitor, typing works at once, alt-tab away and back,
     Esc returns focus.
4. **New tab** (`apps/browser-extension`)
   - `githubDeleteFile`, the braindump folder in `today.ts`, the 60 s tree refresh on open,
     `DELETE_BRAINDUMP` in `types.ts` and the worker, and the `Braindumps` widget.
   - → verify: worker tests (listing from the tree, delete with a fresh sha, a bad path refused) and
     `StartPage.test.tsx` (renders the list, delete is optimistic and rolls back on failure).
5. **Docs**: `features.md`, `documentation.md`, the desktop README, the extension README, and
   `progress.md`.

## Open questions for you

1. ~~What is "the current GitHub repo"?~~ Answered: the palette's **active repo** (`palette.json`,
   switched with "Switch repository…"), which is also the repo the new tab page reads.
2. **The desktop and the extension keep their active repo separately** (keyring + `palette.json`
   vs `chrome.storage.local`). They must point at the same repo, or the new tab will not show what
   the desktop wrote. Is that already true on your machine, or should syncing the active repo
   between the two be part of this?
3. **The palette's `>d` dumps.** With braindumps out of the palette, `>d` is a second scratch pad.
   Once the window ships, should `>d` (a) go, with its local dumps uploaded once as braindumps, (b)
   go, with its dumps left to age out, or (c) stay, as a local-only pad for text that must never
   reach GitHub (pasted secrets, for example)? The recommendation is (b).
4. **Commit noise.** One or two commits per braindump on the default branch is fine for a private
   data repo. Would you rather have a dedicated `braindumps` branch? It is cheap in the desktop app
   but makes the new tab listing read a second tree.
