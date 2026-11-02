# Business, phase 5a: money admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The console covers a solo business's money admin:
- expenses with receipts uploaded into the repo
- a VAT summary (Soll or Ist) per month, quarter and year, with output and input VAT
- CSV exports
- a year export zip for the Steuerberater
- retainer drafts that come due and move forward on issue
- contract reminders and a contract form with file upload
- a pipeline board where a client's stage can be changed

**Architecture:**
- **Pure logic in `packages/formats/src/business`:** VAT summary, CSV builders, year-export file list, retainer and contract helpers, stage change, expense and contract actions. The CI check and the agent share this logic.
- **Binary files:** they reach the repo through one new capability. `commitFiles` and `writeBusiness` accept `Uint8Array` values, which are uploaded as base64 blobs.
- **Zip:** a small store-only zip writer in the console (no dependency) builds the year export from bytes read at the head commit.
- **Pages:** follow the phase 2–4 pattern: page in `pages/`, view logic in `lib/business/`, writes through `writeBusiness`.

**Tech Stack:** Preact console, `@kaihuman/formats`, `@kaihuman/core` (Octokit git data API), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-business-design.md` §2 (expenses layout), §3 (money rules, retention), §5 (`/business`, `/business/expenses`, forms), §9 (year export, retention), §10 phase 5. Phase 5b (browser extension and desktop palette client targets, kb-mcp business tools) is a separate plan.

## Global Constraints

- **User decisions (2026-11-02):**
  - `business.yaml` gets an optional `vat_basis: accrual | cash`. A missing value means `accrual` (Soll).
  - Receipts and contract files may be up to 10 MB each (`ATTACHMENT_MAX_BYTES = 10485760`). Images are stored as they are, with no recompression.
  - Phase 5 ships as two PRs; this plan is 5a.
- **Money:** amounts are integer minor units, quantities and rates decimal strings, never floats in records. `computeTotals` is frozen and must not change.
- **Attachment types:**
  - Receipts: `pdf`, `jpg`, `jpeg`, `png`, `webp`, `heic`.
  - Contract files: `pdf` only.
  - Extensions are lower-cased on write.
- **Paths:**
  - Receipt: `expenses/<yyyy>/<ulid>.<ext>`, and the expense's `receipt` field is exactly `<ulid>.<ext>` (same ULID as the expense).
  - Contract file: `clients/<slug>/contracts/<ulid>.pdf`, and `file` is exactly `<ulid>.pdf`.
- **Small-business regime:** with `vat_regime: small-business` the VAT summary reports "not applicable". The console shows `No VAT: small-business regime (§19 UStG).` and the CSV omits VAT columns' meaning but keeps them as `0`.
- **CSV format (German Steuerberater friendly):**
  - UTF-8 with BOM, `;` separator, CRLF line ends.
  - Fields containing `;`, `"`, CR or LF are quoted, with `"` doubled.
  - Amounts as `1234,56` (decimal comma, no thousands separator, `-` for negatives). Dates `YYYY-MM-DD`.
- **Retention:** deleting an expense or contract is allowed but warns while it is inside the retention period. The period ends `31 Dec of (year of the record's date + jurisdiction retentionYears)`. The warning text: `This record must be kept until <date> (retention). Delete anyway?`
- **Writes:** every write goes through `writeBusiness`, one commit per user action, with a readable message (`business: …`).
- **Demo mode:** forms are read-only, as in phases 3–4.
- **Version:** `BUSINESS_TOOLS_VERSION` → `1.3.0`, because the check, skill and validators change.

## Review Focus

1. **Cash-basis VAT with part payments:** an invoice paid in two instalments across two quarters splits its VAT between the quarters in proportion to the payments. The rounding must sum back to the invoice VAT once fully paid: the last payment takes the remainder. → Task 2 test `cash basis splits VAT across part payments and sums exactly`.
2. **Overpayment or payment on a credit note:** the cash-basis share is capped at the invoice's gross, so VAT never exceeds the invoice VAT. Payments referencing a credit note are ignored for output VAT, because credit notes count by issue date in both bases. → Task 2 test `cash basis caps at invoice gross`.
3. **Receipt upload failure mid-way:** the YAML and the receipt go in one commit, so a failed commit leaves neither file. A file over 10 MB or of a wrong type is refused before any network call. → Task 4 tests.
4. **Retainer issued twice or edited:** issuing a retainer draft advances `next_date` only if the project's `next_date` still equals the draft's `from_retainer`. A second, stale draft for the same period never advances it again. → Task 3 test.
5. **Year export of a year with large receipts:** files are fetched with a concurrency of 4 and progress is shown. A failed fetch aborts with `Could not read <path>.` and no partial download. Names in the zip are UTF-8 (flag bit 11). → Task 6 tests.

---

### Task 1: Binary files in commits

**Files:**
- Modify: `packages/core/src/services/github.service.ts` (`commitFiles`), `packages/core/src/services/github.service.memory.ts`, the `applyCommit` in `packages/core/src/stores/github-file.store.ts` (~:709), and `apps/console/src/lib/business/write.ts` (`FileChanges`)
- Test: the existing core tests for `commitFiles` and the memory service, plus `apps/console/src/lib/business/write.test.ts`

**Interfaces:**
- Produces:
  - `commitFiles(owner, repo, branch, files: Record<string, string | Uint8Array | null>, message, opts?)`.
    - A `Uint8Array` value is uploaded with `git.createBlob({ encoding: 'base64' })` and put in the tree by `sha`.
    - A string stays inline `content`, as today.
  - `gitBlobSha(content: string | Uint8Array)` hashes the raw bytes.
  - `FileChanges` in formats/console becomes `Record<string, string | Uint8Array | null>`. Check where `FileChanges` is declared (formats `actions`) and widen it there.
  - `applyCommit` records a binary file's sha so later `getFileBytes` and tombstone logic see it, but it caches no text for it.

- [ ] **Step 1: Write failing tests.**
  - Core: a commit with `{ 'a/r.png': new Uint8Array([0,255,1]) }` calls `createBlob` with base64 `AP8B` and a tree entry `{ path, mode: '100644', type: 'blob', sha }`.
  - Memory service: after that commit, `getFileBytes('a/r.png')` returns the same bytes.
  - `gitBlobSha(new Uint8Array([0,255,1]))` equals `git hash-object` of the same bytes. Compute the expected value once with `printf '\x00\xff\x01' | git hash-object --stdin` and pin it.
  - `writeBusiness`: a builder returning a binary change commits it, and the store does not cache it as text.
- [ ] **Step 2: Run them** (`pnpm --filter @kaihuman/core test`, then the console test). Expected: FAIL.
- [ ] **Step 3: Implement.** Base64-encode in chunks so that 10 MB does not hit call-stack limits with `String.fromCharCode(...bytes)`.
- [ ] **Step 4: Run** core and console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(core): binary files in commits`

### Task 2: VAT basis, VAT summary and CSV builders (formats)

**Files:**
- Modify: `records.ts` (`BusinessProfile.vat_basis?: 'accrual' | 'cash'`, plus `KEY_ORDER`), `validate.ts` (`validateProfile`)
- Create: `packages/formats/src/business/vat.ts`, `csv.ts`, and tests. Export both from the business index.

**Interfaces:**
- Produces:
  - `type VatPeriod = string`: `YYYY-MM`, `YYYY-Qn` or `YYYY`.
  - `periodRange(period: VatPeriod): { start: string; end: string }`. It throws `Invalid period: <p>` on bad input.
  - `vatSummary(repo: BusinessRepo, period: VatPeriod): VatSummary`, where
    ```ts
    type VatSummary =
      | { applicable: false; period: VatPeriod; reason: 'small-business' }
      | { applicable: true; period: VatPeriod; basis: 'accrual' | 'cash';
          output: { rate: string; category: VatCategory; taxable: number; tax: number }[];
          outputTax: number; inputTax: number; reverseChargeNet: number; payable: number };
    ```
  - **Output VAT, accrual:** invoices by issue date, plus credit notes by issue date as negatives, grouped by category and rate from `totals.breakdown`.
  - **Output VAT, cash:** for each payment in the period on an invoice, the share is `min(paid so far incl. this, gross) − min(paid before, gross)` of the gross. VAT per breakdown row is that share × row tax / gross, rounded half-up. The payment that completes the invoice takes the exact remainder. Credit notes count by issue date in both bases.
  - **Input VAT:** expenses by `date`, the sum of `vat`, in both bases.
  - `reverseChargeNet` is the taxable amount of `AE` rows.
  - `payable = outputTax − inputTax`.
  - `csvTable(rows: (string | number)[][]): string`: BOM, `;`, CRLF and quoting as in Global Constraints. Numbers are written as given.
  - `csvAmount(minor: number): string` → `1234,56` / `-0,50`.
  - `expensesCsv(expenses: Expense[]): string`. Columns: `Datum;Lieferant;Beschreibung;Kategorie;Netto;USt-Satz;USt;Brutto;Kunde;Projekt;Beleg`.
  - `invoicesCsv(rows: { issued: Issued; paid: number }[]): string`. Columns: `Nummer;Typ;Datum;Kunde;Netto;USt;Brutto;Bezahlt;Offen`.
  - `paymentsCsv(payments: Payment[]): string`. Columns: `Datum;Rechnung;Betrag;Methode;Referenz`.
  - `vatCsv(summaries: VatSummary[]): string`. Columns: `Zeitraum;Basis;Umsatzsteuer;Vorsteuer;Reverse-Charge netto;Zahllast`.
  - Check the actual type names `Issued` / `Payment` in `records.ts` and use them.

- [ ] **Step 1: Write failing tests.**
  - `periodRange('2026-Q4')` → `2026-10-01..2026-12-31`, `periodRange('2026-02')` ends `2026-02-28`, and a bad period throws.
  - Accrual: 2 invoices and 1 credit note in Q4 → exact output rows and `outputTax`. An expense with `vat: 1900` → `inputTax: 1900`, and `payable` is the difference.
  - Cash: `cash basis splits VAT across part payments and sums exactly`. A gross of 11900 with VAT 1900 paid 5000 (Q1) then 6900 (Q2) gives Q1 tax 798 and Q2 1102, summing to 1900.
  - `cash basis caps at invoice gross`.
  - `small-business` → `applicable: false`.
  - `vat_basis` validation accepts `accrual`/`cash`, rejects others, and is absent by default.
  - `csvTable([['a;b','x"y'],[1]])` → `﻿"a;b";"x""y"\r\n1\r\n`, and `csvAmount(-50)` → `-0,50`.
  - Each `*Csv` writes the header row above for one sample.
- [ ] **Step 2: Run** `pnpm --filter @kaihuman/formats test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the formats tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(formats): VAT summary with Soll/Ist basis and CSV exports`

### Task 3: Retainers due, contract reminders, stage change, expense and contract actions (formats)

**Files:**
- Modify: `records.ts` (`Draft.from_retainer?: string`, plus `KEY_ORDER`), `validate.ts` (`validateDraft`; tighten `validateExpense.receipt` and `validateContract.file` to the exact forms in Global Constraints), `actions/drafts.ts` (`draftFromRetainer` sets `from_retainer: retainer.next_date`), `paths.ts`
- Create: `actions/expenses.ts`, `actions/contracts.ts`, `actions/stage.ts`, `reminders.ts`, and tests
- Modify: the issue action (`issue.ts` / `actions/` issue composition) to advance the retainer

**Interfaces:**
- Produces:
  - `ATTACHMENT_MAX_BYTES = 10485760`, `RECEIPT_EXTENSIONS = ['pdf','jpg','jpeg','png','webp','heic'] as const`, `CONTRACT_EXTENSIONS = ['pdf'] as const`.
  - `expensePath(year: string, id: Ulid): string`, `receiptPath(year, id, ext): string`, `contractPath(client: Slug, id: Ulid): string`, `contractFilePath(client, id): string`.
  - `retentionEnd(repo: BusinessRepo, date: string): string`, giving `YYYY-12-31`.
  - `saveExpense(repo, expense: Expense, receipt?: { ext: string; bytes: Uint8Array }): Result<{ changes: FileChanges; message: string }>`.
    - It validates the expense, the receipt size and type, and that `receipt === <id>.<ext>`.
    - When the expense already had a receipt with a different extension, it deletes the old file.
    - The message is `business: expense <supplier> <date>`.
  - `deleteExpense(repo, id): Result<…>` removes the YAML and the receipt.
  - `saveContract(repo, contract: Contract, file?: Uint8Array)` and `deleteContract(repo, client, id)` work the same way.
  - `setClientStage(repo, slug, stage: ClientStage): Result<…>` rewrites `client.yaml` keeping key order. The message is `business: <slug> → <stage>`. The same stage is refused with `<slug> is already <stage>.`
  - `retainersDue(repo, today: string, windowDays = 14): { project: Project; date: string; hasDraft: boolean }[]`. It returns projects whose retainer `next_date ≤ today + windowDays`, sorted by date. `hasDraft` is true when a draft has `project` + `from_retainer === next_date`.
  - `nextRetainerDate(retainer): string`: monthly is +1 month, quarterly +3 months, end-of-month clamped. Reuse `addMonths`.
  - `contractReminders(repo, today, windowDays = 60): { contract: Contract; date: string; what: 'renewal' | 'notice' | 'end' }[]`. The notice date is `(renewal_date ?? end) − notice_period_days`. Move `contractDates` logic from `apps/console/src/lib/business/overview.ts` here, keep its behaviour, and add `end`.
  - **Issuing a draft with `from_retainer`:** the same commit rewrites the project YAML with `next_date = nextRetainerDate(...)`, but only if the project's current `next_date === from_retainer`. The issued document does not carry `from_retainer`; check the issued validator and strip it.

- [ ] **Step 1: Write failing tests.**
  - Path helpers.
  - `saveExpense` with a 10485761-byte receipt is refused with `Receipts can be up to 10 MB.`, and `ext: 'exe'` with `Receipts must be PDF, JPG, PNG, WEBP or HEIC.`
  - A valid save gives changes with the YAML and the bytes.
  - Changing a receipt from `.png` to `.pdf` deletes the old file.
  - `deleteExpense` removes both files.
  - `setClientStage` changes only `stage`, and the same stage is refused.
  - `retainersDue` covers the window edge and `hasDraft`.
  - `nextRetainerDate('2026-01-31', monthly)` → `2026-02-28`.
  - `contractReminders` gives notice = renewal − 30 days, plus `end`.
  - Retainer advance: issuing a `from_retainer` draft advances `next_date`, and a second stale draft for the same period does not. The issued YAML has no `from_retainer`.
  - `retentionEnd` for 2026 under `de` → `2034-12-31`.
- [ ] **Step 2: Run** the formats tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Update `packages/formats/skills/kh-business/SKILL.md` (expenses, receipts, `from_retainer`, `vat_basis`) and the business-check if it validates receipts and contract files by path.
- [ ] **Step 4: Run** the formats tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(formats): expenses, contracts, stage change, retainer and contract reminders`

### Task 4: Expenses page with receipt upload and VAT summary

**Files:**
- Create: `apps/console/src/pages/ExpensesPage.tsx`, `ExpenseFormPage.tsx`, `apps/console/src/lib/business/expense-form.ts`, `apps/console/src/lib/business/download.ts` (`downloadBlob(name, data: Blob)`), and tests
- Modify: `App.tsx` (routes `/business/expenses`, `/business/expenses/new`, `/business/expenses/:id`), `BusinessPage.tsx` (an "Expenses" link)

**Interfaces:**
- Consumes: Task 1 binary `writeBusiness`, Task 2 `vatSummary` / `expensesCsv` / `vatCsv`, Task 3 `saveExpense` / `deleteExpense` / `retentionEnd`.
- Produces:
  - `expenseFormFromExpense`, `emptyExpenseForm(profile)`, and `expenseFromForm(form): Result<Expense>`.
    - Money is typed as decimal text and parsed to minor units with the existing money parser.
    - Gross is computed from net + VAT, and the VAT is suggested from net × rate. The user can override it (rounding on receipts).
  - **ExpensesPage:**
    - Year select, and a list by date desc: date, supplier, category, net, VAT, gross, and a receipt link that opens via a blob URL from `getFileBytes`.
    - Period switch month/quarter/year with a VAT summary block:
      - basis label `Soll (accrual)` / `Ist (cash)`
      - output VAT by rate
      - input VAT
      - reverse-charge net
      - `Payable` or `Refund` when negative
    - Small-business shows the not-applicable text.
    - Buttons `Export expenses (CSV)` and `Export VAT (CSV)`, with file names `expenses-<year>.csv` and `vat-<year>.csv`. The VAT CSV has the 12 months, 4 quarters and the year.
  - **ExpenseFormPage:**
    - Fields: date, supplier, description, category (a datalist of used categories plus `Software, Hardware, Travel, Office, Phone & internet, Training, Professional fees, Bank fees, Other`), net, VAT rate, VAT, gross (read-only), optional client/project, and a receipt file input (`accept` from `RECEIPT_EXTENSIONS`).
    - Size and type are checked on select, before any network call.
    - Delete shows the retention confirm text from Global Constraints.

- [ ] **Step 1: Write failing tests.**
  - `expenseFromForm` parsing and the gross check.
  - The form refuses an 11 MB file with the formats message and makes no write call.
  - A save calls `writeBusiness` once, with YAML plus bytes.
  - Delete shows the retention text.
  - ExpensesPage lists expenses, shows the VAT summary for a quarter (accrual and cash fixtures), and the export buttons call `downloadBlob` with the right names and a BOM.
- [ ] **Step 2: Run** the console tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): expenses with receipts, VAT summary and CSV export`

### Task 5: Dashboard: VAT payable, retainers due, contract reminders; contract form

**Files:**
- Modify: `apps/console/src/lib/business/overview.ts`
  - `Dashboard.vat` uses `vatSummary` payable for month and quarter
  - add `retainersDue`
  - `contractsDue` comes from `contractReminders`
- Modify: `BusinessPage.tsx`
  - VAT stat labelled `VAT payable` with the basis
  - a "Retainers due" card with `Create draft` (existing `/business/drafts/new?from=retainer&project=…` link) or `Draft ready` when `hasDraft`
  - contract reminders include `end`
- Modify: `ClientPage.tsx` (contracts list: next reminder, file link, `Add contract`, `Edit`)
- Create: `ContractFormPage.tsx` (routes `/clients/:slug/contracts/new` and `/clients/:slug/contracts/:id`), `lib/business/contract-form.ts`, and tests

**Interfaces:**
- Consumes: Task 2 `vatSummary`, Task 3 `retainersDue` / `contractReminders` / `saveContract` / `deleteContract`.
- Produces: `contractFormFromContract`, `emptyContractForm`, and `contractFromForm(form): Result<Contract>`.
  - Fields: kind (datalist `contract, nda, framework, sla, other`), title, start, end, notice_period_days, renewal_date, and a PDF file.
  - Delete uses the retention confirm.

- [ ] **Step 1: Write failing tests.**
  - The dashboard VAT equals `vatSummary(...).payable` for the month and quarter, including input VAT.
  - The retainers-due card shows `Create draft` and `Draft ready`.
  - An end-date reminder appears.
  - The contract form saves YAML plus PDF in one write, refuses non-PDF, and its edit keeps the existing file when no new file is chosen.
  - The DraftPage `from=retainer` draft carries `from_retainer`.
- [ ] **Step 2: Run** the console tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): VAT payable, retainers due, contract reminders and contract form`

