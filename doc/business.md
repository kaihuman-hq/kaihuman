# Business — file format reference

Status: phase 1 built (2026-10-26): formats, repo check, skill, set-up function. Phase 2 built
(2026-10-27): read-only console pages. Phase 3 built (2026-11-02): daily forms, running timer,
palette commands, read-only issued files, business hours on the browser extension's start page. Design: `docs/superpowers/specs/2026-10-26-business-design.md`.

## Goal

Track a solo business as plain files in your private Life OS repo, under `.kh/business/`. Agents
and the console share the files. A GitHub Action checks them on every push.

## Layout

```
.kh/business/
  business.yaml                  your profile (legal name, address, VAT ID, bank, defaults)
  clients/<slug>/client.yaml     + notes.md, todos.todos.md, log.actionlog.md,
                                 projects/<slug>.yaml, contracts/<id>.yaml
  drafts/<ulid>.yaml             unnumbered offer / invoice / credit-note drafts
  offers/<year>/<number>.yaml    issued offers (frozen)
  invoices/<year>/<number>.yaml  issued invoices and credit notes (frozen)
  time/<yyyy-mm>.jsonl           one line per time entry
  payments/<year>.jsonl          one line per payment
  expenses/<year>/<ulid>.yaml    expenses (+ receipt file)
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
- an `id` that differs from the file name (drafts, expenses, contracts);
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
`syncKB` refreshes the tool files when `.kh/business/.tools/version` differs from
`BUSINESS_TOOLS_VERSION`. Repos without business get nothing.

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
