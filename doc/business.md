# Business — file format reference

Status: phase 1 built (2026-10-26): formats, repo check, skill, set-up function. Phase 2 built
(2026-10-27): read-only console pages. Phase 3 built (2026-11-02): daily forms, running timer,
palette commands, read-only issued files, business hours on the browser extension's start page. Phase 4 built
(2026-11-02): share links. Phase 5a built (2026-11-02): money admin (expenses and receipts, VAT summary,
CSV, year export, retainers due, contract reminders and form, pipeline board). Design: `docs/superpowers/specs/2026-10-26-business-design.md`.

## Goal

Track a solo business as plain files in your private Life OS repo, under `.kh/business/`. Agents
and the console share the files. A GitHub Action checks them on every push.

## Layout

```
.kh/business/
  business.yaml                  your profile (legal name, address, VAT ID, bank, defaults)
  clients/<slug>/client.yaml     + notes.md, todos.todos.md, log.actionlog.md,
                                 projects/<slug>.yaml, contracts/<id>.yaml + <id>.pdf
  drafts/<ulid>.yaml             unnumbered offer / invoice / credit-note drafts
  offers/<year>/<number>.yaml    issued offers (frozen)
  invoices/<year>/<number>.yaml  issued invoices and credit notes (frozen)
  time/<yyyy-mm>.jsonl           one line per time entry
  payments/<year>.jsonl          one line per payment
  expenses/<year>/<ulid>.yaml    expenses (+ receipt <ulid>.<ext> beside it)
  events.jsonl, links.jsonl      document events and share links
  VERFAHRENSDOKUMENTATION.md     GoBD template you complete
  SKILL.md                       agent skill (copies in .agents/ and .claude/skills/kh-business/)
  .tools/                        business-check.mjs and its version
.github/workflows/business-check.yml
```

Client and project slugs match `^[a-z0-9][a-z0-9-]{1,39}$`. Drafts, time entries, payments,
expenses, contracts and events use ULIDs; a file named by its ULID has that ULID as `id`. Issued
documents use their number.

## Record formats

YAML 1.2 core schema, unique keys. Unknown keys are an error. Dates are strings (`YYYY-MM-DD`).

```yaml
# clients/acme-gmbh/client.yaml
name: Acme GmbH
address: { street: Hauptstrasse 5, postcode: "80331", city: Muenchen, country: DE }
vat_id: DE987654321
contacts: [{ name: Erika Beispiel, email: erika@acme.example }]
payment_terms_days: 14
stage: active          # lead | contacted | offer-sent | active | past | lost
```

```yaml
# drafts/<ulid>.yaml (an issued file adds number, seller, buyer, totals, retain_until)
id: 01M5KA3Q00W16BGNTZ49EKRX27
kind: invoice          # invoice | credit-note | offer
client: acme-gmbh
service_period: { start: "2026-10-01", end: "2026-10-25" }
lines:
  - { description: Development, quantity: "7.5", unit: HUR, unit_price: 9500, vat_category: S, vat_rate: "19" }
```

```jsonl
{"id":"01M581YW00W16BGNTZ49EKRX27","date":"2026-10-12","minutes":450,"client":"acme-gmbh","note":"Implementation"}
{"id":"01M5AMBK0038DJQW16BGNTZ49E","date":"2026-11-05","invoice":"RE-2026-0001","amount":100138,"method":"transfer"}
```

The first line is `time/2026-10.jsonl`, the second `payments/2026.jsonl`. JSONL files are
append only: one object per line, and hand edits (CRLF, blank lines, no final newline) are fine.

```yaml
# expenses/2026/01M5KA3Q00W16BGNTZ49EKRX27.yaml (the receipt is expenses/2026/01M5KA3Q00W16BGNTZ49EKRX27.pdf)
id: 01M5KA3Q00W16BGNTZ49EKRX27
date: "2026-03-14"      # must be in the folder's year
supplier: Hetzner Online GmbH
description: Server March
category: Software      # free text; the form suggests common ones
net: 1000
vat_rate: "19"
vat: 190
gross: 1190
client: acme-gmbh       # optional, with project
receipt: 01M5KA3Q00W16BGNTZ49EKRX27.pdf
```

