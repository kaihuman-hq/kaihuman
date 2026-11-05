# Cross-device sync analysis (console PWA)

Date: 2026-11-05. Analysis only; no source changed.

**Report:** a user created and edited files in the desktop PWA. The mobile PWA showed them only after a long delay, and it seemed to overwrite some desktop changes.

**Short answer:** GitHub is the only shared state. There is no queue, no polling and no refresh when the app resumes. A file that is already open in memory is never read again. When the mobile app saves its stale copy, GitHub answers 409. The store then gets the new sha and saves the stale content again ("user wins"). That is the overwrite. The delay happens because the desktop pushes edits late, and because the mobile app pulls only on a cold start or a repo change.

Line numbers refer to `packages/core/src/stores/github-file.store.ts` (**store**) and `packages/core/src/services/github.service.ts` (**service**) at commit `e73a206`, unless a file is named.

## How sync works today

- Write path: an edit goes to `updateFileContent` (store:303). This updates memory, sets an in-memory dirty flag and writes to IndexedDB after 500 ms. `saveFile` (store:403) then sends one Contents API `PUT` with the sha held in memory (service:222–247). There is one commit per file and no queue. Failures are not replayed.
- Read path: `loadTree` (store:88) reads the branch ref and the recursive tree. `openFile` (store:194) shows the IndexedDB copy first, then revalidates it with a Contents API `GET`.
- Service worker: Workbox only precaches the app shell. `runtimeCaching` matches only `127.0.0.1:4000` (`apps/console/vite.config.ts:26-31`). **The service worker does not cache GitHub API responses. This cause is ruled out.**
- Browser HTTP cache: GitHub GETs carry `Cache-Control: private, max-age=60`. Only `getHeadSha` and `commitFiles` bypass this cache (`noStore`, service:10-17, 348-357, 379-384).

## Root causes, ranked by likelihood × impact

### 1. A 409 conflict is resolved as "user wins", which is a blind overwrite (critical: the overwrite itself)

- store:499-519: on `409`, the store fetches the latest sha and keeps the local content. Then `continue` sends the stale text again with the fresh sha. The comment there says "User Wins".
- `resolveConflict('keep_local')` does the same thing deliberately (store:353-365).
- `upsertRepoFile` (service:457-471) also reads the current sha first and then overwrites. Quick notes and push-notification files use it.
- The optimistic-concurrency check that GitHub gives us (`sha` on PUT) is thrown away. Every stale save turns into a lost update.

### 2. Open files are never revalidated, and nothing refreshes on resume (high: this causes the stale state that cause 1 then writes)

- Callers open a file only when it is not in memory yet, for example `if (!openFiles[path]) openFile(path)` (`packages/ui/src/LifeOS/Templates/KanbanBoard.tsx:1228-1232`). `FileViewer` calls `openFile` only on mount (`apps/console/src/components/FileViewer.tsx:35-40`).
- `loadTree` runs only when the repo changes (`apps/console/src/pages/Dashboard.tsx:113-122`) or when a page mounts with an empty tree.
- The console has no `visibilitychange`, `focus`, `online` or interval listener (grep: the only `visibilitychange` is in `TimezoneWidget`).
- A mobile PWA that is resumed from the background keeps its old `openFiles`, with old content and old sha, for hours. The next edit on mobile (one Kanban toggle, one keystroke) serializes the **whole stale file**. Then cause 1 forces it onto GitHub.
- New desktop files appear on mobile only after the operating system kills the PWA and it starts cold.

### 3. The desktop pushes edits late, and unsaved edits are dropped on reopen (high: the delay, and silent loss)

- The editor pushes only on an explicit save or on a **2-minute** autosave interval (`apps/console/src/components/editor/CodeMirrorEditor.tsx:93-107`). Nothing flushes the edit on `pagehide` or `visibilitychange`.
- `dirtyFiles` is memory-only (store:57). After a reload, the IndexedDB copy holds the unsaved text with the old sha, but no dirty flag. `openFile` sees that the content differs and takes the else-branch (store:258-283). It **replaces the local edits with the remote version**. The conflict branch (store:243) needs the dirty flag, so it never fires. The IndexedDB "survive a crash" write in store:325-348 therefore cannot be recovered.
- When a desktop window is closed or suspended within 2 minutes of an edit, the edit never leaves the device.

### 4. Reads go through the 60-second HTTP cache (medium: widens the race windows)

- `fetchRepoTree` reads `heads/<branch>` **without** `noStore` (service:80-85). For up to 60 seconds after a commit, a reload can list the old tree.
- `getFileContent` (service:118-141) is cacheable. `openFile` revalidation and the 409 retry (store:505) both use it. For this reason:
  - the "fresh" sha in the retry can still be stale, so the store returns 409 up to 3 times. Then it shows "Could not save … after 3 attempts" (store:530-535) and does not retry later.
  - `openFile` can confirm a stale copy as current.
- `repo-files.ts:170-173` already documents this hazard for by-path reads. The store does not apply that guard.

### 5. Failures are surfaced but not retried, and the app has no offline queue (medium)

