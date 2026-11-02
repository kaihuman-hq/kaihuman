import { parseActionLog } from '@kaihuman/formats';
import type {
  BusinessRepo,
  Client,
  ClientStage,
  Contract,
  ContractDate,
  Draft,
  InvoiceStatus,
  Issued,
  LinkRecord,
  OfferStatus,
  Project,
  Slug,
} from '@kaihuman/formats/business';
import {
  CLIENT_STAGES,
  contractDates,
  contractReminders,
  deriveInvoiceStatus,
  deriveOfferStatus,
} from '@kaihuman/formats/business';
import { addDays, isoWeek, quarterOf } from './dates.js';

export type InvoiceRow = {
  number: string;
  kind: 'invoice' | 'credit-note';
  client: Slug;
  issueDate: string;
  dueDate?: string;
  gross: number;
  currency: string;
  status: InvoiceStatus;
  pdf: boolean;
  link: 'active' | 'revoked' | 'expired' | null;
};

export type OfferRow = {
  number: string;
  client: Slug;
  issueDate: string;
  validUntil: string;
  gross: number;
  currency: string;
  status: OfferStatus;
  pdf: boolean;
  link: InvoiceRow['link'];
};

export type ClientSummary = {
  slug: Slug;
  name: string;
  stage: ClientStage;
  billedThisYear: number;
  open: number;
  unbilledMinutes: number;
  minutesThisMonth: number;
  currency: string;
};

export type TimelineItem = {
  date: string;
  kind: 'offer' | 'invoice' | 'credit-note' | 'payment' | 'event' | 'log' | 'contract';
  title: string;
  ref?: string;
};

export type ClientOverview = {
  client: Client;
  summary: ClientSummary;
  offers: OfferRow[];
  invoices: InvoiceRow[];
  projects: { project: Project; minutesUsed: number; amountBilled: number }[];
  timeByWeek: { week: string; project: string | null; minutes: number }[];
  contracts: Contract[];
  timeline: TimelineItem[];
  files: { notes?: string; todos?: string; log?: string };
};

export type Dashboard = {
  /** Open > 0; overdue first, then by due date. */
  receivables: InvoiceRow[];
  openTotal: number;
  overdueTotal: number;
  unbilled: { client: Slug; minutes: number }[];
  vat: {
    month: { period: string; due: number };
    quarter: { period: string; due: number };
  };
  contractsDue: ({ contract: Contract } & ContractDate)[];
  drafts: Draft[];
  pipeline: Record<ClientStage, ClientSummary[]>;
  currency: string;
};

const TIMELINE_CAP = 100;
const CONTRACT_WINDOW_DAYS = 60;
const CONTRACT_DATE_TITLES: Record<ContractDate['what'], string> = {
  renewal: 'Renewal due',
  notice: 'Notice deadline',
  end: 'Contract ends',
};

const currencyOf = (repo: BusinessRepo): string => repo.profile?.currency ?? 'EUR';
const sum = (values: Iterable<number>): number => {
  let total = 0;
  for (const v of values) total += v;
  return total;
};
const newestFirst = <T extends { issueDate: string; number: string }>(rows: T[]): T[] =>
  rows.sort((a, b) =>
    a.issueDate === b.issueDate
      ? b.number.localeCompare(a.number)
      : b.issueDate.localeCompare(a.issueDate),
  );

/** The newest link record of a document, or null. */
export const latestLink = (links: readonly LinkRecord[], doc: string): LinkRecord | null =>
  links
    .filter((l) => l.doc === doc)
    .reduce<LinkRecord | null>(
      (best, l) => (best && Date.parse(best.created) > Date.parse(l.created) ? best : l),
      null,
    );

/** The latest link of a document decides; an expiry on the `expires` day itself still counts as active. */
const linkState = (
  links: readonly LinkRecord[],
  doc: string,
  today: string,
): InvoiceRow['link'] => {
  const latest = latestLink(links, doc);
  if (!latest) return null;
  if (latest.revoked) return 'revoked';
  if (latest.expires !== undefined && latest.expires.slice(0, 10) < today) return 'expired';
  return 'active';
};

const hasPdf = (repo: BusinessRepo, path: string): boolean =>
  repo.artifacts.has(path.replace(/\.ya?ml$/, '.pdf'));

