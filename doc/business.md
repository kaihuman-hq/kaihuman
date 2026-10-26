# Business — file format reference

Status: phase 1 built (2026-10-26): formats, repo check, skill, set-up function. Console pages
come in later phases. Design: `docs/superpowers/specs/2026-10-26-business-design.md`.

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
expenses and events use ULIDs. Issued documents use their number.

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
  Change either in `business.yaml` under `numbering`.
- The number is the highest existing number of the year plus one. The year comes from `issue_date`:
  a draft issued on 2027-01-02 gets `RE-2027-0001`, whatever else exists.
- The check reports gaps in a year's series.

## Issuing and the frozen rule

- Agents and forms create drafts. Issuing takes a number, copies seller and buyer details,
  computes totals and sets `retain_until` (31 Dec of issue year plus 8 years for `de`, 10 for
  `generic`), in one commit.
- Files under `offers/` and `invoices/` never change and are never deleted. Adding
  `<number>.pdf`, `<number>.xml` and `<number>.sha256` is allowed.
- Corrections are credit notes (type 381, next number of the invoice series, reference to the
  original), then a new invoice if needed.
- Status (open, part-paid, paid, overdue, credited) is calculated from payments and dates, never stored.

## The check

Run it from the repo root:

```
node .kh/business/.tools/business-check.mjs                # validate the tree
node .kh/business/.tools/business-check.mjs --base <sha>   # also compare issued files with <sha>
```

It exits 1 on any error. It flags: invalid or unknown-key records, unquoted numeric decimals,
wrong totals or retention dates, numbers that do not match the year or the pattern, gaps in a
series, references to unknown clients, projects or invoices, and any change or deletion of
issued files since the base. Without a usable base (first push, all-zero sha) it checks the tree
and skips the frozen rule. The workflow runs it on pushes and pull requests that touch
`.kh/business/**`. The bundle is built by `pnpm --filter @kaihuman/formats build`.

## Enable

`enableBusiness(kbRepo, profile)` (`apps/console/src/lib/business-setup.ts`) validates the
profile, refuses a public repo (`PublicRepoError`) or one that already has
`.kh/business/business.yaml` (`AlreadyEnabledError`), and makes one commit,
`chore: enable kaihuman business`, with the profile, empty data folders, the check, the workflow,
the skill and the Verfahrensdokumentation template. The console form for it comes in phase 2.
`syncKB` refreshes the tool files when `.kh/business/.tools/version` differs from
`BUSINESS_TOOLS_VERSION`. Repos without business get nothing.

Before you enable: the whole repo now holds tax records for 8 years, so do not delete it or
rewrite its history, and protect the main branch (no force-push, no deletion).

## GoBD caveat

Branch protection, frozen files enforced by the check, hashes, git history and a completed
Verfahrensdokumentation make a reasonable setup, not a certified one. Have your Steuerberater
review it.
