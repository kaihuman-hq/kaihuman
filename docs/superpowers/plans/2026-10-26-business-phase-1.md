# Business, phase 1: formats, repo check and setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give kaihuman a tested `business` data module (records, money, VAT, numbering, issuing, status, e-invoice data), a repo check that CI in a user's Life OS repo runs on `.kh/business/`, and a one-commit "enable business" setup with an agent skill.

**Architecture:** The module lives in `packages/formats/src/business/` as pure functions, exported at the subpath `@kaihuman/formats/business`. A Node entry point is bundled by Vite into one file, `dist/business-check.mjs`. The console copies that file into the user's repo together with a GitHub workflow, the skill and templates. `enableBusiness` and `syncKB` handle install and updates. No UI in this phase (the setup page is phase 2).

**Tech Stack:** TypeScript strict, Vitest, Biome, `yaml` (eemeli/yaml, YAML 1.2), Vite library build for the bundled check. Everything else is written in the repo.

**Spec:** `docs/superpowers/specs/2026-10-26-business-design.md` (sections 2–4, 6 "Knowledge base agent", 9, 10 phase 1, 11)

## Global Constraints

- Business root in the user's repo: `.kh/business/`. Every path below without `/` at the start is relative to it.
- Money: integer minor units (`12500` = 125.00) with the currency on the record. Never floats. Quantities and rates are decimal strings (`"7.5"`, `"19"`).
- Rounding: each line net is rounded on its own, then line nets are summed per VAT category (category + rate). VAT is computed on each category sum. Half-up, away from zero (kaufmännisch).
- YAML: version 1.2, core schema, unique keys. Unknown keys are an error. A number where a decimal string is expected is an error that says to quote it. Dates stay strings (`YYYY-MM-DD`).
- IDs: client and project slugs match `/^[a-z0-9][a-z0-9-]{1,39}$/`. Drafts, time entries, payments, expenses, events and links use ULIDs. Issued documents use their number.
- Default number formats: invoices and credit notes `RE-{yyyy}-{nnnn}` (one shared series), offers `AN-{yyyy}-{nnn}`. Both can be changed in `business.yaml` `numbering`.
- The number is taken at issue: highest existing number for that year in the series, plus one. The year comes from `issue_date`.
- Issued files under `offers/` and `invoices/` never change and are never deleted. Adding `<number>.pdf`, `<number>.xml` and `<number>.sha256` is allowed.
- Retention: `retain_until` = 31 Dec of (issue year + jurisdiction retention years). `de` = 8. `generic` = 10.
- Jurisdictions: `de` (shipped) and `generic` (no country checks).
- Node code is ESM, `.js` extensions in relative imports, `node:` built-ins. Add the `yaml` runtime dependency to `packages/formats/package.json`. devDependencies go only in the root.
- Done means: `pnpm run build`, `pnpm run check` (zero Biome warnings, zero type errors) and `pnpm -r test` all pass.
- Every task that changes behaviour adds a dated line to the phase-1 entry at the top of `doc/progress.md` (one entry for the whole phase, created in Task 1, extended after that).

## Review Focus

1. **Hand-edited YAML with unquoted numbers** (`vat_rate: 19`, `quantity: 7.5`). Expect a validation error at that path that says "quote it, e.g. \"19\"", not a crash and not silent coercion. Test in Task 3.
2. **Year rollover:** a draft issued on 2027-01-02 for December 2026 work gets `RE-2027-0001`, even when `RE-2026-0042` exists. Test in Task 5.
3. **JSONL edited by hand:** CRLF line endings, blank lines, no final newline. Parsing works with correct line numbers, and appending keeps one entry per line. Test in Task 2.
4. **Payments that don't fit:** overpayment gives `paid` with `open: 0` and `overpaid > 0`. A payment for an unknown invoice is a repo-check error. Tests in Tasks 6 and 7.
5. **CI without a usable base commit** (first push of a branch, base `0000000…`). The check validates the tree and skips the frozen-file rule instead of crashing. Test in Task 7.

---

### Task 1: Package setup, decimals, ULIDs, slugs

**Files:**
- Modify: `packages/formats/package.json` (dependency `yaml`, export `"./business": "./src/business/index.ts"`, export `"./dist/*": "./dist/*"`, `"./business-templates/*": "./business-templates/*"`)
- Create: `packages/formats/src/business/money.ts`, `packages/formats/src/business/ids.ts`, `packages/formats/src/business/index.ts`
- Test: `packages/formats/src/business/money.test.ts`, `packages/formats/src/business/ids.test.ts`
- Modify: `doc/progress.md` (new entry `## 2026-10-26 — Business, phase 1: formats and repo check`)

**Interfaces:**
- Produces:
  - `type Decimal = { readonly units: bigint; readonly scale: number }`
  - `parseDecimal(text: string): Decimal | null`: accepts `/^-?\d+(\.\d+)?$/` only
  - `formatDecimal(d: Decimal): string`
  - `mulMinor(qty: Decimal, minor: number): number`: half-up rounded
  - `percentOfMinor(minor: number, rate: Decimal): number`: half-up rounded
  - `formatMinor(minor: number, currency: string): string`, e.g. `"125.00"`, no symbol
  - `type Slug = string & { __brand: 'Slug' }`, `asSlug(s: string): Slug | null`
  - `type Ulid = string & { __brand: 'Ulid' }`, `isUlid(s: string): s is Ulid`, `newUlid(nowMs: number, random: Uint8Array): Ulid` (10 random bytes, Crockford base32), `ulid(): Ulid` (uses `Date.now()` and `crypto.getRandomValues`)

- [ ] **Step 1: Install and wire the package.** Run `pnpm install`, then `pnpm add yaml --filter @kaihuman/formats`. Add the three exports. `index.ts` re-exports `./money.js` and `./ids.js`.
- [ ] **Step 2: Write failing tests**

