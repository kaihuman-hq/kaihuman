# Business, phase 3: daily forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner run the business day to day from kaihuman:
- log time, and start and stop a timer that is shared across devices
- add client todos and log lines
- record payments
- create clients and projects
- write drafts (blank, from unbilled time or from a retainer)
- issue invoices, offers and credit notes
- mark offers accepted or declined, or turn them into invoices
- capture for a client from the Quick pages and the console palette

It also shows business hours in the time views, and makes issued documents read-only in the generic file browser.

**Architecture:**
- **Pure builders** in `packages/formats/src/business/` produce file changes (`FileChanges`: path → new content, or `null` to delete). They are the single source of truth for what each action writes, so the console, the agent skill and later the palettes can share them.
- **One console write layer** (`lib/business/write.ts`) applies the changes:
  1. re-reads the files it touches
  2. commits atomically with `commitFiles`, guarded by the head sha the read saw
  3. retries once when the branch moved
  4. updates the local file store so pages refresh without a full reload
- Forms are thin Preact components over pure form-logic modules, like the phase 2 enable page.

**Tech Stack:** Preact + signals, preact-router, Tailwind `--los-*`, Octokit (core), Vitest (jsdom, `preact` `render` + `act`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-business-design.md` (sections 3, 5 "Forms", 6, 9, 10 phase 3). Phases 1–2: `packages/formats/src/business/*`, `apps/console/src/lib/business/*`, `apps/console/src/pages/{Business,Clients,Client,BusinessEnable}Page.tsx`, `doc/business.md`.

## Global Constraints

- **Writes:**
  - Every business write goes through `writeBusiness` (Task 3), and so through one `commitFiles` call per user action, with a readable message starting `business: `.
  - No business write uses `saveFile`.
  - Client todo and log lines use the existing `addTodoEntry` / `addActionLogEntry` from `@kaihuman/formats`. Existing file text is kept byte for byte, apart from the appended line.
- **Conflicts (spec section 9):**
  - The write re-reads the files it touches, then commits with `expectedHeadSha`.
  - If the branch moved, it rebuilds from fresh contents and retries once.
  - If that fails too, it throws `ConflictError`, and the form shows `Someone else changed the repository at the same time. Reload and try again.` Nothing is half-written.
- **Issued documents are never written** except at issue time, through `issue()`. No form edits or deletes anything under `offers/` or `invoices/`.
- **Running timer:**
  - one per repo, in `.kh/business/time/running.yaml`
  - `{ client, project?, started_at, note? }`, where `started_at` is an ISO datetime with offset
  - start creates it; stop turns it into a time entry and deletes it, in the same commit
  - starting while one runs is refused with `A timer is already running for <client>.`
- **Stopping a timer:**
  - entry `date` = local date of `started_at`
  - `minutes` = round((now − started_at) / 60000), clamped to 1…1440
  - stop opens the log-time form prefilled, so the user can fix minutes, date and note before saving
- **Dates:** local, via `todayLocal()` / `localDate`. Money stays integer minor units. Decimals are strings.
- **Slugs:** client and project slugs come from names via the ideas slug rule (`/^[a-z0-9][a-z0-9-]{1,39}$/`, cut at a word end). The user can edit the slug before saving. An existing slug is refused.
- **Offer accepted:**
  - appends an `accepted` event
  - moves the client's `stage` to `active` if it was `lead`, `contacted` or `offer-sent`
  - "Declined" appends a `declined` event only
  - "Convert to invoice" creates a draft with `from_offer`
- **Credit note:** a draft of kind `credit-note` with `corrects` = the invoice number. Its lines are prefilled from the invoice and can be edited, then it is issued like any draft.
- **UI:**
  - same look as phase 2 (raw Tailwind, `--los-*`, `StatusBar`, `components/business/*`)
  - labels on every field, phone width works, a disabled submit while saving, a `useRef` double-submit guard
  - success routes to the relevant client page, or returns to where the form was opened
- **The palette here means the console `SearchModal` (`packages/ui/src/LifeOS/Organisms/SearchModal.tsx`).** The browser extension and desktop palettes are phase 5 (spec).
- **Generated files:** never commit `apps/console/src/version.ts` / `version.json` build churn.
- **Done means:** zero Biome warnings, zero type errors, all tests pass. Turbo's root check fails in the sandbox, so run `pnpm --filter <pkg> lint|check-types|test` per package. Build `@kaihuman/formats` and `@kaihuman/ui` before console tests when they changed. Each task adds a bullet to one dated `doc/progress.md` entry `## 2026-11-02 — Business, phase 3: daily forms`, created in Task 1.

## Review Focus

1. **Two devices write at once.** Phone and laptop each log time for the same month. Both entries land in `time/<month>.jsonl` (one after a retry), and none is lost. Test in Task 3.
2. **The timer runs past midnight or for days.** Stop yields a prefilled entry dated on the start day with at most 1440 minutes, and the user can correct it. Test in Task 2.
3. **Issuing with stale data.** Another device issued `RE-2026-0042` a minute ago. This device's issue re-reads the tree, takes `RE-2026-0043`, and never overwrites. Test in Task 8.
4. **Deleting a draft, then loading the tree.** After issue, the draft never reappears from the local cache. Test in Task 1.
5. **Form validation errors.** A bad IBAN, an empty line description or an unquoted rate never commits. Each shows a field error, and the user's input stays in the form. Tests in Tasks 5–8.

---

### Task 1: Core — deletes, head guard and local store update in one commit

**Files:**
- Modify: `packages/core/src/services/github.service.ts` (`commitFiles`), `packages/core/src/services/github.service.memory.ts` (`commitFiles`), `packages/core/src/stores/github-file.store.ts` (new `applyCommit`)
- Create: `packages/core/src/services/conflict.ts` (`ConflictError`)
- Test: `packages/core/src/services/commit-files.test.ts`, `packages/core/src/stores/apply-commit.test.ts` (follow existing core test setup; `fake-indexeddb` is available at the root)
- Modify: `doc/progress.md` (new entry)

**Interfaces:**
- Produces:
  - `commitFiles(owner, repo, branch, files: Record<string, string | null>, message: string, opts?: { expectedHeadSha?: string }): Promise<{ commitSha: string; blobShas: Record<string, string> }>`
    - `null` → tree entry `{ path, mode: '100644', type: 'blob', sha: null }`
    - `expectedHeadSha` given but differs from the ref → throws `ConflictError` before creating anything
    - `updateRef` failing as non-fast-forward (status 409/422) → `ConflictError`
    - `blobShas` come from the created tree (`git.getTree(newTree.sha, recursive)` filtered to the written paths), or from the createTree response
  - `getHeadSha(owner, repo, branch): Promise<string>` on both services
  - `class ConflictError extends Error { readonly name = 'ConflictError' }`, exported from `@kaihuman/core`
  - In memory: `null` deletes, `expectedHeadSha` compared with a counter-based fake head that changes on every commit, and the same return shape
  - `githubFileStore.applyCommit(changes: Record<string, string | null>, blobShas: Record<string, string>): Promise<void>`, which updates:
    - `tree` (add/replace with the new sha, remove deleted)
    - the IDB `files` and `trees` entries, the same way `deleteFile` and `createFile` do, so `loadTree`'s merge cannot resurrect a deleted path
    - open files (`openFiles` replaced or closed)
- Existing callers (`lib/github-kb.ts`, `lib/business-setup.ts`) keep working without changes. The added param is optional, and the return value can be ignored.

- [ ] **Step 1: Write failing tests**

```ts
// memory service
await svc.commitFiles('o', 'r', 'main', { 'a.md': 'x', 'b.md': 'y' }, 'm1');
const head = await svc.getHeadSha('o', 'r', 'main');
await svc.commitFiles('o', 'r', 'main', { 'b.md': null }, 'm2', { expectedHeadSha: head });
expect((await svc.fetchRepoTree('o', 'r', 'main')).map((t) => t.path)).toEqual(['a.md']);
await expect(svc.commitFiles('o', 'r', 'main', { 'a.md': 'z' }, 'm3', { expectedHeadSha: head })).rejects.toBeInstanceOf(ConflictError);
// real service with mocked octokit: null → sha:null entry; expectedHeadSha mismatch → ConflictError and createTree not called; updateRef 422 → ConflictError
// store: after applyCommit({ '.kh/business/drafts/X.yaml': null }, {}) and a loadTree() whose remote tree still lists the draft (stale API) but IDB had it cached, the draft is not in tree (Review Focus 4)
```

- [ ] **Step 2: Run** `pnpm --filter @kaihuman/core test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the core tests, lint and check-types. Then run the console tests (callers unchanged). Expected: PASS.
- [ ] **Step 5: Commit:** `feat(core): commitFiles deletes, head guard and store update`

### Task 2: Formats — running timer and time entries

**Files:**
- Modify: `packages/formats/src/business/records.ts` (`RunningTimer`, `KEY_ORDER.timer`), `validate.ts` (`validateTimer`), `paths.ts` (kind `timer` for `.kh/business/time/running.yaml`, plus `TIMER_PATH`), `repo.ts` (load it into `BusinessRepo.timer: RunningTimer | null`), `check.ts` (timer client must exist)
- Create: `packages/formats/src/business/actions/time.ts`
- Test: `packages/formats/src/business/actions/time.test.ts`, plus extensions of `paths.test.ts` and `repo.test.ts`

**Interfaces:**
- Produces:
  - `type RunningTimer = { client: Slug; project?: Slug; started_at: string; note?: string }`
  - `startTimer(repo: BusinessRepo, input: { client: string; project?: string; note?: string }, now: Date): Result<{ changes: FileChanges; message: string }>`
    - refuses when `repo.timer` exists: issue at `timer`, message `A timer is already running for <client>.`
    - refuses an unknown client or project
    - message: `business: start timer for <client>`
  - `timerToEntry(timer: RunningTimer, now: Date): Omit<TimeEntry, 'id'>`
    - date = local date of `started_at`
    - minutes = clamp(round(Δ/60000), 1, 1440)
  - `logTime(repo: BusinessRepo, timeFiles: Readonly<Record<string, string>>, entry: Omit<TimeEntry, 'id'>, opts: { id: Ulid; stopTimer?: boolean }): Result<{ changes: FileChanges; message: string }>`
    - validates the entry
    - appends it to `timePath(entry.date.slice(0, 7))` via `appendJsonl` with `KEY_ORDER.time`
    - with `stopTimer`, also sets `TIMER_PATH` to `null`
    - message: `business: log 1.5 h for <client>`
  - `cancelTimer(repo: BusinessRepo): Result<{ changes: FileChanges; message: string }>` deletes `TIMER_PATH`
- The agent skill (`packages/formats/skills/kh-business/SKILL.md`) documents `time/running.yaml`.

- [ ] **Step 1: Write failing tests**

```ts
const t = { client: 'acme-gmbh', started_at: '2026-11-02T23:30:00+01:00' } as RunningTimer;
expect(timerToEntry(t, new Date('2026-11-03T01:00:00+01:00'))).toMatchObject({ date: '2026-11-02', minutes: 90 }); // Review Focus 2
expect(timerToEntry(t, new Date('2026-11-05T09:00:00+01:00')).minutes).toBe(1440);
expect(timerToEntry(t, new Date('2026-11-02T23:30:10+01:00')).minutes).toBe(1);
expect(startTimer({ ...repo, timer: t }, { client: 'acme-gmbh' }, now)).toMatchObject({ ok: false, issues: [{ path: 'timer' }] });
const r = logTime(repo, { '.kh/business/time/2026-11.jsonl': existing }, { date: '2026-11-02', minutes: 90, client: 'acme-gmbh', note: 'x' }, { id: ulid0, stopTimer: true });
expect(r.ok && r.value.changes['.kh/business/time/running.yaml']).toBeNull();
expect(r.ok && r.value.changes['.kh/business/time/2026-11.jsonl']?.startsWith(existing)).toBe(true);
expect(classifyBusinessPath('.kh/business/time/running.yaml')).toEqual({ kind: 'timer' });
// repo.test: a timer for an unknown client → check finding; timer loads into repo.timer
```

  (Use local-offset-aware date maths. In tests, use explicit offsets and compute the local date in the test's timezone, or set `TZ=Europe/Berlin` for the run and say so.)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the formats tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(formats): running timer and time entry actions`

### Task 3: Console write layer

**Files:**
- Create: `apps/console/src/lib/business/write.ts`
- Test: `apps/console/src/lib/business/write.test.ts`

**Interfaces:**
- Consumes: `githubService.getHeadSha`, `commitFiles(..., { expectedHeadSha })`, `ConflictError`, `githubFileStore.applyCommit` (Task 1), `fetchRepoTree`, `getFileContent`, `loadBusinessRepo` (phase 2), `rememberRepoFile` (`lib/repo-files.ts`)
- Produces:
  - `type Fresh = { headSha: string; tree: TreeItem[]; repo: BusinessRepo; read: (path: string) => Promise<string | null> }`
    - `read` fetches current content, or `null` if the path isn't in the tree
  - `writeBusiness(target: KBRepo, build: (fresh: Fresh) => Promise<Result<{ changes: FileChanges; message: string }>>): Promise<Result<{ commitSha: string }>>`, which:
    1. gets the head sha
    2. fetches the tree at that head
    3. loads the business files needed for `repo` (business tree items, through the sha cache)
    4. calls `build`
    5. on `ok: false`, returns the issues without committing
    6. commits with `expectedHeadSha`
    7. on `ConflictError`, repeats steps 1–6 once
    8. on success, calls `githubFileStore.applyCommit` and `rememberRepoFile` for written paths
  - Errors other than conflicts propagate. A second conflict throws `ConflictError`.
  - `CONFLICT_MESSAGE = 'Someone else changed the repository at the same time. Reload and try again.'`
  - `writeErrorMessage(e: unknown): string`: `ConflictError` → `CONFLICT_MESSAGE`; anything else → `Saving failed, nothing was written: <message>`

- [ ] **Step 1: Write failing tests** (mock `@kaihuman/core`, as `business-setup.test.ts` does)

```ts
// first commit rejects with ConflictError, build is called twice with fresh contents, second commit succeeds → ok
// build returns the appended time file built from the content read in that attempt → final committed content contains both the other device's entry and ours (Review Focus 1)
// two conflicts → rejects ConflictError; applyCommit not called
// build returns ok:false → commitFiles not called, issues returned
expect(writeErrorMessage(new ConflictError('x'))).toBe(CONFLICT_MESSAGE);
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): business write layer with conflict retry`

### Task 4: Time forms, timer and business hours

**Files:**
- Create: `apps/console/src/pages/LogTimePage.tsx` (route `/business/time/new?client=&project=&from=timer`), `apps/console/src/lib/business/time-form.ts`, `apps/console/src/components/business/TimerCard.tsx`
- Modify: `apps/console/src/App.tsx`, `apps/console/src/pages/BusinessPage.tsx` (TimerCard plus a "Hours" stat: today and this week), `apps/console/src/pages/ClientPage.tsx` (TimerCard scoped to the client, plus a "Log time" link), `apps/console/src/lib/business/overview.ts` (`hoursSummary(repo, today)` → `{ todayMinutes, weekMinutes }`, Monday-based week)
- Test: `time-form.test.ts`, `LogTimePage.test.tsx`, `TimerCard.test.tsx`, plus an extension of `overview.test.ts`

**Interfaces:**
- Consumes: `startTimer`, `timerToEntry`, `logTime`, `cancelTimer` (Task 2), `writeBusiness`, `writeErrorMessage` (Task 3), `useBusinessRepo`
- Produces:
  - `type TimeForm = { client: string; project: string; date: string; hours: string /* "1.5" or "1:30" */; note: string }`
  - `entryFromForm(form: TimeForm): Result<Omit<TimeEntry, 'id'>>`, where hours accept `1.5`, `1,5`, `1:30` and `90m`, and minutes are rounded
  - `TimerCard({ client?: Slug })`:
    - **no timer:** a client select (fixed when `client` is given), an optional project select, an optional note, and "Start".
    - **timer running:** "Running for <client> · <elapsed>" (updates every 30 s), "Stop…" (routes to `LogTimePage` prefilled with `from=timer`) and "Cancel" (with a confirm step).
  - `LogTimePage` with `from=timer` prefills from `timerToEntry(repo.timer, new Date())` and saves with `stopTimer: true`.
  - On success, routes to `/clients/<client>`.

- [ ] **Step 1: Write failing tests.** Cover:
  - hour parsing (`1:30` → 90, `1,5` → 90, `abc` → field error, `0` → error)
  - prefill from a timer
  - start refused while running (message shown)
  - stop flow commits the time file plus the timer delete in one `writeBusiness` call
  - `hoursSummary` week boundary on Monday
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): log time, shared timer, business hours`

