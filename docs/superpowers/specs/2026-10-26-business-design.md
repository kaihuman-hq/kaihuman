# Business: clients, offers, invoices — design

Date: 2026-10-26 · Status: draft for review

## 1. Goal

A solo business owner tracks everything about their business as files in a
private GitHub repo, and kaihuman renders it. One page per client shows
offers, invoices, payments, time, todos, the action log, contracts and
projects. Clients can download offers and invoices at any time through
end-to-end encrypted, revocable links.

kaihuman has other users, so everything here works per user: each user has
their own business repo, and the share service separates and limits
accounts.

### Decisions so far

| Topic | Decision |
|---|---|
| First user | Germany, VAT-registered (regular USt) |
| System of record | kaihuman files. An external generator renders PDFs (and later e-invoice XML) from them. Numbering lives in the repo. |
| Location | A separate private repo per user (e.g. `you/business`), with the main branch protected against force-push and deletion |
| Formats | YAML records, Markdown for prose, JSONL for append-only streams. Todos and the action log use the existing formats. |
| Input | Console forms for daily actions, plus an agent skill for drafting by editing files |
| Share links | A Cloudflare Worker. Files are encrypted in the browser, the key sits in the URL fragment, and the server-side token can be revoked. |
| Encryption scope | Only files that leave the repo. Repo files stay plaintext in a private repo. |
| Scope | Core plus payments, expenses/VAT, projects/retainers, contracts, pipeline, delivered in phases (section 9) |

### Non-goals

- No double-entry bookkeeping or annual accounts. Exports go to the Steuerberater.
- No PDF rendering inside kaihuman (section 7).
- No client portal or client accounts.
- No encryption of repo files at rest.
- No multi-currency accounting. Records carry a currency, and v1 assumes one currency per business.

## 2. Repository layout

```
business.yaml                  profile: legal name, address, USt-IdNr, Steuernummer,
                               IBAN/BIC, contact, jurisdiction, number formats,
                               defaults (payment terms, VAT rate, language)
clients/<slug>/
  client.yaml                  legal name, address (ISO country), VAT ID, Leitweg-ID,
                               buyer reference, e-invoice address, contacts[],
                               payment terms, language, stage
  notes.md
  todos.todos.md               existing todos format
  log.actionlog.md             existing action-log format
  projects/<slug>.yaml         status, hourly/daily rate or fixed price, budget,
                               optional retainer {amount, interval, next_date}
  contracts/<id>.yaml          kind (contract, NDA, …), start, end, notice period,
                               renewal date, file
  contracts/<id>.pdf
drafts/<ulid>.yaml             unnumbered offer/invoice/credit-note drafts
offers/<year>/<number>.yaml    issued offers (+ <number>.pdf)
invoices/<year>/<number>.yaml  issued invoices and credit notes (+ .pdf, later .xml)
time/<yyyy-mm>.jsonl           {id, date, minutes, client, project?, note, invoice?}
payments/<year>.jsonl          {id, date, invoice, amount, method, ref}
expenses/<year>/<ulid>.yaml    date, supplier, net/VAT/gross, rate, category,
                               client/project if billable, receipt
expenses/<year>/<ulid>.<ext>   receipt file
links.jsonl                    share links: {id, doc, url, created, expires?, revoked?}
events.jsonl                   dated document events: sent, accepted, declined,
                               downloaded (pulled from the share service)
.github/workflows/business-check.yml
VERFAHRENSDOKUMENTATION.md     template the user completes (GoBD)
```

- **IDs:** clients and projects use slugs (`/^[a-z0-9][a-z0-9-]{1,39}$/`, the same rule as ideas). Drafts, expenses, time and payment entries use ULIDs. Issued documents use their number.
- **Joins:** every record names its `client` (and optionally `project`) by slug. The client page brings records together by slug.
- **Pipeline:** `client.yaml` `stage: lead | contacted | offer-sent | active | past | lost`. A lead is just a client in an early stage. Offers move it forward.

## 3. Data rules

### Money and numbers
- Amounts are integer minor units (`12500` = 125.00) with the currency on the record. Never floats.
- Quantities and rates are decimal strings (`"7.5"`, `"19"`).
- Rounding is per line, then summed per VAT category. The rule is written down in the module and in the Verfahrensdokumentation.
- YAML is parsed as 1.2 core schema with strict validation. Unknown keys are an error, and values that look like dates stay strings.

### Invoice lifecycle
1. **Draft:** `drafts/<ulid>.yaml`, editable, no number. Created by a form, by the agent, from unbilled time, or from a retainer.
2. **Issue** (console only):
   - Validates the draft.
   - Takes the next number in the year's series. This is the highest existing number in `invoices/<year>/` plus one, re-checked against the remote tree right before the commit.
   - Copies seller and buyer details into the document and calculates the totals.
   - Makes one atomic commit with `commitFiles`: issued file, draft removed, time entries tagged with `invoice`, action-log line.
   - If the branch moved meanwhile, the commit fails and is retried with a fresh number check.