export const invoiceRows = (repo: BusinessRepo, today: string): InvoiceRow[] => {
  const docs = repo.issued.filter((i) => i.doc.kind === 'invoice' || i.doc.kind === 'credit-note');
  const creditNotes = docs.filter((i) => i.doc.kind === 'credit-note').map((i) => i.doc);
  const currency = currencyOf(repo);
  return newestFirst(
    docs.map(({ path, doc }) => ({
      number: doc.number,
      kind: doc.kind === 'credit-note' ? ('credit-note' as const) : ('invoice' as const),
      client: doc.client,
      issueDate: doc.issue_date,
      ...(doc.due_date !== undefined ? { dueDate: doc.due_date } : {}),
      gross: doc.totals.gross,
      currency: doc.currency ?? currency,
      status: deriveInvoiceStatus(doc, repo.payments, creditNotes, repo.events, today),
      pdf: hasPdf(repo, path),
      link: linkState(repo.links, doc.number, today),
    })),
  );
};

export const offerRows = (repo: BusinessRepo, today: string): OfferRow[] => {
  const offers = repo.issued.filter((i) => i.doc.kind === 'offer');
  const all = offers.map((o) => o.doc);
  const currency = currencyOf(repo);
  return newestFirst(
    offers.map(({ path, doc }) => ({
      number: doc.number,
      client: doc.client,
      issueDate: doc.issue_date,
      validUntil: doc.valid_until ?? '',
      gross: doc.totals.gross,
      currency: doc.currency ?? currency,
      status: deriveOfferStatus(doc, repo.events, all, today),
      pdf: hasPdf(repo, path),
      link: linkState(repo.links, doc.number, today),
    })),
  );
};

/** Gross of invoices minus credit notes issued in the given year. */
const billedIn = (issued: readonly Issued[], clientSlug: string, year: string): number =>
  sum(
    issued
      .filter((d) => d.client === clientSlug && d.issue_date.startsWith(year))
      .map((d) =>
        d.kind === 'invoice' ? d.totals.gross : d.kind === 'credit-note' ? -d.totals.gross : 0,
      ),
  );

const summarize = (repo: BusinessRepo, client: Client, today: string): ClientSummary => {
  const month = today.slice(0, 7);
  const time = repo.time.filter((t) => t.client === client.slug);
  const rows = invoiceRows(repo, today).filter(
    (r) => r.client === client.slug && r.kind === 'invoice',
  );
  return {
    slug: client.slug,
    name: client.name,
    stage: client.stage,
    billedThisYear: billedIn(
      repo.issued.map((i) => i.doc),
      client.slug,
      today.slice(0, 4),
    ),
    open: sum(rows.map((r) => r.status.open)),
    unbilledMinutes: sum(time.filter((t) => t.invoice === undefined).map((t) => t.minutes)),
    minutesThisMonth: sum(time.filter((t) => t.date.startsWith(month)).map((t) => t.minutes)),
    currency: currencyOf(repo),
  };
};

export const clientSummaries = (repo: BusinessRepo, today: string): ClientSummary[] =>
  repo.clients.map((c) => summarize(repo, c, today)).sort((a, b) => a.name.localeCompare(b.name));

export const clientOverview = (
  repo: BusinessRepo,
  slug: string,
  today: string,
  logContent?: string,
): ClientOverview | null => {
  const client = repo.clients.find((c) => c.slug === slug);
  if (!client) return null;
  const invoices = invoiceRows(repo, today).filter((r) => r.client === slug);
  const offers = offerRows(repo, today).filter((r) => r.client === slug);
  const mine = new Set([...invoices, ...offers].map((r) => r.number));
  const time = repo.time.filter((t) => t.client === slug);
  const contracts = repo.contracts.filter((c) => c.client === slug);

  const projects = repo.projects
    .filter((p) => p.client === slug)
    .map((project) => ({
      project,
      minutesUsed: sum(time.filter((t) => t.project === project.slug).map((t) => t.minutes)),
      amountBilled: sum(
        repo.issued
          .filter((i) => i.doc.client === slug && i.doc.project === project.slug)
          .map(({ doc }) =>
            doc.kind === 'invoice'
              ? doc.totals.gross
              : doc.kind === 'credit-note'
                ? -doc.totals.gross
                : 0,
          ),
      ),
    }));

  const weeks = new Map<string, { week: string; project: string | null; minutes: number }>();
  for (const t of time) {
    const week = isoWeek(t.date);
    const key = `${week}\u0000${t.project ?? ''}`;
    const row = weeks.get(key) ?? { week, project: t.project ?? null, minutes: 0 };
    row.minutes += t.minutes;
    weeks.set(key, row);
  }
  const timeByWeek = [...weeks.values()].sort(
    (a, b) => a.week.localeCompare(b.week) || (a.project ?? '').localeCompare(b.project ?? ''),
  );

  const timeline: TimelineItem[] = [
    ...offers.map((o) => ({
      date: o.issueDate,
      kind: 'offer' as const,
      title: `Offer ${o.number}`,
      ref: o.number,
    })),
    ...invoices.map((i) => ({
      date: i.issueDate,
      kind: i.kind,
      title: `${i.kind === 'invoice' ? 'Invoice' : 'Credit note'} ${i.number}`,
      ref: i.number,
    })),
    ...repo.payments
      .filter((p) => mine.has(p.invoice))
      .map((p) => ({
        date: p.date,
        kind: 'payment' as const,
        title: `Payment for ${p.invoice}`,
        ref: p.invoice,
      })),
    ...repo.events
      .filter((e) => mine.has(e.doc))
      .map((e) => ({
        date: e.at.slice(0, 10),
        kind: 'event' as const,
        title: `${e.doc} ${e.type}`,
        ref: e.doc,
      })),
    ...(logContent
      ? parseActionLog(logContent).entries.map((e) => ({
          date: e.timestamp.slice(0, 10),
          kind: 'log' as const,
          title: e.description,
        }))
      : []),
    ...contracts.flatMap((c) => [
      { date: c.start, kind: 'contract' as const, title: c.title, ref: c.id },
      ...contractDates(c)
        .filter((d) => d.date >= today)
        .map((d) => ({
          date: d.date,
          kind: 'contract' as const,
          title: CONTRACT_DATE_TITLES[d.what],
          ref: c.id,
        })),
    ]),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, TIMELINE_CAP);

  const files: ClientOverview['files'] = {};
  for (const f of repo.clientFiles) if (f.client === slug) files[f.kind] = f.path;

  return {
    client,
    summary: summarize(repo, client, today),
    offers,
    invoices,
    projects,
    timeByWeek,
    contracts,
    timeline,
    files,
  };
};

