import type { TreeItem } from '@kaihuman/core';
import { localDate } from '@kaihuman/formats';
import {
  type BusinessRepo,
  classifyBusinessPath,
  clientDir,
  type DocKind,
  type FileChanges,
  type IssueContext,
  type Issued,
  issue,
  type Line,
  type Result,
  seriesOf,
  type Totals,
  timePath,
  type Ulid,
} from '@kaihuman/formats/business';
import { money } from '../../components/business/money';
import { addDays, isRealDate } from './dates';

/**
 * What issuing reads: a `Fresh` inside `writeBusiness` for the commit, or the page's loaded state
 * for the preview. Only paths and reads are needed, so both fit.
 */
export type IssueSource = {
  tree: readonly Pick<TreeItem, 'path' | 'type'>[];
  repo: BusinessRepo;
  read: (path: string) => Promise<string | null>;
};

export type IssuePreview = {
  number: string;
  kind: DocKind;
  client: string;
  corrects?: string;
  issueDate: string;
  dueDate?: string;
  currency: string;
  lines: Line[];
  totals: Totals;
  legalNotes: string[];
  /** Reasons to ask "Issue anyway?" before committing; empty when there is nothing odd. */
  warnings: string[];
};

/** Further ahead than this, an issue date is probably a typo. */
const FUTURE_DAYS = 7;

export const issuedNotice = (number: string): string =>
  `Issued ${number}. Generate the PDF with your generator; kaihuman shows "PDF missing" until it is in the repo.`;

const refuse = (path: string, message: string) => ({
  ok: false as const,
  issues: [{ path, message }],
});

/** The page's loaded business files as an {@link IssueSource}; failed fetches still count as paths. */
export const loadedSource = (
  repo: BusinessRepo,
  contents: Readonly<Record<string, string>>,
  failedPaths: readonly string[] = [],
): IssueSource => ({
  tree: [...Object.keys(contents), ...failedPaths].map((path) => ({ path, type: 'blob' })),
  repo,
  read: async (path) => contents[path] ?? null,
});

const blobPaths = (tree: IssueSource['tree']): string[] =>
  tree.filter((t) => t.type === 'blob').map((t) => t.path);

/**
 * The series and number a frozen file (`invoices/` or `offers/`: the yaml or its pdf, xml, sha256)
 * holds, from its file stem; null for anything else. An artifact alone still takes its number.
 */
const frozenNumber = (path: string): { series: 'invoice' | 'offer'; number: string } | null => {
  const c = classifyBusinessPath(path);
  if (c.kind === 'issued') return { series: c.doc, number: c.number };
  if (c.kind !== 'artifact' || c.doc === 'contract') return null;
  const file = path.slice(path.lastIndexOf('/') + 1);
  return { series: c.doc, number: file.slice(0, file.lastIndexOf('.')) };
};

/** Every number of `series` held by a frozen file, any year. */
const takenNumbers = (paths: readonly string[], series: 'invoice' | 'offer'): string[] => [
  ...new Set(
    paths.flatMap((p) => {
      const f = frozenNumber(p);
      return f && f.series === series ? [f.number] : [];
    }),
  ),
];

/**
 * Everything `issue()` needs, read from `source`. Numbers come from the tree's paths, not from the
 * parsed documents, so an invalid issued file, or a PDF without its yaml, still blocks its number.
 */
export async function buildIssueContext(
  source: IssueSource,
  draftId: Ulid,
  issueDate: string,
  now: Date,
): Promise<Result<IssueContext>> {
  const { repo } = source;
  const draft = repo.drafts.find((d) => d.id === draftId);
  if (!draft) {
    return repo.issued.some((i) => i.doc.draft_id === draftId)
      ? refuse('draft', 'This draft was already issued.')
      : refuse('draft', `No draft ${draftId}.`);
  }
  if (!isRealDate(issueDate)) return refuse('issue_date', 'Enter the issue date as YYYY-MM-DD.');
  const profile = repo.profile;
  if (!profile) return refuse('profile', 'Set up the business profile first.');
  const client = repo.clients.find((c) => c.slug === draft.client);
  if (!client) return refuse('client', `unknown client "${draft.client}"`);

  const series = seriesOf(draft.kind);
  const existingNumbers = takenNumbers(blobPaths(source.tree), series);
  const creditNoteNumbers = repo.issued
    .filter((i) => i.doc.kind === 'credit-note')
    .map((i) => i.doc.number);

  const ids = new Set(draft.time_entries ?? []);
  const months = new Set(repo.time.filter((t) => ids.has(t.id)).map((t) => t.date.slice(0, 7)));
  const timeFiles: Record<string, string> = {};
  for (const month of months) {
    const text = await source.read(timePath(month));
    if (text !== null) timeFiles[timePath(month)] = text;
  }
  const clientLog = await source.read(`${clientDir(client.slug)}/log.actionlog.md`);

  return {
    ok: true,
    value: {
      draft,
      profile,
      client,
      existingNumbers,
      creditNoteNumbers,
      issueDate,
      timeFiles,
      clientLog,
      now,
    },
  };
}

