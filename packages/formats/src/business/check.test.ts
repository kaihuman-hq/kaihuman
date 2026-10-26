import { describe, expect, it } from 'vitest';
import { type Change, checkBusinessRepo, formatFinding } from './check.js';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import { KEY_ORDER } from './records.js';
import { parseYaml, stringifyYaml } from './yaml.js';

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

  it('without business.yaml still validates other files and uses default numbering', () => {
    const noProfile = new Map(base);
    noProfile.delete('.kh/business/business.yaml');
    expect(run(noProfile)).toContainEqual(
      expect.objectContaining({ file: '.kh/business/business.yaml' }),
    );
    noProfile.set(INVOICE, invoiceText.replace('vat_rate: "7"', 'vat_rate: 7'));
    noProfile.set(
      '.kh/business/invoices/2026/RE-2026-0003.yaml',
      invoiceText.replace('number: RE-2026-0001', 'number: RE-2026-0003'),
    );
    const found = errors(noProfile);
    expect(found).toContainEqual(
      expect.objectContaining({ file: INVOICE, message: expect.stringContaining('quote') }),
    );
    expect(found).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('RE-2026-0002') }),
    );
  });

  it('counts credit notes in the invoice series when looking for gaps', () => {
    const creditNote = invoiceText
      .replace('number: RE-2026-0001', 'number: RE-2026-0003')
      .replace('kind: invoice', 'kind: credit-note\ncorrects: RE-2026-0001')
      .replace('type_code: 380', 'type_code: 381');
    const files = withFile('.kh/business/invoices/2026/RE-2026-0003.yaml', creditNote);
    expect(errors(files).map((f) => f.message)).toEqual([expect.stringContaining('RE-2026-0002')]);
    const fixed = withFile(
      '.kh/business/invoices/2026/RE-2026-0002.yaml',
      creditNote.replace('number: RE-2026-0003', 'number: RE-2026-0002'),
    );
    fixed.set('.kh/business/invoices/2026/RE-2026-0003.yaml', creditNote);
    expect(errors(fixed).filter((f) => f.message.includes('gap'))).toEqual([]);
  });

  it('verifies totals against the stored exemption reasons, not the current profile', () => {
    const doc = parseYaml(invoiceText);
    if (!doc.ok) throw new Error('fixture');
    const small = {
      ...(doc.value as object),
      lines: [
        {
          description: 'Dev',
          quantity: '1',
          unit: 'C62',
          unit_price: 10000,
          vat_category: 'E',
          vat_rate: '0',
        },
      ],
      totals: {
        net: 10000,
        vat: 0,
        gross: 10000,
        breakdown: [
          {
            category: 'E',
            rate: '0',
            taxable: 10000,
            tax: 0,
            exemption_reason: 'Kleinunternehmer gemäß § 19 UStG',
          },
        ],
      },
    };
    const text = stringifyYaml(small, KEY_ORDER.issued);
    // The fixture profile is `regular`: the invoice was issued under small-business rules.
    expect(errors(withFile(INVOICE, text))).toEqual([]);
    expect(
      errors(withFile(INVOICE, text.replace('unit_price: 10000', 'unit_price: 10001'))),
    ).toContainEqual(expect.objectContaining({ path: 'totals' }));
  });

  it('reports a record id that differs from the file name', () => {
    const files = [
      '.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml',
      '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.yaml',
      '.kh/business/clients/acme-gmbh/contracts/01M52X5E00EKRX27CHPV05AFMS.yaml',
    ];
    for (const file of files) {
      const id = file.slice(file.lastIndexOf('/') + 1, -'.yaml'.length);
      const other = withFile(
        file,
        (base.get(file) ?? '').replace(`id: ${id}`, 'id: 01M5KA3Q00W16BGNTZ49EKRX99'),
      );
      expect(errors(other), file).toEqual([expect.objectContaining({ file, path: 'id' })]);
    }
  });

  it('reports a retain_until that does not follow the jurisdiction', () => {
    const files = withFile(
      INVOICE,
      invoiceText.replace('retain_until: "2034-12-31"', 'retain_until: "2036-12-31"'),
    );
    expect(errors(files)).toEqual([
      expect.objectContaining({
        path: 'retain_until',
        message: expect.stringContaining('2034-12-31'),
      }),
    ]);
    const generic = withFile(
      INVOICE,
      invoiceText.replace('jurisdiction: de', 'jurisdiction: generic'),
    );
    expect(errors(generic)).toEqual([
      expect.objectContaining({
        path: 'retain_until',
        message: expect.stringContaining('2036-12-31'),
      }),
    ]);
  });

  it('reports an issued number outside the series pattern or year', () => {
    const foo = '.kh/business/invoices/2026/FOO-1.yaml';
    const files = withFile(foo, invoiceText.replace('number: RE-2026-0001', 'number: FOO-1'));
    expect(errors(files)).toContainEqual(expect.objectContaining({ file: foo, path: 'number' }));
    const wrongYear = '.kh/business/invoices/2026/RE-2025-0001.yaml';
    const other = withFile(
      wrongYear,
      invoiceText.replace('number: RE-2026-0001', 'number: RE-2025-0001'),
    );
    expect(errors(other)).toContainEqual(
      expect.objectContaining({ file: wrongYear, path: 'number' }),
    );
  });

  it('reports a document kind in the wrong folder', () => {
    const offerPath = '.kh/business/offers/2026/AN-2026-001.yaml';
    const asInvoice = '.kh/business/invoices/2026/RE-2026-0002.yaml';
    const moved = withFile(
      asInvoice,
      (base.get(offerPath) ?? '').replace('number: AN-2026-001', 'number: RE-2026-0002'),
    );
    expect(errors(moved)).toContainEqual(
      expect.objectContaining({ file: asInvoice, path: 'kind' }),
    );
    const asOffer = '.kh/business/offers/2026/AN-2026-002.yaml';
    const misplaced = withFile(
      asOffer,
      invoiceText.replace('number: RE-2026-0001', 'number: AN-2026-002'),
    );
    expect(errors(misplaced)).toContainEqual(
      expect.objectContaining({ file: asOffer, path: 'kind' }),
    );
  });

  it('reports corrects that names a credit note', () => {
    const creditNote = (number: string, corrects: string) =>
      invoiceText
        .replace('number: RE-2026-0001', `number: ${number}`)
        .replace('kind: invoice', `kind: credit-note\ncorrects: ${corrects}`)
        .replace('type_code: 380', 'type_code: 381');
    const files = withFile(
      '.kh/business/invoices/2026/RE-2026-0002.yaml',
      creditNote('RE-2026-0002', 'RE-2026-0001'),
    );
    expect(errors(files)).toEqual([]);
    files.set(
      '.kh/business/invoices/2026/RE-2026-0003.yaml',
      creditNote('RE-2026-0003', 'RE-2026-0002'),
    );
    expect(errors(files)).toEqual([
      expect.objectContaining({
        file: '.kh/business/invoices/2026/RE-2026-0003.yaml',
        path: 'corrects',
      }),
    ]);
  });

  it('rejects symbolic links among issued documents but not elsewhere', () => {
    const symlinks = [INVOICE, '.kh/business/offers/2026/AN-2026-001.pdf'];
    expect(
      checkBusinessRepo({ files: base, changes: null, today, symlinks }).filter(
        (f) => f.level === 'error',
      ),
    ).toHaveLength(2);
    expect(
      checkBusinessRepo({
        files: base,
        changes: null,
        today,
        symlinks: ['.kh/business/notes.md'],
      }).filter((f) => f.level === 'error'),
    ).toEqual([]);
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