```yaml
# clients/acme-gmbh/contracts/<ulid>.yaml (optional file: <ulid>.pdf)
id: 01M5KA3Q00W16BGNTZ49EKRX28
client: acme-gmbh
kind: retainer
title: Support agreement
start: "2026-01-01"
end: "2026-12-31"       # optional
notice_period_days: 90  # optional
renewal_date: "2027-01-01"   # optional
file: 01M5KA3Q00W16BGNTZ49EKRX28.pdf
```

`business.yaml` takes an optional `vat_basis: accrual | cash`. A missing value means `accrual`
(Soll). A project may carry `retainer: { amount, interval: monthly|quarterly, next_date, description }`.
A draft made from a retainer carries `from_retainer: <next_date>`.

## Money and decimals

- Amounts are integer minor units: `12500` is 125.00. The currency is on the record. Never floats.
- Quantities and rates are decimal strings: `"7.5"`, `"19"`. A bare number (`vat_rate: 19`) is an
  error that says to quote it.
- Each line net is rounded on its own, half-up away from zero. Line nets are summed per VAT
  category and rate, and VAT is computed on each sum.

## Numbering

- Invoices and credit notes share one series, `RE-{yyyy}-{nnnn}`. Offers use `AN-{yyyy}-{nnn}`.
  Change either in `business.yaml` under `numbering`: a pattern has exactly one `{yyyy}` and one
  `{n…}`, and its other text is letters, digits, `-` and `_`, starting with a letter or digit, so
  every number is a valid file name.
- The number is the highest existing number of the year plus one. The year comes from `issue_date`:
  a draft issued on 2027-01-02 gets `RE-2027-0001`, whatever else exists.
- The check reports gaps in a year's series.

## Issuing and the frozen rule

- Agents and forms create drafts. Issuing takes a number, copies seller and buyer details,
  computes totals and sets `retain_until` (31 Dec of issue year plus 8 years for `de`, 10 for
  `generic`), in one commit.
- Files under `offers/` and `invoices/` never change and are never deleted. Adding
  `<number>.pdf`, `<number>.xml` and `<number>.sha256` is allowed.
- Corrections are credit notes (type 381, next number of the invoice series, `corrects` names the
  original invoice, never another credit note), then a new invoice if needed.
- Under `de` with `vat_regime: regular`, invoices and credit notes with lines in category E, K, O
  or Z are refused: they need an exemption note (§ 14 Abs. 4 Nr. 8 UStG) that is not supported
  yet. E is the category for small-business (§ 19 UStG); AE (reverse charge) gets its note.
- Status (open, part-paid, paid, overdue, credited) is calculated from payments and dates, never stored.

## The check

Run it from the repo root:

```
node .kh/business/.tools/business-check.mjs                # validate the tree
node .kh/business/.tools/business-check.mjs --base <sha>   # also compare issued files with <sha>
```

It exits 1 on any error. Errors:

- invalid records: unknown keys, missing fields, unquoted numbers where a string or decimal is
  expected, a missing or invalid `business.yaml`;
- an `id` that differs from the file name (drafts, expenses, contracts), an expense whose `date`
  is not in its year folder, a contract whose `client` differs from its client folder, or an
  expense or contract id used twice (the console leaves such an expense or contract out and lists
  it under load problems);
- an expense `receipt` or contract `file` that is not exactly `<id>.<ext>` (`<id>.pdf` for
  contracts), or that names a file not beside the record in the tree (from tools version 1.3.0 on;
  a record with another name is a load error, so rename the file and the field to match the id;
  a record whose file is missing stays loaded so the form can remove or replace it);
- issued documents: a `number` that differs from the file name or does not parse under the
  series pattern (`business.yaml` `numbering`, else the default) with the folder's year; an
  `issue_date` outside the year folder; an offer outside `offers/` or an invoice or credit note
  outside `invoices/`; a `type_code` other than 380 for an invoice, 381 for a credit note, null
  for an offer; stored totals that differ from the totals computed from the lines;
  `retain_until` other than 31 Dec of issue year plus the jurisdiction's retention years;
- gaps in a year's series;
- references to unknown clients or projects, payments for anything but an issued invoice,
  `corrects` that is not an issued invoice, `from_offer` that is not an issued offer;
- symbolic links under `invoices/` or `offers/`;
- any change or deletion since the base of an issued file or of its pdf, xml or sha256.

