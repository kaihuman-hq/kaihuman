# Work Streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A side panel in the browser extension with pinned work streams, an automatic "needs
you" inbox from GitHub, My open PRs, a start-page summary card and a toolbar badge.

**Architecture:** The file format and every edit to it are pure functions in `@kaihuman/formats`
(`streams.ts`). In the extension, new modules under `src/background/work/` poll GitHub
(Notifications REST + one GraphQL query), build a snapshot in `chrome.storage.local`, and write the
streams file through a queue of operations. The service worker only wires these modules to alarms,
messages, the command and the context menu. The side panel (`src/sidepanel/`) and the start-page
card read storage and send messages; they never call GitHub.

**Tech Stack:** TypeScript strict, Preact + `preact/hooks`, Tailwind, Vitest (jsdom), CRXJS
(Manifest V3), GitHub REST + GraphQL v4.

**Spec:** `doc/work-streams.md` — read it first; this plan argues from it.

## Global Constraints

- Node/TS code is ESM; relative imports in `packages/formats` use `.js` extensions (match
  `packages/formats/src/index.ts`); the extension imports without extensions (match its files).
- No new dependencies. No new `host_permissions` (`https://api.github.com/*` is already there).
- Done means `pnpm run check` (Biome + tsc) is clean and `pnpm -r test` passes. Never skip tests.
- Comments say why, not what. Prefer discriminated unions and branded types over runtime flags.
- Streams file path: `.kh/browser.streams.json`, `"version": 1`, 2-space JSON plus a final newline.
- Only `http:` and `https:` URLs are pinned or opened.
- Done items are pruned **14 days** after `doneAt`.
- Notifications poll: every **1 minute**, or `X-Poll-Interval` seconds if longer.
- GraphQL refresh: every **5 minutes**, every **1 minute** while a side panel is open, and at once
  after notifications changed.
- Backoff on offline/5xx: **1, 2, 4, 8, 15** minutes (cap 15). Write conflicts: **3** retries.
- Streams file cache TTL: **15 minutes** (same as `PINNED_TABS_CACHE_TTL_MS`).
- Keyboard command: `pin-current-tab`, suggested `Alt+Shift+P`.
- Storage keys (`chrome.storage.local`): `workSnapshot`, `streamsCache`, `streamsWriteQueue`,
  `streamsSaveError`, `workPollState`, `workDismissed`, `workToken`, `workUi`.
- Every change gets a dated entry at the top of `doc/progress.md` (Task 14 writes it once for the
  feature; earlier commits do not need one each).

## Decisions made while planning (deviations from the spec)

- **Inbox searches live in the extension** (`src/background/work/queries.ts`), not in
  `GITHUB_WORK_QUERIES`. That table also drives the palette's `>gw` and is mirrored in
  `apps/desktop-palette/src-tauri/src/github.rs`; widening it would change both. The inbox reuses
  the three existing strings and adds two. Task 14 corrects the spec's sentence.
- **OAuth approval link** is `https://github.com/settings/applications` (the OAuth client id is a
  Worker secret, not in the repo; that page lists kaihuman with a per-org **Request** button). The
  SSO link is `https://github.com/orgs/<org>/sso`.
- **Non-PR/issue notifications** (discussions, releases, check suites) appear under New activity
  with key `thread:<id>` and the repository URL, so a mention in a discussion is not lost.
- **More than 50 pinned GitHub items** are split into several GraphQL queries of at most 50
  lookups each (GraphQL node limits); the searches go in the first one only.
- **Stream reordering** uses ↑/↓ buttons; **items** move between streams by drag and drop or the
  **Move** menu.

## Review Focus

1. **One PR, many URL spellings** — `/pull/12/files`, `/pull/12#discussion_r1`, `?w=1`,
   `www.github.com`, a trailing slash, `Acme/API` vs `acme/api` must be one item, never a duplicate
   (Task 1 test `normalizes every spelling of one PR to the same key`).
2. **Another browser removed the item** an operation in the queue refers to — the operation is a
   no-op and the rest of the queue still applies (Task 3 test `ignores operations on missing ids`,
   Task 4 test `applies the rest of the queue when one op no longer matches`).
3. **Notifications that are not PRs or issues** (Discussion, Release, CheckSuite, `subject.url`
   null) must show up, not crash the poll (Task 6 test `keeps a discussion mention as a thread row`).
4. **Many pinned items** (more than 50) must not exceed GraphQL limits (Task 5 test `splits more
   than 50 pinned refs into several queries`).