### Task 5: Clients, projects, client todos and log lines

**Files:**
- Create: `packages/formats/src/business/actions/clients.ts` (+ test), `apps/console/src/pages/ClientFormPage.tsx` (`/clients/new`), `apps/console/src/pages/ProjectFormPage.tsx` (`/clients/:slug/projects/new`), `apps/console/src/lib/business/client-form.ts` (+ test), `apps/console/src/components/business/QuickAdd.tsx` (todo / log line input for a client)
- Modify: `App.tsx`, `ClientsPage.tsx` ("New client" link), `ClientPage.tsx` ("New project", and QuickAdd in the Todos and Action log cards)
- Test: `ClientFormPage.test.tsx`, `QuickAdd.test.tsx`

**Interfaces:**
- Produces (formats `actions/clients.ts`):
  - `slugifyName(name: string): Slug`, the ideas slug rule. Reuse `slugifyIdeaTitle`'s algorithm by extracting a shared helper rather than duplicating it.
  - `createClient(repo: BusinessRepo, client: Client): Result<{ changes: FileChanges; message: string }>`
    - refuses an existing slug (issue `slug`)
    - writes `clients/<slug>/client.yaml` via `stringifyYaml(KEY_ORDER.client)`
    - validates through `validateClient`
    - message: `business: new client <slug>`
  - `createProject(repo, project: Project)`: the same pattern, for `clients/<client>/projects/<slug>.yaml`
  - `addClientTodo(repo, logOrTodoText: string | null, client: Slug, text: string, now: Date)` and `addClientLog(...)`: append via `addTodoEntry` / `addActionLogEntry` to `clients/<slug>/todos.todos.md` / `log.actionlog.md`, creating the file the way those helpers do for a new file