### Task 6: Year export zip

**Files:**
- Create: `apps/console/src/lib/business/zip.ts` (+ test), `packages/formats/src/business/year-export.ts` (+ test, exported), `apps/console/src/lib/business/year-export.ts` (+ test)
- Modify: `ExpensesPage.tsx` or `BusinessPage.tsx`: an `Export year for Steuerberater…` panel with a year select, progress (`Reading 12 of 87 files…`), and the result download `business-<year>.zip`

**Interfaces:**
- Produces:
  - `zipStore(entries: { path: string; bytes: Uint8Array; modified?: Date }[]): Uint8Array`.
    - Store method (0), CRC-32 (table-based, in-repo), UTF-8 flag bit 11, DOS time from `modified` (default 1980-01-01).
    - It throws `Zip too large.` above 0xFFFFFFFF bytes or 65535 entries (no ZIP64).
  - `yearExportPaths(repo: BusinessRepo, tree: string[], year: string): string[]`, with repo-relative paths under `.kh/business/`:
    - `business.yaml` and `VERFAHRENSDOKUMENTATION.md`
    - `offers/<year>/*`, `invoices/<year>/*` (yaml/pdf/xml/sha256)
    - `expenses/<year>/*`
    - `payments/<year>.jsonl`, `time/<year>-*.jsonl`
    - the `client.yaml` of every client named by a document, expense or time entry of that year, and their `contracts/*` active in that year
    - Sorted, no duplicates.
  - `yearExportSummaries(repo, year): Record<string, string>`: `summary/invoices.csv`, `summary/payments.csv`, `summary/expenses.csv`, `summary/vat.csv` (months, quarters, year), and `summary/README.txt`. The README holds the business name, the year, the generation date, the VAT basis and a list of what is included.
  - `buildYearExport(target: KBRepo, repo: BusinessRepo, year: string, onProgress: (done: number, total: number) => void): Promise<Uint8Array>`.
    - It reads every path at the current head sha with `getFileBytes`, at most 4 at a time.
    - It adds the summaries and `SHA256SUMS`, which lists `sha256  path` for every other entry, computed with WebCrypto.
    - Any read failure rejects with `Could not read <path>.`