```ts
// money.test.ts
expect(parseDecimal('7.5')).toEqual({ units: 75n, scale: 1 });
expect(parseDecimal('19')).toEqual({ units: 19n, scale: 0 });
expect(parseDecimal('1e3')).toBeNull();
expect(parseDecimal('1,5')).toBeNull();
expect(mulMinor(parseDecimal('7.5')!, 9500)).toBe(71250);
expect(mulMinor(parseDecimal('0.333')!, 10000)).toBe(3330);
expect(mulMinor(parseDecimal('0.5')!, 1)).toBe(1);        // half-up
expect(mulMinor(parseDecimal('-0.5')!, 1)).toBe(-1);      // away from zero
expect(percentOfMinor(83250, parseDecimal('19')!)).toBe(15818); // 15817.5 → 15818
expect(percentOfMinor(1000, parseDecimal('7')!)).toBe(70);
expect(formatMinor(12500, 'EUR')).toBe('125.00');
expect(formatDecimal(parseDecimal('7.50')!)).toBe('7.50');
// ids.test.ts
expect(newUlid(0, new Uint8Array(10))).toBe('00000000000000000000000000');
expect(newUlid(1469918176385, new Uint8Array(10)).slice(0, 10)).toBe('01ARYZ6S41');
expect(isUlid(ulid())).toBe(true);
expect(asSlug('acme-gmbh')).toBe('acme-gmbh');
expect(asSlug('Acme')).toBeNull();
expect(asSlug('a')).toBeNull();
```

- [ ] **Step 3: Run** `pnpm --filter @kaihuman/formats test -- business`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement.** All arithmetic in `bigint`. Throw if a result is not a safe integer.
- [ ] **Step 5: Run the tests again.** Expected: PASS. Run `pnpm --filter @kaihuman/formats lint check-types`: clean.
- [ ] **Step 6: Commit:** `feat(formats): business decimals, ULIDs and slugs`

### Task 2: Strict YAML, JSONL and the validator helpers

**Files:**
- Create: `packages/formats/src/business/yaml.ts`, `packages/formats/src/business/jsonl.ts`, `packages/formats/src/business/validate-kit.ts`
- Test: `packages/formats/src/business/yaml.test.ts`, `packages/formats/src/business/jsonl.test.ts`

**Interfaces:**
- Produces:
  - `type Issue = { path: string; message: string; line?: number }` (`path` like `lines[1].vat_rate`)
  - `type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] }`
  - `parseYaml(text: string): Result<unknown>`: `yaml` `parseDocument` with `{ version: '1.2', schema: 'core', uniqueKeys: true }`. Syntax errors become issues with `line`. A BOM is stripped.
  - `stringifyYaml(value: unknown, keyOrder: readonly string[]): string`: keys in `keyOrder` come first, in that order, then the rest alphabetically. Nested objects are sorted alphabetically. Strings that would re-parse as another type are quoted. LF line endings, final newline.
  - `parseJsonl<T>(text: string, validate: (raw: unknown, path: string) => Result<T>): { entries: { line: number; value: T }[]; issues: Issue[] }`: CRLF and blank lines tolerated
  - `appendJsonl(text: string, entry: object, keyOrder: readonly string[]): string`
  - `replaceJsonlLines(text: string, replace: (raw: Record<string, unknown>, line: number) => Record<string, unknown> | null, keyOrder: readonly string[]): string`: rewrites only the lines whose callback returns an object, and leaves every other line byte-for-byte
  - In `validate-kit.ts`, small field readers used by Task 3: `obj(raw, path, known: readonly string[], issues)`, `str`, `optStr`, `int`, `decimalStr` (number → issue `"${path}: quote it, e.g. \"19\""`), `date` (`YYYY-MM-DD`), `oneOf(values)`, `slug`, `ulidField`, `arr`. Each pushes to `issues` and returns the value or `undefined`. `obj` reports every key not in `known` as `unknown key "<k>"`.

- [ ] **Step 1: Write failing tests**