5. **Switching GitHub account or adding a work token** must not show the old account's inbox or
   apply its dismissals (Task 8 test `clears the snapshot and dismissals when the viewer login
   changes`).

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/formats/src/streams.ts` | Types, URL → item ref, normalisation, parse/serialize, operations, prune |
| `packages/formats/src/streams.test.ts` | Tests for the above |
| `apps/browser-extension/src/background/work/types.ts` | Shared work types and storage keys |
| `apps/browser-extension/src/background/work/repo-file.ts` | Read (ETag) and write (sha, conflict) one repo file |
| `apps/browser-extension/src/background/work/streams-store.ts` | Streams cache, write queue, flush |
| `apps/browser-extension/src/background/work/queries.ts` | Inbox search strings |
| `apps/browser-extension/src/background/work/graphql.ts` | Build the GraphQL query, parse the response |
| `apps/browser-extension/src/background/work/notifications.ts` | Poll, map, mark read/done |
| `apps/browser-extension/src/background/work/inbox.ts` | Pure: inbox rows, summary, auto-done ops |
| `apps/browser-extension/src/background/work/poller.ts` | One work cycle: tokens, backoff, snapshot, badge |
| `apps/browser-extension/src/background/work/messages.ts` | Handlers for `WORK_*` messages, command, context menu |
| `apps/browser-extension/src/background/service-worker.ts` | Wiring only (alarm, port, message dispatch) |
| `apps/browser-extension/src/types.ts` | New `WORK_*` message types and fields |
| `apps/browser-extension/manifest.ts` | `sidePanel`, `side_panel`, `pin-current-tab` |
| `apps/browser-extension/sidepanel.html` | Side panel page |
| `apps/browser-extension/src/sidepanel/*` | Side panel UI |
| `apps/browser-extension/src/newtab/WorkCard.tsx` | Start page card |

---

### Task 1: Streams URL refs and normalisation (`@kaihuman/formats`)

**Files:**
- Create: `packages/formats/src/streams.ts`
- Create: `packages/formats/src/streams.test.ts`
- Modify: `packages/formats/src/index.ts` (add `export * from './streams.js';`)

**Interfaces:**
- Produces:
  - `type GithubRef = { kind: 'github-pr' | 'github-issue'; owner: string; repo: string; number: number; key: GithubKey }`
  - `type GithubKey = string & { readonly __brand: 'GithubKey' }` — `owner/repo#number`, lowercase owner and repo
  - `type ItemRef = GithubRef | { kind: 'link'; host: string }`
  - `isSafeUrl(url: string): boolean`
  - `itemRefOf(url: string): ItemRef | null` — `null` for unsafe or unparseable URLs
  - `normalizeItemUrl(url: string): string`
  - `githubKey(owner: string, repo: string, number: number): GithubKey`

- [ ] **Step 1: Write the failing tests**

```ts
describe('itemRefOf', () => {
  it('reads PRs and issues, with any suffix', () => {
    expect(itemRefOf('https://github.com/acme/api/pull/412/files')).toEqual({
      kind: 'github-pr', owner: 'acme', repo: 'api', number: 412, key: 'acme/api#412' });
    expect(itemRefOf('https://github.com/acme/api/issues/7#issuecomment-1')?.kind).toBe('github-issue');
  });
  it('treats Slack, Claude and other pages as links', () => {
    expect(itemRefOf('https://acme.slack.com/archives/C04/p1728896')).toEqual({ kind: 'link', host: 'acme.slack.com' });
    expect(itemRefOf('https://claude.ai/code/session_01')).toEqual({ kind: 'link', host: 'claude.ai' });
    expect(itemRefOf('https://github.com/acme/api')).toEqual({ kind: 'link', host: 'github.com' });
  });
  it('refuses javascript:, file: and garbage', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url']) expect(itemRefOf(url)).toBeNull();
  });
});

describe('normalizeItemUrl', () => {
  it('normalizes every spelling of one PR to the same key', () => {
    const spellings = [
      'https://github.com/acme/api/pull/12', 'https://github.com/acme/api/pull/12/',
      'https://github.com/acme/api/pull/12/files', 'https://github.com/acme/api/pull/12#discussion_r1',
      'https://github.com/acme/api/pull/12?w=1', 'https://www.github.com/Acme/API/pull/12',
    ];
    expect(new Set(spellings.map(normalizeItemUrl))).toEqual(new Set(['https://github.com/acme/api/pull/12']));
  });
  it('drops the fragment, tracking parameters and a trailing slash from links', () => {
    expect(normalizeItemUrl('https://example.com/a/?utm_source=x&id=3&fbclid=y#top')).toBe('https://example.com/a?id=3');
  });
  it('keeps Slack thread parameters', () => {
    const url = 'https://acme.slack.com/archives/C04/p1728896?thread_ts=1728896.1&cid=C04';
    expect(normalizeItemUrl(url)).toBe(url);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @kaihuman/formats exec vitest run src/streams.test.ts`
Expected: FAIL — `itemRefOf` is not exported.

- [ ] **Step 3: Implement in `packages/formats/src/streams.ts`**

GitHub host is `github.com` or `www.github.com`; the path must match
`^/([^/]+)/([^/]+)/(pull|issues)/(\d+)(/|$)`. Tracking parameters to drop: names starting with
`utm_`, plus `fbclid`, `gclid`, `mc_cid`, `mc_eid`. For GitHub refs the normalised URL is
`https://github.com/<owner>/<repo>/<pull|issues>/<n>` (lowercased owner and repo, no query). For
links: drop the fragment and tracking parameters, and remove one trailing `/` from a non-root path.
Unsafe URLs are returned unchanged by `normalizeItemUrl` (callers check `isSafeUrl` first). Start
the file with a doc comment pointing to `doc/work-streams.md`, like `ideas.ts`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @kaihuman/formats exec vitest run src/streams.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/formats/src/streams.ts packages/formats/src/streams.test.ts packages/formats/src/index.ts
git commit -m "Streams format: item refs and URL normalisation"
```

---

### Task 2: Streams file parse and serialize

**Files:**
- Modify: `packages/formats/src/streams.ts`
- Modify: `packages/formats/src/streams.test.ts`

**Interfaces:**
- Consumes: `isSafeUrl` (Task 1).
- Produces:
  - `STREAMS_PATH = '.kh/browser.streams.json'`
  - `type StreamId = string & { readonly __brand: 'StreamId' }`, `type ItemId = string & { readonly __brand: 'ItemId' }`
  - `interface StreamItem { id: ItemId; url: string; title: string; addedAt: string; labels: string[]; doneAt?: string; extra: Record<string, unknown> }`
  - `interface Stream { id: StreamId; name: string; createdAt: string; items: StreamItem[]; invalidItems: unknown[]; extra: Record<string, unknown> }`
  - `interface StreamsFile { version: 1; updatedAt: string; streams: Stream[]; invalidStreams: unknown[]; extra: Record<string, unknown> }`
  - `type StreamsParse = { ok: true; file: StreamsFile } | { ok: false; error: string }`
  - `parseStreams(content: string): StreamsParse`
  - `serializeStreams(file: StreamsFile): string`
  - `emptyStreams(now: string): StreamsFile`
  - `newStreamId(): StreamId` (`st_` + 8 lowercase base-36 chars from `crypto.getRandomValues`), `newItemId(): ItemId` (`it_` + 8)

`extra` holds keys this version does not know; `invalidItems` / `invalidStreams` hold entries that
fail validation. Both are written back unchanged (invalid entries after the valid ones).

- [ ] **Step 1: Write the failing tests**

```ts
describe('parseStreams / serializeStreams', () => {
  it('round-trips the example from the spec byte for byte', () => {
    const text = readFileSync(new URL('../fixtures/streams/example.json', import.meta.url), 'utf8');
    const parsed = parseStreams(text);
    expect(parsed.ok).toBe(true);
    expect(serializeStreams((parsed as { ok: true; file: StreamsFile }).file)).toBe(text);
  });
  it('keeps unknown fields and invalid entries', () => {
    const text = JSON.stringify({ version: 1, updatedAt: 'T', future: 1, streams: [
      { id: 'st_a', name: 'A', createdAt: 'T', color: 'red', items: [
        { id: 'it_1', url: 'javascript:alert(1)', title: 'x', addedAt: 'T', labels: [] },
        { id: 'it_2', url: 'https://x.dev', title: 'y', addedAt: 'T', labels: [], pinnedBy: 'me' } ] },
      { name: 'no id' } ] });
    const { file } = parseStreams(text) as { ok: true; file: StreamsFile };
    expect(file.streams[0].items.map((i) => i.id)).toEqual(['it_2']);
    const again = JSON.parse(serializeStreams(file));
    expect(again.future).toBe(1);
    expect(again.streams[0].color).toBe('red');
    expect(again.streams[0].items).toHaveLength(2);
    expect(again.streams[0].items[0].pinnedBy).toBe('me');
    expect(again.streams).toHaveLength(2);
  });
  it('reports invalid JSON and a wrong version instead of repairing them', () => {
    expect(parseStreams('{ nope')).toEqual({ ok: false, error: '.kh/browser.streams.json is not valid JSON' });
    expect(parseStreams('{"version":2,"streams":[]}')).toEqual({ ok: false, error: '.kh/browser.streams.json has version 2; this extension reads version 1' });
  });
  it('makes ids with the right prefixes', () => {
    expect(newStreamId()).toMatch(/^st_[a-z0-9]{8}$/);
    expect(newItemId()).toMatch(/^it_[a-z0-9]{8}$/);
  });
});
```

Create the fixture `packages/formats/fixtures/streams/example.json` with exactly the JSON from the
spec's "Data model" section, followed by one newline.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @kaihuman/formats exec vitest run src/streams.test.ts`
Expected: FAIL — `parseStreams` is not exported.

- [ ] **Step 3: Implement `parseStreams`, `serializeStreams`, `emptyStreams`, `newStreamId`, `newItemId`**

A stream is valid with a string `id` and an `items` array; an item is valid with string `id`,
`url` (passing `isSafeUrl`), `title`, `addedAt`, a `labels` string array, and an optional string
`doneAt`. Serialisation writes known keys in the order of the spec example, then `extra`; `doneAt`
only when set.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @kaihuman/formats exec vitest run src/streams.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/formats
git commit -m "Streams format: parse and serialize, keeping unknown entries"
```

---

### Task 3: Streams operations

**Files:**
- Modify: `packages/formats/src/streams.ts`
- Modify: `packages/formats/src/streams.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `type StreamOp =`
    `| { op: 'addStream'; streamId: StreamId; name: string; at: string }`
    `| { op: 'renameStream'; streamId: StreamId; name: string }`
    `| { op: 'deleteStream'; streamId: StreamId }`
    `| { op: 'reorderStreams'; order: StreamId[] }`
    `| { op: 'pin'; streamId: StreamId; itemId: ItemId; url: string; title: string; labels: string[]; at: string }`
    `| { op: 'move'; itemId: ItemId; streamId: StreamId; index?: number }`
    `| { op: 'setLabels'; itemId: ItemId; labels: string[] }`
    `| { op: 'markDone'; itemId: ItemId; at: string }`
    `| { op: 'undone'; itemId: ItemId }`
    `| { op: 'remove'; itemId: ItemId }`
    `| { op: 'prune'; now: string }`
  - `applyOp(file: StreamsFile, op: StreamOp): StreamsFile` (pure; never mutates the input)
  - `applyOps(file: StreamsFile, ops: StreamOp[], updatedAt: string): StreamsFile` — applies in order, then a `prune` with `updatedAt`, then sets `updatedAt`
  - `PRUNE_AFTER_DAYS = 14`
  - `findItemByUrl(file: StreamsFile, url: string): { stream: Stream; item: StreamItem } | undefined` (compares `normalizeItemUrl`)
  - `streamLabels(file: StreamsFile): string[]` (unique, sorted with `localeCompare`)

Rules the tests pin:
- An operation whose stream or item id no longer exists is a no-op (another browser removed it).
- `addStream` with an existing id is a no-op; names are trimmed and an empty name throws
  `Error('Give the stream a name')`.
- `pin` of a URL already in the file moves that item (keeping its `id` and `addedAt`), clears
  `doneAt`, and adds the new labels to the existing ones. `pin` with an unsafe URL throws
  `Error('Only http and https pages can be pinned')`. The URL is stored normalised.
- `markDone` on an item that already has `doneAt` keeps the first `doneAt`.
- `deleteStream` removes the stream with its items (the UI asks first).
- `reorderStreams` puts the listed ids first in that order; unlisted streams keep their order after them.
- Labels are trimmed, empty ones dropped, duplicates removed.

- [ ] **Step 1: Write the failing tests**

Tests (each builds a small `StreamsFile` with `emptyStreams('2026-10-14T00:00:00Z')` and ops):
- `pins a page into a stream with a normalised url`
- `moves an already pinned url instead of duplicating it` — pin the same PR as `/pull/1/files` into
  stream B; expect one item, in B, same `id`, labels merged, `doneAt` cleared.
- `ignores operations on missing ids` — `move`, `setLabels`, `markDone`, `remove`, `renameStream` on
  unknown ids return a deep-equal file.
- `is idempotent` — for every op kind, `applyOp(applyOp(f, op), op)` deep-equals `applyOp(f, op)`.
- `keeps the first doneAt`
- `prunes only items done more than 14 days ago` — done at `2026-09-29T00:00:00Z` with now
  `2026-10-14T00:00:01Z` is removed; done at `2026-09-30T00:00:00Z` stays; not-done stays.
- `reorders listed streams first`
- `refuses an empty stream name and an unsafe url` (exact messages above)
- `lists labels across streams, sorted and unique`
- `does not mutate its input` — `Object.freeze` deeply (`structuredClone` + freeze helper) and apply every op.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @kaihuman/formats exec vitest run src/streams.test.ts`
Expected: FAIL — `applyOp` is not exported.

- [ ] **Step 3: Implement the operations, `applyOps`, `findItemByUrl`, `streamLabels`**

- [ ] **Step 4: Run all formats tests**

Run: `pnpm --filter @kaihuman/formats test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/formats
git commit -m "Streams format: pure, idempotent operations and prune"
```

---

### Task 4: Work types, repo file access and the streams store

**Files:**
- Create: `apps/browser-extension/src/background/work/types.ts`
- Create: `apps/browser-extension/src/background/work/repo-file.ts`
- Create: `apps/browser-extension/src/background/work/streams-store.ts`
- Create: `apps/browser-extension/src/background/work/streams-store.test.ts`

**Interfaces:**
- Consumes: `parseStreams`, `serializeStreams`, `emptyStreams`, `applyOps`, `StreamOp`, `StreamsFile`, `STREAMS_PATH` (Tasks 2–3).
- Produces (`types.ts`):
  - `WORK_KEYS = { snapshot: 'workSnapshot', streamsCache: 'streamsCache', queue: 'streamsWriteQueue', saveError: 'streamsSaveError', pollState: 'workPollState', dismissed: 'workDismissed', workToken: 'workToken', ui: 'workUi' } as const`
  - `interface StreamsCache { repo: string; state: StreamsParse; sha: string | null; etag: string | null; fetchedAt: number }`
  - `type CiState = 'success' | 'failure' | 'pending' | null`
  - `type ReviewState = 'approved' | 'changes_requested' | 'review_required' | null`
  - `interface WorkItemStatus { key: GithubKey; url: string; repo: string; number: number; kind: 'pr' | 'issue'; title: string; state: 'open' | 'merged' | 'closed'; isDraft: boolean; review: ReviewState; ci: CiState; conflict: boolean; updatedAt: string }`
  - `type PinnedStatus = WorkItemStatus | { key: GithubKey; error: 'not-found' | 'forbidden'; org: string }`
  - `type InboxReason = 'review-requested' | 'assigned' | 'failing' | 'changes-requested' | 'ready-to-merge'`
  - `interface NotificationThread { threadId: string; key: GithubKey | `thread:${string}`; reason: string; title: string; url: string; repo: string; updatedAt: string; unread: boolean }`
  - `interface OrgAccessProblem { org: string; fix: 'oauth' | 'sso'; url: string }`
  - `type WorkProblem = { kind: 'signed-out' } | { kind: 'auth' } | { kind: 'rate-limit'; until: number } | { kind: 'offline'; retryAt: number }`
  - `interface WorkSnapshot { login: string; fetchedAt: number; searches: Record<InboxReason | 'mine', WorkItemStatus[]>; threads: NotificationThread[]; pinned: Record<string, PinnedStatus>; orgProblems: OrgAccessProblem[]; problem: WorkProblem | null }`
- Produces (`repo-file.ts`):
  - `class GithubHttpError extends Error { status: number; retryAt?: number }` — `retryAt` (epoch ms) from `retry-after` seconds, or from `x-ratelimit-reset` when `x-ratelimit-remaining` is `0`
  - `githubHttpError(res: Response, action: string): Promise<GithubHttpError>` — message from the JSON body's `message`, like `githubFailure` in `service-worker.ts`
  - `class WriteConflict extends Error`
  - `readRepoFile(token: string, repo: string, path: string, etag?: string | null): Promise<{ status: 'unchanged' } | { status: 'missing' } | { status: 'ok'; content: string; sha: string; etag: string | null }>` — sends `If-None-Match` when `etag` is given, `cache: 'no-store'` otherwise; other failures throw `GithubHttpError`
  - `writeRepoFile(token: string, repo: string, path: string, content: string, sha: string | null, message: string): Promise<string>` — returns the new blob sha; throws `WriteConflict` on `409` or `422`
- Produces (`streams-store.ts`):
  - `loadStreams(opts?: { force?: boolean }): Promise<StreamsCache | undefined>` — `undefined` when signed out; uses the cache when usable for the repo and younger than 15 minutes unless `force`
  - `enqueueStreamOps(ops: StreamOp[]): Promise<void>` — throws `Error('The streams file is read-only until it is valid JSON again')` when the cached state is `{ ok: false }`; appends to `streamsWriteQueue`; schedules `flushStreams` 3 s later
  - `flushStreams(): Promise<{ saved: boolean }>` — reads fresh, `applyOps(file, queue, now)`, writes against the sha; on `WriteConflict` re-reads and re-applies, up to 3 retries; on success removes exactly the flushed ops from the queue (ops added meanwhile stay), clears `streamsSaveError`, and updates `streamsCache`; on final failure keeps the queue and sets `streamsSaveError` to the message

Credentials are read the same way as `credentials()` in `service-worker.ts`
(`lifeos_token`, `lifeos_repo`); copy that three-line helper into `streams-store.ts` as
`dataRepoCredentials()` rather than importing from the worker (the worker module has side
effects on import).

- [ ] **Step 1: Write the failing tests** (stub `chrome.storage.local` with an in-memory map and `fetch` with a scripted queue of responses, as `service-worker.test.ts` does)

- `reads the file once and serves the cache for 15 minutes`
- `replays the ETag and keeps the cache on 304`
- `treats a missing file as empty streams`
- `marks a broken file read-only and refuses ops` — `enqueueStreamOps` rejects with the exact message
- `flushes queued ops in one commit against the sha` — expect one `PUT` whose body `sha` equals the read sha and whose decoded content has the pinned item
- `survives a worker restart` — enqueue, `vi.resetModules()`, re-import, `flushStreams()` still commits the op
- `rereads and reapplies after a conflict` — first `PUT` answers 409, second 200; expect two reads, `{ saved: true }`, empty queue
- `keeps the queue after three conflicts` — four 409s; expect `{ saved: false }`, queue unchanged, `streamsSaveError` set
- `applies the rest of the queue when one op no longer matches` — queue `[markDone(missing), pin(new)]`; the commit contains the pin
- `keeps ops queued during a flush` — enqueue a second op while the first `PUT` is pending; after the flush the second op is still queued

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/streams-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `types.ts`, `repo-file.ts`, `streams-store.ts`**

Base64 helpers: reuse the approach of `decodeBase64`/`encodeBase64` in `service-worker.ts`
(UTF-8 safe); put local copies in `repo-file.ts`. Commit message: `Update .kh/browser.streams.json via Extension`.
The 3 s delay is a `setTimeout`; the `work` alarm (Task 8) also calls `flushStreams()` when the
queue is not empty, which covers a worker suspended before the timer fired.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/streams-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/background/work
git commit -m "Extension: streams store with a write queue that survives restarts"
```

---

### Task 5: Inbox queries and the GraphQL query

**Files:**
- Create: `apps/browser-extension/src/background/work/queries.ts`
- Create: `apps/browser-extension/src/background/work/graphql.ts`
- Create: `apps/browser-extension/src/background/work/graphql.test.ts`

**Interfaces:**
- Consumes: `GITHUB_WORK_QUERIES` from `@kaihuman/palette`; `GithubRef`, `githubKey` (Task 1); types, `GithubHttpError` and `githubHttpError` from Task 4.
- Produces (`queries.ts`):
  - `INBOX_QUERIES: Record<InboxReason, string>` — `review-requested`, `assigned`, `failing` from `GITHUB_WORK_QUERIES`; `changes-requested`: `is:open is:pr archived:false author:@me review:changes_requested`; `ready-to-merge`: `is:open is:pr archived:false author:@me review:approved status:success`
  - `MY_OPEN_PRS_QUERY = 'is:open is:pr archived:false author:@me'`
- Produces (`graphql.ts`):
  - `MAX_LOOKUPS_PER_QUERY = 50`
  - `buildWorkQueries(pinned: GithubRef[]): { query: string; variables: Record<string, string | number> }[]` — the first query has `viewer { login }`, the six aliased searches (`first: 50`, `type: ISSUE`) and up to 50 lookups; further queries hold the remaining lookups in chunks of 50. Lookups use variables (`$o0`, `$r0`, `$n0`, …), never string interpolation of owner/repo.
  - `parseWorkResponses(responses: unknown[], pinned: GithubRef[]): { login: string; searches: WorkSnapshot['searches']; pinned: Record<string, PinnedStatus>; orgProblems: OrgAccessProblem[] }`
  - `runWorkQueries(token: string, pinned: GithubRef[]): Promise<ReturnType<typeof parseWorkResponses>>` — `POST https://api.github.com/graphql`; throws `GithubHttpError` (Task 4) for non-2xx

Mapping: PR `state` `MERGED`/`CLOSED`/`OPEN` → lowercase; issue `CLOSED`/`OPEN`. CI from
`commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`: `SUCCESS` → `success`,
`FAILURE`/`ERROR` → `failure`, `PENDING`/`EXPECTED` → `pending`, none → `null`. `reviewDecision`
lowercased; `mergeable === 'CONFLICTING'` → `conflict: true`. A lookup error with `type: 'NOT_FOUND'`
→ `{ error: 'not-found' }`; `type: 'FORBIDDEN'` → `{ error: 'forbidden', org: owner }` plus an
`OrgAccessProblem` (once per org): message containing `SAML` → `fix: 'sso'`, url
`https://github.com/orgs/<org>/sso`; otherwise `fix: 'oauth'`, url
`https://github.com/settings/applications`.

- [ ] **Step 1: Write the failing tests** (fixtures as inline objects in the test file)

- `puts viewer, six searches and the lookups in the first query`
- `passes owner, repo and number as variables` — a ref with owner `a"b` must not appear in `query`
- `splits more than 50 pinned refs into several queries` — 120 refs → 3 queries with 50/50/20 lookups; only the first has `search(`
- `maps PR and issue fields` — merged PR with failing CI, changes requested, conflict, draft
- `marks missing pinned items not-found`
- `reports a forbidden org once, with the oauth fix` and `… with the sso fix when the message says SAML`
- `keeps the data of a partial response` — `data` with some lookups plus `errors` for others

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/graphql.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `queries.ts` and `graphql.ts`**

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/graphql.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/background/work
git commit -m "Extension: one GraphQL query for inbox searches and pinned item status"
```

---

### Task 6: Notifications

**Files:**
- Create: `apps/browser-extension/src/background/work/notifications.ts`
- Create: `apps/browser-extension/src/background/work/notifications.test.ts`

**Interfaces:**
- Consumes: `githubKey` (Task 1); `NotificationThread`, `GithubHttpError`, `githubHttpError` (Task 4).
- Produces:
  - `subjectKey(subjectApiUrl: string | null): GithubKey | null` — `https://api.github.com/repos/o/r/pulls/12` and `/issues/12` → `o/r#12`; anything else → `null`
  - `pollNotifications(token: string, lastModified: string | null): Promise<{ status: 'unchanged'; pollIntervalSec: number } | { status: 'changed'; threads: NotificationThread[]; lastModified: string | null; pollIntervalSec: number }>` — `GET /notifications?participating=true&per_page=50` with `If-Modified-Since`
  - `markThreadDone(token: string, threadId: string): Promise<void>` — `DELETE /notifications/threads/{id}`
  - `markThreadRead(token: string, threadId: string): Promise<void>` — `PATCH /notifications/threads/{id}`

A thread's `url` is the HTML page: `https://github.com/o/r/pull/12` (or `/issues/12`) when
`subjectKey` matches; otherwise `https://github.com/<repo full_name>` with key `thread:<id>`.
`pollIntervalSec` is `Number(X-Poll-Interval)` or 60.

- [ ] **Step 1: Write the failing tests**

- `maps pull and issue subjects to keys`
- `keeps a discussion mention as a thread row` — subject type `Discussion`, `url: null` → key `thread:9`, url `https://github.com/acme/web`
- `sends If-Modified-Since and treats 304 as unchanged`
- `reads X-Poll-Interval`
- `throws GithubHttpError with retryAt on a rate limit` — 403, `x-ratelimit-remaining: 0`, `x-ratelimit-reset: 1760000000` → `retryAt === 1760000000000`
- `marks a thread done and read with the right verbs`

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/notifications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `notifications.ts`**

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/notifications.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/background/work
git commit -m "Extension: participating notifications with conditional polling"
```

---

### Task 7: Inbox rows, summary and auto-done (pure)

**Files:**
- Create: `apps/browser-extension/src/background/work/inbox.ts`
- Create: `apps/browser-extension/src/background/work/inbox.test.ts`

**Interfaces:**
- Consumes: `StreamsFile`, `StreamOp`, `itemRefOf` (Tasks 1–3); types from Task 4.
- Produces:
  - `interface InboxRow { key: string; url: string; title: string; repo: string; number?: number; kind: 'pr' | 'issue' | 'thread'; reasons: (InboxReason | string)[]; updatedAt: string; threadId?: string; status?: WorkItemStatus }`
  - `type Dismissed = Record<string, string>` — key → the `updatedAt` it was dismissed at
  - `buildInbox(snapshot: WorkSnapshot, file: StreamsFile | null, dismissed: Dismissed): { waiting: InboxRow[]; activity: InboxRow[]; mine: WorkItemStatus[] }`
  - `pinnedKeys(file: StreamsFile): Set<string>` — `GithubKey`s of not-done pinned items
  - `workSummary(snapshot: WorkSnapshot, file: StreamsFile | null, dismissed: Dismissed): { waiting: number; activity: number; redCiInStreams: number }`
  - `autoDoneOps(file: StreamsFile, pinned: Record<string, PinnedStatus>, at: string): StreamOp[]` — a `markDone` for every not-done pinned GitHub item whose status is `merged` or `closed`
  - `unreadKeys(snapshot: WorkSnapshot): Set<string>` — keys with an unread thread (for the **• new** dot)

Rules: one row per key; `reasons` = every search it is in plus the thread `reason`; a row with any
`InboxReason` goes to `waiting`, otherwise to `activity`; pinned keys are excluded from both and
from `mine`; a dismissed key is hidden while its `updatedAt` equals the dismissed value; `mine`
excludes keys already in `waiting`; each list is sorted by `updatedAt` descending.

- [ ] **Step 1: Write the failing tests**

- `merges a search hit and a mention into one waiting row with two reasons`
- `excludes pinned items from every list`
- `brings a dismissed row back when the item changes`
- `puts thread-only items under activity`
- `counts waiting, activity and red CI in streams`
- `marks merged and closed pinned items done, once` — a file where one is already done yields no op for it

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/inbox.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `inbox.ts`**

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/inbox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/background/work
git commit -m "Extension: inbox rows, summary and auto-done"
```

---

### Task 8: The work cycle and service-worker wiring

**Files:**
- Create: `apps/browser-extension/src/background/work/poller.ts`
- Create: `apps/browser-extension/src/background/work/poller.test.ts`
- Modify: `apps/browser-extension/src/background/service-worker.ts` (alarm creation near line 121, the `onAlarm` listener near line 131, the `onConnect` listener at line 149)

**Interfaces:**
- Consumes: Tasks 4–7.
- Produces:
  - `interface WorkPollState { notificationsLastModified: string | null; nextNotificationsAt: number; nextGraphqlAt: number; backoffStep: number }` (stored at `workPollState`)
  - `runWorkCycle(opts: { force?: boolean; panelOpen: boolean; now?: number }): Promise<WorkSnapshot | undefined>`
  - `workPollingToken(): Promise<string | undefined>` — `workToken` when set, else the sign-in token
  - `setPanelOpen(open: boolean): void` and `isPanelOpen(): boolean` (module state, counted by open ports)
  - `BACKOFF_MINUTES = [1, 2, 4, 8, 15]`

Cycle rules:
1. No sign-in token and no work token → snapshot `problem: { kind: 'signed-out' }`, badge cleared, stop.
2. If `now < nextNotificationsAt` and not `force` → skip notifications; else poll and set
   `nextNotificationsAt = now + max(60, pollIntervalSec) * 1000`.
3. GraphQL runs when `force`, notifications changed, or `now >= nextGraphqlAt`; then
   `nextGraphqlAt = now + (panelOpen ? 1 : 5) minutes`. Pinned refs come from `loadStreams()`.
4. `401` → `problem: { kind: 'auth' }`, badge `!`, no further calls until `force` or a token change
   (`AUTH_TOKEN_UPDATE` or `workToken` change resets `workPollState`).
5. `GithubHttpError` with `retryAt` → `problem: { kind: 'rate-limit', until: retryAt }`, both `next*At = retryAt`.
6. Network error or 5xx → `problem: { kind: 'offline', retryAt }`, using `BACKOFF_MINUTES[backoffStep]`, step +1 (capped); success resets the step to 0.
7. On every failure the previous snapshot's data stays; only `problem` changes.
8. If the GraphQL `login` differs from the stored snapshot's `login` → start from an empty
   snapshot and clear `workDismissed` before writing.
9. After GraphQL: `enqueueStreamOps(autoDoneOps(...))` when non-empty (skip when read-only).
10. Badge: `chrome.action.setBadgeText({ text: count ? String(count) : '' })` with
    `workSummary(...).waiting`; red background `#b91c1c`. The existing per-tab palette-failure
    badge keeps working (per-tab text wins over the global one).
11. If `streamsWriteQueue` is not empty, call `flushStreams()`.

Wiring in `service-worker.ts`:
- `chrome.alarms.create('work', { periodInMinutes: 1 });` and in `onAlarm`: `if (alarm.name === 'work') runWorkCycle({ panelOpen: isPanelOpen() }).catch(...)`.
- In the existing `onConnect` listener: when `port.name === 'work-panel'`, `setPanelOpen(true)`, run
  `loadStreams({ force: true })` then `runWorkCycle({ force: true, panelOpen: true })` (the spec's
  "refresh when the side panel opens"), and on `port.onDisconnect` `setPanelOpen(false)`.
  Other ports keep today's behaviour.

- [ ] **Step 1: Write the failing tests** (stub `chrome` and `fetch`; drive `now` explicitly)

- `reports signed-out without calling GitHub`
- `skips GraphQL on a 304 until five minutes have passed`
- `runs GraphQL at once when notifications changed`
- `refreshes every minute while the panel is open`
- `stops on 401 and shows ! on the badge`
- `pauses until the rate-limit reset`
- `backs off 1, 2, 4, 8, 15, 15 minutes when offline and resets after a success`
- `keeps the last data when a call fails`
- `rereads the streams file and runs a full cycle when a panel connects`
- `uses the work token for polling and the sign-in token for the streams file` — assert the
  `Authorization` header per URL
- `clears the snapshot and dismissals when the viewer login changes`
- `queues auto-done ops for merged pinned PRs`
- `sets the badge to the waiting count`

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/poller.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `poller.ts` and the wiring**

- [ ] **Step 4: Run the extension tests (the worker tests must still pass)**

Run: `pnpm --filter browser-extension test`
Expected: PASS. If `service-worker.test.ts` fails because its `chrome` stub lacks
`action.setBadgeText` or `port.onDisconnect`, add those stubs to the test's `beforeEach`.

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/background
git commit -m "Extension: work polling cycle with backoff, snapshot and badge"
```

---

### Task 9: Messages, the pin command, the context menu and the manifest

**Files:**
- Create: `apps/browser-extension/src/background/work/messages.ts`
- Create: `apps/browser-extension/src/background/work/messages.test.ts`
- Modify: `apps/browser-extension/src/types.ts` (message types and fields)
- Modify: `apps/browser-extension/src/background/service-worker.ts` (dispatch, `onCommand`, `onInstalled`, `contextMenus.onClicked`)
- Modify: `apps/browser-extension/manifest.ts`
- Modify: `apps/browser-extension/src/manifest.test.ts`
- Create: `apps/browser-extension/sidepanel.html` (copy of `newtab.html` with `<title>kaihuman work</title>` and `src="/src/sidepanel/main.tsx"`)
- Create: `apps/browser-extension/src/sidepanel/main.tsx` (renders a placeholder `<p>Work</p>`; Task 10 replaces it)

**Interfaces:**
- Consumes: Tasks 3–8.
- Produces — message types added to `Message['type']`:
  - `WORK_OPS` `{ ops: StreamOp[] }` → `{ ok: true }` (calls `enqueueStreamOps`)
  - `WORK_REFRESH` → the snapshot (`runWorkCycle({ force: true, panelOpen: isPanelOpen() })`, plus `loadStreams({ force: true })`)
  - `WORK_DISMISS` `{ key: string; updatedAt: string; threadId?: string }` → `{ ok: true }`; stores `workDismissed[key] = updatedAt`; calls `markThreadDone` when `threadId` is set; on failure removes the dismissal and rejects with `could not dismiss — retry`
  - `WORK_OPEN` `{ url: string; threadId?: string }` → opens the URL in a new tab (only `isSafeUrl`), then `markThreadRead` when `threadId` is set (errors ignored)
  - `WORK_SET_TOKEN` `{ key: string }` → stores `workToken` (empty removes it) and resets `workPollState`
  - `WORK_PIN_TAB` `{ streamId?: StreamId; labels?: string[]; tabId?: number }` → pins the given or active tab to `streamId` or to `workUi.lastStreamId`; when there is no stream yet, creates one named `Inbox`
  - Fields on `Message`: `ops?: StreamOp[]`, `key?: string` (exists), `updatedAt?: string`, `threadId?: string`, `streamId?: string`, `labels?: string[]`
- `handleWorkMessage(message: Message): Promise<unknown> | undefined` — returns `undefined` for non-work messages so the worker's existing chain continues.
- `rebuildPinMenu(file: StreamsFile | null): Promise<void>` — removes and recreates the parent menu `kaihuman-pin` (title `Pin to stream`, contexts `page`, `link`) with one child per stream (`kaihuman-pin:<streamId>`); called on install and whenever `streamsCache` changes (`chrome.storage.onChanged`).
- Context menu click: for `kaihuman-pin:<id>`, pin `info.linkUrl` (title = `info.selectionText` or the URL) or else the tab's URL and title.
- Command `pin-current-tab`: `WORK_PIN_TAB` logic for the active tab, then the badge flashes `✓` for 2 s on that tab (`chrome.action.setBadgeText({ tabId, text: '✓' })`, then `''`).

Manifest changes: add `'sidePanel'` to `permissions`; add
`side_panel: { default_path: 'sidepanel.html' }`; add to `commands`:
`'pin-current-tab': { suggested_key: { default: 'Alt+Shift+P' }, description: 'Pin the current tab to a kaihuman work stream' }`.

- [ ] **Step 1: Write the failing tests**

`messages.test.ts`:
- `queues ops from the panel`
- `pins the active tab to the last stream used`
- `creates an Inbox stream for the first pin`
- `dismisses locally and on GitHub, and undoes the local part when GitHub fails`
- `opens only safe urls and marks the thread read`
- `rebuilds the pin menu with one entry per stream`

`manifest.test.ts` (new `it`s):
- `declares the side panel` — `permissions` contains `sidePanel`; `side_panel.default_path === 'sidepanel.html'`
- `binds pin-current-tab` — `commands['pin-current-tab'].suggested_key.default === 'Alt+Shift+P'`
- `adds no host permission for work` — `host_permissions` equals the list before this change (copy the current array into the test)

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/background/work/messages.test.ts src/manifest.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `messages.ts`, the types, the wiring and the manifest**

In the worker's `onMessage` listener, call `handleWorkMessage(message)` first and, when it returns a
promise, answer it with the existing `answer(promise, sendResponse)` helper.

- [ ] **Step 4: Run the tests, then build and check the side panel is bundled**

Run: `pnpm --filter browser-extension test && pnpm --filter browser-extension build && ls apps/browser-extension/dist/sidepanel.html && grep -o '"side_panel":{[^}]*}' apps/browser-extension/dist/manifest.json`
Expected: tests PASS; `dist/sidepanel.html` exists; the manifest shows `"default_path":"sidepanel.html"`.
If CRXJS does not emit the page, add `build.rollupOptions.input.sidepanel = 'sidepanel.html'` in `vite.config.ts` and rebuild.

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension
git commit -m "Extension: work messages, pin command, Pin to stream menu, side panel entry"
```

---

### Task 10: Side panel shell, state hook, states and the This-tab bar

**Files:**
- Create: `apps/browser-extension/src/sidepanel/useWorkState.ts`
- Create: `apps/browser-extension/src/sidepanel/SidePanel.tsx`
- Create: `apps/browser-extension/src/sidepanel/ThisTabBar.tsx`
- Create: `apps/browser-extension/src/sidepanel/SidePanel.test.tsx`
- Modify: `apps/browser-extension/src/sidepanel/main.tsx` (render `<SidePanel />`, import `../index.css` like `src/newtab/main.tsx`)

**Interfaces:**
- Consumes: `WORK_KEYS`, `WorkSnapshot`, `StreamsCache` (Task 4); `buildInbox`, `unreadKeys`, `Dismissed` (Task 7); messages (Task 9); `send` from `src/palette/port.ts`; `findItemByUrl` (Task 3).
- Produces:
  - `useWorkState(): { snapshot?: WorkSnapshot; streams?: StreamsCache; dismissed: Dismissed; saveError?: string; queueLength: number; ui: WorkUi }` — reads the `WORK_KEYS` from `chrome.storage.local` on mount and on `chrome.storage.onChanged`
  - `interface WorkUi { lastStreamId?: StreamId; collapsed: string[]; label?: string }` (stored at `workUi`)
  - `updateWorkUi(patch: Partial<WorkUi>): Promise<void>`
  - `<SidePanel />` — on mount opens `chrome.runtime.connect({ name: 'work-panel' })` (kept for the panel's lifetime)
  - `<ThisTabBar file={StreamsFile | null} ui={WorkUi} readOnly={boolean} />` — tracks the active tab via `chrome.tabs.query({ active: true, currentWindow: true })`, `chrome.tabs.onActivated` and `chrome.tabs.onUpdated`

Panel states, each with exact copy:
- signed out (`problem.kind === 'signed-out'` or no streams cache): `Sign in to kaihuman in the console to see your work.` with a link to `CONSOLE_URL`
- auth: `GitHub refused the token. Sign in again.`
- rate limit: `Paused by GitHub until HH:MM.` (local time, `toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`)
- offline: `Offline — showing data as of HH:MM.`
- read-only file: `The streams file is not valid JSON, so it is read-only.` with a link `Open it in the console` (`consoleFileUrl('.kh/browser.streams.json', repo)` from `src/console.ts`)
- save error: `Not saved yet: <message>`
- org problems: one banner per org: `<org> hides its items from kaihuman.` + link `Request access` (oauth) or `Authorise SSO` (sso)
- header: `Work`, `⟳` button (`WORK_REFRESH`), and `<age> ago` from `snapshot.fetchedAt`

This-tab bar: unsafe URL (e.g. `chrome://`) → `This page cannot be pinned.`; already pinned → `In <stream name>` with **✓ Done** (`markDone`) and a **Move** select; otherwise a stream select (default `ui.lastStreamId`), a labels input (comma-separated) and **Pin** (`WORK_OPS` with one `pin` op, new `newItemId()`; saves `lastStreamId`). With no streams, the select offers `New stream…` which prompts for a name and sends `addStream` + `pin` in one `WORK_OPS`.

- [ ] **Step 1: Write the failing tests** (render with `preact` `render` into a jsdom container; stub `chrome.storage`, `chrome.tabs`, `chrome.runtime.connect`, and `send` via `chrome.runtime.sendMessage`)

- `shows the sign-in message when signed out`
- `shows the read-only banner with a console link`
- `shows one banner per org problem with the right link`
- `shows offline with the data time`
- `pins the active tab to the last stream used` — asserts the sent `WORK_OPS` payload
- `shows where an already pinned tab is and marks it done`
- `refuses chrome:// pages`
- `connects a work-panel port on mount`

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/sidepanel/SidePanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the hook, the shell, the states and the bar**

Style with the Tailwind classes the start page uses (dark background `#050505`, text `#e6e6e6`);
keep the layout to one column for a ~360 px panel.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter browser-extension exec vitest run src/sidepanel/SidePanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/sidepanel
git commit -m "Side panel: state, banners and pinning the current tab"
```

---

### Task 11: Side panel inbox and My open PRs

**Files:**
- Create: `apps/browser-extension/src/sidepanel/StatusChips.tsx`
- Create: `apps/browser-extension/src/sidepanel/InboxSection.tsx`
- Create: `apps/browser-extension/src/sidepanel/InboxSection.test.tsx`
- Modify: `apps/browser-extension/src/sidepanel/SidePanel.tsx` (render the sections under the bar)

**Interfaces:**
- Consumes: `buildInbox`, `InboxRow` (Task 7); `WorkItemStatus` (Task 4); messages (Task 9).
- Produces:
  - `<StatusChips status={WorkItemStatus | PinnedStatus | undefined} unread={boolean} />` — chips: `CI ✓` / `CI ✗` / `CI ●`, `approved`, `changes requested`, `review requested`, `conflict`, `draft`, `no access`, `not found`, and `• new` when `unread`
  - `<InboxSection title={string} rows={InboxRow[]} file={StreamsFile | null} readOnly={boolean} />` — row: title, `repo#number`, reason chips (labels: `review requested`, `assigned`, `CI failing`, `changes requested`, `ready to merge`, or the thread reason with `_` → space), age; **📌** opens a small menu of streams (+ `New stream…`) that sends `pin` with the row's URL and title; **✕** sends `WORK_DISMISS` with `key`, `updatedAt`, `threadId`
  - `<MineSection prs={WorkItemStatus[]} … />` — same row without ✕
- Clicking a row title sends `WORK_OPEN` with `url` and `threadId`.

Dismiss is optimistic: the row hides at once (local state), and if `send` rejects it comes back with
`could not dismiss — retry` under it.

- [ ] **Step 1: Write the failing tests**

- `lists waiting before activity with counts in the headings` — headings `Waiting on you (2)`, `New activity (1)`, `My open PRs (1)`
- `shows one row with two reason chips`
- `pins a row into a stream`
- `hides a dismissed row at once and brings it back with a note when dismissing fails`
- `opens a row and passes its thread id`

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/sidepanel/InboxSection.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `StatusChips`, `InboxSection`, `MineSection`; render them in `SidePanel`**

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter browser-extension exec vitest run src/sidepanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/sidepanel
git commit -m "Side panel: inbox, My open PRs and status chips"
```

---

### Task 12: Side panel streams, labels and the work token setting

**Files:**
- Create: `apps/browser-extension/src/sidepanel/StreamSection.tsx`
- Create: `apps/browser-extension/src/sidepanel/WorkSettings.tsx`
- Create: `apps/browser-extension/src/sidepanel/StreamSection.test.tsx`
- Modify: `apps/browser-extension/src/sidepanel/SidePanel.tsx` (streams list, label filter, `+ New stream`, settings)

**Interfaces:**
- Consumes: `StreamsFile`, `Stream`, `StreamOp`, `streamLabels`, `itemRefOf` (Tasks 1–3); `StatusChips` (Task 11); `unreadKeys` (Task 7); `useWorkState`, `updateWorkUi` (Task 10).
- Produces:
  - `<StreamSection stream={Stream} index={number} count={number} statuses={WorkSnapshot['pinned']} unread={Set<string>} label={string | undefined} collapsed={boolean} readOnly={boolean} streams={Stream[]} />`
  - `<WorkSettings />` — a `Work token` password input with **Save** / **Remove** (`WORK_SET_TOKEN`) and the hint `A classic token with repo and notifications, for orgs that block the kaihuman app.`

Behaviour:
- Header: `▾`/`▸` name `(<open count>)`; click toggles `workUi.collapsed`; inline rename on double
  click (`renameStream`); **↑**/**↓** send `reorderStreams`; **Delete** asks
  `confirm('Delete "<name>" and its <n> items?')` when it has items, then `deleteStream`.