- [ ] **Step 1: Write failing tests.**
  - `zipStore` of two entries (one with a non-ASCII name `Beleg-ä.pdf`) has local-header and central-directory signatures and offsets that parse back. The CRC matches `zlib.crc32` (Node ≥ 22.2, available here), and the UTF-8 flag is set.
  - 65536 entries throw.
  - `yearExportPaths` on a fixture tree picks exactly the expected paths (it excludes other years, drafts, links.jsonl and events.jsonl).
  - `buildYearExport` with a fake service and 6 files calls `onProgress` up to 6/6, has at most 4 reads in flight, includes `SHA256SUMS` with correct hashes, and rejects with `Could not read …` on one failing read.
- [ ] **Step 2: Run** the formats and console tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the formats and console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(business): year export zip for the Steuerberater`

### Task 7: Pipeline board

**Files:**
- Create: `apps/console/src/pages/PipelinePage.tsx` (+ test), route `/business/pipeline`
- Modify: `BusinessPage.tsx` (the pipeline card links to `Open board`)

**Interfaces:**
- Consumes: Task 3 `setClientStage`, the existing `Dashboard.pipeline`.
- Produces:
  - **Columns:** one per `CLIENT_STAGES`, with headings `Lead, Contacted, Offer sent, Active, Past, Lost` and a count.
  - **Cards:** client name (link to the client page), open amount, last activity date.
  - **Moving a client:** each card has a labelled `<select>` `Move <name> to…`. There is no drag-and-drop, so it is fully keyboard-usable. Choosing a stage writes through `writeBusiness`, updates the board, and announces `<name> moved to <Stage>.` in an `<output>`.
  - The `Past` and `Lost` columns are collapsed by default behind a `Show past and lost (n)` toggle.

- [ ] **Step 1: Write failing tests.**
  - The board renders the columns with their counts.
  - Moving a client calls `writeBusiness` with only the stage changed, and the announcement shows.
  - On a write failure the card stays in its column and an alert shows.
  - Demo mode has no selects.
  - The collapsed toggle works.
- [ ] **Step 2: Run** the console tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): pipeline board with stage changes`

### Task 8: Docs, version and full verification

**Files:**
- Modify: `doc/business.md` (expenses and receipts, VAT basis and summary, CSV formats, year export contents, retainers, contracts, pipeline), `doc/features.md`, `doc/roadmap.md` (tick the phase 5a items), `doc/progress.md`, `README.md` if business features are listed, and the enable-form / business setup docs where `vat_basis` can be set
- Modify: `apps/console/src/lib/business/enable-form.ts` (a `VAT basis` select, default Soll, written only when `cash`) and its test
- Modify: `apps/console/src/lib/business-setup.ts` (`BUSINESS_TOOLS_VERSION` → `1.3.0`) and its test

- [ ] **Step 1: Write the docs and the enable-form change.** Every claim must match the code from Tasks 1–7.
- [ ] **Step 2: Full verification:** `pnpm install --frozen-lockfile`, the formats and ui builds, then `pnpm -r --no-bail lint`, `check-types` and `test`. All must exit 0. The 8 clippy warnings in `apps/cli` are pre-existing.
- [ ] **Step 3: Commit:** `docs(business): money admin`