/** What issuing would produce, for display; nothing is written. */
export async function previewIssue(
  source: IssueSource,
  draftId: Ulid,
  issueDate: string,
  now: Date,
): Promise<Result<IssuePreview>> {
  const ctx = await buildIssueContext(source, draftId, issueDate, now);
  if (!ctx.ok) return ctx;
  const r = issue(ctx.value);
  if (!r.ok) return r;
  const d = r.value.document;
  return {
    ok: true,
    value: {
      number: d.number,
      kind: d.kind,
      client: d.buyer.name,
      ...(d.corrects ? { corrects: d.corrects } : {}),
      issueDate: d.issue_date,
      ...(d.due_date ? { dueDate: d.due_date } : {}),
      currency: d.currency ?? ctx.value.profile.currency,
      lines: d.lines,
      totals: d.totals,
      legalNotes: d.legal_notes,
      warnings: issueWarnings(source.repo, d, localDate(now)),
    },
  };
}

/**
 * Not refusals, but worth a second look (ruling Q12 and over-crediting): an issue date before the
 * latest one of the series in that year, one far in the future, and a credit note larger than the
 * part of the invoice not yet credited.
 */
const issueWarnings = (repo: BusinessRepo, d: Issued, today: string): string[] => {
  const warnings: string[] = [];
  const series = seriesOf(d.kind);
  const year = d.issue_date.slice(0, 4);
  const latest = repo.issued
    .map((i) => i.doc)
    .filter((o) => seriesOf(o.kind) === series && o.issue_date.slice(0, 4) === year)
    .reduce<Issued | null>((a, o) => (a && a.issue_date >= o.issue_date ? a : o), null);
  if (latest && latest.issue_date > d.issue_date) {
    warnings.push(
      `The issue date is out of order with ${latest.number} (${latest.issue_date}). Issue anyway?`,
    );
  }
  if (d.issue_date > addDays(today, FUTURE_DAYS)) {
    warnings.push('The issue date is in the future. Issue anyway?');
  }
  if (d.kind === 'credit-note') {
    const invoice = repo.issued.find((i) => i.doc.number === d.corrects)?.doc;
    if (invoice) {
      const credited = repo.issued
        .filter((i) => i.doc.kind === 'credit-note' && i.doc.corrects === invoice.number)
        .reduce((n, i) => n + i.doc.totals.gross, 0);
      const over = d.totals.gross - (invoice.totals.gross - credited);
      if (over > 0) {
        warnings.push(
          `This credit note is ${money(over, d.currency ?? invoice.currency ?? 'EUR')} more than the amount still open on ${invoice.number}.`,
        );
      }
    }
  }
  return warnings;
};

/**
 * Paths under `offers/` or `invoices/` that `changes` would delete, overwrite, or write under a
 * number some frozen file (yaml, pdf, xml or sha256) already holds. Issued files are frozen, so any
 * hit means the change must not be committed.
 */
export const frozenClashes = (
  tree: IssueSource['tree'],
  changes: Readonly<FileChanges>,
): string[] => {
  const paths = blobPaths(tree);
  const existing = new Set(paths);
  const taken = {
    invoice: new Set(takenNumbers(paths, 'invoice')),
    offer: new Set(takenNumbers(paths, 'offer')),
  };
  return Object.entries(changes)
    .filter(([path, content]) => {
      const f = frozenNumber(path);
      if (!f) return false;
      if (content === null || existing.has(path)) return true;
      return classifyBusinessPath(path).kind === 'issued' && taken[f.series].has(f.number);
    })
    .map(([path]) => path);
};

/**
 * The commit for issuing, built from fresh state inside `writeBusiness`: a number taken since the
 * preview yields the next one, and a frozen file is never overwritten.
 */
export async function issueFromFresh(
  fresh: IssueSource,
  draftId: Ulid,
  issueDate: string,
  now: Date,
): Promise<Result<{ changes: FileChanges; message: string; number: string }>> {
  const ctx = await buildIssueContext(fresh, draftId, issueDate, now);
  if (!ctx.ok) return ctx;
  const r = issue(ctx.value);
  if (!r.ok) return r;
  const clashes = frozenClashes(fresh.tree, r.value.changes);
  if (clashes.length > 0) {
    return refuse('number', `${clashes.join(', ')} already exists; nothing was written.`);
  }
  return {
    ok: true,
    value: {
      changes: r.value.changes,
      message: r.value.commitMessage,
      number: r.value.document.number,
    },
  };
}