- Item row: icon by kind (`⇄` PR, `◎` issue, `#` for hosts ending in `slack.com`, `↗` for other
  links; no favicon fetch, which would need a new host permission), title (from `statuses[key].title` when present, else the
  stored title), `repo#number` for GitHub, `StatusChips`, labels as chips, age from `addedAt`.
  Actions: **Labels** (prompt with comma-separated current labels → `setLabels`), **Move** (select
  → `move`), **✓** (`markDone`), **✕** (`remove`). Title click → `WORK_OPEN` with the unread thread
  id when there is one.
- Rows are `draggable`; dropping on another stream's header sends `move` with that stream id.
- `Done (<n>)` row, collapsed by default; expanded rows show **Undo** (`undone`).
- Label filter: a select of `streamLabels(file)` plus `all`; when set, streams show only items with
  that label, and empty streams are hidden. Stored in `workUi.label`.
- Read-only: all edit actions are disabled.

- [ ] **Step 1: Write the failing tests**

- `shows open items with status and labels, and done items folded`
- `uses the live title for GitHub items`
- `sends move when an item is dropped on another stream`
- `asks before deleting a stream with items`
- `filters by label across streams`
- `disables editing when the file is read-only`
- `saves and removes the work token`

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/sidepanel/StreamSection.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `StreamSection`, `WorkSettings` and the list in `SidePanel`**