3. **Frozen:** an issued file never changes. CI fails on any modification or deletion under `offers/` and `invoices/`. Adding the generated PDF/XML and a `<number>.sha256` file is allowed.
4. **Correction:** a credit note (type 381, gets the next number from the invoice series, references the original), then a new invoice if needed.
5. **Status is calculated, never stored:**
   - From payments: open, part-paid, paid.
   - From the due date: overdue.
   - From `events.jsonl`: sent, viewed.

Offers follow the same rules with their own series:
- Statuses: draft → issued → accepted / declined / expired. Expired is worked out from `valid_until`.
- A revision is a new number with `supersedes:`.
- "Convert to invoice" creates a draft with `from_offer:`.

### Fields for e-invoices (EN 16931)
Every issued invoice stores what XRechnung/ZUGFeRD need:
- type code, currency, issue and due date, service period
- buyer reference / Leitweg-ID
- seller and buyer addresses with ISO country, VAT IDs, seller contact, electronic addresses
- lines: quantity, UN/ECE unit code, unit price, VAT category code and rate
- VAT breakdown with the exemption reason (e.g. reverse charge `AE`)
- payment means (SEPA 58, IBAN, reference)
- totals

### Jurisdiction
- `business.yaml` names a `jurisdiction`.
- The module has a small jurisdiction interface: required fields, VAT categories and notes, number-format rules, retention years.
- v1 ships `de`: §14 UStG fields, reverse-charge text, Kleinunternehmer note if `vat_regime: small-business`, retention 8 years.
- Other countries fall back to a generic set with no country checks, and the UI says so.

## 4. The `business` module (`packages/formats/src/business/`)

Pure, dependency-light, fully tested. Every surface uses it: console, CI check, agent, generator.

- Parse and serialise each record type, with branded types and discriminated unions (`Draft | IssuedInvoice | CreditNote`).
- `validate(record, profile)` returns typed errors with path and message.
- `computeTotals(doc)`: lines, VAT breakdown, net, VAT, gross.
- `nextNumber(series, existingNumbers)` and `detectGaps(...)`.
- `issue(draft, profile, client, numbers, now)` returns the issued document plus the list of file changes.
- `deriveInvoiceStatus(invoice, payments, events, today)` and the same for offers.
- `toEn16931(invoice)`: plain object for generators. XML serialisation comes in phase 6.
- Reading and appending JSONL streams without touching unrelated lines.
- Shared fixtures in `packages/formats/fixtures/business/`.
- A `business-check` CLI entry (Node, ESM) that CI in the business repo runs. It validates schemas and refuses changes to issued files compared with the base commit.
- Adds a YAML 1.2 parser dependency (`yaml`) to `packages/formats`. The existing hand-written frontmatter parser cannot hold nested data.

## 5. Console

### Setup
- A "Business repo" setting, separate from the current repo, stored like the current repo choice.
- "Set up business repo" works like the knowledge-base setup. It creates the skeleton in one commit: `business.yaml` from a short form, the CI workflow, the agent skill and the Verfahrensdokumentation template. It also explains how to turn on branch protection.

### Pages
- **`/business`:**
  - who owes me (open and overdue, with totals)
  - unbilled hours per client
  - VAT for the current month and quarter
  - contracts with renewal or notice dates in the next 60 days
  - drafts waiting to be issued
  - pipeline columns by stage
