---
name: kh-business
description: Work with the user's business data in their kaihuman data repo (.kh/business/): clients, projects, time, payments, drafts. Use when the user says "new client", "log time for <client>", "draft an invoice", "draft an offer", "what does <client> owe", "add a payment", or mentions client:<slug>.
---

# kaihuman business

Business data is plain files under `.kh/business/` in the user's kaihuman **data repo** (their
life-OS repo, which must be private). If the repository you work in has `.kh/business/business.yaml`,
this is the data repo. Many agents and the user share these files, so write little and write it in
the right place.

## Layout

```
.kh/business/
  business.yaml                  the user's profile: name, address, VAT ID, bank, defaults
  clients/<slug>/
    client.yaml                  name, address, VAT ID, contacts, payment terms, stage
    notes.md                     free text
    todos.todos.md               todos (existing todos format)
    log.actionlog.md             action log (existing action-log format)
    projects/<slug>.yaml         status, rate, budget, retainer
    contracts/<id>.yaml          contracts, NDAs, with start, end, notice period
  drafts/<ulid>.yaml             unnumbered offer / invoice / credit-note drafts
  offers/<year>/<number>.yaml    issued offers          (frozen)
  invoices/<year>/<number>.yaml  issued invoices        (frozen)
  time/<yyyy-mm>.jsonl           one line per time entry
  payments/<year>.jsonl          one line per payment
  expenses/<year>/<ulid>.yaml    expenses (+ receipt file)
  events.jsonl, links.jsonl      document events and share links
```

Client and project slugs match `^[a-z0-9][a-z0-9-]{1,39}$`. Records name their client by slug.
Drafts, time entries, payments, expenses and events get a ULID as `id`.

## Rules

1. **Drafts only.** You create and edit files in `drafts/`. Never write, edit or delete anything under
   `offers/` or `invoices/`: issued documents are frozen, and the check fails on any change.
   Issuing (numbering, totals, freezing) happens in the kaihuman console. Tell the user to
   issue the draft there.
2. **Money is integer cents** with the currency from `business.yaml`: `12500` means 125.00. Never use
   decimals for money.
3. **Rates and quantities are quoted strings**: `quantity: "7.5"`, `vat_rate: "19"`. An unquoted
   number is an error.
4. **Append only.** `time/*.jsonl`, `payments/*.jsonl` and `events.jsonl` get one JSON object per line.
   Add a line at the end, never rewrite or reorder existing lines. Use a fresh ULID as `id`.
5. **Todos and log use the existing formats** (`todos.todos.md`, `log.actionlog.md` in the client's folder).
6. Dates are strings, `YYYY-MM-DD`. Unknown keys are an error: do not invent fields.
7. Before you write, say in one line what you will write and where.

## Common tasks

- **New client:** create `clients/<slug>/client.yaml` (`name`, `address`, `contacts`, `stage: lead`).
  Ask for what you do not know instead of guessing.
- **Log time:** append to `time/<yyyy-mm>.jsonl`:
  `{"id":"<ulid>","date":"2026-10-12","minutes":450,"client":"acme-gmbh","project":"website","note":"Implementation"}`
- **Draft an invoice or offer:** create `drafts/<ulid>.yaml` with `kind`, `client`, `lines`
  (`description`, `quantity`, `unit`, `unit_price`, `vat_category`, `vat_rate`) and, for unbilled time,
  `time_entries: [<ulid>, …]`. Copy the shape of an existing draft or issued file.
- **What does a client owe:** read the client's issued invoices and `payments/<year>.jsonl`. An invoice
  is open until its payments cover `totals.gross`. Report the number and the amount open.
- **Add a payment:** append to `payments/<year>.jsonl`:
  `{"id":"<ulid>","date":"2026-11-05","invoice":"RE-2026-0001","amount":100138,"method":"transfer"}`

## Check your work

Run the repo check before you finish. It validates every file and the frozen-file rule:

```
node .kh/business/.tools/business-check.mjs
```

Fix every error it prints. The same check runs in GitHub Actions on each push that touches `.kh/business/`.