```ts
expect(parseYaml('a: 1\na: 2\n').ok).toBe(false);
expect(parseYaml('d: 2026-10-26\nno: no\n')).toEqual({ ok: true, value: { d: '2026-10-26', no: 'no' } }); // 1.2 core: no date/bool coercion of "no"
expect(stringifyYaml({ b: 1, a: 'x', number: 'RE-1' }, ['number'])).toBe('number: RE-1\na: x\nb: 1\n');
expect(parseYaml(stringifyYaml({ v: '19', d: '2026-01-01', t: 'true' }, []))).toEqual({ ok: true, value: { v: '19', d: '2026-01-01', t: 'true' } });
const text = '{"id":"a"}\r\n\r\n{"id":"b"}';                 // CRLF, blank line, no final newline
const r = parseJsonl(text, okValidator);
expect(r.entries.map((e) => [e.line, (e.value as { id: string }).id])).toEqual([[1, 'a'], [3, 'b']]);
expect(appendJsonl(text, { id: 'c' }, ['id']).endsWith('{"id":"b"}\n{"id":"c"}\n')).toBe(true);
expect(parseJsonl('{bad\n', okValidator).issues[0]).toMatchObject({ line: 1 });
expect(replaceJsonlLines('{"id":"a"}\n{"id":"b"}\n', (o) => (o.id === 'b' ? { ...o, invoice: 'RE-1' } : null), ['id'])).toBe('{"id":"a"}\n{"id":"b","invoice":"RE-1"}\n');
// validate-kit
const issues: Issue[] = [];
decimalStr(19, 'lines[0].vat_rate', issues);
expect(issues[0]?.message).toContain('quote it');
obj({ a: 1, z: 2 }, 'x', ['a'], issues);
expect(issues.some((i) => i.message === 'unknown key "z"')).toBe(true);
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Check that `'no'` parses as a string under `schema: 'core'`. If the library maps it to a boolean, add a custom tag override.
- [ ] **Step 4: Run them again.** Expected: PASS. Lint and type-check are clean.
- [ ] **Step 5: Commit:** `feat(formats): strict YAML and JSONL for business records`

### Task 3: Record types and validators

**Files:**
- Create: `packages/formats/src/business/records.ts` (types and key orders), `packages/formats/src/business/validate.ts`, `packages/formats/src/business/paths.ts`
- Create fixtures: `packages/formats/fixtures/business/repo/` with a small valid tree: `business.yaml`, `clients/acme-gmbh/client.yaml`, `clients/acme-gmbh/projects/website.yaml`, `clients/acme-gmbh/contracts/<ulid>.yaml`, `drafts/<ulid>.yaml`, `invoices/2026/RE-2026-0001.yaml`, `offers/2026/AN-2026-001.yaml`, `time/2026-10.jsonl`, `payments/2026.jsonl`, `events.jsonl`, `links.jsonl`, `expenses/2026/<ulid>.yaml`. The issued invoice `RE-2026-0001` (issue date `2026-10-26`, due `2026-11-09`) uses the three lines of Task 4's first test, so its totals are net 84250 / VAT 15888 / gross 100138 and must match Task 4's `computeTotals` (fill them in when Task 4 lands, and keep this fixture as Task 4's integration case).
- Test: `packages/formats/src/business/validate.test.ts`, `packages/formats/src/business/paths.test.ts`

**Interfaces:**
- Produces (`records.ts`). Field names below are the file keys (snake_case):
  - `Address { street; postcode; city; country /* ISO 3166-1 alpha-2 */ }`
  - `BusinessProfile { name; address; vat_id?; tax_number?; contact { name; email; phone? }; bank { iban; bic?; account_holder? }; jurisdiction: 'de' | 'generic'; vat_regime: 'regular' | 'small-business'; currency; language: 'de' | 'en'; payment_terms_days: number; default_vat_rate: string; electronic_address?; numbering?: { invoice?: string; offer?: string } }`
  - `ClientStage = 'lead' | 'contacted' | 'offer-sent' | 'active' | 'past' | 'lost'`
  - `Client { slug /* from folder */; name; address; vat_id?; buyer_reference?; leitweg_id?; electronic_address?; contacts: { name; email?; phone?; role? }[]; payment_terms_days?; language?; currency?; stage: ClientStage; tags?: string[] }`
  - `Project { slug; client; name; status: 'active' | 'paused' | 'done'; rate?: { per: 'hour' | 'day'; amount: number }; fixed_price?: number; budget_minutes?: number; budget_amount?: number; retainer?: { amount: number; interval: 'monthly' | 'quarterly'; next_date: string; description: string } }`
  - `Contract { id: Ulid; client; kind: string; title; start; end?; notice_period_days?; renewal_date?; file? }`
  - `VatCategory = 'S' | 'Z' | 'E' | 'AE' | 'K' | 'O'`
  - `Line { description; quantity: string; unit: string /* UN/ECE rec 20 */; unit_price: number; vat_category: VatCategory; vat_rate: string }`
  - `DocKind = 'invoice' | 'credit-note' | 'offer'`
  - `Draft { id: Ulid; kind: DocKind; client: Slug; project?; currency?; language?; service_period?: { start; end }; service_date?; lines: Line[]; notes?; payment_terms_days?; valid_until? /* offer */; from_offer?; supersedes? /* offer */; corrects? /* credit-note: invoice number */; buyer_reference?; time_entries?: Ulid[] }`
  - `Party { name; address; vat_id?; tax_number?; contact?; electronic_address?; buyer_reference?; leitweg_id? }`
  - `Totals { net: number; vat: number; gross: number; breakdown: { category: VatCategory; rate: string; taxable: number; tax: number; exemption_reason?: string }[] }`
  - `Issued = Omit<Draft, 'id'> & { number: string; draft_id: Ulid; type_code: 380 | 381 | null /* offer: null */; issue_date: string; due_date?: string; seller: Party; buyer: Party; payment?: { means_code: '58'; iban; bic?; reference: string }; totals: Totals; legal_notes: string[]; retain_until: string; jurisdiction: 'de' | 'generic' }`
  - `TimeEntry { id: Ulid; date; minutes: number; client: Slug; project?; note; invoice? }`
  - `Payment { id: Ulid; date; invoice: string; amount: number; method?: string; ref?: string }`
  - `DocEvent { id: Ulid; at: string /* ISO datetime */; doc: string; type: 'sent' | 'accepted' | 'declined' | 'downloaded'; note? }`
  - `LinkRecord { id: Ulid; doc: string; url: string; created: string; expires?; revoked?: string }`
  - `Expense { id: Ulid; date; supplier; description; category; net: number; vat: number; gross: number; vat_rate: string; client?; project?; receipt? }`
  - `KEY_ORDER: Record<RecordKind, readonly string[]>`, used by every writer
- Produces (`validate.ts`): `validateProfile`, `validateClient(raw, slug)`, `validateProject(raw, slug, client)`, `validateContract`, `validateDraft`, `validateIssued`, `validateTimeEntry`, `validatePayment`, `validateEvent`, `validateLink`, `validateExpense`. Each has the shape `(raw: unknown, …) => Result<T>`. Cross-field rules:
  - `credit-note` requires `corrects`
  - `offer` requires `valid_until`
  - `gross === net + vat` for expenses and totals
  - `lines` must not be empty
  - `minutes` is between 1 and 1440
- Produces (`paths.ts`):
  - `BUSINESS_ROOT = '.kh/business'`
  - `type BusinessPath = { kind: 'profile' } | { kind: 'client'; client: Slug } | { kind: 'project'; client: Slug; project: Slug } | { kind: 'contract'; client: Slug; id: Ulid } | { kind: 'draft'; id: Ulid } | { kind: 'issued'; doc: 'invoice' | 'offer'; year: number; number: string } | { kind: 'artifact'; doc: 'invoice' | 'offer' | 'contract'; ext: 'pdf' | 'xml' | 'sha256' } | { kind: 'time'; month: string } | { kind: 'payments'; year: number } | { kind: 'events' } | { kind: 'links' } | { kind: 'expense'; year: number; id: Ulid } | { kind: 'receipt' } | { kind: 'notes' | 'todos' | 'log'; client: Slug } | { kind: 'meta' } /* SKILL.md, VERFAHRENSDOKUMENTATION.md, .tools/**, .gitkeep */ | { kind: 'unknown' }`
  - `classifyBusinessPath(path: string): BusinessPath` (path relative to the repo root)
  - path builders `issuedPath(doc, year, number)`, `draftPath(id)`, `timePath(month)`, `paymentsPath(year)`, `clientDir(slug)`

- [ ] **Step 1: Write failing tests.**
  - Every fixture file validates `ok`.
  - Plus these cases:

```ts
const bad = validateDraft({ ...draftFixture, lines: [{ ...line, vat_rate: 19 }] });
expect(bad).toMatchObject({ ok: false, issues: [{ path: 'lines[0].vat_rate', message: expect.stringContaining('quote it') }] });
expect(validateDraft({ ...draftFixture, kind: 'credit-note' })).toMatchObject({ ok: false, issues: [{ path: 'corrects' }] });
expect(validateClient({ ...clientFixture, colour: 'red' }, 'acme-gmbh')).toMatchObject({ ok: false, issues: [{ message: 'unknown key "colour"' }] });
expect(validateTimeEntry({ ...timeFixture, minutes: 0 }).ok).toBe(false);
expect(classifyBusinessPath('.kh/business/invoices/2026/RE-2026-0001.yaml')).toEqual({ kind: 'issued', doc: 'invoice', year: 2026, number: 'RE-2026-0001' });
expect(classifyBusinessPath('.kh/business/invoices/2026/RE-2026-0001.pdf')).toEqual({ kind: 'artifact', doc: 'invoice', ext: 'pdf' });
expect(classifyBusinessPath('.kh/business/clients/acme-gmbh/todos.todos.md')).toEqual({ kind: 'todos', client: 'acme-gmbh' });
expect(classifyBusinessPath('.kh/business/clients/Acme/client.yaml').kind).toBe('unknown');
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with the `validate-kit` readers. Export everything from `index.ts`.
- [ ] **Step 4: Run them again.** Expected: PASS (the issued-invoice fixture totals are checked again in Task 4).
- [ ] **Step 5: Commit:** `feat(formats): business record types, validators and paths`