Warnings: unrecognised files in `.kh/business/`, and events or links for a document that is not
issued. Without a usable base (first push, all-zero sha) it checks the tree and skips the frozen
rule. The workflow runs it on pushes and pull requests that touch
`.kh/business/**`. The bundle is built by `pnpm --filter @kaihuman/formats build`.

## Enable

`enableBusiness(kbRepo, profile)` (`apps/console/src/lib/business-setup.ts`) validates the
profile, refuses a public repo (`PublicRepoError`) or one that already has
`.kh/business/business.yaml` (`AlreadyEnabledError`), and makes one commit,
`chore: enable kaihuman business`, with the profile, empty data folders, the check, the workflow,
the skill and the Verfahrensdokumentation template. The console form for it is `/business/enable`.
The next business write (any console action that commits under `.kh/business/`) or KB sync
refreshes the tool files when `.kh/business/.tools/version` differs from `BUSINESS_TOOLS_VERSION`
(`1.3.0` since phase 5a: the check, skill and validators changed, so a repo set up earlier is
upgraded with its next business write or KB sync). Repos without business get nothing.

The form has a `VAT basis` select next to the VAT regime: Soll (default, nothing written) or Ist
(writes `vat_basis: cash`). Edit `business.yaml` to change it later.

Before you enable: the whole repo now holds tax records for 8 years, so do not delete it or
rewrite its history, and protect the main branch (no force-push, no deletion).

## Console

The console reads the business files and, since phase 3, writes them through forms. It needs
business enabled, and the pages warn when the repository is public (business data belongs in a
private repo).

| Page | What it shows |
|------|---------------|
| `/business` | Dashboard: open and overdue invoices, VAT this month and quarter, who owes me, unbilled time, contracts with a renewal or notice date in the next 60 days, drafts, clients by stage |
| `/clients` | Client list with name, stage, billed this year, open amount and unbilled hours; filter by stage |
| `/clients/:slug` | One page per client: timeline, offers, invoices, projects with budget use, time by week, todos, action log, contracts, notes and pages that link to the client |
| `/business/enable` | Set-up form; explains why it is blocked on a public repo |
| `/business/time/new` | Log time (also the stop-timer form, prefilled) |
| `/clients/new`, `/clients/:slug/projects/new` | New client, new project |
| `/business/payments/new?invoice=` | Record a payment |
| `/business/drafts/new`, `/business/drafts/:id` | Draft editor (invoice, offer, credit note) |
| `/business/drafts/:id/issue` | Issue preview and the "Issue <number>" button |
| `/business/expenses`, `/business/expenses/new`, `/business/expenses/:id` | Expenses of a year, VAT summary, CSV exports, year export; expense form |
| `/business/pipeline` | Pipeline board: clients by stage |
| `/clients/:slug/contracts/new`, `/clients/:slug/contracts/:id` | Contract form |
| `/business/shared` | Shared files: every share link on the service with size, dates, downloads and status; revoke; storage used |

- The Kanban board, the todo analytics and the action log have an All / Business / Personal toggle.
  Client todos (`clients/<slug>/todos.todos.md`) and logs (`log.actionlog.md`) count as Business.
- `[[client:slug]]` in a wiki page is a link to `/clients/<slug>`. The client page lists the wiki
  pages and ideas that contain it under "Linked from".
- A file with errors shows up in a collapsible "N files have problems" list; the rest still renders.
- Demo mode seeds a sample business ("Demo Studio", fake IBAN and VAT ID) with three clients, a paid
  and an overdue invoice, an offer, time entries and a wiki page linking to the active client.

## Writing (phase 3)

Every form makes one commit per action, with a message starting `business: `
(`writeBusiness`, `apps/console/src/lib/business/write.ts`).

- **Forms:** log time; start, stop and cancel the timer; new client and project; client todo and log
  lines (quick add on the client page); record a payment; offer accepted, declined or converted to
  an invoice draft; draft editor (from unbilled time, a retainer or empty); issue; credit note
  (a draft of kind `credit-note` with `corrects`, lines prefilled from the invoice).
- **Timer:** `time/running.yaml` holds the one running timer (`client`, optional `project` and
  `note`, `started_at` with offset). Starting while one runs is refused. Stop opens the log-time form
  prefilled (date = day of `started_at`, minutes rounded, 1 to 1440); saving appends the entry and
  deletes `running.yaml` in one commit.