- Console form logic:
  - `clientFromForm(form) → Result<Client>`, with fields name, slug (auto from name until the user edits it), street, postcode, city, country (default `DE`), VAT ID, buyer reference, Leitweg-ID, contact name, email, phone, payment terms, stage (default `lead`)
  - `projectFromForm(form) → Result<Project>`, with fields name, slug, status, rate (amount + per hour/day), fixed price, budget hours, budget amount, retainer (amount, interval, next date, description)
  - Money inputs accept `1200`, `1200.50` and `1.200,50` and convert to minor units. Invalid input is a field error.

- [ ] **Step 1: Write failing tests**

```ts
expect(slugifyName('Müller & Söhne GmbH')).toBe('muller-sohne-gmbh');
expect(createClient(repoWithAcme, { ...client, slug: 'acme-gmbh' })).toMatchObject({ ok: false, issues: [{ path: 'slug' }] });
// createClient writes valid YAML that loadBusinessRepo loads with zero findings
// addClientLog on an existing log keeps the old text byte-for-byte + one line
// money parsing: '1.200,50' → 120050, '12,5' → 1250, 'x' → error
// ClientFormPage: invalid email → field error, no writeBusiness call (Review Focus 5); success → route('/clients/<slug>')
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the formats and console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(business): client and project forms, client todos and log lines`