- [ ] **Step 4: Run all side panel tests**

Run: `pnpm --filter browser-extension exec vitest run src/sidepanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/sidepanel
git commit -m "Side panel: streams with labels, moves, done items and the work token"
```

---

### Task 13: Start page card

**Files:**
- Create: `apps/browser-extension/src/newtab/WorkCard.tsx`
- Modify: `apps/browser-extension/src/newtab/StartPage.tsx` (render `<WorkCard />` as the first `<section>` in the column that holds the braindumps, near line 594)
- Modify: `apps/browser-extension/src/newtab/StartPage.test.tsx`

**Interfaces:**
- Consumes: `useWorkState` (Task 10); `buildInbox`, `workSummary` (Task 7).
- Produces: `<WorkCard />` — renders nothing when signed out or when all three counts are 0 and
  there is no problem; else the line `<w> waiting on you · <a> new · <r> red CI in streams` (parts
  with 0 are left out) and the first three waiting rows (title + reason). A click on the card calls
  `chrome.sidePanel.open({ windowId })` with the current window (`chrome.windows.getCurrent()`),
  directly from the page so the user gesture counts.

- [ ] **Step 1: Write the failing tests** (in `StartPage.test.tsx`, extend the `chrome` stub with `storage.local` data for `workSnapshot`/`streamsCache`, `sidePanel.open` and `windows.getCurrent`)

