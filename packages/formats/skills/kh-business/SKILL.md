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
  business.yaml                  the user's profile: name, address, VAT ID, bank, defaults,
                                 vat_basis (accrual, the default, or cash)
  clients/<slug>/
    client.yaml                  name, address, VAT ID, contacts, payment terms, stage
    notes.md                     free text
    todos.todos.md               todos (existing todos format)
    log.actionlog.md             action log (existing action-log format)
    projects/<slug>.yaml         status, rate, budget, retainer
    contracts/<id>.yaml          contracts, NDAs, with start, end, notice period, renewal date
    contracts/<id>.pdf           the signed contract (optional; `file: <id>.pdf`)
  drafts/<ulid>.yaml             unnumbered offer / invoice / credit-note drafts
  offers/<year>/<number>.yaml    issued offers          (frozen)
  invoices/<year>/<number>.yaml  issued invoices        (frozen)
  time/<yyyy-mm>.jsonl           one line per time entry
  time/running.yaml              the running timer (at most one)
  payments/<year>.jsonl          one line per payment
  expenses/<year>/<ulid>.yaml    expenses
  expenses/<year>/<ulid>.<ext>   the receipt (optional; `receipt: <ulid>.<ext>`)
  events.jsonl, links.jsonl      document events and share links
```

Never create share links or edit `links.jsonl`: links are made and revoked by the kaihuman console
(they hold an encryption key and need the share service). Reading it is fine.

Client and project slugs match `^[a-z0-9][a-z0-9-]{1,39}$`. Records name their client by slug.
Drafts, time entries, payments, expenses, contracts and events get a ULID as `id`. A ULID is 26
characters of Crockford base32 (`0-9` and `A-Z` without `I`, `L`, `O`, `U`; the first character
`0`-`7`), time first so it sorts by creation. Make a fresh one with:

```
node -e 'const A="0123456789ABCDEFGHJKMNPQRSTVWXYZ";let t=Date.now(),s="";for(let i=0;i<10;i++){s=A[t%32]+s;t=Math.floor(t/32)}for(let i=0;i<16;i++)s+=A[Math.floor(Math.random()*32)];console.log(s)'
```

For a file named by its ULID (`drafts/<ulid>.yaml`, `expenses/<year>/<ulid>.yaml`,
`contracts/<ulid>.yaml`), the `id` inside must equal the file name; the check fails otherwise.

## Rules

1. **Drafts only.** You create and edit files in `drafts/`. Never write, edit or delete anything under
   `offers/` or `invoices/`: issued documents are frozen, and the check fails on any change.
   Issuing (numbering, totals, freezing) happens only in the kaihuman console. Tell the user to
   issue the draft there. The console's forms and the user's timer write the same files, so re-read
   `time/running.yaml` and the month file right before you write.
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
- **Start or stop a timer:** `time/running.yaml` is the one running timer:
  `client`, optional `project` and `note`, and `started_at` as an ISO datetime with offset
  (`2026-11-02T09:30:00+01:00`); it may end in `Z` instead of an offset. There is never more than one; if the file exists, tell the user which
  client it runs for instead of replacing it. Start: create the file. Stop: in the same commit, append a
  time entry (`date` = the local day of `started_at`, `minutes` = elapsed minutes rounded, at least 1 and
  at most 1440) and delete `running.yaml`. Cancel: delete the file only.
- **Draft an invoice or offer:** create `drafts/<ulid>.yaml` with `kind`, `client`, `lines`
  (`description`, `quantity`, `unit`, `unit_price`, `vat_category`, `vat_rate`) and, for unbilled time,
  `time_entries: [<ulid>, …]`. Copy the shape of an existing draft.
- **What does a client owe:** read the client's issued invoices and `payments/<year>.jsonl`. An invoice
  is open until its payments cover `totals.gross`. Report the number and the amount open.
- **Record an expense:** create `expenses/<year>/<ulid>.yaml` (`<year>` from `date`) with `id`,
  `date`, `supplier`, `description`, `category`, `net`, `vat`, `gross` (= net + vat, all cents) and
  `vat_rate`; optional `client`, `project`. A receipt sits next to it as `<ulid>.<ext>` with the
  same ULID and a lower-case `ext` of `pdf`, `jpg`, `jpeg`, `png`, `webp` or `heic`, at most 10 MB,
  and the expense names it exactly: `receipt: <ulid>.<ext>`. A contract file is likewise
  `contracts/<id>.pdf` with `file: <id>.pdf` (PDF only, at most 10 MB). Expenses and contracts must be
  kept for the retention period (8 years after the record's year in Germany); ask before deleting one.
- **Retainers:** a project's `retainer.next_date` is the start of the next period to bill. A draft
  for it carries `from_retainer: <next_date>`; issuing it in the console moves `next_date` on by one
  period. Never change `next_date` yourself when you only draft the invoice.
- **Add a payment:** append to `payments/<year>.jsonl`:
  `{"id":"<ulid>","date":"2026-11-05","invoice":"RE-2026-0001","amount":100138,"method":"transfer"}`

## Check your work

Run the repo check before you finish. It validates every file and the frozen-file rule:

```
node .kh/business/.tools/business-check.mjs
```

Fix every error it prints. The same check runs in GitHub Actions on each push that touches `.kh/business/`.
