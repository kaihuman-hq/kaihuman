# Business, phase 2: read-only console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the business data from `.kh/business/` in the console. This covers an "Enable business" setup page, a `/business` dashboard, a `/clients` list and the one-page `/clients/:slug` overview. It also adds client labels and a business/personal filter to the existing todo and action-log views, `[[client:slug]]` links in the wiki, and a sample business in demo mode.

**Architecture:**
- A shared `loadBusinessRepo(files)` in `packages/formats` turns the business files into typed records plus per-file findings. The repo check is refactored to use it, so parsing lives in one place.
- Pure view-model functions in `apps/console/src/lib/business/` build what each page shows from a `BusinessRepo` and a `today` date. Pages are thin Preact components over those functions.
- A sha-cached file loader, generalised from the Ideas page, fetches only `.kh/business/**`, plus wiki and idea Markdown for backlinks.
- Nothing is written to the repo except the one setup commit.

**Tech Stack:** Preact + `@preact/signals`, preact-router, Tailwind with `--los-*` tokens, `lucide-preact`, Vitest (jsdom, `preact` `render` + `preact/test-utils` `act`, no testing-library). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-business-design.md` (sections 5, 6, 9, 10 phase 2). Phase 1 code: `packages/formats/src/business/*`, `apps/console/src/lib/business-setup.ts`, `doc/business.md`.

## Global Constraints

- **Read-only.** Phase 2 pages never write to the repo. The only write is the "Enable business" setup commit through `enableBusiness` (plus `syncKB` install if the knowledge base is missing, see Task 4).
- **What gets loaded.** Business pages fetch only blobs under `.kh/business/` whose `classifyBusinessPath` kind is not `meta`, `artifact` or `receipt`. Artifacts are known from the tree alone ("PDF present"). Backlinks additionally read `.md` files under `.kh/wiki/` and `.kh/ideas/`, at most 300 files. Every fetch goes through the sha-keyed cache.
- **Dates:**
  - "Today" is the user's local date via `localDate(new Date())` from `packages/formats/src/dates.ts`, never a UTC slice.
  - All view-model functions take `today: string` (`YYYY-MM-DD`) as a parameter.
  - "This month" is `today.slice(0, 7)`. "This year" is `today.slice(0, 4)`. A quarter is Q1–Q4 of the calendar year.
- **Money display:** `formatMinor(amount, currency)` followed by the currency code, e.g. `1001.38 EUR`. Never compute money with floats.
- **Invoice status:**
  - comes only from `deriveInvoiceStatus` / `deriveOfferStatus`
  - "billed this year" = sum of `totals.gross` of invoices issued this year, minus the gross of credit notes issued this year
  - "open" = sum of `InvoiceStatus.open` over all invoices
- **Unbilled time:** time entries with no `invoice` field.
- **Invalid files never crash a page.** Each file with errors appears in a collapsible "N files have problems" list (path + messages). Everything valid still renders.
- **UI style:**
  - existing console look: raw Tailwind with `--los-bg`, `--los-fg`, `--los-muted`, `--los-border`, `--los-accent`, `--los-warning`, `--los-success`; `StatusBar` at the bottom like other pages; `lucide-preact` icons
  - small shared pieces go in `apps/console/src/components/business/`
  - layout must work at phone width
- **Navbar:**
  - new `NavItemId` `'business'` (label "Business", icon `Briefcase`)
  - added to `NAVBAR_ITEMS`, not to `DEFAULT_NAVBAR`
  - wired through `MainApp` and `Dashboard` like `ideas`
- **Code placement:**
  - pure business logic shared by console and check → `packages/formats/src/business/`
  - console view models → `apps/console/src/lib/business/`
  - shared UI (todo/action-log/wiki) → `packages/ui`
- **Done means:**
  - zero Biome warnings, zero type errors, all tests pass
  - turbo `pnpm run check` cannot run in the sandbox, so run per package: `pnpm --filter <pkg> lint|check-types|test`, and `pnpm --filter @kaihuman/formats build` plus `pnpm --filter @kaihuman/ui build` before console type-check/tests
  - every task adds a bullet to one dated `doc/progress.md` entry `## 2026-10-27 — Business, phase 2: console pages`, created in Task 1
- **Numbering format (phase 1 ruling R16):** the setup form does not offer a numbering field. Defaults apply. `doc/business.md` warns not to change `numbering` once documents are issued.

## Review Focus

1. **One broken file in a business repo** (e.g. bad YAML in one `client.yaml`). The other clients, the dashboard and the client page still render, and the problems list names the file and the issue. Tests in Tasks 1 and 3.
2. **Unknown client** (`/clients/nope`). The page says "No client `nope`" with a link back to `/clients` instead of rendering blank. Test in Task 6.
3. **Repo without business, demo without seed, or a public repo.** `/business` and `/clients` show a call to action to enable business. On a public repo the setup page explains why it is blocked and writes nothing. Tests in Tasks 4 and 5.
4. **Month boundary in local time.** With `today = '2026-11-01'`, time logged on 2026-10-31 counts for last month, and an invoice due 2026-10-31 is overdue. Tests in Task 2.
5. **A repo with many files.** The business loader requests only business files (plus capped wiki/ideas Markdown for backlinks), and a second load with unchanged shas makes no network calls. Test in Task 3.

---

### Task 1: `loadBusinessRepo` and path helpers in formats

**Files:**
- Create: `packages/formats/src/business/repo.ts`
- Test: `packages/formats/src/business/repo.test.ts`
- Modify: `packages/formats/src/business/check.ts` (use `loadBusinessRepo` for parsing and validation and keep the existing behaviour), `packages/formats/src/business/paths.ts` (scope helpers), `packages/formats/src/business/index.ts`
- Modify: `doc/progress.md` (new entry)

**Interfaces:**
- Produces:
  - `type LoadedIssued = { path: string; doc: Issued }`
  - `type BusinessRepo = { profile: BusinessProfile | null; clients: Client[]; projects: Project[]; contracts: Contract[]; drafts: Draft[]; issued: LoadedIssued[]; time: TimeEntry[]; payments: Payment[]; events: DocEvent[]; links: LinkRecord[]; expenses: Expense[]; clientFiles: { client: Slug; kind: 'notes' | 'todos' | 'log'; path: string }[]; artifacts: ReadonlySet<string>; findings: Finding[] }`
  - `loadBusinessRepo(files: ReadonlyMap<string, string>, treePaths?: readonly string[]): BusinessRepo`
    - `files` holds the fetched contents. `treePaths` lists every path in the tree, so artifacts and receipts are known without fetching them.
    - It classifies, parses (YAML/JSONL) and validates every file with the existing validators.
    - Each failure becomes a `Finding` with level `error`. `unknown` paths become `warning`, using exactly the messages `checkBusinessRepo` produces today.
  - `checkBusinessRepo` calls `loadBusinessRepo(files)` and then runs only its cross-file rules: references, gaps, numbers, totals, retain_until, kinds, ids, frozen rule and symlinks. Its output for every existing test stays identical.
  - In `paths.ts`:
    - `isBusinessPath(path: string): boolean`, true for paths under `.kh/business/`
    - `clientOfPath(path: string): Slug | null`, the slug for any path under `.kh/business/clients/<slug>/`
    - `type Scope = 'all' | 'business' | 'personal'`
    - `inScope(path: string, scope: Scope): boolean`

- [ ] **Step 1: Write failing tests**

```ts
const files = loadFixtureRepo();
const repo = loadBusinessRepo(files, [...files.keys(), '.kh/business/invoices/2026/RE-2026-0001.pdf']);
expect(repo.profile?.name).toBeTruthy();
expect(repo.clients.map((c) => c.slug)).toEqual(['acme-gmbh']);
expect(repo.issued.map((i) => i.doc.number).sort()).toEqual(['AN-2026-001', 'RE-2026-0001']);
expect(repo.artifacts.has('.kh/business/invoices/2026/RE-2026-0001.pdf')).toBe(true);
expect(repo.findings).toEqual([]);
const broken = new Map(files).set('.kh/business/clients/acme-gmbh/client.yaml', 'name: [');
const r2 = loadBusinessRepo(broken);
expect(r2.clients).toEqual([]);
expect(r2.issued).toHaveLength(2); // the rest still loads
expect(r2.findings).toContainEqual(expect.objectContaining({ file: '.kh/business/clients/acme-gmbh/client.yaml', level: 'error' }));
expect(clientOfPath('.kh/business/clients/acme-gmbh/todos.todos.md')).toBe('acme-gmbh');
expect(clientOfPath('todos/work.todos.md')).toBeNull();
expect(inScope('todos/work.todos.md', 'personal')).toBe(true);
expect(inScope('.kh/business/clients/acme-gmbh/log.actionlog.md', 'personal')).toBe(false);
expect(inScope('.kh/business/clients/acme-gmbh/log.actionlog.md', 'business')).toBe(true);
```

- [ ] **Step 2: Run** `pnpm --filter @kaihuman/formats test -- repo`. Expected: FAIL.
- [ ] **Step 3: Implement** `repo.ts` and the path helpers. Move the parse/validate part of `check.ts` into `loadBusinessRepo` without duplicating it.
- [ ] **Step 4: Run the whole formats suite.** All existing `check*.test.ts` tests must pass unchanged, together with the new ones. Run formats lint and check-types.
- [ ] **Step 5: Commit:** `feat(formats): loadBusinessRepo shared by console and check`

### Task 2: Console view models

**Files:**
- Create: `apps/console/src/lib/business/overview.ts`, `apps/console/src/lib/business/dates.ts`
- Test: `apps/console/src/lib/business/overview.test.ts`, `apps/console/src/lib/business/dates.test.ts`
- Modify: `packages/formats/src/business/status.ts` (phase 1 deferred minor: compare `DocEvent.at` with `Date.parse`, not string order) + its test

**Interfaces:**
- Consumes: `BusinessRepo` (Task 1), `deriveInvoiceStatus`, `deriveOfferStatus`, `formatMinor`, `parseActionLog` (`@kaihuman/formats`)
- Produces (`dates.ts`):
  - `quarterOf(date: string): { year: number; q: 1 | 2 | 3 | 4 }`
  - `isoWeek(date: string): string`, e.g. `'2026-W44'`
  - `addDays(date: string, days: number): string`
- Produces (`overview.ts`):
  - `type InvoiceRow = { number: string; kind: 'invoice' | 'credit-note'; client: Slug; issueDate: string; dueDate?: string; gross: number; currency: string; status: InvoiceStatus; pdf: boolean; link: 'active' | 'revoked' | 'expired' | null }`
  - `type OfferRow = { number: string; client: Slug; issueDate: string; validUntil: string; gross: number; currency: string; status: OfferStatus; pdf: boolean; link: InvoiceRow['link'] }`
  - `invoiceRows(repo: BusinessRepo, today: string): InvoiceRow[]`, newest first
    - `link` is the latest `LinkRecord` for the document: revoked if `revoked` is set, expired if `expires < today`, else active
  - `offerRows(repo: BusinessRepo, today: string): OfferRow[]`, newest first
  - `type ClientSummary = { slug: Slug; name: string; stage: ClientStage; billedThisYear: number; open: number; unbilledMinutes: number; minutesThisMonth: number; currency: string }`
  - `clientSummaries(repo: BusinessRepo, today: string): ClientSummary[]`, sorted by name
  - `type TimelineItem = { date: string; kind: 'offer' | 'invoice' | 'credit-note' | 'payment' | 'event' | 'log' | 'contract'; title: string; ref?: string }`
  - `type ClientOverview = { client: Client; summary: ClientSummary; offers: OfferRow[]; invoices: InvoiceRow[]; projects: { project: Project; minutesUsed: number; amountBilled: number }[]; timeByWeek: { week: string; project: string | null; minutes: number }[]; contracts: Contract[]; timeline: TimelineItem[]; files: { notes?: string; todos?: string; log?: string } }`
  - `clientOverview(repo: BusinessRepo, slug: string, today: string, logContent?: string): ClientOverview | null`
    - The timeline merges every dated item for the client, newest first, capped at 100.
    - Log lines come from `parseActionLog(logContent)` when it is given.
    - Contracts appear on their `start` date. A renewal or notice date in the future appears on that date with title `Renewal due` / `Notice deadline`.
  - `type Dashboard = { receivables: InvoiceRow[] /* open > 0, overdue first then by due date */; openTotal: number; overdueTotal: number; unbilled: { client: Slug; minutes: number }[]; vat: { month: { period: string; due: number }; quarter: { period: string; due: number } }; contractsDue: { contract: Contract; date: string; what: 'renewal' | 'notice' }[]; drafts: Draft[]; pipeline: Record<ClientStage, ClientSummary[]>; currency: string }`
  - `businessDashboard(repo: BusinessRepo, today: string): Dashboard`, where:
    - `vat.due` = sum of `breakdown[].tax` of invoices issued in the period, minus that of credit notes issued in the period
    - the notice date = `end − notice_period_days`
    - contracts are included when the renewal or notice date falls in `[today, today+60]`
    - `period` is `'2026-10'` / `'2026-Q4'`
  - `currency` everywhere = `repo.profile?.currency ?? 'EUR'`

- [ ] **Step 1: Write failing tests.** Build repos from the fixture (via `loadBusinessRepo`, test helper copied or imported from formats fixtures) plus small additions.

```ts
expect(quarterOf('2026-10-27')).toEqual({ year: 2026, q: 4 });
expect(isoWeek('2026-10-27')).toBe('2026-W44');
expect(isoWeek('2027-01-01')).toBe('2026-W53');
const d = businessDashboard(repo, '2026-11-10'); // RE-2026-0001 gross 100138 due 2026-11-09, fixture payment covers it fully
expect(d.receivables).toEqual([]);
const unpaid = { ...repo, payments: [] };
expect(businessDashboard(unpaid, '2026-11-10')).toMatchObject({ openTotal: 100138, overdueTotal: 100138 });
expect(businessDashboard(unpaid, '2026-11-09').overdueTotal).toBe(0); // due day itself not overdue
expect(businessDashboard(repo, '2026-10-27').vat).toEqual({ month: { period: '2026-10', due: 15888 }, quarter: { period: '2026-Q4', due: 15888 } });
const s = clientSummaries(withTime(repo, [{ date: '2026-10-31', minutes: 60 }, { date: '2026-11-01', minutes: 30 }]), '2026-11-01');
expect(s[0]).toMatchObject({ minutesThisMonth: 30 }); // Review Focus 4
expect(clientOverview(repo, 'nope', '2026-10-27')).toBeNull();
const o = clientOverview(repo, 'acme-gmbh', '2026-10-27', '- 2026-10-20 10:00:00 Kickoff call #business\n');
expect(o?.timeline[0]?.date >= o!.timeline.at(-1)!.date).toBe(true);
expect(o?.timeline.some((t) => t.kind === 'log' && t.title.includes('Kickoff'))).toBe(true);
expect(o?.invoices[0]).toMatchObject({ number: 'RE-2026-0001', pdf: false });
// contractsDue: contract end 2026-12-31, notice 30 days → notice date 2026-12-01 within 60 days of 2026-10-27
// status.ts: two decisions with at '2026-10-20T10:00:00+02:00' and '2026-10-20T09:30:00Z' → the Z one (09:30Z = 11:30+02) is latest
```

- [ ] **Step 2: Run** `pnpm --filter @kaihuman/app-console test -- business/overview business/dates` (after `pnpm --filter @kaihuman/formats build`). Expected: FAIL.
- [ ] **Step 3: Implement.** Pure functions, no Preact, no stores.
- [ ] **Step 4: Run them again.** Expected: PASS. Then run the formats status test, plus console lint and check-types.
- [ ] **Step 5: Commit:** `feat(console): business view models`

### Task 3: Business file loader and `useBusinessRepo`

**Files:**
- Create: `apps/console/src/lib/repo-files.ts` (generic sha-cached loader), `apps/console/src/lib/business/load.ts`, `apps/console/src/lib/business/use-business-repo.ts`
- Modify: `apps/console/src/lib/ideas-files.ts` (use `repo-files.ts`, behaviour unchanged)
- Test: `apps/console/src/lib/repo-files.test.ts`, `apps/console/src/lib/business/load.test.ts`

**Interfaces:**
- Consumes: `githubService.getFileContent`, `githubFileStore.tree / isLoading / loadedRepo / error / loadTree`, `githubProfileStore.currentRepo` (`@kaihuman/core`); `loadBusinessRepo`, `classifyBusinessPath` (Task 1)
- Produces:
  - `type LoadedFiles = { contents: Record<string, string>; errors: string[] }`
  - `loadRepoFiles(repoFullName: string, items: readonly TreeItem[], concurrency = 4): Promise<LoadedFiles>`. This is the existing `loadIdeaContents` logic moved here: a module-level cache keyed `repo:path` and valid while the sha matches, and failures pushed as `"path: message"`.
  - `businessTreeItems(tree: readonly TreeItem[]): TreeItem[]`: blobs under `.kh/business/` except kinds `meta`, `artifact`, `receipt`
  - `backlinkTreeItems(tree: readonly TreeItem[], cap = 300): TreeItem[]`: `.md` blobs under `.kh/wiki/` and `.kh/ideas/`
  - `type BusinessState = { status: 'no-repo' } | { status: 'loading' } | { status: 'disabled'; repo: GithubRepo } | { status: 'error'; message: string } | { status: 'ready'; repo: GithubRepo; data: BusinessRepo; contents: Record<string, string>; loadErrors: string[] }`
    - `disabled` means the tree has no `.kh/business/business.yaml`.
    - `loadErrors` are network failures. `data.findings` are validation problems.
  - `useBusinessRepo(): BusinessState`, a Preact hook following the IdeasPage effect pattern (load the tree when it is empty, `cancelled` flag, dependencies `[repo?.full_name, itemsKey]`). It passes `tree.map((t) => t.path)` as `treePaths`.
  - `useBacklinkContents(enabled: boolean): Record<string, string>`: lazy load for the client page.

- [ ] **Step 1: Write failing tests** (mock `@kaihuman/core` like `business-setup.test.ts`)

```ts
const tree = [blob('.kh/business/business.yaml', 's1'), blob('.kh/business/clients/acme-gmbh/client.yaml', 's2'), blob('.kh/business/invoices/2026/RE-2026-0001.pdf', 's3'), blob('.kh/business/.tools/business-check.mjs', 's4'), blob('notes/a.md', 's5')];
expect(businessTreeItems(tree).map((t) => t.path)).toEqual(['.kh/business/business.yaml', '.kh/business/clients/acme-gmbh/client.yaml']);
await loadRepoFiles('o/r', businessTreeItems(tree));
await loadRepoFiles('o/r', businessTreeItems(tree));
expect(githubService.getFileContent).toHaveBeenCalledTimes(2); // second run served from sha cache (Review Focus 5)
vi.mocked(githubService.getFileContent).mockRejectedValueOnce(new Error('boom'));
const r = await loadRepoFiles('o/r2', businessTreeItems(tree));
expect(r.errors).toEqual(['.kh/business/business.yaml: boom']);
expect(Object.keys(r.contents)).toEqual(['.kh/business/clients/acme-gmbh/client.yaml']);
expect(backlinkTreeItems([blob('.kh/wiki/a.md', 'x'), blob('.kh/ideas/b.md', 'y'), blob('docs/c.md', 'z')]).map((t) => t.path)).toEqual(['.kh/wiki/a.md', '.kh/ideas/b.md']);
```

  Also add a hook test (render a tiny component with `preact` `render` + `act`, stores mocked as `{ value }` objects): status `disabled` when the tree lacks `business.yaml`, and `ready` with `data.clients.length === 1` for the fixture files.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Move the loader logic out of `ideas-files.ts` and make it use `loadRepoFiles`. The ideas tests and IdeasPage behaviour stay the same.
- [ ] **Step 4: Run** the console tests (all of them, since ideas uses the loader too), lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): business file loader and useBusinessRepo`