### Task 4: Totals and jurisdictions

**Files:**
- Create: `packages/formats/src/business/totals.ts`, `packages/formats/src/business/jurisdiction.ts`
- Test: `packages/formats/src/business/totals.test.ts`, `packages/formats/src/business/jurisdiction.test.ts`

**Interfaces:**
- Consumes: `mulMinor`, `percentOfMinor`, `parseDecimal` (Task 1), and `Line`, `Totals`, `Draft`, `Issued`, `BusinessProfile`, `Client`, `Issue` (Tasks 2–3)
- Produces:
  - `lineNet(line: Line): number`
  - `computeTotals(lines: readonly Line[], exemptionReasons?: Partial<Record<VatCategory, string>>): Totals`: breakdown sorted by category then rate. VAT for `E`, `AE`, `K`, `O` and `Z` is always 0.
  - `interface Jurisdiction { code: 'de' | 'generic'; retentionYears: number; checkIssue(doc: Draft, profile: BusinessProfile, client: Client): Issue[]; legalNotes(doc: Draft, profile: BusinessProfile): string[]; exemptionReasons(profile: BusinessProfile): Partial<Record<VatCategory, string>> }`
  - `jurisdictionFor(code: 'de' | 'generic'): Jurisdiction`
  - `de` rules for `invoice` and `credit-note` (offers: only lines, client name and address):
    - The profile has `vat_id` or `tax_number`.
    - The buyer has name and full address.
    - `service_period` or `service_date` is present.
    - `vat_regime: 'small-business'` means every line is `E` with rate `"0"`, and the note is `Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.`
    - Any `AE` line needs `client.vat_id` and `profile.vat_id`, and the note is `Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).`
    - `S` lines need rate > 0.
    - `de.retentionYears = 8`.
  - `generic`: no checks, no notes, `retentionYears = 10`.

- [ ] **Step 1: Write failing tests**

```ts
const t = computeTotals([
  { description: 'Dev', quantity: '7.5', unit: 'HUR', unit_price: 9500, vat_category: 'S', vat_rate: '19' },
  { description: 'Setup', quantity: '1', unit: 'C62', unit_price: 12000, vat_category: 'S', vat_rate: '19' },
  { description: 'Book', quantity: '1', unit: 'C62', unit_price: 1000, vat_category: 'S', vat_rate: '7' },
]);
expect(t).toEqual({ net: 84250, vat: 15888, gross: 100138, breakdown: [
  { category: 'S', rate: '19', taxable: 83250, tax: 15818 },
  { category: 'S', rate: '7', taxable: 1000, tax: 70 },
] });
expect(computeTotals([{ ...rcLine, vat_category: 'AE', vat_rate: '0' }], { AE: 'Reverse charge' }).breakdown[0])
  .toMatchObject({ category: 'AE', tax: 0, exemption_reason: 'Reverse charge' });
const de = jurisdictionFor('de');
expect(de.checkIssue({ ...invoiceDraft, lines: [{ ...line, vat_category: 'AE', vat_rate: '0' }] }, profile, { ...client, vat_id: undefined }))
  .toContainEqual(expect.objectContaining({ path: 'client.vat_id' }));
expect(de.legalNotes(invoiceDraft, { ...profile, vat_regime: 'small-business' }))
  .toContain('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
expect(de.checkIssue({ ...invoiceDraft, service_period: undefined, service_date: undefined }, profile, client))
  .toContainEqual(expect.objectContaining({ path: 'service_period' }));
expect(jurisdictionFor('generic').checkIssue(invoiceDraft, { ...profile, vat_id: undefined, tax_number: undefined }, client)).toEqual([]);
```

  - Also assert that the issued-invoice fixture's `totals` equal `computeTotals(fixture.lines, …)`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Sum line nets per (category, rate) **before** applying the percentage.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(formats): business totals and German VAT rules`