### Task 6: Payments and offer decisions

**Files:**
- Create: `packages/formats/src/business/actions/payments.ts` (+ test), `packages/formats/src/business/actions/offers.ts` (+ test), `apps/console/src/pages/PaymentFormPage.tsx` (`/business/payments/new?invoice=`), `apps/console/src/lib/business/payment-form.ts` (+ test)
- Modify: `App.tsx`, `ClientPage.tsx` (per open invoice: "Record payment"; per issued offer that is not superseded: "Accepted", "Declined", "Convert to invoice"), `BusinessPage.tsx` ("Record payment" on receivables rows)

**Interfaces:**
- Produces:
  - `recordPayment(repo, paymentsText: string | null, payment: Omit<Payment, 'id'>, id: Ulid)`
    - the invoice must exist and be kind `invoice` (issue `invoice`)
    - appends to `paymentsPath(year of payment.date)`
    - message: `business: payment 500.00 EUR for RE-2026-0001`
  - `decideOffer(repo, eventsText: string | null, offer: string, decision: 'accepted' | 'declined', now: Date, id: Ulid)`
    - appends an event to `events.jsonl`
    - on `accepted`, also rewrites `clients/<slug>/client.yaml` with `stage: 'active'` when the stage was `lead`, `contacted` or `offer-sent`, keeping all other fields via `stringifyYaml(KEY_ORDER.client)`
    - refuses a superseded offer, or one that already has a decision (issue `offer`)
  - `offerToInvoiceDraft(offer: Issued, id: Ulid): Draft`: kind `invoice`, same client, project, lines, currency and buyer reference, `from_offer` = number
  - `createDraftFile(repo, draft: Draft)` writes `drafts/<id>.yaml`. Shared with Task 7, so define it here.
  - `paymentFromForm(form, openAmount)`: amount defaults to the invoice's open amount, date defaults to today, plus method and reference
  - An overpayment shows a confirm step: `This is 98.62 EUR more than the open amount. Record anyway?`