### Task 4: "Enable business" page

**Files:**
- Create: `apps/console/src/pages/BusinessEnablePage.tsx`, `apps/console/src/lib/business/enable-form.ts`
- Test: `apps/console/src/lib/business/enable-form.test.ts`, `apps/console/src/pages/BusinessEnablePage.test.tsx`
- Modify: `apps/console/src/App.tsx` (route `/business/enable`)
- Modify: `apps/console/src/lib/github-kb.ts` (load `business-setup` with `await import('./business-setup')` only when `.kh/business/business.yaml` is in the tree), `packages/formats/vite.business-check.config.ts` (`build.minify: true`). Phase 1 deferred minor M1.

**Interfaces:**
- Consumes: `enableBusiness`, `PublicRepoError`, `AlreadyEnabledError` (`lib/business-setup.ts`), `syncKB` (`lib/github-kb.ts`), `validateProfile`
- Produces:
  - `type EnableForm = { name: string; street: string; postcode: string; city: string; country: string; vatId: string; taxNumber: string; contactName: string; email: string; phone: string; iban: string; bic: string; vatRegime: 'regular' | 'small-business'; paymentTermsDays: string; confirmRetention: boolean; confirmBranchProtection: boolean; confirmAccess: boolean }`
  - `EMPTY_FORM: EnableForm`, with country `'DE'`, vatRegime `'regular'` and paymentTermsDays `'14'`
  - `profileFromForm(form: EnableForm): Result<BusinessProfile>`, which:
    - trims every field and drops empty optional ones
    - fixes jurisdiction `'de'` when the country is `DE`, else `'generic'`
    - fixes currency `'EUR'`, language `'de'` and default_vat_rate `'19'`
    - sets **no** `numbering` field (R16)
    - removes spaces from the IBAN and uppercases it
    - runs the result through `validateProfile`
  - `canSubmit(form: EnableForm): boolean`: all three confirmations ticked
  - `enableErrorMessage(e: unknown): string`, with this copy:
    - `PublicRepoError` → `This repository is public. Business data (invoices, client details, share links) needs a private repository. Make it private on GitHub, then try again.`
    - `AlreadyEnabledError` → `Business is already enabled in this repository.`
    - anything else → `Setup failed, nothing was written: <message>`
