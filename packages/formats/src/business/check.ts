import { parseJsonl } from './jsonl.js';
import { DEFAULT_NUMBERING, findGaps, formatNumber } from './numbering.js';
import { BUSINESS_ROOT, type BusinessPath, classifyBusinessPath } from './paths.js';
import type { BusinessProfile, Draft, Issued, VatCategory } from './records.js';
import { computeTotals } from './totals.js';
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
import type { Issue, Result } from './validate-kit.js';
import { parseYaml } from './yaml.js';

export type Change = { status: 'A' | 'M' | 'D'; path: string };
export type Finding = Issue & { file: string; level: 'error' | 'warning' };

type Series = 'invoice' | 'offer';

const PROFILE_PATH = `${BUSINESS_ROOT}/business.yaml`;
const FROZEN_MESSAGE = 'issued documents never change; issue a credit note';

/** Key-sorted JSON, so stored and recomputed totals compare regardless of key order. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );

const readYaml = <T>(text: string, validate: (raw: unknown) => Result<T>): Result<T> => {
  const parsed = parseYaml(text);
  return parsed.ok ? validate(parsed.value) : parsed;
};

export const checkBusinessRepo = (input: {
  files: ReadonlyMap<string, string>;
  /** null = no usable base commit, so the frozen-file rule cannot be checked. */
  changes: readonly Change[] | null;
  /** Symlinks found on disk; one under invoices/ or offers/ could hide a changed issued document. */
  symlinks?: readonly string[];
  today: string;
}): Finding[] => {
  const { files, changes } = input;
  const findings: Finding[] = [];
  const add = (file: string, level: Finding['level'], issue: Issue) =>
    findings.push({ ...issue, file, level });
  const addIssues = (file: string, issues: readonly Issue[]) => {
    for (const i of issues) add(file, 'error', i);
  };
  const fail = (file: string, path: string, message: string, level: Finding['level'] = 'error') =>
    add(file, level, { path, message });

  const paths = [...files.keys()].filter((p) => p.startsWith(`${BUSINESS_ROOT}/`)).sort();

  // Profile first: numbering patterns and exemption reasons depend on it.
  let profile: BusinessProfile | undefined;
  const profileText = files.get(PROFILE_PATH);
  if (profileText === undefined) {
    fail(PROFILE_PATH, '', 'business.yaml is missing; default numbering patterns are used');
  } else {
    const r = readYaml(profileText, validateProfile);
    if (r.ok) profile = r.value;
    else addIssues(PROFILE_PATH, r.issues);
  }
  const patterns: Record<Series, string> = {
    invoice: profile?.numbering?.invoice ?? DEFAULT_NUMBERING.invoice,
    offer: profile?.numbering?.offer ?? DEFAULT_NUMBERING.offer,
  };

  const clients = new Set<string>();
  const projects = new Set<string>(); // "client/project"
  const issued: { file: string; series: Series; year: number; doc: Issued }[] = [];
  const drafts: { file: string; doc: Draft }[] = [];
  const refs: { file: string; line?: number; path: string; client?: string; project?: string }[] =
    [];
  const payments: { file: string; line: number; invoice: string }[] = [];
  const docRefs: { file: string; line: number; doc: string; what: string }[] = [];

  for (const file of paths) {
    const text = files.get(file) ?? '';
    const p: BusinessPath = classifyBusinessPath(file);
    switch (p.kind) {
      case 'profile':
      case 'meta':
      case 'receipt':
      case 'artifact':
      case 'notes':
      case 'todos':
      case 'log':
        break;
      case 'unknown':
        fail(file, '', 'unrecognised file in the business folder', 'warning');
        break;
      case 'client': {
        clients.add(p.client);
        const r = readYaml(text, (raw) => validateClient(raw, p.client));
        if (!r.ok) addIssues(file, r.issues);
        break;
      }
      case 'project': {
        projects.add(`${p.client}/${p.project}`);
        const r = readYaml(text, (raw) => validateProject(raw, p.project, p.client));
        if (!r.ok) addIssues(file, r.issues);
        break;
      }
      case 'contract': {
        const r = readYaml(text, validateContract);
        if (!r.ok) addIssues(file, r.issues);
        else refs.push({ file, path: 'client', client: r.value.client });
        break;
      }
      case 'draft': {
        const r = readYaml(text, validateDraft);
        if (!r.ok) addIssues(file, r.issues);
        else {
          drafts.push({ file, doc: r.value });
          refs.push({
            file,
            path: 'client',
            client: r.value.client,
            ...(r.value.project ? { project: r.value.project } : {}),
          });
        }
        break;
      }
      case 'issued': {
        const r = readYaml(text, validateIssued);
        if (!r.ok) {
          addIssues(file, r.issues);
          break;
        }
        issued.push({ file, series: p.doc, year: p.year, doc: r.value });
        if (r.value.number !== p.number) {
          fail(file, 'number', `"${r.value.number}" does not match the file name "${p.number}"`);
        }
        if (!r.value.issue_date.startsWith(`${p.year}-`)) {
          fail(file, 'issue_date', `${r.value.issue_date} is not in the year folder ${p.year}`);
        }
        // Reasons come from the document itself: the profile's vat_regime may change later,
        // and that must not turn frozen history red. Amounts, categories and rates are still verified.
        const reasons: Partial<Record<VatCategory, string>> = {};
        for (const b of r.value.totals.breakdown) {
          if (b.exemption_reason !== undefined) reasons[b.category] = b.exemption_reason;
        }
        const expected = computeTotals(r.value.lines, reasons);
        if (canonical(expected) !== canonical(r.value.totals)) {
          fail(file, 'totals', 'stored totals differ from the totals computed from the lines');
        }
        refs.push({
          file,
          path: 'client',
          client: r.value.client,
          ...(r.value.project ? { project: r.value.project } : {}),
        });
        break;
      }
      case 'time': {
        const r = parseJsonl(text, validateTimeEntry);
        addIssues(file, r.issues);
        for (const e of r.entries) {
          refs.push({
            file,
            line: e.line,
            path: 'client',
            client: e.value.client,
            ...(e.value.project ? { project: e.value.project } : {}),
          });
        }
        break;
      }
      case 'expense': {
        const r = readYaml(text, validateExpense);
        if (!r.ok) addIssues(file, r.issues);
        else if (r.value.client) {
          refs.push({
            file,
            path: 'client',
            client: r.value.client,
            ...(r.value.project ? { project: r.value.project } : {}),
          });
        }
        break;
      }
      case 'payments': {
        const r = parseJsonl(text, validatePayment);
        addIssues(file, r.issues);
        for (const e of r.entries) payments.push({ file, line: e.line, invoice: e.value.invoice });
        break;
      }
      case 'events': {
        const r = parseJsonl(text, validateEvent);
        addIssues(file, r.issues);
        for (const e of r.entries)
          docRefs.push({ file, line: e.line, doc: e.value.doc, what: 'doc' });
        break;
      }
      case 'links': {
        const r = parseJsonl(text, validateLink);
        addIssues(file, r.issues);
        for (const e of r.entries)
          docRefs.push({ file, line: e.line, doc: e.value.doc, what: 'doc' });
        break;
      }
    }
  }

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
    if (doc.corrects !== undefined && !invoices.has(doc.corrects)) {
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
export const BUSINESS_CHECK_BUNDLE = '@kaihuman/formats/dist/business-check.mjs';