- [ ] **Step 1: Write failing tests.** Cover:
  - a payment for an unknown invoice is refused
  - the payment year comes from its date
  - accepting moves stage `offer-sent` → `active`, and leaves `past` unchanged
  - a second decision is refused
  - the convert draft validates and has `from_offer`
  - payment form defaults and the overpayment confirm
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the formats and console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(business): payments and offer decisions`

### Task 7: Draft editor

**Files:**
- Create: `packages/formats/src/business/actions/drafts.ts` (+ test), `apps/console/src/pages/DraftPage.tsx` (`/business/drafts/new?client=&kind=&from=unbilled|retainer&project=` and `/business/drafts/:id`), `apps/console/src/lib/business/draft-form.ts` (+ test), `apps/console/src/components/business/LinesEditor.tsx`
- Modify: `App.tsx`, `BusinessPage.tsx` (drafts list links to `/business/drafts/:id`, plus a "New draft" button), `ClientPage.tsx` ("New invoice from unbilled time", "New offer")

**Interfaces:**
- Produces:
  - `draftFromUnbilled(repo, client: Slug, opts: { project?: Slug; entryIds?: Ulid[] }, id: Ulid, today: string): Result<Draft>`:
    - one line per project with an hourly rate: `quantity` = hours as a decimal string with 2 places, unit `HUR`, `unit_price` = rate
    - day rates use unit `DAY`, with quantity = hours / 8 to 2 places
    - entries without a project or rate go into one line with `unit_price: 0` and the description `Time without rate — set a price`
    - `time_entries` = the entry ids, `vat_category` `S`, rate = profile `default_vat_rate`
    - `service_period` = min/max entry date
    - refuses when there are no unbilled entries (issue `time_entries`)
  - `draftFromRetainer(repo, project: Project, id: Ulid, today: string): Result<Draft>`: one line, the retainer description, quantity `"1"`, unit `C62`, `unit_price` = amount, `service_period` = the retainer period that starts at `next_date`
  - `saveDraft(repo, draft: Draft)` validates and writes `drafts/<id>.yaml`. It may replace an existing draft. Never an issued path.
  - `deleteDraft(repo, id)` sets `drafts/<id>.yaml` to `null`
  - `DraftForm` ↔ `Draft` conversion in `draft-form.ts`
  - `LinesEditor`: rows of description, quantity, unit (select HUR, DAY, C62), unit price, VAT category (S, AE; Z/E/K/O are shown disabled with the hint `needs an exemption note — not supported yet` under `de` regular), VAT rate
    - add and remove rows
    - live totals via `computeTotals` (display only)
  - `DraftPage` has three buttons:
    - **Save draft**
    - **Delete** (with a confirm step)
    - **Issue…**: saves first, then routes to `/business/drafts/:id/issue` (Task 8)

- [ ] **Step 1: Write failing tests**

```ts
// two unbilled entries (90 + 30 min) on project website (rate 9500/hour) → one line quantity "2.00", unit_price 9500, time_entries both ids
// entries without project → a 0-price line with the hint description
// no unbilled → ok:false at time_entries
// retainer: amount 120000 monthly next_date 2026-12-01 → service_period 2026-12-01..2026-12-31
// draft form: empty description → field error at lines[0].description; quantity "1,5" → "1.5"; saveDraft writes YAML that validateDraft accepts
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the formats and console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(business): draft editor from unbilled time and retainers`

### Task 8: Issue and credit notes

**Files:**
- Create: `apps/console/src/pages/IssuePage.tsx` (`/business/drafts/:id/issue`), `apps/console/src/lib/business/issue-flow.ts` (+ test), `packages/formats/src/business/actions/credit.ts` (+ test)
- Modify: `App.tsx`, `ClientPage.tsx` (per invoice that is not fully credited: "Credit note…")

**Interfaces:**
- Consumes: `issue(ctx)` from phase 1 (`IssueContext` with `existingNumbers`, `creditNoteNumbers`, `timeFiles`, `clientLog`, `issueDate`, `now`), `writeBusiness`
- Produces:
  - `buildIssueContext(fresh: Fresh, draftId: Ulid, issueDate: string, now: Date): Promise<Result<IssueContext>>`, which:
    - reads the draft
    - finds `existingNumbers` for the draft's series from `fresh.tree` (all years), and `creditNoteNumbers`
    - reads the time files of the listed entries' months and the client log
  - `previewIssue(...)`: the same as `issue()`, returning the number, totals, due date and legal notes for display without committing
  - `IssuePage`:
    - shows the preview: number, client, issue date (editable, default today), lines summary, net / VAT / gross, due date, legal notes
    - "Issue <number>" runs `writeBusiness((fresh) => buildIssueContext(fresh, …).then(issue))`
    - the committed number may differ from the preview if the tree moved, so the success message shows the committed number
  - After success, a notice reads `Issued RE-2026-0043. Generate the PDF with your generator; kaihuman shows "PDF missing" until it is in the repo.`, then the page routes to the client page.
  - `creditNoteDraft(invoice: Issued, id: Ulid): Draft`: kind `credit-note`, `corrects` = the invoice number, the invoice's lines, no `time_entries`
  - "Credit note…" creates the draft (`createDraftFile`) and routes to the draft editor

- [ ] **Step 1: Write failing tests**

```ts
// issue-flow: draft + fresh tree containing RE-2026-0042 → issued RE-2026-0043; preview made before another device added RE-2026-0043 → writeBusiness retry yields RE-2026-0044, never overwrites (Review Focus 3)
// committed changes: issued file written, draft path null, time entries tagged, log line appended — single commit
// credit draft validates; issuing it gets the next invoice-series number and type_code 381
// IssuePage: shows number + totals; issue error (e.g. de exemption refusal) shown as message, nothing written
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the formats and console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(business): issue documents and credit notes`

### Task 9: Client targets in Quick pages and the console palette

**Files:**
- Create: `packages/formats/src/business/actions/capture.ts` (+ test)
- Modify: `apps/console/src/pages/QuickTodoPage.tsx`, `QuickLogPage.tsx` (optional "For client" select listing clients when business is enabled; with a client, writes go through `addClientTodo` / `addClientLog` + `writeBusiness`, and errors are shown instead of swallowed), `packages/ui/src/LifeOS/Organisms/SearchModal.tsx` (business capture results), `packages/ui/src/LifeOS/Layouts/MainApp.tsx` + `apps/console/src/pages/Dashboard.tsx` (wire an `onBusinessCapture` prop)
- Test: `capture.test.ts`, `QuickTodoPage.test.tsx` (client path), `packages/ui` SearchModal parse test, if SearchModal logic can be extracted to a pure module (`search-business.ts`)

**Interfaces:**
- Produces:
  - `type Capture = { kind: 'todo' | 'log'; client: Slug; text: string } | { kind: 'start-timer'; client: Slug; project?: Slug } | { kind: 'stop-timer' }`
  - `parseCapture(query: string, clients: readonly string[]): Capture | null`, which recognises:
    - `todo acme-gmbh: send draft`
    - `log acme-gmbh: call with Jana`
    - `timer acme-gmbh` / `timer acme-gmbh/website`
    - `stop timer`

    The client must be a known slug (unique prefix allowed: `todo acme: …` matches `acme-gmbh` when it is the only client starting `acme`). Otherwise the result is `null`.
  - SearchModal shows one result: `Add todo for acme-gmbh: send draft` / `Log for acme-gmbh: …` / `Start timer for acme-gmbh/website` / `Stop timer (opens form)`. Enter calls `onBusinessCapture(capture)`.
  - `Dashboard` implements it: todo and log write via `writeBusiness`, start-timer via `startTimer`, and stop-timer routes to `/business/time/new?from=timer`.
  - Success shows the existing flash/toast pattern. A failure shows `writeErrorMessage`.
  - Clients for the palette come from the business tree (`.kh/business/clients/<slug>/` folder names), with no file loads.

- [ ] **Step 1: Write failing tests.** Cover:
  - `parseCapture` cases: exact slug, unique prefix, ambiguous prefix → null, unknown → null, missing text → null, `timer acme/website`, `stop timer`
  - Quick todo with a client commits to the client file
  - Quick todo without a client is unchanged (still the inbox)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** ui lint, test and build, then the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(business): client targets in quick capture and the palette`