- Errors land only in `error.value` (store:530-533). Most callers call `saveFile` without awaiting it or checking the result (for example `layout.store.ts:219-220` and the Kanban handlers in `KanbanBoard.tsx:1315-1382`).
- When a save fails because the device is offline or the app was suspended mid-`fetch`, the file stays dirty in memory only. There is no replay when the app is back online. After a reload, cause 3 discards the edit.

### 6. Smaller contributors (low)

- Tree "smart merge" resurrection (store:150-169): files that are cached in IndexedDB but missing remotely are kept. Files that the desktop deleted or renamed can come back on mobile. Editing such a file then re-creates it, or fails with 409, which cause 1 then overwrites.
- Multi-file operations are separate commits. Examples are a Kanban move (`KanbanBoard.tsx:1415-1418`) and `renameFile` (store:861-907, save then delete). A suspension between the two commits leaves duplicated or missing items. Atomic `commitFiles` exists (service:370) but these paths do not use it.
- Concurrent writes on the branch: `commitFiles` handles a non-fast-forward ref update correctly (409 or 422 → `ConflictError`, service:425-434). Only business writes and `syncKB` use `commitFiles`. Contents API PUTs from two devices to *different* files are serialized by GitHub and are safe. PUTs to the *same* file are protected only by the sha, which cause 1 bypasses.

## Reproduction scenario

1. Open the same `*.todos.md` Kanban board on desktop and mobile. On mobile, send the PWA to the background.
2. On desktop, add todo A and save, so GitHub gets sha S1. Create a new file F.
3. Resume mobile without killing it. A is missing and F is missing (cause 2).
4. On mobile, toggle any todo. `saveFile` sends a PUT with the old sha S0 and gets 409. It reads the sha S1 (or S0 from the HTTP cache, then retries) and sends a PUT with the stale text. **Todo A is gone from GitHub** (cause 1).
5. Variant for cause 3: on desktop, type in the editor and close the window within 2 minutes. The edit never reaches GitHub. Reopen the window: the edit is silently replaced.

## Recommended fix design

1. **Never resolve 409 blindly.** On 409 (or 422 for a sha mismatch), read the remote copy with `cache: 'no-store'`. Then try a three-way merge: the base is the content at the sha we held, then local, then remote. Formats with list semantics (todos, logs, read-it-later) get a structural merge. Other files use a line diff3. If the merge is clean, save the result with the remote sha. If not, fill `fileConflicts` and stop. Remove `upsertRepoFile`'s read-then-overwrite where the caller only appends, and give those files unique paths, as raw notes already have. This needs the base content: keep `{baseSha, baseContent}` next to the working copy.
2. **Revalidate on resume.** Add a `syncNow()` that runs on `visibilitychange → visible`, `focus`, `online` and a slow interval (60–120 s while visible). It reads the head with `getHeadSha` (no-store) and skips the work if the head did not change. Otherwise it reloads the tree from that commit (`fetchRepoTree(..., { commitSha })`, which is immutable and needs no cache bypass). For every open file whose tree sha differs, it refreshes the file when it is clean and three-way merges it when it is dirty. Stop the `if (!openFiles[path])` pattern from defeating this.
3. **Make dirty state durable and flush early.** Persist `{dirty, baseSha, baseContent}` in IndexedDB. On `openFile`, an IndexedDB entry that is marked dirty is never replaced. It goes through the merge in fix 1 instead. Save after a short debounce (2–5 s) instead of every 2 minutes, and flush on `visibilitychange → hidden` and on `pagehide`.
4. **Read through the no-store path.** Use `noStore` for `fetchRepoTree`'s `getRef`. Read file content by blob sha from the tree (`getBlobBytes`, which is immutable), or with `cache: 'no-store'`. Do not use cacheable by-path reads.
5. **Use a durable outbox.** Keep an IndexedDB queue of dirty paths, replayed on `online`, on resume and at startup, with backoff. Every replay goes through fix 1, so stale content can never be force-pushed. Show a "N unsynced" indicator.
6. Low priority: use `commitFiles` with `expectedHeadSha` for moves and renames. Limit the smart-merge resurrection to entries marked "created locally, not yet pushed" (`sha === ''`).

## Test plan

Use Vitest with the in-memory GitHub service (`github.service.memory.ts`), extended so it can return 409 on a sha mismatch and serve stale reads.

- Regression for cause 1: device A saves v1. Device B, holding v0, edits and saves. Expect a merged result, or a conflict with v1 still on the remote. Never expect B's v0-based text alone.
- Regression for cause 3: edit, simulate a reload by building a new store on the same IndexedDB (`fake-indexeddb`), then `openFile`. Expect the edit kept and marked dirty. Add a second case where the remote changed meanwhile: expect a merge or a conflict.
- Cause 2: a remote commit, then a `visibilitychange` event. Expect the tree and clean open files updated, and dirty files merged.
- Cause 4: a stale-cache stub returns the old sha by path. Expect the retry to use the no-store read and succeed in one attempt.
- Cause 5: the save fails offline. Fire `online`. Expect the outbox to replay through the merge.
- Merge units: todo, log and read-it-later structural merges (both sides add, one side deletes), and line diff3 for markdown.
- Manual check on two devices: run the reproduction scenario above on an iOS and an Android PWA, with backgrounding and airplane-mode toggles.
