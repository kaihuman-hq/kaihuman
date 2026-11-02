import { asSlug, isUlid, type Slug, type Ulid } from './ids.js';

export const BUSINESS_ROOT = '.kh/business';

export type BusinessPath =
  | { kind: 'profile' }
  | { kind: 'client'; client: Slug }
  | { kind: 'project'; client: Slug; project: Slug }
  | { kind: 'contract'; client: Slug; id: Ulid }
  | { kind: 'draft'; id: Ulid }
  | { kind: 'issued'; doc: 'invoice' | 'offer'; year: number; number: string }
  | { kind: 'artifact'; doc: 'invoice' | 'offer' | 'contract'; ext: 'pdf' | 'xml' | 'sha256' }
  | { kind: 'time'; month: string }
  | { kind: 'timer' }
  | { kind: 'payments'; year: number }
  | { kind: 'events' }
  | { kind: 'links' }
  | { kind: 'expense'; year: number; id: Ulid }
  | { kind: 'receipt' }
  | { kind: 'notes' | 'todos' | 'log'; client: Slug }
  /** SKILL.md, VERFAHRENSDOKUMENTATION.md, .tools/**, .gitkeep */
  | { kind: 'meta' }
  | { kind: 'unknown' };

export const clientDir = (slug: Slug): string => `${BUSINESS_ROOT}/clients/${slug}`;
export const draftPath = (id: Ulid): string => `${BUSINESS_ROOT}/drafts/${id}.yaml`;
export const issuedPath = (doc: 'invoice' | 'offer', year: number, number: string): string =>
  `${BUSINESS_ROOT}/${doc === 'invoice' ? 'invoices' : 'offers'}/${year}/${number}.yaml`;
export const timePath = (month: string): string => `${BUSINESS_ROOT}/time/${month}.jsonl`;
export const TIMER_PATH = `${BUSINESS_ROOT}/time/running.yaml`;
export const EVENTS_PATH = `${BUSINESS_ROOT}/events.jsonl`;
export const LINKS_PATH = `${BUSINESS_ROOT}/links.jsonl`;
export const paymentsPath = (year: number): string => `${BUSINESS_ROOT}/payments/${year}.jsonl`;

const UNKNOWN: BusinessPath = { kind: 'unknown' };
const YEAR = /^\d{4}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** What an issued file name (without `.yaml`) may be; numbering patterns must produce it. */
export const ISSUED_NUMBER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** Folders the scaffold creates with a `.gitkeep`. */
const DATA_DIRS = ['clients', 'drafts', 'offers', 'invoices', 'time', 'payments', 'expenses'];
const ARTIFACT_EXT = ['pdf', 'xml', 'sha256'] as const;

const split = (name: string): [string, string] | null => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? null : [name.slice(0, dot), name.slice(dot + 1)];
};

const issuedDir = (doc: 'invoice' | 'offer', year: string, file: string): BusinessPath => {
  if (!YEAR.test(year)) return UNKNOWN;
  const parts = split(file);
  if (!parts || !ISSUED_NUMBER.test(parts[0])) return UNKNOWN;
  const [number, ext] = parts;
  if (ext === 'yaml') return { kind: 'issued', doc, year: Number(year), number };
  const artifact = ARTIFACT_EXT.find((e) => e === ext);
  return artifact ? { kind: 'artifact', doc, ext: artifact } : UNKNOWN;
};

const clientFile = (client: Slug, rest: string[]): BusinessPath => {
  const [first, second] = rest;
  if (rest.length === 1) {
    if (first === 'client.yaml') return { kind: 'client', client };
    if (first === 'notes.md') return { kind: 'notes', client };
    if (first === 'todos.todos.md') return { kind: 'todos', client };
    if (first === 'log.actionlog.md') return { kind: 'log', client };
    return UNKNOWN;
  }
  if (rest.length !== 2 || first === undefined || second === undefined) return UNKNOWN;
  const parts = split(second);
  if (!parts) return UNKNOWN;
  const [name, ext] = parts;
  if (first === 'projects' && ext === 'yaml') {
    const project = asSlug(name);
    return project ? { kind: 'project', client, project } : UNKNOWN;
  }
  if (first === 'contracts') {
    if (!isUlid(name)) return UNKNOWN;
    if (ext === 'yaml') return { kind: 'contract', client, id: name };
    if (ext === 'pdf') return { kind: 'artifact', doc: 'contract', ext };
  }
  return UNKNOWN;
};

/** Classifies a repo-relative path. Anything outside the known layout is `unknown`. */
export const classifyBusinessPath = (path: string): BusinessPath => {
  if (!path.startsWith(`${BUSINESS_ROOT}/`)) return UNKNOWN;
  const parts = path.slice(BUSINESS_ROOT.length + 1).split('/');
  const [top, a, b] = parts;
  if (parts.length === 1) {
    switch (top) {
      case 'business.yaml':
        return { kind: 'profile' };
      case 'events.jsonl':
        return { kind: 'events' };
      case 'links.jsonl':
        return { kind: 'links' };
      case 'SKILL.md':
      case 'VERFAHRENSDOKUMENTATION.md':
      case '.gitkeep':
        return { kind: 'meta' };
      default:
        return UNKNOWN;
    }
  }
  if (top === '.tools') return { kind: 'meta' };
  if (parts.length === 2 && a === '.gitkeep' && top !== undefined && DATA_DIRS.includes(top)) {
    return { kind: 'meta' };
  }
  if (top === 'clients' && a !== undefined) {
    const client = asSlug(a);
    return client ? clientFile(client, parts.slice(2)) : UNKNOWN;
  }
  if (top === 'drafts' && parts.length === 2 && a !== undefined) {
    const parts2 = split(a);
    return parts2 && parts2[1] === 'yaml' && isUlid(parts2[0])
      ? { kind: 'draft', id: parts2[0] }
      : UNKNOWN;
  }
  if ((top === 'invoices' || top === 'offers') && parts.length === 3 && a && b) {
    return issuedDir(top === 'invoices' ? 'invoice' : 'offer', a, b);
  }
  if (top === 'time' && parts.length === 2 && a === 'running.yaml') return { kind: 'timer' };
  if (top === 'time' && parts.length === 2 && a?.endsWith('.jsonl')) {
    const month = a.slice(0, -'.jsonl'.length);
    return MONTH.test(month) ? { kind: 'time', month } : UNKNOWN;
  }
  if (top === 'payments' && parts.length === 2 && a?.endsWith('.jsonl')) {
    const year = a.slice(0, -'.jsonl'.length);
    return YEAR.test(year) ? { kind: 'payments', year: Number(year) } : UNKNOWN;
  }
  if (top === 'expenses' && parts.length === 3 && a && b && YEAR.test(a)) {
    const p = split(b);
    if (!p || !isUlid(p[0])) return UNKNOWN;
    return p[1] === 'yaml' ? { kind: 'expense', year: Number(a), id: p[0] } : { kind: 'receipt' };
  }
  return UNKNOWN;
};

export const isBusinessPath = (path: string): boolean => path.startsWith(`${BUSINESS_ROOT}/`);

/** The client slug of any path under `.kh/business/clients/<slug>/`, else null. */
export const clientOfPath = (path: string): Slug | null => {
  const prefix = `${BUSINESS_ROOT}/clients/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  const slash = rest.indexOf('/');
  return slash < 0 ? null : asSlug(rest.slice(0, slash));
};

export type Scope = 'all' | 'business' | 'personal';

export const inScope = (path: string, scope: Scope): boolean =>
  scope === 'all' || isBusinessPath(path) === (scope === 'business');
