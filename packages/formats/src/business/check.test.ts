import { describe, expect, it } from 'vitest';
import { type Change, checkBusinessRepo, formatFinding } from './check.js';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';

const today = '2026-10-26';
const INVOICE = '.kh/business/invoices/2026/RE-2026-0001.yaml';
const PAYMENTS = '.kh/business/payments/2026.jsonl';

const base = loadFixtureRepo();
const withFile = (path: string, text: string) => new Map([...base, [path, text]]);
const run = (files = base, changes: Change[] | null = null) =>
  checkBusinessRepo({ files, changes, today });
const errors = (files = base, changes: Change[] | null = null) =>
  run(files, changes).filter((f) => f.level === 'error');
const invoiceText = base.get(INVOICE) ?? '';

describe('checkBusinessRepo', () => {
  it('finds no errors in the fixture repo', () => {
    expect(errors()).toEqual([]);
  });

  it('warns about unknown files and ignores paths outside the business folder', () => {
    expect(run(withFile('.kh/business/stray.txt', 'x'))).toContainEqual(
      expect.objectContaining({ level: 'warning', file: '.kh/business/stray.txt' }),
    );
    expect(run(withFile('notes/x.md', 'anything'))).toEqual(run());
  });

  it('rejects changes and deletions of issued documents, allows additions of artifacts', () => {
    for (const status of ['M', 'D'] as const) {
      expect(errors(base, [{ status, path: INVOICE }])).toContainEqual(
        expect.objectContaining({
          file: INVOICE,
          message: expect.stringContaining('never change'),
        }),
      );
    }
    expect(errors(base, [{ status: 'M', path: INVOICE.replace('.yaml', '.pdf') }])).toHaveLength(1);
    expect(
      errors(base, [{ status: 'D', path: '.kh/business/offers/2026/AN-2026-001.sha256' }]),
    ).toHaveLength(1);
    expect(errors(base, [{ status: 'A', path: INVOICE.replace('.yaml', '.pdf') }])).toEqual([]);
  });

  it('allows drafts to be deleted and issued documents to be added', () => {
    const changes: Change[] = [
      { status: 'D', path: '.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml' },
      { status: 'A', path: INVOICE },
    ];
    expect(errors(base, changes)).toEqual([]);
  });

  it('reports a gap in the series, naming the missing number', () => {
    const files = withFile(
      '.kh/business/invoices/2026/RE-2026-0003.yaml',
      invoiceText.replace('number: RE-2026-0001', 'number: RE-2026-0003'),
    );
    expect(errors(files)).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('RE-2026-0002') }),
    );
  });

  it('reports a number that differs from the file name and a wrong year folder', () => {
    const wrongNumber = withFile(
      INVOICE,
      invoiceText.replace('number: RE-2026-0001', 'number: RE-2026-0002'),
    );
    expect(errors(wrongNumber)).toContainEqual(expect.objectContaining({ path: 'number' }));
    const wrongYear = withFile(
      INVOICE,
      invoiceText.replace('issue_date: "2026-10-26"', 'issue_date: "2027-01-02"'),
    );
    expect(errors(wrongYear)).toContainEqual(expect.objectContaining({ path: 'issue_date' }));
  });

  it('reports a payment for an unknown invoice', () => {
    const files = withFile(
      PAYMENTS,
      `${base.get(PAYMENTS)}{"id":"01M5AMBK0038DJQW16BGNTZ49F","date":"2026-10-20","invoice":"RE-2026-0099","amount":100}\n`,
    );
    expect(errors(files)).toContainEqual(expect.objectContaining({ path: 'invoice', line: 2 }));
  });

  it('reports stored totals that differ from the lines', () => {
    const files = withFile(INVOICE, invoiceText.replace('unit_price: 9500', 'unit_price: 9600'));
    expect(errors(files)).toContainEqual(expect.objectContaining({ path: 'totals' }));
  });

  it('reports unknown clients and projects on drafts', () => {
    const draft = '.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml';
    const text = base.get(draft) ?? '';
    expect(
      errors(withFile(draft, text.replace('client: acme-gmbh', 'client: nobody'))),
    ).toContainEqual(expect.objectContaining({ path: 'client' }));
    expect(
      errors(withFile(draft, text.replace('project: website', 'project: nope'))),
    ).toContainEqual(expect.objectContaining({ path: 'project' }));
  });

  it('reports unresolved corrects and from_offer, and warns for events and links', () => {
    const draft = '.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml';
    const text = base.get(draft) ?? '';
    const files = withFile(draft, `${text}corrects: RE-2026-0042\nfrom_offer: AN-2026-009\n`);
    expect(errors(files).map((f) => f.path)).toEqual(
      expect.arrayContaining(['corrects', 'from_offer']),
    );
    const ev = withFile(
      '.kh/business/events.jsonl',
      '{"id":"01M5D6RA00AFMSY38DJQW16BGN","at":"2026-10-26T09:30:00Z","doc":"RE-2026-0077","type":"sent"}\n',
    );
    expect(run(ev)).toContainEqual(
      expect.objectContaining({ level: 'warning', path: 'doc', line: 1 }),
    );
    expect(errors(ev)).toEqual([]);
  });

  it('reports invalid records and a missing profile but still checks the rest', () => {
    const noProfile = new Map(base);
    noProfile.delete('.kh/business/business.yaml');
    expect(run(noProfile)).toContainEqual(
      expect.objectContaining({ file: '.kh/business/business.yaml' }),
    );
    const bad = withFile(INVOICE, invoiceText.replace('vat_rate: "7"', 'vat_rate: 7'));
    expect(errors(bad)).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('quote') }),
    );
  });
});

describe('formatFinding', () => {
  it('prints a GitHub annotation without repeating the path', () => {
    expect(
      formatFinding({ file: 'a.yaml', level: 'error', path: 'totals', message: 'bad', line: 3 }),
    ).toBe('::error file=a.yaml,line=3::totals: bad');
    expect(
      formatFinding({ file: 'a.yaml', level: 'warning', path: 'doc', message: 'doc: x' }),
    ).toBe('::warning file=a.yaml::doc: x');
  });
});