### Task 5: Numbering and issuing

**Files:**
- Create: `packages/formats/src/business/numbering.ts`, `packages/formats/src/business/issue.ts`
- Test: `packages/formats/src/business/numbering.test.ts`, `packages/formats/src/business/issue.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 (`computeTotals`, `jurisdictionFor`, `validateDraft`, `stringifyYaml`, `KEY_ORDER`, `replaceJsonlLines`, `appendJsonl`, path builders)
- Produces:
  - `DEFAULT_NUMBERING = { invoice: 'RE-{yyyy}-{nnnn}', offer: 'AN-{yyyy}-{nnn}' } as const`
  - `seriesOf(kind: DocKind): 'invoice' | 'offer'` (credit notes use `invoice`)
  - `formatNumber(pattern: string, year: number, seq: number): string`: `{yyyy}` is the year, `{n…}` is the zero-padded sequence (the count of `n` is the minimum width)
  - `parseNumber(pattern: string, number: string): { year: number; seq: number } | null`
  - `nextNumber(pattern: string, year: number, existing: readonly string[]): string`
  - `findGaps(pattern: string, year: number, existing: readonly string[]): number[]`: missing sequence numbers between 1 and the max
  - `type FileChanges = Record<string, string | null>` (`null` = delete, keys are repo-root paths)
  - `type IssueContext = { draft: Draft; profile: BusinessProfile; client: Client; existingNumbers: readonly string[] /* same series, any year */; issueDate: string; timeFiles: Readonly<Record<string, string>> /* path → content, for the months of draft.time_entries */; clientLog: string | null /* current log.actionlog.md */; now: Date }`
  - `issue(ctx: IssueContext): Result<{ document: Issued; changes: FileChanges; commitMessage: string }>`, which:
    - validates the draft
    - runs `jurisdiction.checkIssue`
    - numbers the document
    - copies `seller` from the profile and `buyer` from the client (`buyer_reference` / `leitweg_id` from the draft first, then the client)
    - sets `due_date` = issue date + payment terms (draft, then client, then profile) for invoices. Credit notes and offers get no due date.
    - sets `payment` with `reference = number` for invoices
    - writes `legal_notes` and `retain_until`
    - `type_code`: invoice 380, credit note 381, offer null
  - The changes are:
    - write `issuedPath`
    - `draftPath(draft.id)` → `null`
    - every listed time entry gets `invoice: number` through `replaceJsonlLines`
    - one line appended to `clients/<slug>/log.actionlog.md` in the existing action-log format (`- YYYY-MM-DD HH:mm:ss Issued RE-2026-0042 (1001.38 EUR) #business`; check `packages/formats/src/action-log.ts` for the serializer and use it)
  - `commitMessage` is `business: issue RE-2026-0042 for acme-gmbh`.
  - Error cases:
    - A time entry that is listed but missing, or already has an `invoice`, is an issue at `time_entries[i]`.
    - A credit note whose `corrects` is not in `existingNumbers` is an issue at `corrects`.
    - A `credit-note` copies nothing from the original. Its lines are written as positive amounts.

- [ ] **Step 1: Write failing tests**

```ts
expect(formatNumber('RE-{yyyy}-{nnnn}', 2026, 42)).toBe('RE-2026-0042');
expect(formatNumber('AN-{yyyy}-{nnn}', 2026, 1234)).toBe('AN-2026-1234');
expect(parseNumber('RE-{yyyy}-{nnnn}', 'RE-2026-0042')).toEqual({ year: 2026, seq: 42 });
expect(nextNumber('RE-{yyyy}-{nnnn}', 2026, ['RE-2026-0001', 'RE-2026-0002'])).toBe('RE-2026-0003');
expect(nextNumber('RE-{yyyy}-{nnnn}', 2027, ['RE-2026-0042'])).toBe('RE-2027-0001'); // year rollover
expect(findGaps('RE-{yyyy}-{nnnn}', 2026, ['RE-2026-0001', 'RE-2026-0003'])).toEqual([2]);
const r = issue({ ...ctx, issueDate: '2027-01-02', existingNumbers: ['RE-2026-0042'] });
expect(r.ok && r.value.document.number).toBe('RE-2027-0001');
expect(r.ok && r.value.document.retain_until).toBe('2035-12-31');
expect(r.ok && r.value.changes['.kh/business/drafts/' + ctx.draft.id + '.yaml']).toBeNull();
expect(r.ok && Object.keys(r.value.changes)).toContain('.kh/business/invoices/2027/RE-2027-0001.yaml');
expect(r.ok && r.value.changes['.kh/business/time/2026-12.jsonl']).toContain('"invoice":"RE-2027-0001"');
expect(r.ok && r.value.document.due_date).toBe('2027-01-16'); // 14 days from profile
expect(issue({ ...ctx, timeFiles: { '.kh/business/time/2026-12.jsonl': alreadyBilled } })).toMatchObject({ ok: false, issues: [{ path: 'time_entries[0]' }] });
expect(issue({ ...ctx, draft: { ...creditDraft, corrects: 'RE-2026-0099' } })).toMatchObject({ ok: false, issues: [{ path: 'corrects' }] });
expect(issue({ ...ctx, draft: creditDraft }).ok && /* number from invoice series */ true).toBe(true);
// round trip: the issued YAML validates and its totals match computeTotals
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `issue` is pure (no I/O, no `Date.now()`). The console reads the inputs in phase 3.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(formats): business numbering and issuing`