- `shows the work summary and the first three waiting rows`
- `leaves out zero counts`
- `opens the side panel on click`
- `shows nothing when signed out`

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter browser-extension exec vitest run src/newtab/StartPage.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `WorkCard` and place it**

- [ ] **Step 4: Run the full extension suite**

Run: `pnpm --filter browser-extension test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/newtab
git commit -m "Start page: work summary card that opens the side panel"
```

---

### Task 14: Docs, full checks and the manual run

**Files:**
- Modify: `doc/work-streams.md` (status line → `built (<date>)`; the `GITHUB_WORK_QUERIES` sentence → the inbox searches live in `src/background/work/queries.ts` and reuse three of its strings; note the other planning decisions)
- Modify: `doc/features.md` (rows under **Browser extension**)
- Modify: `doc/progress.md` (dated entry at the top)
- Modify: `packages/docspack/docs/40-browser-extension.md` (a **Work streams** section: side panel, pin shortcut, Pin to stream menu, `.kh/browser.streams.json`, work token)
- Modify: `apps/browser-extension/README.md` if it lists features or permissions (add `sidePanel` and why)

- [ ] **Step 1: Write the docs**

`doc/features.md` rows (Browser extension table, `Added` = the build date):
- `Work side panel: pinned streams with labels, Waiting on you / New activity inbox from GitHub, My open PRs, live CI and review status, merged or closed items done by themselves | side panel (toolbar → side panel, or the start page card)`
- `Pin any tab to a stream: Alt+Shift+P, right-click **Pin to stream ▸**, or the This-tab bar; stored in .kh/browser.streams.json | all pages`
- `Work summary card and toolbar badge with the Waiting-on-you count | start page, toolbar icon`

- [ ] **Step 2: Run the repo's checks exactly as CI does**

Run: `pnpm run check && pnpm -r test && pnpm run build`
Expected: zero Biome warnings, zero type errors, all tests pass, build succeeds. Fix anything
reported with `pnpm run fix` and by hand, then run again.

- [ ] **Step 3: Manual run with a real account** (load `apps/browser-extension/dist` unpacked)

Check and note the result of each in the progress entry:
1. Pin a GitHub PR, a Slack thread and a Claude session; all three appear in the panel and in
   `.kh/browser.streams.json` after one commit.
2. Merge (or close) the pinned PR; within 5 minutes (1 with the panel open) it is under **Done**.
3. Ask someone (or a second account) to request your review; it is under **Waiting on you** within
   2 minutes; ✕ removes it from github.com/notifications.
4. `Alt+Shift+P` on a page pins it to the last stream; right-click **Pin to stream ▸** lists the streams.
5. The employer org: its PRs appear, or the org banner shows; with a work token set, they appear.

- [ ] **Step 4: Commit**

```bash
git add doc packages/docspack apps/browser-extension/README.md
git commit -m "Work streams: docs, features and progress"
```