### Task 10: Issued documents are read-only in the file browser

**Files:**
- Modify:
  - `apps/console/src/components/FileViewer.tsx` (read-only banner + mode for issued paths)
  - `apps/console/src/components/editor/CodeMirrorEditor.tsx` (`readOnly?: boolean`; no auto-save when read-only)
  - `apps/console/src/pages/Dashboard.tsx` (`onFileChange`, delete, rename and move refuse issued paths with a message)
- Create: `apps/console/src/lib/business/guards.ts` (+ test)

**Interfaces:**
- Produces:
  - `isFrozenPath(path: string): boolean`: issued `.yaml` and issued artifacts (`pdf` / `xml` / `sha256`) under `.kh/business/offers/` or `.kh/business/invoices/`, via `classifyBusinessPath`
  - `frozenMessage(path): string`: `Issued documents never change. To correct an invoice, issue a credit note from the client page.`
  - The FileViewer banner shows that message plus a link to `/business`. The editor is read-only.
  - Delete, rename and move of frozen paths show the message and do nothing.

- [ ] **Step 1: Write failing tests.** Cover:
  - `isFrozenPath` truth table: issued yaml and pdf → true; drafts, time files and a client.yaml → false
  - FileViewer renders the banner and passes `readOnly`
  - the Dashboard delete handler for a frozen path doesn't call `deleteFile`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): issued documents are read-only in the file browser`