- **Conflicts:** a write re-reads the files it touches and commits against the head sha it read. If
  the branch moved, it rebuilds from fresh contents and retries once. If that fails too, nothing is
  written and the form says `Someone else changed the repository at the same time. Reload and try
  again.` Your input stays in the form.
- **Issuing:** do not change `numbering` in `business.yaml` once you have issued documents. The
  check reads the format of every issued number from it, and a changed format breaks the gap-free
  series. Issued offers and invoices are written only by "Issue" (`issue()`). The next number
  is taken from fresh state, so a number issued on another device is never overwritten.
- **Palette** (console `SearchModal`, when business is enabled): `todo <client>: text`,
  `log <client>: text`, `timer <client>[/project]`, `stop timer`. The client is an exact slug or a
  unique prefix. Quick todo and quick log also have a "For client" select.
- **File browser:** issued yaml and offer/invoice pdf, xml and sha256 files open read-only and
  cannot be changed, renamed, moved or deleted there.

## Money admin (phase 5a)

**Expenses and receipts.** `/business/expenses` lists a year newest first (the select offers the
current and previous year, and every year with documents, payments, time or expenses). The form
takes date, supplier, description, category, client and project, net, VAT rate and VAT (suggested
from net × rate, half-up, until you type one); gross is net + VAT. A receipt is a PDF, JPG, JPEG,
PNG, WEBP or HEIC of up to 10 MB (`Receipts can be up to 10 MB.`, `Receipts must be PDF, JPG, PNG,
WEBP or HEIC.`), stored as it is (no recompression) at `expenses/<year>/<id>.<ext>`, extension
lower-cased, in the same commit as the YAML. A refused file is checked when you pick it and never
blocks saving. "Remove receipt" deletes it. Changing the date to another year moves the YAML and
refuses to leave a kept receipt behind. Delete asks
`This record must be kept until <date> (retention). Delete anyway?` while today is on or before
31 Dec of (year of the expense date + the jurisdiction's retention years: 8 for `de`, 10 for
`generic`); after that it is a plain confirm. Expenses cannot be negative yet (no refunds).

**VAT summary.** On `/business/expenses` for a month, quarter or year, and as `VAT payable
<period> (Soll|Ist)` on the dashboard (`VAT refund` when negative).
- Soll (accrual): invoices count by issue date, credit notes negative by their issue date.
- Ist (cash): credit notes are netted into the invoice they correct (effective gross and VAT per
  category and rate = invoice − credit notes). Each payment carries its share of the effective VAT,
  in proportion to the effective gross, capped at it; the payment that completes the invoice takes
  the exact remainder, so the parts sum to the effective VAT. A credit note issued after payments
  already exceed the new effective gross counts negative on its issue date only for that excess
  (VAT already taxed). A credit note whose invoice is unknown counts by its issue date. Payments
  on credit notes are ignored.
- Both bases: input VAT is the VAT of expenses by expense date; net of reverse-charge (`AE`)
  lines is shown separately. Payable = output − input.
- With `vat_regime: small-business` it shows `No VAT: small-business regime (§19 UStG).`

**CSV.** `expenses-<year>.csv` and `vat-<year>.csv` (12 months, 4 quarters, the year) are
downloaded from the expenses page; the year export has more. UTF-8 with BOM, `;` separator, CRLF,
fields with `;`, `"`, CR or LF quoted with `"` doubled, amounts as `1234,56` (`-` for negatives),
dates `YYYY-MM-DD`. Text fields (supplier, description, category, client, project, receipt,
method, reference) that start with `=`, `+`, `@`, tab or CR get a leading `'`, so a spreadsheet
does not run them as a formula. Columns:
- expenses: `Datum;Lieferant;Beschreibung;Kategorie;Netto;USt-Satz;USt;Brutto;Kunde;Projekt;Beleg`,
  oldest first;
- invoices: `Nummer;Typ;Datum;Kunde;Netto;USt;Brutto;Bezahlt;Offen` (`Rechnung`, or
  `Rechnungskorrektur` for credit notes, negative and never open);
- payments: `Datum;Rechnung;Betrag;Methode;Referenz`;
- VAT: `Zeitraum;Basis;Umsatzsteuer;Vorsteuer;Reverse-Charge netto;Zahllast`, `Basis` is `Soll` or
  `Ist`; small-business rows say `Kleinunternehmer` with `0,00`.