- **`/clients`:** list with stage filter, billed this year, open amount.
- **`/clients/:slug`:**
  1. header: contact, stage, billed this year, open amount, unbilled hours, hours this month
  2. timeline that merges offers, invoices, payments, events, downloads, action log and contracts by date
  3. offers and invoices with calculated status, PDF present or missing, link status
  4. projects with budget used and retainer
  5. time by week and project
  6. todos and action log (the existing widgets on this client's files)
  7. contracts and notes
- **`/business/expenses`:** list, receipt upload, VAT summary per month or quarter, CSV export for the Steuerberater.
- **`/business/shared`:** every uploaded file with link, expiry, downloads and storage used. Revoke and delete from here.

### Forms
- log time, start/stop timer
- add todo or log line
- record payment
- new client or project
- new draft, prefilled from unbilled time or a retainer
- issue, with a confirmation showing the number and totals
- credit note
- mark offer accepted or declined
- add expense
- create or revoke share link

Each form writes through `commitFiles` with a readable commit message.

### Code placement
- Pages go in `apps/console/src/pages/`.
- Loaders and view-model logic go in `apps/console/src/lib/business/` with tests.
- Reusable widgets go in `packages/ui`.
- Routes go in `App.tsx`. Nav entries need both the `NavItemId` union and `NAVBAR_ITEMS`.

### Agent skill
- `SKILL.md` in the business repo describes the formats, the rule that drafts are the only thing an agent creates for numbered documents, and how to add clients, time and notes.
- Issuing stays in the console, so numbering always runs through the same code.

## 6. Share service (`apps/share-worker`)

A Cloudflare Worker with D1 (records) and R2 (encrypted files, EU jurisdiction), at a host such as `docs.kaihuman.com`.

### Flow
1. The user clicks "Create share link" on an issued document with a PDF.
   - The first time, a one-time explanation appears: what gets uploaded, where (Cloudflare, EU), that it is encrypted in the browser, who can open it, how to revoke. The user must accept it.
   - Every upload then asks for confirmation: "Upload RE-2026-0042.pdf (encrypted) to create a share link?" Nothing is ever uploaded automatically.
2. The browser makes a random 256-bit key and encrypts the file with AES-GCM using WebCrypto.
3. The browser sends the ciphertext plus metadata (document label, business name, optional expiry) to `POST /api/files`, authenticated with the user's GitHub token.
   - The Worker checks the token with GitHub `GET /user` and keys everything by the numeric GitHub user id.
   - It stores the ciphertext in R2.
   - It returns a random 128-bit token.
4. The link is `https://docs.kaihuman.com/d/<token>#<key>`. The console appends it to `links.jsonl` in the private business repo, so the owner can copy it again.
5. The client opens the link.
   - The Worker serves a static page: document label, "shared by <business name>", Download button, report-abuse link.
   - On click, the page fetches the ciphertext, decrypts it locally with the key from the fragment, and saves the PDF.
   - The fragment is never sent to the server, so neither the operator nor email scanners can read the file.
   - Scanner pre-opens only load the landing page and are not counted.
6. The Worker records download events (time and coarse user agent, no IP stored). The console pulls them into `events.jsonl` and the client's action log.
7. **Revoke:** the token is marked revoked and the R2 object is deleted. Issuing a credit note offers to revoke the original invoice's link.

### Multi-user and abuse limits
- Every record and object is scoped to a GitHub user id. No list or read crosses users.
- Only PDF and XML, max 10 MB per file, a storage quota per user (e.g. 500 MB), rate limits on uploads.
- Expiry is optional: invoices default to none, offers default to `valid_until`.
- `DELETE /api/account` removes all of a user's files and records.
- A report-abuse address on every landing page, and an operator tool to disable a token.
- The share-service URL is a console setting, so users can self-host the Worker.
- The privacy policy gets a share-service section.
- The console marks online documents with an "Online · link active" badge.

## 7. Generator contract

- The external generator reads an issued `<number>.yaml` and should use `computeTotals` / `toEn16931` from the module, never its own tax maths.
- It writes `<number>.pdf` (and from phase 6 `<number>.xml`) next to it, plus `<number>.sha256`.
- The console shows "PDF missing" until the file exists.
- Template version and generator name go into the sha256 file for traceability.

## 8. Errors, compliance, retention

- **Concurrent edits:** writes use `commitFiles`. If the remote ref moved, the console reloads and retries once, then shows the conflict.
- **Validation:** forms validate before writing, and CI validates after.
- **Invalid files written by hand or by the agent:** shown in a per-file error list (as on the Ideas page) and never crash a page.
- **Retention:** each issued document has `retain_until` (end of issue year + jurisdiction years). The UI warns before deleting anything that is not yet past it.
- **GoBD position:** branch protection, frozen issued files enforced in CI, file hashes, git history and a completed Verfahrensdokumentation make a reasonable setup, but not a certified one. The owner should have their Steuerberater review it.

## 9. Phases

Each phase gets its own implementation plan and ships on its own.

1. **Formats and scaffold:** `business` module (parse, validate, totals, VAT, numbering, issue, status), fixtures, `business-check` CLI, scaffold templates, agent skill.
2. **Read-only console:** business repo setting and setup, `/clients`, client page, `/business` dashboard.
3. **Daily forms:** time and timer, todo and log, payments, drafts, issue, credit notes, offer accept/decline.
4. **Share service:** Worker, D1/R2, encryption, consent flow, `/business/shared`, download events.
5. **Money admin:** expenses and receipts, VAT summary and export, retainer drafts, contract reminders, pipeline board.
6. **E-invoice:** XRechnung (UBL/CII) and ZUGFeRD output from `toEn16931`, checked with the KoSIT validator. Must be done before 2028-01-01.

## 10. Testing

- **Module:** totals and rounding, reverse charge, Kleinunternehmer note, numbering (gaps, collisions, year rollover), issue snapshot, credit notes, derived status, strict YAML edge cases, JSONL append. Uses shared fixtures.
- **`business-check`:** accepts valid repos, rejects edits to issued files, accepts added PDF/XML/sha256.
- **Console `lib/business`:** loaders, timeline merge, dashboard aggregates, commit composition for issue and payment.
- **Share Worker:** auth and user scoping, quota and type limits, token lookup, revoke, expiry, account deletion. Plus a round-trip test of the encryption helper (encrypt in Node, decrypt with the landing-page code).

## 11. Open points for planning

- Exact number format default (`RE-{yyyy}-{nnnn}` / `AN-{yyyy}-{nnn}`), which can be changed in `business.yaml`.
- Default quota and rate limits for the hosted share service.
- The share-service domain.
