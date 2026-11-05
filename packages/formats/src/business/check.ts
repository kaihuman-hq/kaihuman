import { findGaps, formatNumber } from './numbering.js';
import { BUSINESS_ROOT, classifyBusinessPath } from './paths.js';
import { type Finding, loadBusinessRepoDetailed } from './repo.js';
import type { Issue } from './validate-kit.js';

export type { Finding } from './repo.js';
export type Change = { status: 'A' | 'M' | 'D'; path: string };

const FROZEN_MESSAGE = 'issued documents never change; issue a credit note';

export const checkBusinessRepo = (input: {
  files: ReadonlyMap<string, string>;
  /** null = no usable base commit, so the frozen-file rule cannot be checked. */
  changes: readonly Change[] | null;
  /** Symlinks found on disk; one under invoices/ or offers/ could hide a changed issued document. */
  symlinks?: readonly string[];
  today: string;
}): Finding[] => {
  const { files, changes } = input;
  const { repo, cross } = loadBusinessRepoDetailed(files);
  const findings: Finding[] = [...repo.findings];
  const add = (file: string, level: Finding['level'], issue: Issue) =>
    findings.push({ ...issue, file, level });
  const fail = (file: string, path: string, message: string, level: Finding['level'] = 'error') =>
    add(file, level, { path, message });
  const { patterns, clients, projects, issued, drafts, refs, payments, docRefs } = cross;

  for (const r of refs) {
    const at = r.line === undefined ? {} : { line: r.line };
    if (r.client !== undefined && !clients.has(r.client)) {
      add(r.file, 'error', { path: 'client', message: `unknown client "${r.client}"`, ...at });
    } else if (r.client !== undefined && r.project !== undefined) {
      if (!projects.has(`${r.client}/${r.project}`)) {
        add(r.file, 'error', {
          path: 'project',
          message: `unknown project "${r.project}" of client "${r.client}"`,
          ...at,
        });
      }
    }
  }

  const invoices = new Map(
    issued.filter((i) => i.series === 'invoice').map((i) => [i.doc.number, i]),
  );
  const offers = new Set(issued.filter((i) => i.series === 'offer').map((i) => i.doc.number));
  const allNumbers = new Set([...invoices.keys(), ...offers]);

  for (const pay of payments) {
    const target = invoices.get(pay.invoice);
    if (!target || target.doc.kind !== 'invoice') {
      add(pay.file, 'error', {
        path: 'invoice',
        message: `payment is for "${pay.invoice}", which is not an issued invoice`,
        line: pay.line,
      });
    }
  }
  for (const { file, doc } of [...issued.map((i) => ({ file: i.file, doc: i.doc })), ...drafts]) {
    if (doc.corrects !== undefined && invoices.get(doc.corrects)?.doc.kind !== 'invoice') {
      fail(file, 'corrects', `"${doc.corrects}" is not an issued invoice`);
    }
    if (doc.from_offer !== undefined && !offers.has(doc.from_offer)) {
      fail(file, 'from_offer', `"${doc.from_offer}" is not an issued offer`);
    }
  }
  for (const r of docRefs) {
    if (!allNumbers.has(r.doc)) {
      add(r.file, 'warning', {
        path: r.what,
        message: `"${r.doc}" is not an issued document`,
        line: r.line,
      });
    }
  }

  // Gaps: credit notes live in the invoice series, so grouping by folder is grouping by series.
  for (const series of ['invoice', 'offer'] as const) {
    const inSeries = issued.filter((i) => i.series === series);
    const numbers = inSeries.map((i) => i.doc.number);
    for (const year of new Set(inSeries.map((i) => i.year))) {
      const gaps = findGaps(patterns[series], year, numbers);
      if (gaps.length === 0) continue;
      const first = inSeries.find((i) => i.year === year);
      const missing = gaps.map((g) => formatNumber(patterns[series], year, g)).join(', ');
      fail(
        first?.file ?? `${BUSINESS_ROOT}/${series === 'invoice' ? 'invoices' : 'offers'}/${year}`,
        'number',
        `gap in ${series} numbers for ${year}: missing ${missing}`,
      );
    }
  }

  for (const link of input.symlinks ?? []) {
    const p = link.slice(BUSINESS_ROOT.length + 1);
    if (p.startsWith('invoices/') || p.startsWith('offers/')) {
      fail(link, '', 'symbolic links are not allowed among issued documents');
    }
  }

  if (changes !== null) {
    for (const c of changes) {
      if (c.status === 'A') continue;
      const p = classifyBusinessPath(c.path);
      if (p.kind === 'issued') fail(c.path, '', FROZEN_MESSAGE);
      else if (p.kind === 'artifact' && p.doc !== 'contract') {
        fail(c.path, '', 'issued documents never change; their pdf, xml and sha256 are frozen');
      }
    }
  }

  return findings;
};

const prefixed = (f: Finding): string =>
  f.message.startsWith(`${f.path}:`) || f.path === '' ? f.message : `${f.path}: ${f.message}`;

/** GitHub Actions workflow annotation. */
export const formatFinding = (f: Finding): string => {
  const line = f.line === undefined ? '' : `,line=${f.line}`;
  return `::${f.level} file=${f.file}${line}::${prefixed(f)}`;
};