- The page:
  - **No repo selected:** a "Select a repository" message.
  - **Public repo** (`currentRepo.value.private !== true`): the public-repo message, with the form disabled.
  - **Otherwise the form**, with:
    - grouped fields: business, address, tax, contact, bank, terms
    - the three confirmation checkboxes, whose labels are spec section 5's three points:
      1. this repo now holds tax records for 8 years — never delete it or rewrite its history
      2. protect the main branch against force-push and deletion (GitHub → Settings → Branches)
      3. anyone with access to this repo sees the business data
    - inline field errors from `profileFromForm`
  - **Submit:**
    1. If `.kh/.skill-version` is missing from the tree, run `syncKB(repo, { install: true })` first. That makes two commits: KB setup, then business.
    2. `enableBusiness(repo, profile)`
    3. `githubFileStore.loadTree()`
    4. `route('/business')`
  - **Errors:** shown with `enableErrorMessage`.
  - A `StatusBar` at the bottom.

- [ ] **Step 1: Write failing tests**

```ts
const filled = { ...EMPTY_FORM, name: 'Muster GmbH', street: 'Weg 1', postcode: '10115', city: 'Berlin', vatId: 'DE123456789', contactName: 'Max', email: 'max@example.com', iban: 'de89 3704 0044 0532 0130 00' };
const p = profileFromForm(filled);
expect(p.ok && p.value).toMatchObject({ jurisdiction: 'de', currency: 'EUR', default_vat_rate: '19', payment_terms_days: 14, bank: { iban: 'DE89370400440532013000' } });
expect(p.ok && 'numbering' in p.value).toBe(false);
expect(profileFromForm({ ...filled, email: '' }).ok).toBe(false);
expect(canSubmit(filled)).toBe(false);
expect(canSubmit({ ...filled, confirmRetention: true, confirmBranchProtection: true, confirmAccess: true })).toBe(true);
expect(enableErrorMessage(new PublicRepoError('x'))).toMatch(/^This repository is public/);
expect(enableErrorMessage(new Error('boom'))).toBe('Setup failed, nothing was written: boom');
// page test: currentRepo private:false → public message rendered, submit button disabled, enableBusiness not called (Review Focus 3)
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the form logic, the page, the route, the dynamic import and the minify setting. The existing `github-kb.test.ts` tests must still pass.
- [ ] **Step 4: Run** the console tests, lint and check-types, then `pnpm --filter @kaihuman/formats build`. The bundle is now smaller than before (state the size in the report).
- [ ] **Step 5: Commit:** `feat(console): enable business page`

### Task 5: `/business` dashboard, `/clients` list, navbar

**Files:**
- Create: `apps/console/src/pages/BusinessPage.tsx`, `apps/console/src/pages/ClientsPage.tsx`, `apps/console/src/components/business/Stat.tsx`, `apps/console/src/components/business/Card.tsx`, `apps/console/src/components/business/ProblemsList.tsx`, `apps/console/src/components/business/EnableCallout.tsx`, `apps/console/src/components/business/StatusPill.tsx`
- Modify:
  - `apps/console/src/App.tsx` (routes `/business`, `/clients`)
  - `packages/core/src/models/types.ts` (`NavItemId` gets `'business'`)
  - `packages/ui/src/LifeOS/navbar-items.ts` (entry `{ id: 'business', label: 'Business', icon: Briefcase }`)
  - `packages/ui/src/LifeOS/Layouts/MainApp.tsx` (`onBusinessClick`, handled wherever `onIdeasClick` is)
  - `apps/console/src/pages/Dashboard.tsx` (`onBusinessClick={() => route('/business')}`)
  - `apps/console/src/navbar-config.test.ts`
- Test: `apps/console/src/pages/BusinessPage.test.tsx`, `apps/console/src/pages/ClientsPage.test.tsx`

**Interfaces:**
- Consumes: `useBusinessRepo` (Task 3), `businessDashboard`, `clientSummaries`, `invoiceRows` (Task 2)
- UI contract:
  - `StatusPill({ state })` colours an invoice or offer state: overdue in warning, paid and accepted in success, the rest muted.
  - `ProblemsList({ findings, loadErrors })` is collapsed by default, with the title `N files have problems`. It renders nothing when both lists are empty.
  - `EnableCallout()` explains business tracking in two sentences and links to `/business/enable`.
- Page states (both pages):
  - `no-repo` → "Select a repository"
  - `loading` → pulse text
  - `disabled` → `EnableCallout`
  - `error` → message
  - `ready` → content plus `ProblemsList`
- `/business` (ready) shows:
  - stat row: open total, overdue total, VAT this month, VAT this quarter
  - "Who owes me": receivables with client, number, due date, `StatusPill`, open amount
  - "Unbilled time" per client in hours (`minutes / 60` to one decimal)
  - "Contracts due" (next 60 days)
  - "Drafts" waiting to be issued (client, kind, line count)
  - "Pipeline": columns by stage, client names linking to `/clients/<slug>`
  - Empty sections show a one-line muted note, not nothing.
- `/clients` (ready):
  - a table or cards of `clientSummaries`: name (link), stage, billed this year, open, unbilled hours
  - a stage filter (chips, "all" by default)
  - an empty state: "No clients yet. Ask the agent to add one, or create `.kh/business/clients/<slug>/client.yaml`."
- Navbar: `'business'` is available in settings but not in the default list. Clicking it routes to `/business`.

- [ ] **Step 1: Write failing tests.** Render the pages with `useBusinessRepo` mocked (`vi.mock('../lib/business/use-business-repo')`).

```ts
mockState({ status: 'disabled', repo });
render(<BusinessPage />, host);
expect(host.textContent).toContain('Enable business'); // Review Focus 3
mockState(readyState(fixtureRepoUnpaid, { today: '2026-11-10' }));
render(<BusinessPage />, host);
expect(host.textContent).toContain('RE-2026-0001');
expect(host.textContent).toContain('1001.38 EUR');
mockState(readyState(withBrokenClientFile));
render(<ClientsPage />, host);
expect(host.textContent).toContain('1 file has problems'); // Review Focus 1 (singular for 1)
// navbar-config.test: NAVBAR_ITEMS contains 'business'; DEFAULT_NAVBAR unchanged
```

  The pages read `today` through a small injectable `todayLocal()` from `lib/business/dates.ts` so tests can fix it. Mock it in tests.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the pages, components and nav wiring.
- [ ] **Step 4: Run** `pnpm --filter @kaihuman/ui build`, then the console tests, lint and check-types, plus ui and core lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): business dashboard and client list`

