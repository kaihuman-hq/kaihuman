import type { Slug } from './ids.js';
import { parseJsonl } from './jsonl.js';
import { jurisdictionFor } from './jurisdiction.js';
import { DEFAULT_NUMBERING, parseNumber } from './numbering.js';
import { BUSINESS_ROOT, classifyBusinessPath } from './paths.js';
import type {
  BusinessProfile,
  Client,
  Contract,
  DocEvent,
  Draft,
  Expense,
  Issued,
  LinkRecord,
  Payment,
  Project,
  RunningTimer,
  TimeEntry,
  VatCategory,
} from './records.js';
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
  validateTimer,
} from './validate.js';
import type { Issue, Result } from './validate-kit.js';
import { parseYaml } from './yaml.js';

export type Finding = Issue & { file: string; level: 'error' | 'warning' };
export type Series = 'invoice' | 'offer';

export type LoadedIssued = { path: string; doc: Issued };

export type BusinessRepo = {
  profile: BusinessProfile | null;
  clients: Client[];
  projects: Project[];
  contracts: Contract[];
  drafts: Draft[];
  issued: LoadedIssued[];
  time: TimeEntry[];
  /** The running timer, or null when none runs (or its file is invalid; see `findings`). */
  timer: RunningTimer | null;
  payments: Payment[];
  events: DocEvent[];
  links: LinkRecord[];
  expenses: Expense[];
  clientFiles: { client: Slug; kind: 'notes' | 'todos' | 'log'; path: string }[];
  /** Pdf/xml/sha256 and receipt paths, known from the tree alone. */
  artifacts: ReadonlySet<string>;
  findings: Finding[];
};

/** What the cross-file rules of `checkBusinessRepo` need beyond the records. */
export type RepoCrossData = {
  patterns: Record<Series, string>;
  /** Client slugs by path, including those whose file is invalid. */
  clients: ReadonlySet<string>;
  /** "client/project" by path, including invalid files. */
  projects: ReadonlySet<string>;
  issued: { file: string; series: Series; year: number; doc: Issued }[];
  drafts: { file: string; doc: Draft }[];
  refs: { file: string; line?: number; path: string; client?: string; project?: string }[];
  payments: { file: string; line: number; invoice: string }[];
  docRefs: { file: string; line: number; doc: string; what: string }[];
};

export const PROFILE_PATH = `${BUSINESS_ROOT}/business.yaml`;

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

