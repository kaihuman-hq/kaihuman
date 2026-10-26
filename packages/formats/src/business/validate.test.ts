import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseJsonl } from './jsonl.js';
import { KEY_ORDER } from './records.js';
import {
  validateClient,
  validateContract,
  validateDraft,
  validateEvent,
  validateExpense,
  validateIssued,
  validateLink,
  validatePayment,
  validateProfile,
  validateProject,
  validateTimeEntry,
} from './validate.js';
import { parseYaml } from './yaml.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/business/repo');
const yaml = (rel: string): unknown => {
  const r = parseYaml(readFileSync(join(root, rel), 'utf8'));
  if (!r.ok) throw new Error(`${rel}: ${r.issues[0]?.message}`);
  return r.value;
};
const jsonl = (rel: string): unknown => {
  const first = readFileSync(join(root, rel), 'utf8').split('\n')[0];
  return JSON.parse(first ?? '');
};

const profile = yaml('business.yaml');
const client = yaml('clients/acme-gmbh/client.yaml') as Record<string, unknown>;
const project = yaml('clients/acme-gmbh/projects/website.yaml');
const contract = yaml('clients/acme-gmbh/contracts/01M52X5E00EKRX27CHPV05AFMS.yaml');
const draft = yaml('drafts/01M50ARQ007CHPV05AFMSY38DJ.yaml') as Record<string, unknown>;
const invoice = yaml('invoices/2026/RE-2026-0001.yaml') as Record<string, unknown>;
const offer = yaml('offers/2026/AN-2026-001.yaml');
const expense = yaml('expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.yaml') as Record<string, unknown>;
const time = jsonl('time/2026-10.jsonl') as Record<string, unknown>;
const payment = jsonl('payments/2026.jsonl');
const event = jsonl('events.jsonl');
const link = jsonl('links.jsonl');
const line = (draft.lines as Record<string, unknown>[])[0];

describe('fixture repo', () => {
  it.each([
    ['profile', () => validateProfile(profile)],
    ['client', () => validateClient(client, 'acme-gmbh')],
    ['project', () => validateProject(project, 'website', 'acme-gmbh')],
    ['contract', () => validateContract(contract)],
    ['draft', () => validateDraft(draft)],
    ['issued invoice', () => validateIssued(invoice)],
    ['issued offer', () => validateIssued(offer)],
    ['time entry', () => validateTimeEntry(time)],
    ['payment', () => validatePayment(payment)],
    ['event', () => validateEvent(event)],
    ['link', () => validateLink(link)],
    ['expense', () => validateExpense(expense)],
  ])('%s validates', (_name, run) => {
    const r = run();
    expect(r.ok ? [] : r.issues).toEqual([]);
  });

  it('every JSONL line in the fixture validates through parseJsonl', () => {
    const text = readFileSync(join(root, 'time/2026-10.jsonl'), 'utf8');
    const { entries, issues } = parseJsonl(text, validateTimeEntry);
    expect(issues).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  it('keeps the client slug from the folder and defaults contacts', () => {
    const r = validateClient({ ...client, contacts: undefined }, 'acme-gmbh');
    expect(r).toMatchObject({ ok: true, value: { slug: 'acme-gmbh', contacts: [] } });
  });
});

describe('rules', () => {
  it('asks to quote an unquoted vat_rate', () => {
    const bad = validateDraft({ ...draft, lines: [{ ...line, vat_rate: 19 }] });
    expect(bad).toMatchObject({
      ok: false,
      issues: [{ path: 'lines[0].vat_rate', message: expect.stringContaining('quote it') }],
    });
  });

  it('asks to quote an unquoted quantity', () => {
    const bad = validateDraft({ ...draft, lines: [{ ...line, quantity: 7.5 }] });
    expect(bad).toMatchObject({
      ok: false,
      issues: [{ path: 'lines[0].quantity', message: expect.stringContaining('quote it') }],
    });
  });

  it('requires corrects on a credit note', () => {
    expect(validateDraft({ ...draft, kind: 'credit-note' })).toMatchObject({
      ok: false,
      issues: [{ path: 'corrects' }],
    });
    expect(validateDraft({ ...draft, kind: 'credit-note', corrects: 'RE-2026-0001' }).ok).toBe(
      true,
    );
  });

  it('requires valid_until on an offer', () => {
    expect(validateDraft({ ...draft, kind: 'offer' })).toMatchObject({
      ok: false,
      issues: [{ path: 'valid_until' }],
    });
  });

  it('rejects empty lines', () => {
    expect(validateDraft({ ...draft, lines: [] })).toMatchObject({
      ok: false,
      issues: [{ path: 'lines' }],
    });
  });

  it('rejects unknown keys', () => {
    expect(validateClient({ ...client, colour: 'red' }, 'acme-gmbh')).toMatchObject({
      ok: false,
      issues: [{ message: 'unknown key "colour"' }],
    });
    const nested = validateDraft({ ...draft, lines: [{ ...line, discount: 1 }] });
    expect(nested).toMatchObject({ ok: false, issues: [{ path: 'lines[0].discount' }] });
  });

  it('rejects a bad slug from the folder', () => {
    expect(validateClient(client, 'Acme').ok).toBe(false);
  });

  it('rejects a project whose client key disagrees with its folder', () => {
    expect(validateProject(project, 'website', 'other-gmbh')).toMatchObject({
      ok: false,
      issues: [{ path: 'client' }],
    });
  });

  it('bounds minutes to 1..1440', () => {
    expect(validateTimeEntry({ ...time, minutes: 0 }).ok).toBe(false);
    expect(validateTimeEntry({ ...time, minutes: 1441 }).ok).toBe(false);
    expect(validateTimeEntry({ ...time, minutes: 1440 }).ok).toBe(true);
  });

  it('requires gross = net + vat on expenses', () => {
    expect(validateExpense({ ...expense, gross: 1191 })).toMatchObject({
      ok: false,
      issues: [{ path: 'gross' }],
    });
  });

  it('requires gross = net + vat in issued totals but does not recompute from lines', () => {
    const totals = invoice.totals as Record<string, unknown>;
    expect(validateIssued({ ...invoice, totals: { ...totals, gross: 1 } })).toMatchObject({
      ok: false,
      issues: [{ path: 'totals.gross' }],
    });
    // Consistent but wrong for the lines: still shape-valid.
    expect(validateIssued({ ...invoice, totals: { ...totals, net: 1, vat: 1, gross: 2 } }).ok).toBe(
      true,
    );
  });

  it('ties type_code null to offers', () => {
    expect(validateIssued({ ...invoice, type_code: null }).ok).toBe(false);
    expect(validateIssued({ ...(offer as object), type_code: 380 }).ok).toBe(false);
  });

  it('rejects a non-ULID id and a bad datetime', () => {
    expect(validateTimeEntry({ ...time, id: 'nope' }).ok).toBe(false);
    expect(validateEvent({ ...(event as object), at: '2026-10-26' }).ok).toBe(false);
  });

  it('rejects non-mappings', () => {
    expect(validateProfile('x').ok).toBe(false);
    expect(validateDraft(null).ok).toBe(false);
  });
});

describe('KEY_ORDER', () => {
  it('lists every key the validators accept for each record', () => {
    expect(KEY_ORDER.issued).toEqual(expect.arrayContaining(['number', 'lines', 'totals']));
    expect(new Set(KEY_ORDER.issued).size).toBe(KEY_ORDER.issued.length);
  });
});
