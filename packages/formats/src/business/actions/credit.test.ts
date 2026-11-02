import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Ulid } from '../ids.js';
import { issue } from '../issue.js';
import type { Client, Issued } from '../records.js';
import { type BusinessRepo, loadBusinessRepo } from '../repo.js';
import { validateDraft } from '../validate.js';
import { parseYaml } from '../yaml.js';
import { creditInvoice, creditNoteDraft } from './credit.js';

const id = '01M5AMBK0038DJQW16BGNTZ49H' as Ulid;
const repo = loadBusinessRepo(loadFixtureRepo());
const invoice = repo.issued.find((i) => i.doc.number === 'RE-2026-0001')?.doc as Issued;
const DRAFT = `.kh/business/drafts/${id}.yaml`;

const creditNote = (gross: number, number = 'RE-2026-0002'): Issued => ({
  ...invoice,
  number,
  kind: 'credit-note',
  type_code: 381,
  corrects: invoice.number,
  totals: { ...invoice.totals, gross },
});
const withIssued = (base: BusinessRepo, ...docs: Issued[]): BusinessRepo => ({
  ...base,
  issued: [...base.issued, ...docs.map((doc) => ({ path: `x/${doc.number}.yaml`, doc }))],
});

describe('creditNoteDraft', () => {
  const draft = creditNoteDraft(invoice, id);

  it('is a credit note correcting the invoice, with its lines and no time entries', () => {
    expect(draft).toMatchObject({
      id,
      kind: 'credit-note',
      client: invoice.client,
      project: invoice.project,
      corrects: 'RE-2026-0001',
      service_period: invoice.service_period,
    });
    expect(draft.lines).toEqual(invoice.lines);
    expect(draft.lines[0]).not.toBe(invoice.lines[0]);
    expect(draft.time_entries).toBeUndefined();
  });

  it('validates', () => {
    expect(validateDraft(draft).ok).toBe(true);
  });

  it('issues as the next number of the invoice series with type code 381', () => {
    const client = repo.clients.find((c) => c.slug === 'acme-gmbh') as Client;
    const r = issue({
      draft,
      profile: repo.profile as NonNullable<BusinessRepo['profile']>,
      client,
      existingNumbers: ['RE-2026-0001', 'RE-2026-0042'],
      creditNoteNumbers: [],
      issueDate: '2026-11-02',
      timeFiles: {},
      clientLog: null,
      now: new Date(2026, 10, 2, 9, 0, 0),
    });
    expect(r.ok && r.value.document.number).toBe('RE-2026-0043');
    expect(r.ok && r.value.document.type_code).toBe(381);
    expect(r.ok && r.value.document.corrects).toBe('RE-2026-0001');
  });
});

describe('creditInvoice', () => {
  it('saves the credit note draft', () => {
    const r = creditInvoice(repo, 'RE-2026-0001', id, '2026-11-02');
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(Object.keys(r.value.changes)).toEqual([DRAFT]);
    const saved = parseYaml(r.value.changes[DRAFT] ?? '');
    expect(saved.ok && (saved.value as { corrects: string }).corrects).toBe('RE-2026-0001');
    expect(r.value.message).toBe(`business: save draft ${id} for acme-gmbh`);
  });

  it('allows a credit note for a partly credited invoice', () => {
    const r = creditInvoice(withIssued(repo, creditNote(100)), 'RE-2026-0001', id, '2026-11-02');
    expect(r.ok).toBe(true);
  });

  it('refuses an invoice that is already fully credited', () => {
    const credited = withIssued(repo, creditNote(invoice.totals.gross));
    expect(creditInvoice(credited, 'RE-2026-0001', id, '2026-11-02')).toEqual({
      ok: false,
      issues: [{ path: 'invoice', message: 'RE-2026-0001 is already fully credited.' }],
    });
  });

  it('refuses an unknown number and a credit note', () => {
    const cn = creditNote(100, 'RE-2026-0002');
    expect(creditInvoice(repo, 'RE-2026-0099', id, '2026-11-02')).toEqual({
      ok: false,
      issues: [{ path: 'invoice', message: 'unknown invoice "RE-2026-0099"' }],
    });
    expect(creditInvoice(withIssued(repo, cn), 'RE-2026-0002', id, '2026-11-02')).toEqual({
      ok: false,
      issues: [{ path: 'invoice', message: 'unknown invoice "RE-2026-0002"' }],
    });
  });

  it('refuses a second credit note draft for the same invoice', () => {
    const drafted = { ...repo, drafts: [...repo.drafts, creditNoteDraft(invoice, id)] };
    const other = '01M5AMBK0038DJQW16BGNTZ49J' as Ulid;
    expect(creditInvoice(drafted, 'RE-2026-0001', other, '2026-11-02')).toEqual({
      ok: false,
      issues: [
        { path: 'invoice', message: 'A credit note draft for RE-2026-0001 already exists.' },
      ],
    });
  });
});