/** Parses and validates every business file; one broken file never stops the others. */
export const loadBusinessRepoDetailed = (
  files: ReadonlyMap<string, string>,
  treePaths: readonly string[] = [],
): { repo: BusinessRepo; cross: RepoCrossData } => {
  const findings: Finding[] = [];
  const add = (file: string, level: Finding['level'], issue: Issue) =>
    findings.push({ ...issue, file, level });
  const addIssues = (file: string, issues: readonly Issue[]) => {
    for (const i of issues) add(file, 'error', i);
  };
  const fail = (file: string, path: string, message: string, level: Finding['level'] = 'error') =>
    add(file, level, { path, message });
  const sameId = (file: string, id: string, expected: string) => {
    if (id !== expected) fail(file, 'id', `"${id}" does not match the file name "${expected}"`);
  };

  const paths = [
    ...new Set([...files.keys(), ...treePaths].filter((p) => p.startsWith(`${BUSINESS_ROOT}/`))),
  ].sort();

  const repo: BusinessRepo = {
    profile: null,
    clients: [],
    projects: [],
    contracts: [],
    drafts: [],
    issued: [],
    time: [],
    timer: null,
    payments: [],
    events: [],
    links: [],
    expenses: [],
    clientFiles: [],
    artifacts: new Set(),
    findings,
  };
  const artifacts = repo.artifacts as Set<string>;

  // Profile first: numbering patterns and exemption reasons depend on it.
  const profileText = files.get(PROFILE_PATH);
  if (profileText === undefined) {
    // In the tree but not fetched: a load failure the caller reports, not a missing file.
    if (!treePaths.includes(PROFILE_PATH))
      fail(PROFILE_PATH, '', 'business.yaml is missing; default numbering patterns are used');
  } else {
    const r = readYaml(profileText, validateProfile);
    if (r.ok) repo.profile = r.value;
    else addIssues(PROFILE_PATH, r.issues);
  }
  const patterns: Record<Series, string> = {
    invoice: repo.profile?.numbering?.invoice ?? DEFAULT_NUMBERING.invoice,
    offer: repo.profile?.numbering?.offer ?? DEFAULT_NUMBERING.offer,
  };

  const cross: RepoCrossData = {
    patterns,
    clients: new Set(),
    projects: new Set(),
    issued: [],
    drafts: [],
    refs: [],
    payments: [],
    docRefs: [],
  };
  const clients = cross.clients as Set<string>;
  const projects = cross.projects as Set<string>;
  const { refs } = cross;

  for (const file of paths) {
    const p = classifyBusinessPath(file);
    // Tree-only paths (not fetched) are listed above; only fetched files are parsed.
    const text = files.get(file);
    switch (p.kind) {
      case 'profile':
      case 'meta':
        break;
      case 'receipt':
      case 'artifact':
        artifacts.add(file);
        break;
      case 'notes':
      case 'todos':
      case 'log':
        repo.clientFiles.push({ client: p.client, kind: p.kind, path: file });
        break;
      case 'unknown':
        fail(file, '', 'unrecognised file in the business folder', 'warning');
        break;
      case 'client': {
        clients.add(p.client);
        if (text === undefined) break;
        const r = readYaml(text, (raw) => validateClient(raw, p.client));
        if (r.ok) repo.clients.push(r.value);
        else addIssues(file, r.issues);
        break;
      }
      case 'project': {
        projects.add(`${p.client}/${p.project}`);
        if (text === undefined) break;
        const r = readYaml(text, (raw) => validateProject(raw, p.project, p.client));
        if (r.ok) repo.projects.push(r.value);
        else addIssues(file, r.issues);
        break;
      }
      case 'contract': {
        if (text === undefined) break;
        const r = readYaml(text, validateContract);
        if (!r.ok) addIssues(file, r.issues);
        else {
          repo.contracts.push(r.value);
          sameId(file, r.value.id, p.id);
          refs.push({ file, path: 'client', client: r.value.client });
        }
        break;
      }
      case 'draft': {
        if (text === undefined) break;
        const r = readYaml(text, validateDraft);
        if (!r.ok) addIssues(file, r.issues);
        else {
          repo.drafts.push(r.value);
          sameId(file, r.value.id, p.id);
          cross.drafts.push({ file, doc: r.value });
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
        if (text === undefined) break;
        const r = readYaml(text, validateIssued);
        if (!r.ok) {
          addIssues(file, r.issues);
          break;
        }
        const doc = r.value;
        repo.issued.push({ path: file, doc });
        cross.issued.push({ file, series: p.doc, year: p.year, doc });
        if (doc.number !== p.number) {
          fail(file, 'number', `"${doc.number}" does not match the file name "${p.number}"`);
        }
        const parsed = parseNumber(patterns[p.doc], p.number);
        if (!parsed || parsed.year !== p.year) {
          fail(
            file,
            'number',
            `"${p.number}" is not a ${p.year} number of the pattern "${patterns[p.doc]}"`,
          );
        }
        if (!doc.issue_date.startsWith(`${p.year}-`)) {
          fail(file, 'issue_date', `${doc.issue_date} is not in the year folder ${p.year}`);
        }
        if ((p.doc === 'offer') !== (doc.kind === 'offer')) {
          fail(
            file,
            'kind',
            p.doc === 'offer'
              ? `a ${doc.kind} belongs under invoices/, not offers/`
              : 'an offer belongs under offers/, not invoices/',
          );
        }
        const retainUntil = `${Number(doc.issue_date.slice(0, 4)) + jurisdictionFor(doc.jurisdiction).retentionYears}-12-31`;
        if (doc.retain_until !== retainUntil) {
          fail(file, 'retain_until', `must be ${retainUntil} for ${doc.jurisdiction}`);
        }
        // Reasons come from the document itself: the profile's vat_regime may change later,
        // and that must not turn frozen history red. Amounts, categories and rates are still verified.
        const reasons: Partial<Record<VatCategory, string>> = {};
        for (const b of doc.totals.breakdown) {
          if (b.exemption_reason !== undefined) reasons[b.category] = b.exemption_reason;
        }
        const expected = computeTotals(doc.lines, reasons);
        if (canonical(expected) !== canonical(doc.totals)) {
          fail(file, 'totals', 'stored totals differ from the totals computed from the lines');
        }
        refs.push({
          file,
          path: 'client',
          client: doc.client,
          ...(doc.project ? { project: doc.project } : {}),
        });
        break;
      }
      case 'time': {
        if (text === undefined) break;
        const r = parseJsonl(text, validateTimeEntry);
        addIssues(file, r.issues);
        for (const e of r.entries) {
          repo.time.push(e.value);
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
      case 'timer': {
        if (text === undefined) break;
        const r = readYaml(text, validateTimer);
        if (!r.ok) addIssues(file, r.issues);
        else {
          repo.timer = r.value;
          refs.push({
            file,
            path: 'client',
            client: r.value.client,
            ...(r.value.project ? { project: r.value.project } : {}),
          });
        }
        break;
      }
      case 'expense': {
        if (text === undefined) break;
        const r = readYaml(text, validateExpense);
        if (!r.ok) {
          addIssues(file, r.issues);
          break;
        }
        // Writers derive the YAML and receipt paths from id and date, so a record that disagrees
        // with its path is reported and left out: saving or deleting it would miss the real file.
        const before = findings.length;
        sameId(file, r.value.id, p.id);
        if (!r.value.date.startsWith(`${p.year}-`)) {
          fail(file, 'date', `date: ${r.value.date} is not in the year folder ${p.year}`);
        }
        if (repo.expenses.some((e) => e.id === r.value.id)) {
          fail(file, 'id', `another expense already has the id ${r.value.id}`);
        }
        if (findings.length > before) break;
        repo.expenses.push(r.value);
        if (r.value.client) {
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
        if (text === undefined) break;
        const r = parseJsonl(text, validatePayment);
        addIssues(file, r.issues);
        for (const e of r.entries) {
          repo.payments.push(e.value);
          cross.payments.push({ file, line: e.line, invoice: e.value.invoice });
        }
        break;
      }
      case 'events': {
        if (text === undefined) break;
        const r = parseJsonl(text, validateEvent);
        addIssues(file, r.issues);
        for (const e of r.entries) {
          repo.events.push(e.value);
          cross.docRefs.push({ file, line: e.line, doc: e.value.doc, what: 'doc' });
        }
        break;
      }
      case 'links': {
        if (text === undefined) break;
        const r = parseJsonl(text, validateLink);
        addIssues(file, r.issues);
        for (const e of r.entries) {
          repo.links.push(e.value);
          cross.docRefs.push({ file, line: e.line, doc: e.value.doc, what: 'doc' });
        }
        break;
      }
    }
  }
  return { repo, cross };
};

/**
 * `files` holds fetched contents; `treePaths` lists every path in the tree, so artifacts and
 * receipts are known without fetching them.
 */
export const loadBusinessRepo = (
  files: ReadonlyMap<string, string>,
  treePaths?: readonly string[],
): BusinessRepo => loadBusinessRepoDetailed(files, treePaths).repo;
