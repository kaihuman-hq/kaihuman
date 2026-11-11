import {
  type BusinessRepo,
  type Client,
  type ClientStage,
  contractReminders,
  deriveInvoiceStatus,
  formatMinor,
  type InvoiceStatus,
  type Project,
  retainersDue,
  type Slug,
  type TimeEntry,
} from '@kaihuman/formats/business';
import { weekStart } from './dates.js';

export const STAGE_LABEL: Record<ClientStage, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  'offer-sent': 'Offer sent',
  active: 'Active',
  past: 'Past',
  lost: 'Lost',
};

// Active work first; past and lost clients sink to the bottom.
const STAGE_ORDER: Record<ClientStage, number> = {
  active: 0,
  'offer-sent': 1,
  contacted: 2,
  lead: 3,
  past: 4,
  lost: 5,
};

export const currencyOf = (repo: BusinessRepo): string => repo.profile?.currency ?? 'EUR';

/** `1.234,50 EUR` style money for a row. */
export const money = (minor: number, currency: string): string =>
  `${formatMinor(minor, currency)} ${currency}`;

export const hoursText = (minutes: number): string => `${(minutes / 60).toFixed(1)} h`;

export type InvoiceRow = {
  number: string;
  client: Slug;
  issueDate: string;
  dueDate?: string;
  gross: number;
  currency: string;
  status: InvoiceStatus;
};

/** Every issued invoice with its derived status, newest first. Credit notes are folded into status. */
export const invoiceRows = (repo: BusinessRepo, today: string): InvoiceRow[] => {
  const creditNotes = repo.issued.map((i) => i.doc).filter((d) => d.kind === 'credit-note');
  return repo.issued
    .map((i) => i.doc)
    .filter((d) => d.kind === 'invoice')
    .map((doc) => ({
      number: doc.number,
      client: doc.client,
      issueDate: doc.issue_date,
      ...(doc.due_date ? { dueDate: doc.due_date } : {}),
      gross: doc.totals.gross,
      currency: doc.currency ?? currencyOf(repo),
      status: deriveInvoiceStatus(doc, repo.payments, creditNotes, repo.events, today),
    }))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));
};

/** Invoices with money still to come in, overdue first, then by due date. */
export const receivables = (rows: readonly InvoiceRow[]): InvoiceRow[] =>
  rows
    .filter((r) => r.status.open > 0 && r.status.state !== 'credited')
    .sort(
      (a, b) =>
        Number(b.status.state === 'overdue') - Number(a.status.state === 'overdue') ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
    );

export type ClientRow = {
  slug: Slug;
  name: string;
  stage: ClientStage;
  open: number;
  unbilledMinutes: number;
  currency: string;
};

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export const clientRows = (repo: BusinessRepo, today: string): ClientRow[] => {
  const rows = invoiceRows(repo, today);
  return repo.clients
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      stage: c.stage,
      open: sum(rows.filter((r) => r.client === c.slug).map((r) => r.status.open)),
      unbilledMinutes: sum(
        repo.time
          .filter((t) => t.client === c.slug && t.invoice === undefined)
          .map((t) => t.minutes),
      ),
      currency: c.currency ?? currencyOf(repo),
    }))
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.name.localeCompare(b.name));
};

export type HoursSummary = { today: number; week: number; month: number };

export const hoursSummary = (time: readonly TimeEntry[], today: string): HoursSummary => {
  const monday = weekStart(today);
  const month = today.slice(0, 7);
  const minutes = (keep: (t: TimeEntry) => boolean) => sum(time.filter(keep).map((t) => t.minutes));
  return {
    today: minutes((t) => t.date === today),
    week: minutes((t) => t.date >= monday && t.date <= today),
    month: minutes((t) => t.date.startsWith(month)),
  };
};

/** Something to act on, most urgent first; `invoice` items open the payment sheet. */
export type AttentionItem = {
  key: string;
  tone: 'warning' | 'todo';
  title: string;
  detail: string;
  target: { kind: 'invoice'; number: string } | { kind: 'client'; slug: Slug };
};

const CONTRACT_TITLE = { renewal: 'Renewal due', notice: 'Notice deadline', end: 'Contract ends' };

/**
 * Overdue invoices, retainers due, contract dates, then unbilled time. Drafts are not listed:
 * editing and issuing them stays in the console.
 */
export const attentionItems = (repo: BusinessRepo, today: string): AttentionItem[] => {
  const nameOf = (slug: Slug) => repo.clients.find((c) => c.slug === slug)?.name ?? slug;
  const items: AttentionItem[] = [];
  for (const r of receivables(invoiceRows(repo, today))) {
    if (r.status.state !== 'overdue') continue;
    items.push({
      key: `overdue:${r.number}`,
      tone: 'warning',
      title: `${r.number} from ${nameOf(r.client)} is overdue`,
      detail: `${money(r.status.open, r.currency)} open${r.dueDate ? `, due ${r.dueDate}` : ''}`,
      target: { kind: 'invoice', number: r.number },
    });
  }
  for (const { project, date, hasDraft } of retainersDue(repo, today)) {
    items.push({
      key: `retainer:${project.client}/${project.slug}`,
      tone: date < today ? 'warning' : 'todo',
      title: `Retainer ${project.name} for ${nameOf(project.client)}`,
      detail: hasDraft ? `Draft ready, issue by ${date}` : `Bill by ${date}`,
      target: { kind: 'client', slug: project.client },
    });
  }
  for (const r of contractReminders(repo, today)) {
    items.push({
      key: `contract:${r.contract.id}:${r.what}`,
      tone: 'todo',
      title: `${CONTRACT_TITLE[r.what]}: ${r.contract.title}`,
      detail: `${nameOf(r.contract.client)}, ${r.date}`,
      target: { kind: 'client', slug: r.contract.client },
    });
  }
  for (const c of clientRows(repo, today)) {
    if (c.unbilledMinutes === 0) continue;
    items.push({
      key: `unbilled:${c.slug}`,
      tone: 'todo',
      title: `${hoursText(c.unbilledMinutes)} unbilled for ${c.name}`,
      detail: 'Bill it from a draft in the console',
      target: { kind: 'client', slug: c.slug },
    });
  }
  return items;
};

export type ClientDetail = {
  client: Client;
  row: ClientRow;
  projects: Project[];
  invoices: InvoiceRow[];
  /** Newest first, capped. */
  recentTime: TimeEntry[];
  files: { kind: 'notes' | 'todos' | 'log'; path: string }[];
};

export const clientDetail = (
  repo: BusinessRepo,
  slug: string,
  today: string,
  recent = 10,
): ClientDetail | null => {
  const client = repo.clients.find((c) => c.slug === slug);
  const row = clientRows(repo, today).find((r) => r.slug === slug);
  if (!client || !row) return null;
  return {
    client,
    row,
    projects: repo.projects.filter((p) => p.client === slug && p.status !== 'done'),
    invoices: invoiceRows(repo, today).filter((r) => r.client === slug),
    recentTime: repo.time
      .filter((t) => t.client === slug)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, recent),
    files: repo.clientFiles
      .filter((f) => f.client === slug)
      .map(({ kind, path }) => ({ kind, path })),
  };
};

/** Whole minutes the running timer has run, never negative. */
export const timerMinutes = (startedAt: string, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60000));