### Task 11: Today view business hours and docs

**Files:**
- Modify:
  - `apps/browser-extension/src/background/today.ts` (read `.kh/business/time/<current month>.jsonl` and `time/running.yaml` when present; add `business: { minutesToday: number; running: { client: string; since: string } | null } | null` to the summary)
  - `apps/browser-extension/src/newtab/Today.tsx` (a line `Business today: 2.5 h`, plus `· timer running for acme-gmbh` when a timer runs; read-only, with no start/stop in phase 3)
  - The service worker's file reads, if `today.ts` only receives widget files today. Follow how `today.ts` gets `.timetracking.csv` contents and add the two business paths the same way.
- Modify (docs):
  - `doc/business.md` (forms, timer file, conflict behaviour, palette commands, read-only issued files)
  - `doc/features.md`
  - `doc/roadmap.md` (tick phase 3)
  - `doc/progress.md`
  - `packages/formats/skills/kh-business/SKILL.md` (timer file, and the fact that issuing still happens only in the console)
  - `apps/console/src/lib/business-setup.ts` (bump `BUSINESS_TOOLS_VERSION` to `1.1.0` because the skill and check changed)
- Test: extend the extension's `today` tests (find the existing `today.test.ts`), and console `business-setup.test.ts` for the version.

**Interfaces:**
- Produces: `businessToday(timeJsonl: string | null, timerYaml: string | null, today: string, now: Date): { minutesToday: number; running: { client: string; since: string } | null }`. It is a pure function in `today.ts` and must not import `@kaihuman/formats/business` if the extension bundle can't take it. Check: if the extension already depends on `@kaihuman/formats`, use `parseJsonl` / `parseYaml` from it. Otherwise parse minimally and say so.
- A running timer adds its elapsed minutes since `max(started_at, local midnight)` to `minutesToday`.

- [ ] **Step 1: Write failing tests.** Cover:
  - minutes summed only for today
  - a running timer adds elapsed minutes
  - a timer started yesterday counts from midnight
  - no business files → `business: null`, and the Today view is unchanged
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement**, and write the docs.
- [ ] **Step 4: Full verification:** `pnpm install --frozen-lockfile`, the formats build and the ui build, then `pnpm -r --no-bail lint`, `check-types` and `test`. All must exit 0. The 8 clippy warnings in `apps/cli` are pre-existing.
- [ ] **Step 5: Commit:** `feat(business): business hours in the today view; phase 3 docs`