**Year export** ("Export year for Steuerberater…" on the expenses page; also in demo mode).
It builds `business-<year>.zip` in the browser from the head commit and shows
`Reading <n> of <total> files…`. Contents, paths relative to `.kh/business/`: `business.yaml`,
`VERFAHRENSDOKUMENTATION.md`; that year's offers and invoices with PDF, XML and SHA-256; that
year's expenses with receipts; `payments/<year>.jsonl`; `time/<year>-*.jsonl`; the `client.yaml`
of every client named by the year's documents, expenses or time, and their contracts active that
year with the PDF (start on or before 31 Dec, no end or end on or after 1 Jan); `summary/`
(`invoices.csv`, `payments.csv`, `expenses.csv`, `vat.csv`, `README.txt`); and `SHA256SUMS`. No
drafts, links or events. Raw files come from the head commit, one request per file (the blob named by the head tree); paid and open amounts are those of
the generation date, not the year end (the README says so). Files are fetched 4 at a time; one
failure stops the export with `Could not read <path>.` and no zip. A repository tree too large
for GitHub's listing is refused (`The repository is too large to export in one go.`). The zip uses
the store method (no ZIP64: at most 65535 files and 4 GiB), UTF-8 names.

**Retainers.** A project's `retainer` (`monthly` or `quarterly`) with `next_date` within 14 days
(or overdue) appears in the dashboard card `Retainers due` with `Create draft` (a draft with
`from_retainer`) or `Draft ready`. Issuing that invoice moves `next_date` on by one interval (a
month-end date stays on the month end), but only while `next_date` still equals the draft's
`from_retainer`, so a stale second draft never skips a period. Only active projects count.

**Contracts.** The client page lists contracts with their next reminder, `Open PDF` and `Edit`,
and `Add contract` opens the form (kind, title, dates, notice days, renewal date, optional PDF of
up to 10 MB: `Contract files can be up to 10 MB.`, `Contract files must be PDF.`). The dashboard
warns 60 days ahead of the renewal date, the notice deadline (counted back from `renewal_date`,
else `end`) and the end. Delete uses the retention text; retention counts from the contract's end,
or its start when open-ended.

**Pipeline.** `/business/pipeline` ("Open board" on the dashboard): Lead, Contacted, Offer sent and
Active columns; Past and Lost sit behind `Show past and lost (n)`. Cards show the open amount and
the last activity. Pick the stage in the `Move <name> to…` select, then press `Move` (one commit,
`business: <slug> → <stage>`; changing the select alone saves nothing); there is no drag-and-drop.
Demo mode is read-only.

## Share links (phase 4)

An issued offer, invoice or credit note with a PDF can be sent as a link instead of an email
attachment. The link opens a page with a Download button, no sign-in needed.

**The Worker must be deployed by the operator.** Share links need the
[share worker](../apps/share-worker/README.md) (`apps/share-worker`, Cloudflare Worker with D1 and
an R2 bucket in the EU). The default service is `https://docs.kaihuman.com`. Without a running
worker, sharing shows `The share service is not reachable.`; the rest of the business pages are not
affected. The README lists the setup steps.

- **How it works:** on the client page, "Share…" on an issued document asks
  `Upload <number>.pdf (encrypted) to create a share link?`. The console reads the PDF from the
  repository, encrypts it in the browser (AES-GCM 256, a new random key per document), uploads only
  the ciphertext and builds `https://docs.kaihuman.com/d/<token>#<key>`. The key is in the part
  after `#`, which browsers never send to a server, and the console never sends it either. The
  landing page decrypts in the visitor's browser. Nothing uploads automatically.
- **Consent:** sharing stays off until you accept a one-time explanation (stored on this device in
  `lifeos_share_consent_v1`). It says what is uploaded, that the service runs on Cloudflare in the
  EU, that your GitHub sign-in is sent to it to identify you, that the file is encrypted in the
  browser and who can open it. Every upload needs its own
  confirm. Sharing is not available in demo mode.
- **Who can open it:** anyone who has the full link, until it expires or you revoke it. Treat the
  link like the document. Offers expire at the end of their `valid_until` day (UTC); an offer whose
  `valid_until` is already past is shared without expiry. Invoices and credit notes do not expire.
  An expired or revoked link shows `This link is no longer available.` An expired link stops
  working, but its encrypted file stays stored, and counts toward your storage, until you revoke it
  or delete all shared files.