### Task 6: Derived status and EN 16931 data

**Files:**
- Create: `packages/formats/src/business/status.ts`, `packages/formats/src/business/en16931.ts`
- Test: `packages/formats/src/business/status.test.ts`, `packages/formats/src/business/en16931.test.ts`

**Interfaces:**
- Consumes: `Issued`, `Payment`, `DocEvent` (Task 3)
- Produces:
  - `type InvoiceStatus = { state: 'issued' | 'sent' | 'part-paid' | 'paid' | 'overdue' | 'credited'; open: number; paid: number; credited: number; overpaid: number }`
  - `deriveInvoiceStatus(invoice: Issued, payments: readonly Payment[], creditNotes: readonly Issued[], events: readonly DocEvent[], today: string): InvoiceStatus`:
    - `credited` = sum of the gross of credit notes whose `corrects === invoice.number`
    - `open = max(0, gross − paid − credited)`
    - `overpaid = max(0, paid + credited − gross)`
    - State precedence: credited (credited ≥ gross) > paid (open = 0) > overdue (`due_date < today`) > part-paid (paid > 0) > sent (a `sent` or `downloaded` event exists) > issued
  - `type OfferStatus = 'issued' | 'sent' | 'accepted' | 'declined' | 'expired' | 'superseded'`
  - `deriveOfferStatus(offer: Issued, events: readonly DocEvent[], offers: readonly Issued[], today: string): OfferStatus`:
    - Precedence: superseded (another offer has `supersedes === offer.number`) > accepted / declined (latest such event) > expired (`valid_until < today`) > sent > issued
  - `type En16931Invoice`: a plain object with BT-numbered field names in camelCase, e.g. `{ invoiceNumber /*BT-1*/, issueDate /*BT-2*/, typeCode /*BT-3*/, currency /*BT-5*/, dueDate /*BT-9*/, buyerReference /*BT-10*/, precedingInvoice? /*BG-3*/, seller: {...} /*BG-4*/, buyer: {...} /*BG-7*/, servicePeriod? /*BG-14*/, paymentMeans /*BG-16*/, lines: [...] /*BG-25*/, vatBreakdown: [...] /*BG-23*/, totals: {...} /*BG-22*/, notes /*BT-22*/ }`. Amounts are decimal strings with 2 places (`"1001.38"`).
  - `toEn16931(invoice: Issued): En16931Invoice`. It throws for offers.

- [ ] **Step 1: Write failing tests**

```ts
const inv = issuedFixture; // gross 100138, due 2026-11-09
expect(deriveInvoiceStatus(inv, [], [], [], '2026-11-01')).toMatchObject({ state: 'issued', open: 100138 });
expect(deriveInvoiceStatus(inv, [], [], [sentEvent], '2026-11-01').state).toBe('sent');
expect(deriveInvoiceStatus(inv, [pay(50000)], [], [], '2026-11-01')).toMatchObject({ state: 'part-paid', open: 50138 });
expect(deriveInvoiceStatus(inv, [pay(50000)], [], [], '2026-11-10').state).toBe('overdue');
expect(deriveInvoiceStatus(inv, [pay(110000)], [], [], '2026-11-10')).toMatchObject({ state: 'paid', open: 0, overpaid: 9862 });
expect(deriveInvoiceStatus(inv, [], [creditFor(inv)], [], '2026-12-01').state).toBe('credited');
expect(deriveOfferStatus(offer, [], [{ ...offer2, supersedes: offer.number }], '2026-10-01')).toBe('superseded');
expect(deriveOfferStatus(offer, [acceptedEvent], [], '2027-01-01')).toBe('accepted');
expect(deriveOfferStatus(offer, [], [], '2027-01-01')).toBe('expired');
const e = toEn16931(inv);
expect(e).toMatchObject({ invoiceNumber: inv.number, typeCode: '380', currency: 'EUR', totals: { taxExclusive: '842.50', tax: '158.88', taxInclusive: '1001.38', payable: '1001.38' } });
expect(e.paymentMeans).toMatchObject({ code: '58', iban: profile.bank.iban, reference: inv.number });
expect(toEn16931({ ...creditFixture }).precedingInvoice).toBe(creditFixture.corrects);
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(formats): business status derivation and EN 16931 data`

### Task 7: Repo check and its bundled CLI

**Files:**
- Create: `packages/formats/src/business/check.ts` (pure), `packages/formats/src/business/check-cli.ts` (Node entry), `packages/formats/vite.business-check.config.ts`
- Modify: `packages/formats/package.json` (script `"build": "vite build --config vite.business-check.config.ts"`)
- Test: `packages/formats/src/business/check.test.ts`, `packages/formats/src/business/check-cli.test.ts`

