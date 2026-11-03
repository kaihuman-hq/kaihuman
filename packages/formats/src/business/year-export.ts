/** What a year's export for the Steuerberater contains, and the summaries written beside it. */

import { expensesCsv, invoiceCsvRows, invoicesCsv, paymentsCsv, vatCsv } from './csv.js';
import type { Slug } from './ids.js';
import {
  BUSINESS_ROOT,
  classifyBusinessPath,
  clientDir,
  contractFilePath,
  contractPath,
} from './paths.js';
import type { Contract } from './records.js';
import type { BusinessRepo } from './repo.js';
import { vatSummary } from './vat.js';

/** Overlaps the year: starts by its last day and has no end or ends on or after its first. */
export const contractActiveIn = (
  contract: Pick<Contract, 'start' | 'end'>,
  year: string,
): boolean =>
  contract.start <= `${year}-12-31` && (!contract.end || contract.end >= `${year}-01-01`);

const issuedFolder = (path: string): string | null => {
  const parts = path.slice(BUSINESS_ROOT.length + 1).split('/');
  return parts.length === 3 && (parts[0] === 'invoices' || parts[0] === 'offers')
    ? (parts[1] ?? null)
    : null;
};

/** Repo-relative paths of everything the year's export holds, sorted and without duplicates. */
export const yearExportPaths = (
  repo: BusinessRepo,
  tree: readonly string[],
  year: string,
): string[] => {
  const inTree = new Set(tree);
  const out = new Set<string>();
  const addIfPresent = (path: string) => {
    if (inTree.has(path)) out.add(path);
  };

  for (const path of inTree) {
    const p = classifyBusinessPath(path);
    switch (p.kind) {
      case 'profile':
        out.add(path);
        break;
      case 'meta':
        if (path === `${BUSINESS_ROOT}/VERFAHRENSDOKUMENTATION.md`) out.add(path);
        break;
      case 'issued':
      case 'artifact':
        // Contract PDFs are artifacts too; they come in below with their contract.
        if (issuedFolder(path) === year) out.add(path);
        break;
      case 'expense':
      case 'receipt':
        if (path.startsWith(`${BUSINESS_ROOT}/expenses/${year}/`)) out.add(path);
        break;
      case 'payments':
        if (String(p.year) === year) out.add(path);
        break;
      case 'time':
        if (p.month.startsWith(`${year}-`)) out.add(path);
        break;
      default:
        break;
    }
  }

  const clients = new Set<Slug>();
  for (const { path, doc } of repo.issued) if (issuedFolder(path) === year) clients.add(doc.client);
  for (const e of repo.expenses)
    if (e.client && e.date.startsWith(`${year}-`)) clients.add(e.client);
  for (const t of repo.time) if (t.date.startsWith(`${year}-`)) clients.add(t.client);

  for (const slug of clients) addIfPresent(`${clientDir(slug)}/client.yaml`);
  for (const c of repo.contracts) {
    if (!clients.has(c.client) || !contractActiveIn(c, year)) continue;
    addIfPresent(contractPath(c.client, c.id));
    addIfPresent(contractFilePath(c.client, c.id));
  }
  return [...out].sort();
};

const pad = (n: number) => String(n).padStart(2, '0');
const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const BASIS_LABEL = { accrual: 'Soll (accrual)', cash: 'Ist (cash)' } as const;

/** The CSVs and README under `summary/`; paid and open amounts are those known on `generated`. */
export const yearExportSummaries = (
  repo: BusinessRepo,
  year: string,
  generated: string = localToday(),
): Record<string, string> => {
  const inYear = (date: string) => date.startsWith(`${year}-`);
  const byDate = <T extends { date: string; id: string }>(a: T, b: T) =>
    a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  const periods = [
    ...Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`),
    ...[1, 2, 3, 4].map((q) => `${year}-Q${q}`),
    year,
  ];
  const smallBusiness = repo.profile?.vat_regime === 'small-business';
  const vat = smallBusiness
    ? 'No VAT: small-business regime (§19 UStG).'
    : `VAT basis: ${BASIS_LABEL[repo.profile?.vat_basis ?? 'accrual']}`;

  const readme = [
    `Business: ${repo.profile?.name ?? '(no business.yaml)'}`,
    `Year: ${year}`,
    `Generated: ${generated}`,
    vat,
    '',
    'Included:',
    '- business.yaml and VERFAHRENSDOKUMENTATION.md',
    `- offers/${year}/ and invoices/${year}/: issued documents (YAML, PDF, XML, SHA-256)`,
    `- expenses/${year}/: expenses and their receipts`,
    `- payments/${year}.jsonl and time/${year}-*.jsonl`,
    `- clients/: the client.yaml of every client named in ${year}, and their contracts active in ${year}`,
    '- summary/invoices.csv, payments.csv, expenses.csv, vat.csv (months, quarters, year)',
    '- SHA256SUMS: the SHA-256 of every other file in this archive',
    '',
    `Paid and open amounts as of ${generated}, not as of the end of ${year}.`,
    'CSV files: UTF-8 with BOM, ";" separator, decimal comma.',
    '',
  ].join('\n');

  return {
    'summary/invoices.csv': invoicesCsv(invoiceCsvRows(repo, Number(year))),
    'summary/payments.csv': paymentsCsv(repo.payments.filter((p) => inYear(p.date)).sort(byDate)),
    'summary/expenses.csv': expensesCsv(repo.expenses.filter((e) => inYear(e.date)).sort(byDate)),
    'summary/vat.csv': vatCsv(periods.map((p) => vatSummary(repo, p))),
    'summary/README.txt': readme,
  };
};
