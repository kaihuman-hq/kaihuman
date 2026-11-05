import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import { loadBusinessRepo } from './repo.js';
import { contractActiveIn, yearExportPaths, yearExportSummaries } from './year-export.js';

const R = '.kh/business';
const OLD_CONTRACT = '01M52X5E00EKRX27CHPV05AFMT';
const NEXT_CONTRACT = '01M52X5E00EKRX27CHPV05AFMV';
const BETA_EXPENSE = '01M55FJ500NTZ49EKRX27CHPV1';
const GAMMA_EXPENSE = '01JZZZZZZZZZZZZZZZZZZZZZZZ';

const contract = (id: string, start: string, end?: string) =>
  `id: ${id}\nclient: acme-gmbh\nkind: nda\ntitle: Old\nstart: "${start}"\n${end ? `end: "${end}"\n` : ''}file: ${id}.pdf\n`;
const expense = (id: string, date: string, client: string) =>
  `id: ${id}\ndate: "${date}"\nsupplier: S\ndescription: D\ncategory: travel\nnet: 100\nvat: 19\ngross: 119\nvat_rate: "19"\nclient: ${client}\nreceipt: ${id}.pdf\n`;
const client = (slug: string) =>
  `slug: ${slug}\nname: ${slug}\naddress:\n  street: S 1\n  postcode: "10115"\n  city: Berlin\n  country: DE\ncontacts: []\nstage: active\n`;

const files = loadFixtureRepo();
files.set(
  `${R}/clients/acme-gmbh/contracts/${OLD_CONTRACT}.yaml`,
  contract(OLD_CONTRACT, '2024-01-01', '2025-12-31'),
);
files.set(
  `${R}/clients/acme-gmbh/contracts/${NEXT_CONTRACT}.yaml`,
  contract(NEXT_CONTRACT, '2027-01-01'),
);
files.set(
  `${R}/expenses/2026/${BETA_EXPENSE}.yaml`,
  expense(BETA_EXPENSE, '2026-03-01', 'beta-ag'),
);
files.set(
  `${R}/expenses/2025/${GAMMA_EXPENSE}.yaml`,
  expense(GAMMA_EXPENSE, '2025-03-01', 'gamma'),
);
files.set(`${R}/clients/beta-ag/client.yaml`, client('beta-ag'));
files.set(`${R}/clients/gamma/client.yaml`, client('gamma'));

const tree = [
  ...files.keys(),
  `${R}/VERFAHRENSDOKUMENTATION.md`,
  `${R}/SKILL.md`,
  `${R}/.tools/check.mjs`,
  `${R}/invoices/2026/RE-2026-0001.pdf`,
  `${R}/invoices/2026/RE-2026-0001.xml`,
  `${R}/invoices/2026/RE-2026-0001.sha256`,
  `${R}/invoices/2025/RE-2025-0009.yaml`,
  `${R}/invoices/2025/RE-2025-0009.pdf`,
  `${R}/invoices/.gitkeep`,
  `${R}/expenses/2026/${BETA_EXPENSE}.pdf`,
  `${R}/expenses/2025/${GAMMA_EXPENSE}.pdf`,
  `${R}/payments/2025.jsonl`,
  `${R}/time/2025-12.jsonl`,
  `${R}/time/running.yaml`,
  `${R}/clients/acme-gmbh/contracts/01M52X5E00EKRX27CHPV05AFMS.pdf`,
  `${R}/clients/acme-gmbh/contracts/${OLD_CONTRACT}.pdf`,
  `${R}/clients/acme-gmbh/notes.md`,
  'README.md',
];
const repo = loadBusinessRepo(files, tree);