export const businessDashboard = (repo: BusinessRepo, today: string): Dashboard => {
  const rows = invoiceRows(repo, today).filter((r) => r.kind === 'invoice');
  const receivables = rows
    .filter((r) => r.status.open > 0)
    .sort((a, b) => {
      const ao = a.status.state === 'overdue' ? 0 : 1;
      const bo = b.status.state === 'overdue' ? 0 : 1;
      return ao - bo || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });

  const minutes = new Map<Slug, number>();
  for (const t of repo.time) {
    if (t.invoice === undefined) minutes.set(t.client, (minutes.get(t.client) ?? 0) + t.minutes);
  }
  const unbilled = [...minutes]
    .filter(([, m]) => m > 0)
    .map(([client, m]) => ({ client, minutes: m }))
    .sort((a, b) => b.minutes - a.minutes || a.client.localeCompare(b.client));

  const vatOf = (inPeriod: (date: string) => boolean): number =>
    sum(
      repo.issued
        .filter(({ doc }) => inPeriod(doc.issue_date))
        .map(({ doc }) => {
          const tax = sum(doc.totals.breakdown.map((b) => b.tax));
          return doc.kind === 'invoice' ? tax : doc.kind === 'credit-note' ? -tax : 0;
        }),
    );
  const month = today.slice(0, 7);
  const { year, q } = quarterOf(today);
  const quarter = (date: string) => {
    const d = quarterOf(date);
    return d.year === year && d.q === q;
  };

  const contractsDue = contractReminders(repo, today, CONTRACT_WINDOW_DAYS);

  const pipeline = Object.fromEntries(
    CLIENT_STAGES.map((s) => [s, [] as ClientSummary[]]),
  ) as Record<ClientStage, ClientSummary[]>;
  for (const s of clientSummaries(repo, today)) pipeline[s.stage].push(s);

  return {
    receivables,
    openTotal: sum(receivables.map((r) => r.status.open)),
    overdueTotal: sum(
      receivables.filter((r) => r.status.state === 'overdue').map((r) => r.status.open),
    ),
    unbilled,
    vat: {
      month: { period: month, due: vatOf((d) => d.startsWith(month)) },
      quarter: { period: `${year}-Q${q}`, due: vatOf(quarter) },
    },
    contractsDue,
    drafts: repo.drafts,
    pipeline,
    currency: currencyOf(repo),
  };
};

/** Minutes logged today and since Monday of `today`'s week (Monday-based, inclusive). */
export const hoursSummary = (
  repo: BusinessRepo,
  today: string,
): { todayMinutes: number; weekMinutes: number } => {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -weekday);
  let todayMinutes = 0;
  let weekMinutes = 0;
  for (const e of repo.time) {
    if (e.date === today) todayMinutes += e.minutes;
    if (e.date >= monday && e.date <= today) weekMinutes += e.minutes;
  }
  return { todayMinutes, weekMinutes };
};