**Interfaces:**
- Consumes: everything in Tasks 1–6
- Produces:
  - `type Change = { status: 'A' | 'M' | 'D'; path: string }`
  - `type Finding = Issue & { file: string; level: 'error' | 'warning' }`
  - `checkBusinessRepo(input: { files: ReadonlyMap<string, string>; changes: readonly Change[] | null /* null = no base */; today: string }): Finding[]`, with these rules:
    1. Every file under `.kh/business/` is classified. Records are parsed and validated. `unknown` paths are a warning.
    2. An issued file's `number` matches its filename. The year folder matches `issue_date`. Totals equal `computeTotals(lines, …)`.
    3. Per series and year, `findGaps` gives an error naming the missing numbers.
    4. References resolve:
       - `client` / `project` on drafts, time, projects, expenses
       - `payment.invoice` must be an issued invoice (error)
       - `corrects` and `from_offer`
       - `events.doc` and `links.doc` (warning if missing)
    5. If `changes !== null`: `M` or `D` on an issued `.yaml` is an error (`issued documents never change; issue a credit note`). `M` or `D` on an issued artifact (`pdf` / `xml` / `sha256`) is an error. `A` is always allowed.
    6. Paths outside `.kh/business/` are ignored.
  - `formatFinding(f: Finding): string`: `::error file=<file>,line=<line>::<path>: <message>` (GitHub annotation, `warning` for warnings)
  - `runCheck(argv: string[], cwd: string): Promise<number>` in `check-cli.ts`:
    - parses `--base <sha>`
    - reads `.kh/business/**` from disk
    - if `base` is given and not all zeros and `git cat-file -e <base>` succeeds, runs `git diff --name-status --no-renames <base> HEAD -- .kh/business`; otherwise uses `changes = null` and prints a warning that the frozen-file rule was skipped
    - prints findings
    - returns 1 if any error, else 0
  - The file ends with a main guard (`import.meta.url === pathToFileURL(process.argv[1]).href`) that calls `process.exit(await runCheck(...))`.
  - Bundle: Vite SSR library build of `src/business/check-cli.ts` to `dist/business-check.mjs`, ESM, `ssr.noExternal: true` (bundles `yaml`), target `node20`, one file, no sourcemap.
  - `BUSINESS_CHECK_BUNDLE = '@kaihuman/formats/dist/business-check.mjs'` is the import used by Task 8 (`?raw`).

- [ ] **Step 1: Write failing tests**

```ts
const files = loadFixtureRepo(); // Map of '.kh/business/...' → content from fixtures/business/repo
expect(checkBusinessRepo({ files, changes: null, today: '2026-10-26' }).filter((f) => f.level === 'error')).toEqual([]);
expect(checkBusinessRepo({ files, changes: [{ status: 'M', path: '.kh/business/invoices/2026/RE-2026-0001.yaml' }], today })).toContainEqual(expect.objectContaining({ level: 'error', message: expect.stringContaining('never change') }));
expect(checkBusinessRepo({ files, changes: [{ status: 'A', path: '.kh/business/invoices/2026/RE-2026-0001.pdf' }], today }).filter((f) => f.level === 'error')).toEqual([]);
expect(errorsFor(withFile(files, '.kh/business/invoices/2026/RE-2026-0003.yaml', issuedYaml('RE-2026-0003')))).toContainEqual(expect.objectContaining({ message: expect.stringContaining('RE-2026-0002') })); // gap
expect(errorsFor(withPayments(files, '{"id":"…","date":"2026-10-20","invoice":"RE-2026-0099","amount":100}\n'))).toContainEqual(expect.objectContaining({ path: 'invoice' }));
expect(errorsFor(withFile(files, '.kh/business/invoices/2026/RE-2026-0001.yaml', tamperedTotals))).toContainEqual(expect.objectContaining({ path: 'totals' }));
expect(checkBusinessRepo({ files: withFile(files, 'notes/x.md', 'anything'), changes: null, today })).toEqual(checkBusinessRepo({ files, changes: null, today }));
// check-cli.test.ts: temp dir git repo (git init, copy fixture, commit, edit issued file, commit)
expect(await runCheck(['--base', firstSha], dir)).toBe(1);
expect(await runCheck(['--base', '0000000000000000000000000000000000000000'], dir)).toBe(0); // falls back to tree-only
expect(await runCheck([], cleanDir)).toBe(0);
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `check.ts`, `check-cli.ts` and the Vite config.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Verify the bundle.** Run `pnpm --filter @kaihuman/formats build && node packages/formats/dist/business-check.mjs` from inside a copy of the fixture repo (`git init` first). Expected: exit 0. Then edit an issued file and commit, and run `--base HEAD~1`. Expected: an `::error file=…` line and exit 1. Confirm `dist/` stays git-ignored.
- [ ] **Step 6: Commit:** `feat(formats): business repo check and bundled CLI`

### Task 8: Skill, templates, enable and sync; docs

**Files:**
- Create: `packages/formats/skills/kh-business/SKILL.md`
- Create: `packages/formats/business-templates/VERFAHRENSDOKUMENTATION.md`, `packages/formats/business-templates/business-check.yml`
- Create: `apps/console/src/lib/business-setup.ts`
- Test: `apps/console/src/lib/business-setup.test.ts`
- Modify: `apps/console/src/lib/github-kb.ts` (sync business files when present), `apps/console/src/lib/github-kb.test.ts`, `apps/console/src/lib/kb-skills.ts` (`KB_SKILL_VERSION` → `1.9.0`, one paragraph in `KB_CLAUDE_MD` pointing to `.kh/business/` and the `kh-business` skill)
- Create: `doc/business.md` (file format reference, like `doc/ideas.md`)
- Modify: `doc/features.md` (Business: data module and repo check), `doc/roadmap.md` (new `## Business` section listing the six spec phases, phase 1 `[x]`), `doc/progress.md`

