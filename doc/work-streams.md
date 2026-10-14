# Work streams — design

Status: built (2026-10-14); the manual check with a real account is still open.

## Goal

You work in many streams at the same time: issues and pull requests in an employer's GitHub org,
in kaihuman and in other repos, and Slack threads (for example threads where you tag Claude). You
lose track of them. The browser extension gets one place that shows what needs you now and what you
work on, with little manual upkeep.

**Problems this solves**

| Today | After |
| --- | --- |
| A review request or a mention gets lost among GitHub e-mails and tabs. | The side panel lists it under **Waiting on you** or **New activity** within about a minute. |
| You remember a Slack thread exists, but not where. | One click in the side panel pins the open tab to a stream. |
| You have to look up the CI and review state of each PR. | Every pinned PR shows CI, review state, conflicts and new activity. |
| A finished item stays on your list until you remove it. | A merged or closed pinned item moves to **Done** by itself. |
| There is no overview of your open PRs. | **My open PRs** lists every open PR you wrote that is not pinned. |

**Success criteria**

- A review request in any repo the token can read is in the inbox within about two minutes.
- Pinning the open tab takes one click (or `Alt+Shift+P`) and works for any `http(s)` page.
- A pinned PR that is merged or closed shows as done without any action from you.
- The streams are the same in every browser where you use the extension.
- Polling uses less than 10% of the GitHub rate limit.

**Non-goals.** This is not a project manager and not a Slack client. It does not read Slack
messages, write to GitHub issues or PRs (except marking notifications done), or send alerts.

## Research findings

**Does the token need access to all repos?** No extra access. The console signs in through a
GitHub OAuth App with the classic `repo` scope (`apps/auth-worker/src/index.ts`). That token
already reads every repo you can read, private and org repos included, and the `@me` searches cover
all of them. The limits are org policies:

- An org with **OAuth App access restrictions** must approve the kaihuman app. Until it does, its
  items are missing from searches and notifications without an error.
- An org with **SAML SSO** needs the token authorised for SSO. GitHub then answers with an
  `X-GitHub-SSO` header that holds the authorisation link.

**Is there a feed?** Yes: the Notifications API (`GET /notifications`). It is the same inbox as
github.com/notifications, with a `reason` per thread (`review_requested`, `mention`,
`team_mention`, `assign`, `author`, `comment`, `state_change`, …). It is made for polling: it
supports `If-Modified-Since` (a `304` does not count against the rate limit) and sends
`X-Poll-Interval`. It accepts classic OAuth tokens and classic personal access tokens, but not
fine-grained tokens or GitHub App tokens. Webhooks push events, but they need admin rights on each
repo or org and a server, so they do not fit. The private Atom feed (`<user>.private.atom`) has too
little information.

**Slack.** A Slack integration needs a Slack app, a user token with `search:read` and an OAuth step
in `auth-worker`. Slack has no API for the Activity feed or "Later". Company workspaces often do not
let members install apps. So Slack threads come in by **pinning the tab**: the extension already
has the URL and title of every tab. Work that starts in Slack with Claude often ends in a GitHub
PR, so the inbox still sees that part.

## Decisions

1. **Where:** the browser extension. A **side panel** is the workspace, the **start page** shows a
   summary card, and the **toolbar icon** shows a badge.
2. **What:** pinned **streams** that you curate, plus an automatic **inbox** ("needs you") and an
   automatic **My open PRs** group.
3. **Grouping:** each pinned item is in exactly one stream and has optional free-text labels.
4. **Architecture:** everything runs in the extension. Streams are a file in the data repo, and the
   inbox state is GitHub's own notification state. There is no server. (Rejected: a Cloudflare
   backend with webhooks — it would hold your token and needs admin rights per repo. Rejected:
   browser storage only — no sync between machines, and the console could never read it.)

## Data model: `.kh/browser.streams.json`

The file holds only what you curate. Inbox contents and live status are never written to it.