- **Where the link is kept:** `.kh/business/links.jsonl` in your private repository gets one line
  per link (`id`, `doc`, `url` including the key, `created`, optional `expires` as the end of the
  expiry day in UTC, e.g. `2026-12-01T23:59:59Z`, and `revoked`).
  Agents never create share links; only the console writes this file.
- **Revoke:** "Revoke…" next to the link, or on `/business/shared`; an expired link that was never
  revoked keeps a "Revoke…" too, because its file is still stored. The Worker deletes the file
  and the console sets `revoked` on the line, in one commit. Revoking works only while the console
  points at the service that created the link; otherwise it says
  `This link was created on <host>. Switch the share service to <host> to revoke it.` Issuing a
  credit note offers to revoke the link of the invoice it corrects. A link created while signed in
  with another GitHub account is refused with `This link belongs to another GitHub account.` and
  nothing is committed.
- **Downloads:** each download of the file adds a `downloaded` event to `events.jsonl` (the next
  sync, on opening `/business/shared` or "Sync downloads"). Opening the landing page counts
  nothing, because mail scanners open links first, so counts are approximate. The note on an event
  is the client class: `browser`, `bot` or `other`.
- **Limits:** 10 MB per file, 500 MB per GitHub user (revoked files do not count), 30 uploads per
  hour. Over the quota the service answers `Storage limit reached (500 MB).`; over the hourly limit
  `Too many uploads. Try again later.`
- **What the service stores:** the encrypted file, its label, kind, your business name, size,
  created and expiry dates, your numeric GitHub user id, and per download the time, the token and
  the client class. No IP address, no full User-Agent, no GitHub token. It cannot read the files.
  Your GitHub token is sent to the service with every call (the Worker checks it with GitHub and
  keeps only a SHA-256 of it in memory for up to 5 minutes, 60 seconds if refused). The file stays
  until you revoke the link; the records of a revoked link (label, business name, download events)
  stay until you delete your shared files (`/business/shared`, "Delete all my shared files…").
- **Self-hosting:** deploy your own copy of the worker, then enter its URL on `/business/shared`
  (saved on this device as `lifeos_share_url`). Only `https://` URLs are accepted; an
  `http://localhost` override is ignored. For local development build or start the console with
  `VITE_SHARE_URL=http://localhost:8788`. Add the console's origin to `CONSOLE_ORIGINS`. Your GitHub
  sign-in token goes to that service, and the consent names it.

## kb-mcp tools

The MCP server in `apps/kb-mcp` gives an agent without a shell (Claude Desktop) access to the business data. It always reads `.kh/business`, even when the knowledge base uses the legacy `.lifeos`.

- Read: `business_clients`, `business_client` (client by slug or name), `business_open_invoices`, `business_vat_summary` (period `YYYY`, `YYYY-MM`, `YYYY-Qn`), `business_reminders` and `business_check`. Status, VAT and the check come from the same library as the console. The check works without a profile and does not check the frozen-file rule, which needs git history.
- Write: `business_create_draft`, `business_update_draft` (replaces the whole draft), `business_add_time`, `business_add_todo`, `business_add_log` and `business_add_expense` (no receipt). Each returns `{ paths, id?, git }`.
- The server never issues or numbers a document and never deletes. A write to any path that is not a draft, time entry, expense, todos or log file is refused. Issuing stays in the console.
- With `--git`, a write is committed (message `business: …`) and pushed, in the same queue as the ideas tools. See `apps/kb-mcp/README.md`.

## Browser extension

The start page's "Doing" section shows `Business today: 2.5 h`, plus `· timer running for <client>`
while a timer runs. It reads only the current month's `time/<yyyy-mm>.jsonl` and `time/running.yaml`
(the same sync as the other start-page files); a timer started on an earlier day counts from local
midnight, and minutes are rounded down. The line updates when the start page syncs, not live; older
months' time files are never fetched or cached. Without those files the page is unchanged. It is read-only:
start and stop happen in the console.

## GoBD caveat

Branch protection, frozen files enforced by the check, hashes, git history and a completed
Verfahrensdokumentation make a reasonable setup, not a certified one. Have your Steuerberater
review it.