### Task 6: `/clients/:slug` overview page

**Files:**
- Create: `apps/console/src/pages/ClientPage.tsx`, `apps/console/src/lib/business/backlinks.ts`
- Modify: `apps/console/src/App.tsx` (route `/clients/:slug`)
- Test: `apps/console/src/pages/ClientPage.test.tsx`, `apps/console/src/lib/business/backlinks.test.ts`

**Interfaces:**
- Consumes: `useBusinessRepo`, `useBacklinkContents` (Task 3), `clientOverview` (Task 2), `wikilinkTargets` (`packages/ui/src/LifeOS/Organisms/wiki-links.ts`, deep import as `apps/console/src/wiki-links.test.ts` does, or re-export it from `@kaihuman/ui` if cleaner), `TodoWidget` and `ActionLogWidget` from `packages/ui` Widgets in read-only mode (check their props; if no read-only mode exists, render simple lists from `parseTodos` / `parseActionLog`)
- Produces:
  - `clientBacklinks(slug: string, contents: Readonly<Record<string, string>>): string[]`: paths whose content has a `[[client:<slug>]]` or `[[client:<slug>|label]]` link, sorted
- Page (`({ slug }: { slug?: string })`), top to bottom per spec section 5:
  1. Header: name, stage, contact (first contact name, email and phone as `mailto:` / `tel:` links), stats (billed this year, open, unbilled hours, hours this month)
  2. Timeline (first 20, then "Show all")
  3. Offers and invoices tables: number, date, `StatusPill`, amount, `PDF` or `PDF missing`, link status
  4. Projects: name, status, budget used (`minutesUsed` against `budget_minutes`, or billed against `budget_amount`), retainer summary
  5. Time by week and project (last 8 weeks)
  6. Todos and action log for this client's files
  7. Contracts and notes (notes rendered as Markdown with the same `react-markdown` setup as `WikiView`, or as plain pre-wrapped text if that setup isn't reusable without the wiki store)
  8. "Linked from" wiki and idea pages (`clientBacklinks`), linking to `/wiki` with that page open the same way the wiki opens files today
- Unknown slug: `No client \`<slug>\`` plus a link `Back to clients` (Review Focus 2). A disabled business shows `EnableCallout`. `ProblemsList` lists only the findings for this client's files plus the profile.

- [ ] **Step 1: Write failing tests**

```ts
expect(clientBacklinks('acme-gmbh', { '.kh/wiki/a.md': 'see [[client:acme-gmbh]]', '.kh/wiki/b.md': '[[client:acme-gmbh|Acme]]', '.kh/ideas/c.md': '[[client:other]]', '.kh/wiki/d.md': '```\n[[client:acme-gmbh]]\n```' })).toEqual(['.kh/wiki/a.md', '.kh/wiki/b.md']);
mockState(readyState(fixtureRepo));
render(<ClientPage slug="nope" />, host);
expect(host.textContent).toContain('No client');
expect(host.querySelector('a[href="/clients"]')).not.toBeNull();
render(<ClientPage slug="acme-gmbh" />, host);
for (const text of ['RE-2026-0001', 'AN-2026-001', 'PDF missing', 'Timeline']) expect(host.textContent).toContain(text);
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the page and backlinks.
- [ ] **Step 4: Run** the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): client overview page`

### Task 7: Client labels and scope filter in todo and action-log views

**Files:**
- Modify:
  - `packages/ui/src/LifeOS/Templates/KanbanBoard.tsx`
  - `packages/ui/src/LifeOS/Templates/TodoAnalytics.tsx`
  - `packages/ui/src/LifeOS/Templates/ActionLogView.tsx`
  - `packages/ui/src/LifeOS/Organisms/Widgets/BoardOverviewWidget.tsx` (config `scope`)
- Create: `packages/ui/src/LifeOS/Molecules/ScopeToggle.tsx`, `packages/ui/src/LifeOS/scope-files.ts`
- Test: `packages/ui/src/LifeOS/scope-files.test.ts`, plus the BoardOverview config parse/serialize test (extend the existing one if present, else create `packages/ui/src/LifeOS/Organisms/Widgets/board-overview-config.test.ts`)

**Interfaces:**
- Consumes: `inScope`, `clientOfPath`, `Scope` (Task 1, via `@kaihuman/formats`)
- Produces:
  - `withBusinessFiles(paths: readonly string[], tree: readonly { path: string; type: string }[], suffix: '.todos.md' | '.actionlog.md', scope: Scope): string[]`, which:
    - adds the client files under `.kh/business/clients/` that end in `suffix` (needed when the dashboard config lists explicit entries) whenever scope is not `personal`
    - filters by `inScope`
    - dedupes, keeping the input order first
  - `fileLabel(path: string): string`: `clientOfPath(path)` when set (e.g. `acme-gmbh`), else the existing `formatFilePath` result
  - `ScopeToggle({ value, onChange })` with three segments: All / Business / Personal
  - Each view keeps its scope in component state, default `'all'`, and remembers it in `localStorage` (`kh:scope:<view>`, wrapped in try/catch).
  - `BoardOverviewConfig` gets `scope?: Scope` (default `'all'`), parsed, serialized and shown in its settings form.
- Behaviour:
  - Kanban, TodoAnalytics and ActionLogView show `ScopeToggle` next to their search, and their file list goes through `withBusinessFiles`.
  - Item and file badges use `fileLabel`.
  - The dashboard `TodoWidget` (single file) is unchanged.

- [ ] **Step 1: Write failing tests**

```ts
const tree = [{ path: 'todos/work.todos.md', type: 'blob' }, { path: '.kh/business/clients/acme-gmbh/todos.todos.md', type: 'blob' }];
expect(withBusinessFiles(['todos/work.todos.md'], tree, '.todos.md', 'all')).toEqual(['todos/work.todos.md', '.kh/business/clients/acme-gmbh/todos.todos.md']);
expect(withBusinessFiles(['todos/work.todos.md'], tree, '.todos.md', 'business')).toEqual(['.kh/business/clients/acme-gmbh/todos.todos.md']);
expect(withBusinessFiles(['todos/work.todos.md'], tree, '.todos.md', 'personal')).toEqual(['todos/work.todos.md']);
expect(fileLabel('.kh/business/clients/acme-gmbh/log.actionlog.md')).toBe('acme-gmbh');
expect(parseConfig(serializeConfig({ ...defaultConfig, scope: 'business' })).scope).toBe('business');
expect(parseConfig('{}').scope ?? 'all').toBe('all');
```

- [ ] **Step 2: Run** `pnpm --filter @kaihuman/ui test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the edits in the large Template files minimal: one memo dependency, one early `continue` or filter, one toggle element and the label call.
- [ ] **Step 4: Run** the ui tests, lint and check-types, then `pnpm --filter @kaihuman/ui build` and the console tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(ui): business/personal scope and client labels in todo and log views`

### Task 8: `[[client:slug]]` links in the wiki

**Files:**
- Modify: `packages/ui/src/LifeOS/Organisms/wiki-links.ts`, `packages/ui/src/LifeOS/Organisms/WikiView.tsx`, `apps/console/src/pages/WikiPage.tsx`
- Test: `apps/console/src/wiki-links.test.ts` (extend)

**Interfaces:**
- Produces:
  - `CLIENT_LINK_PREFIX = 'client:'`
  - `clientLinkSlug(target: string): string | null`: `'client:acme-gmbh'` → `'acme-gmbh'`, ignoring `|label` and `#heading`; otherwise null
  - `resolveWikilink` returns `null` for `client:` targets, so a page titled "client" can't capture them.
  - `WikiView` gets a new optional prop `onClientLink?: (slug: string) => void`.
  - In `components.a`, a `client:` target renders an anchor `href="/clients/<slug>"`. Its label is the link's label, or the slug. The style is the accent link style, not the red unresolved style. On click it calls `onClientLink(slug)` and prevents default when the prop is given.
  - `WikiPage` passes `onClientLink={(slug) => route('/clients/' + slug)}`.

- [ ] **Step 1: Write failing tests**

```ts
expect(clientLinkSlug('client:acme-gmbh')).toBe('acme-gmbh');
expect(clientLinkSlug('client:acme-gmbh|Acme')).toBe('acme-gmbh');
expect(clientLinkSlug('acme-gmbh')).toBeNull();
expect(resolveWikilink('client:acme-gmbh', ['client.md'], { 'client.md': 'client' }, 'x.md')).toBeNull();
expect(linkifyWikilinks('see [[client:acme-gmbh|Acme]]')).toContain('(wiki:client%3Aacme-gmbh');
```

  Plus a render test of `WikiView`'s link component if it can be mounted in isolation. If it can't without the wiki store, test through an exported `renderWikiAnchor`-style helper and say so in the report.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the ui tests, lint and check-types, the ui build, then the console tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(wiki): client links open the client page`

### Task 9: Demo business and docs

**Files:**
- Modify: `packages/core/src/demo/seed.ts` (a `business(now)` helper adding files under `.kh/business/`)
- Modify: `apps/console/src/demo.test.ts`
- Modify: `doc/business.md` (a "Console" section listing the pages and filters, and a warning not to change `numbering` after issuing), `doc/features.md` (replace "No console pages yet"), `doc/roadmap.md` (tick phase 2), `doc/progress.md`, `README.md` (one line under features if it lists them)

**Interfaces:**
- Consumes: `checkBusinessRepo`, `loadBusinessRepo` (in the test only; core must not import formats, so the seed is inline strings)
- Demo content:
  - `business.yaml`: a fictional business, "Demo Studio", in Berlin. It needs a valid but clearly fake IBAN (`DE89370400440532013000` is the standard test IBAN) and `vat_id: DE000000000`. If that fails validation, use any format-valid fake.
  - Three clients across stages `active`, `offer-sent` and `lead`, each with a `client.yaml`. The active client also has `todos.todos.md` and `log.actionlog.md` with 3–5 entries, one project with a budget, and one contract ending within 60 days of the seed's `now`.
  - Issued docs: one paid invoice, one open invoice that is overdue relative to `now`, one offer, all in the year of `now`, each with correct totals. Totals can be hand-computed: use round numbers, e.g. 10 h × 100.00 EUR at 19%.
  - A time file for the current month with billed and unbilled entries, a payment for the paid invoice, and one `sent` event.
  - One wiki page in the seed links `[[client:<active-slug>]]`.
- Dates are derived from the seed's `now`, the way the existing seed helpers do it.

- [ ] **Step 1: Write the failing test** (`demo.test.ts`)

```ts
const seed = buildDemoSeed(new Date(2026, 9, 27));
const files = new Map(Object.entries(seed.files).filter(([p]) => p.startsWith('.kh/business/')));
expect(checkBusinessRepo({ files, changes: null, today: '2026-10-27' })).toEqual([]);
const repo = loadBusinessRepo(files);
expect(repo.clients).toHaveLength(3);
expect(businessDashboard(repo, '2026-10-27').overdueTotal).toBeGreaterThan(0);
```

  Also run the same check for a second `now` in January, to catch year-boundary date maths in the seed.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement the seed** and write the docs.
- [ ] **Step 4: Full verification.** Run, as separate calls: `pnpm install --frozen-lockfile`; formats build and ui build; `pnpm -r --no-bail lint`, `pnpm -r --no-bail check-types` and `pnpm -r --no-bail test`. All must exit 0.
- [ ] **Step 5: Commit:** `feat(demo): sample business; docs for business console pages`