describe('yearExportPaths', () => {
  it('picks the year’s records, attachments, named clients and their active contracts', () => {
    expect(yearExportPaths(repo, [...tree].reverse(), '2026')).toEqual([
      `${R}/VERFAHRENSDOKUMENTATION.md`,
      `${R}/business.yaml`,
      `${R}/clients/acme-gmbh/client.yaml`,
      `${R}/clients/acme-gmbh/contracts/01M52X5E00EKRX27CHPV05AFMS.pdf`,
      `${R}/clients/acme-gmbh/contracts/01M52X5E00EKRX27CHPV05AFMS.yaml`,
      `${R}/clients/beta-ag/client.yaml`,
      `${R}/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.yaml`,
      `${R}/expenses/2026/${BETA_EXPENSE}.pdf`,
      `${R}/expenses/2026/${BETA_EXPENSE}.yaml`,
      `${R}/invoices/2026/RE-2026-0001.pdf`,
      `${R}/invoices/2026/RE-2026-0001.sha256`,
      `${R}/invoices/2026/RE-2026-0001.xml`,
      `${R}/invoices/2026/RE-2026-0001.yaml`,
      `${R}/offers/2026/AN-2026-001.yaml`,
      `${R}/payments/2026.jsonl`,
      `${R}/time/2026-10.jsonl`,
    ]);
  });

  it('includes a contract that ended inside the year, with its file', () => {
    const paths = yearExportPaths(repo, tree, '2025');
    expect(paths).toContain(`${R}/clients/gamma/client.yaml`);
    // acme is not named by any 2025 record, so none of its contracts are included.
    expect(paths.some((p) => p.includes('acme-gmbh'))).toBe(false);
    expect(paths).toContain(`${R}/invoices/2025/RE-2025-0009.pdf`);
    expect(paths).toContain(`${R}/time/2025-12.jsonl`);
  });
});

describe('contractActiveIn', () => {
  const c = (start: string, end?: string) =>
    ({ start, ...(end ? { end } : {}) }) as Parameters<typeof contractActiveIn>[0];
  it('is active when the contract overlaps the year', () => {
    expect(contractActiveIn(c('2026-12-31'), '2026')).toBe(true);
    expect(contractActiveIn(c('2020-01-01', '2026-01-01'), '2026')).toBe(true);
    expect(contractActiveIn(c('2020-01-01'), '2026')).toBe(true);
    expect(contractActiveIn(c('2027-01-01'), '2026')).toBe(false);
    expect(contractActiveIn(c('2020-01-01', '2025-12-31'), '2026')).toBe(false);
  });
});

describe('yearExportSummaries', () => {
  const s = yearExportSummaries(repo, '2026', '2026-11-02');

  it('writes the four CSVs and a README', () => {
    expect(Object.keys(s).sort()).toEqual([
      'summary/README.txt',
      'summary/expenses.csv',
      'summary/invoices.csv',
      'summary/payments.csv',
      'summary/vat.csv',
    ]);
    expect(s['summary/invoices.csv']).toContain('RE-2026-0001;Rechnung;2026-10-26');
    expect(s['summary/payments.csv']).toContain('2026-11-05;RE-2026-0001;1001,38');
    const expenses = s['summary/expenses.csv']?.slice(1).split('\r\n') ?? [];
    expect(expenses[1]?.startsWith('2026-03-01;')).toBe(true);
    expect(expenses[2]?.startsWith('2026-10-03;')).toBe(true);
    // 12 months, 4 quarters and the year, plus the header and the final empty line.
    expect(s['summary/vat.csv']?.split('\r\n')).toHaveLength(19);
  });

  it('names the business, year, generation date and VAT basis in the README', () => {
    const readme = s['summary/README.txt'] ?? '';
    expect(readme).toContain('Kai Mustermann');
    expect(readme).toContain('2026');
    expect(readme).toContain('Generated: 2026-11-02');
    expect(readme).toContain('Paid and open amounts as of 2026-11-02');
    expect(readme).toContain('VAT basis: Soll (accrual)');
    expect(readme).toContain('SHA256SUMS');
  });

  it('says when the small-business regime applies', () => {
    const small = loadBusinessRepo(
      new Map([
        ...files,
        [
          `${R}/business.yaml`,
          (files.get(`${R}/business.yaml`) ?? '').replace(
            'vat_regime: regular',
            'vat_regime: small-business',
          ),
        ],
      ]),
      tree,
    );
    expect(yearExportSummaries(small, '2026', '2026-11-02')['summary/README.txt']).toContain(
      'No VAT: small-business regime (§19 UStG).',
    );
  });
});