```json
{
  "version": 1,
  "updatedAt": "2026-10-14T09:12:00Z",
  "streams": [
    {
      "id": "st_k3f9",
      "name": "Payments migration",
      "createdAt": "2026-10-14T09:00:00Z",
      "items": [
        {
          "id": "it_8a2c",
          "url": "https://github.com/acme/api/pull/412",
          "title": "Move refunds to the new ledger",
          "addedAt": "2026-10-14T09:05:00Z",
          "labels": ["waiting on Sam"]
        },
        {
          "id": "it_q71d",
          "url": "https://acme.slack.com/archives/C04/p1728896",
          "title": "#payments: @Claude rollout plan",
          "addedAt": "2026-10-14T09:10:00Z",
          "labels": [],
          "doneAt": "2026-10-15T16:00:00Z"
        }
      ]
    }
  ]
}
```

Rules:

- **The kind comes from the URL and is not stored.** A parser gives a discriminated union:
  `github-pr` and `github-issue` (with `owner`, `repo`, `number`), or `link`. URLs such as
  `/pull/412/files` or `/pull/412#discussion_r1` are the same PR. New kinds need no file change.
- **One URL, one place.** URLs are compared after normalisation (no tracking query parameters, no
  trailing slash, and no plain anchor such as `#top`). A fragment that is a route (it contains `/`
  or starts with `#!`, as in Gmail's `#inbox/<id>`) is kept, so hash-routed pages stay separate
  items. Pinning a URL that is already pinned moves it.
- **Done.** A GitHub item gets `doneAt` when it is merged or closed. A link gets `doneAt` when you
  click ✓. Done items are in a collapsed **Done** row in their stream. A write removes items whose
  `doneAt` is more than 14 days old.
- **Labels** are free text per item. The label filter lists the labels that exist.
- **Only `http:` and `https:` URLs**, as in `browser.pinnedtabs.json`, because the file is remote
  input.
- **Entries this version does not understand** (unknown fields, invalid entries) are not shown, but
  stay in the file unchanged. A write never removes them.
- **Code location.** The type, parser, validator and the operations (`pin`, `move`, `setLabels`,
  `markDone`, `undone`, `remove`, `addStream`, `renameStream`, `deleteStream`, `reorderStreams`,
  `prune`) are pure functions in `@kaihuman/formats` (`streams.ts`), so the console and the CLI can
  read the same file later. The extension does the reading, caching and writing.
- **Per-device state** is in `chrome.storage.local` and is never committed: collapsed streams, the
  label filter, the last stream used, dismissed inbox rows, the snapshot, the write queue and the
  optional work token.

## Inbox

### Waiting on you (standing state)

Searches that stay true until the state changes:

| Reason | Search |
| --- | --- |
| Review requested | `is:open is:pr archived:false review-requested:@me` |
| Assigned | `is:open archived:false assignee:@me` |
| Your PR, CI failing | `is:open is:pr archived:false author:@me status:failure` |
| Your PR, changes requested | `is:open is:pr archived:false author:@me review:changes_requested` |
| Your PR, approved and green | `is:open is:pr archived:false author:@me review:approved status:success` |

The inbox searches live in `apps/browser-extension/src/background/work/queries.ts` and reuse three
strings from `GITHUB_WORK_QUERIES` in `packages/palette/src/protocol.ts`, so the palette's `>gw` is
unchanged. ✕ hides a row on this device **until the item's `updatedAt` changes**.

### New activity (events)

`GET /notifications?participating=true`: only threads you take part in, not repos you only watch.
✕ marks the thread done on GitHub (`DELETE /notifications/threads/{id}`), so it also leaves
github.com/notifications.

### Rules

- **Pinned items are never in the inbox.** Their status and the **• new** dot show on their row in
  the stream. Opening a pinned item that has unread activity marks its thread read.
- An item with more than one reason is **one row** with a chip per reason. ✕ on such a row does
  both: it hides the standing reasons and marks the thread done.
- Each row has **Pin to stream…** (choose or create a stream, add labels) and **✕**.
- Order: Waiting on you, then New activity; newest first in each.
- Slack has no inbox source. Slack threads come in by pinning.

### My open PRs

`is:open is:pr archived:false author:@me`, minus pinned items, with status chips. It is computed
and read-only; **Pin** moves a PR into a stream.

## User interface

### Side panel (`chrome.sidePanel`)

```
┌ Work ──────────────────── ⟳ 1m ago ┐
│ [label: all ▾]  [search…]          │
├─ This tab ─────────────────────────┤
│ #payments: rollout plan (Slack)    │
│ [Payments migration ▾] [+label] Pin│
├─ Waiting on you (3) ───────────────┤
│ ⇄ acme/api#418 Ledger backfill     │
│   review requested · 2h      📌 ✕  │
├─ New activity (2) ─────────────────┤
│ ◎ acme/web#88 mentioned you · 5m   │
├─ My open PRs (4) ──────────────────┤
│ ⇄ acme/api#401 ✓ approved · ✓ CI   │
├─ ▾ Payments migration (5) ─────────┤
│ ⇄ acme/api#412 Refunds → ledger    │
│   CI ✗ · changes requested • new   │
│   [waiting on Sam]                 │
│ # #payments: @Claude rollout plan  │
│   Slack · 3d                    ✓  │
│   ▸ Done (2)                       │
├─ ▸ kaihuman (3)  ▸ Hiring (1)      │
│ [+ New stream]                     │
└────────────────────────────────────┘
```

- **This tab** pins the active tab to a stream (default: the stream used last), with optional
  labels. If the tab is already pinned, the bar shows its stream and offers ✓ and move.
- **Rows** show an icon by kind (PR, issue, Slack, or the favicon), the title, `repo#number`,
  status chips (CI ✓/✗/●, approved / changes requested / review requested, conflict, draft), the
  **• new** dot, labels and age. Hover actions: labels, move, ✓, remove.
- **Streams** collapse, reorder, and take items dragged from other streams. Rename is inline.
  Deleting a stream that has items asks first. The label filter applies to all streams.
- **Other ways to pin:** the context menu **Pin to stream ▸** on a page or a link, and the command
  `pin-current-tab` (default `Alt+Shift+P`, changeable in Chrome) that pins to the stream used
  last.

### Start page card

One card: **"3 waiting on you · 2 new · 1 red CI in streams"**, then the first three rows of
Waiting on you. A click opens the side panel. With nothing waiting, the card says **Nothing
waiting — open work panel**, so it is always a way into the panel.

### Toolbar badge

The extension icon shows the Waiting-on-you count. A click still opens the popup, which has an
**Open work panel** button.

## Polling and status

The **service worker is the only part that calls GitHub.** It writes one snapshot to
`chrome.storage.local` (`workSnapshot`). The side panel, start page and badge read the snapshot
and re-render on `chrome.storage.onChanged`. A new alarm `work` runs next to `repoSync`.

Each cycle makes at most two calls:

1. **Notifications**, every minute (or `X-Poll-Interval` if it is longer):
   `GET /notifications?participating=true` with `If-Modified-Since`. A `304` costs nothing. A
   change starts call 2 at once.
2. **One GraphQL query**: every 5 minutes, every minute while the side panel is open, and directly
   after call 1 sees a change. It has the six searches as aliased `search` fields and every pinned
   GitHub item by `owner/repo#number`. Per item: `state`, `isDraft`, `reviewDecision`, CI rollup
   state, `mergeable`, `updatedAt`, `title`. This costs a few points per run, about 100–300 points
   per hour of the 5,000.

The snapshot gives:

- the **inbox** (searches and notifications, merged by `owner/repo#number`, minus pinned and
  dismissed items);
- **auto-done** for pinned items that are merged or closed, and the 14-day prune, both through the
  write queue;
- the **badge** count;
- the current **titles** of pinned GitHub items (shown from the snapshot, no commit needed).

The streams file uses the pinned-tabs cache pattern (`src/background/pinned-tabs.ts`): ETag reads,
a 15-minute cache, and a refresh when the side panel opens.

### Writes

Changes are **operations in a queue** in `chrome.storage.local` (`streamsWriteQueue`), not whole
files. The queue survives a suspended service worker. A flush runs a few seconds after the last
change (or on the next wake): it reads the file, applies the queued operations in order, and
commits against the blob `sha`. On a conflict it reads and applies again, up to three times; then
the queue stays and the panel shows "not saved yet". All operations are idempotent, so two browsers
that both see a merge give the same file.

## Error handling

The rules: never lose data, never fail without a message, and keep the last good snapshot with an
"as of 14:02" stamp.

**Org access.** A restricted org does not cause an error in searches or notifications; its items
are only missing. The signal is a **pinned item** in that org: GraphQL returns a `FORBIDDEN` error
for it, or GitHub sends `X-GitHub-SSO`. Then:

- a banner per org, until the access works, with the fix: the link to request approval of the
  kaihuman OAuth App for that org, or the SSO authorisation link GitHub sent;
- the org's pinned items stay as links with a **no access** chip;
- **Work token** (fallback): an optional field in the extension settings for a classic personal
  access token with `repo` and `notifications`, SSO-authorised if needed. It is kept only in
  `chrome.storage.local`. When it is set, all work polling uses it; data-repo writes keep the
  sign-in token.

**API errors.**

| Error | Behaviour |
| --- | --- |
| `401` | Polling stops, the badge shows `!`, the panel says "Sign in again". |
| `403`/`429` rate limit | Wait until `x-ratelimit-reset` or `retry-after`; the panel shows "paused until 14:20". |
| Offline, `5xx` | Keep the snapshot; retry with backoff 1, 2, 4 … 15 minutes. ⟳ retries now. |
| Pinned item not found | **not found** chip; the item is never removed by itself. |
| Dismiss or mark-done fails | The row was hidden at once; it comes back with "could not dismiss — retry". |

**Streams file.**

| Problem | Behaviour |
| --- | --- |
| Not valid JSON (e.g. after a hand edit) | Read-only mode, banner with a link to the file in the console. Never overwritten. |
| Invalid entries | Hidden, kept unchanged in the file. |
| Signed out | The panel asks you to sign in; pinning is off. |

## Testing

Vitest, with `chrome` stubbed through `vi.stubGlobal` (as in `service-worker.test.ts`), `fetch`
mocked, and components rendered with `preact` `render` (as in `StartPage.test.tsx`).

- **`@kaihuman/formats` `streams.test.ts`:** round trip; unknown fields and invalid entries kept;
  `javascript:` and `file:` refused; invalid JSON reported, not repaired; URL → kind for PR and
  issue URLs with suffixes, Slack, Claude and other links; normalisation for duplicates; every
  operation pure and idempotent; pin of an existing URL moves it; prune removes only items done for
  more than 14 days.
- **Extension background:** inbox merge (one row, several reasons; pinned excluded; dismissed rows
  come back only after a change); notification subject URL → `owner/repo#n`; GraphQL query for N
  pinned items and parsing of partial responses with per-org `FORBIDDEN` errors; `If-Modified-Since`
  replay, `304`, `X-Poll-Interval`, immediate refresh on change, backoff and rate-limit pause; write
  queue across a simulated worker restart, conflict → reread → success, three conflicts → queue
  kept; `401` stops polling; the work token is used for polling and not for writes.
- **UI:** side panel states (empty, signed out, read-only, stale, org banner); This-tab bar for a
  new and for a pinned URL; dismiss (optimistic, reverted on failure); label filter; start page
  card counts and the click that calls `chrome.sidePanel.open`.
- **Manifest:** `sidePanel` permission and `side_panel.default_path`; the `pin-current-tab`
  command; no new host permissions (`https://api.github.com/*` is already there); release checks
  still pass.
- **Manual, before done:** the built extension with a real account: pin a PR, a Slack thread and a
  Claude session; a merge marks the PR done; a review request is in the inbox within two minutes;
  check the employer org (approval or work token).

## Out of scope for now

- Slack as an inbox source (needs a Slack app; reconsider if the workspace allows one).
- A console view of the streams (the file format makes it possible later).
- Notifications on the desktop or the phone.
- Fading or archiving old `link` items automatically.

## Decisions made while building

- **OAuth approval link:** `https://github.com/settings/applications`; the SSO link is
  `https://github.com/orgs/<org>/sso`.
- **Notifications that are not PRs or issues** (discussions, releases, check suites) show as
  `thread:<id>` rows, so they are not lost.
- **More than 50 pinned items** are split into several GraphQL queries.
- **Stream order** changes with ↑/↓ buttons.
- **Done items** are pruned when `now − doneAt > 14 days` exactly.
- **Transient GraphQL errors** keep the last data instead of replacing it.
- **The sign-in message** shows only when signed out, not when only the data repo is missing.