**Interfaces:**
- Consumes: `BusinessProfile`, `validateProfile`, `stringifyYaml`, `KEY_ORDER` (Tasks 2–3); the bundle via `import BUSINESS_CHECK from '@kaihuman/formats/dist/business-check.mjs?raw'`; `githubService.getRepo`, `fetchRepoTree`, `getFileContent`, `commitFiles` from `@kaihuman/core`; `KBRepo` from `github-kb.ts`
- Produces (`business-setup.ts`):
  - `BUSINESS_TOOLS_VERSION = '1.0.0'`, written to `.kh/business/.tools/version`
  - `getBusinessToolFiles(): Record<string, string>`, the files that updates rewrite:
    - `.kh/business/.tools/version`
    - `.kh/business/.tools/business-check.mjs`
    - `.kh/business/SKILL.md`
    - `.agents/skills/kh-business/SKILL.md`
    - `.claude/skills/kh-business/SKILL.md`
    - `.github/workflows/business-check.yml`
  - `getBusinessScaffoldFiles(profile: BusinessProfile): Record<string, string>` = tool files, plus:
    - `.kh/business/business.yaml`
    - `.kh/business/VERFAHRENSDOKUMENTATION.md`
    - `.gitkeep` in `clients/`, `drafts/`, `offers/`, `invoices/`, `time/`, `payments/`, `expenses/`
    - empty `events.jsonl` and `links.jsonl`
  - `class PublicRepoError extends Error {}` and `class AlreadyEnabledError extends Error {}`
  - `enableBusiness(kbRepo: KBRepo, profile: BusinessProfile): Promise<void>`:
    - `validateProfile` first, and throws with the issues if invalid
    - `getRepo().private !== true` → `PublicRepoError`
    - `.kh/business/business.yaml` already present → `AlreadyEnabledError`
    - otherwise one `commitFiles` with `chore: enable kaihuman business`
  - `syncKB` change: when the tree has `.kh/business/business.yaml` and `.kh/business/.tools/version` ≠ `BUSINESS_TOOLS_VERSION`, add `getBusinessToolFiles()` to the same commit. A repo without business gets no business files.
- Workflow template (`business-check.yml`):
  - `on: push` and `pull_request` with `paths: ['.kh/business/**']`
  - `actions/checkout@v4` with `fetch-depth: 0`
  - `actions/setup-node@v4` with `node-version: 22`
  - run: `node .kh/business/.tools/business-check.mjs --base "${{ github.event.pull_request.base.sha || github.event.before }}"`
- `SKILL.md` frontmatter:
  - `name: kh-business`
  - description triggers: "new client", "log time for", "draft an invoice/offer", "what does <client> owe", mentions of `client:<slug>`

  Body:
  - the layout (spec section 2)
  - the key rules:
    - agents create **drafts only** and never write under `offers/` or `invoices/`
    - money is in cents, rates and quantities are quoted strings
    - one JSONL line per time entry / payment / event, append only
    - todos and log use the existing formats
    - issuing happens in the kaihuman console
  - how to run the check locally: `node .kh/business/.tools/business-check.mjs`
- `VERFAHRENSDOKUMENTATION.md` (German, with `[…]` placeholders the user fills in). Sections:
  1. Allgemeine Beschreibung
  2. Anwenderdokumentation (Belegfluss: Entwurf → Ausstellung → PDF/XML → Versand → Zahlung)
  3. Technische Systemdokumentation (Git-Repository, GitHub, Branch-Schutz, kaihuman Konsole, Prüf-Workflow, Generator)
  4. Betriebsdokumentation (Datensicherung, Zugriff, Aufbewahrung 8 Jahre / `retain_until`, Jahresexport)
  5. Internes Kontrollsystem (unveränderliche Rechnungen, Stornorechnung statt Änderung, lückenlose Nummern, SHA-256)

  Plus a closing line to have it reviewed by the Steuerberater.

- [ ] **Step 1: Write failing tests** (`business-setup.test.ts`, mocking `@kaihuman/core` like `github-kb.test.ts`)

```ts
givenRepo({ private: false }, {});
await expect(enableBusiness(repo, profile)).rejects.toBeInstanceOf(PublicRepoError);
givenRepo({ private: true }, { '.kh/business/business.yaml': 'x' });
await expect(enableBusiness(repo, profile)).rejects.toBeInstanceOf(AlreadyEnabledError);
givenRepo({ private: true }, {});
await enableBusiness(repo, profile);
const files = committed();
expect(Object.keys(files)).toEqual(expect.arrayContaining(['.kh/business/business.yaml', '.kh/business/.tools/business-check.mjs', '.github/workflows/business-check.yml', '.claude/skills/kh-business/SKILL.md', '.kh/business/VERFAHRENSDOKUMENTATION.md']));
expect(validateProfile(parseYamlOk(files['.kh/business/business.yaml'])).ok).toBe(true);
await expect(enableBusiness(repo, { ...profile, currency: 5 } as never)).rejects.toThrow();
// github-kb.test.ts
givenRepo({ ...fullySetUp(), '.kh/business/business.yaml': 'x', '.kh/business/.tools/version': '0.9.0' });
await syncKB(repo);
expect(committed()).toHaveProperty('.kh/business/.tools/version', BUSINESS_TOOLS_VERSION);
givenRepo(fullySetUp());
await syncKB(repo);
expect(githubService.commitFiles).not.toHaveBeenCalled(); // no business → nothing new
```

- [ ] **Step 2: Run** `pnpm --filter @kaihuman/formats build && pnpm --filter @kaihuman/app-console test -- business-setup github-kb`. Expected: FAIL.
- [ ] **Step 3: Implement** the setup module, the `syncKB` change, the skill and the templates. Add `getRepo` to the core mock.
- [ ] **Step 4: Write the docs.**
  - `doc/business.md`: formats, rules, the check, how to enable
  - update `features.md` and `roadmap.md`
  - finish the progress entry
- [ ] **Step 5: Full verification.** Run `pnpm install --frozen-lockfile && pnpm run build && pnpm run check && pnpm -r test`. Expected: all green, zero Biome warnings.
- [ ] **Step 6: Commit:** `feat(console): enable business in a Life OS repo with skill and CI check`

---

## Later phases (separate plans, written when phase 1 is merged)

2. Read-only console · 3. Daily forms (also extends `githubService.commitFiles` to accept `null` for deletes, needed by `issue`'s `FileChanges`) · 4. Share service · 5. Money admin · 6. E-invoice XML.
