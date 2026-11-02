import type { TreeItem } from '@kaihuman/core';
import {
  type BusinessRepo,
  classifyBusinessPath,
  clientDir,
  type DocKind,
  type FileChanges,
  type IssueContext,
  issue,
  type Line,
  type Result,
  seriesOf,
  type Totals,
  timePath,
  type Ulid,
} from '@kaihuman/formats/business';

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
};

export const issuedNotice = (number: string): string =>
  `Issued ${number}. Generate the PDF with your generator; kaihuman shows "PDF missing" until it is in the repo.`;

const refuse = (path: string, message: string) => ({
  ok: false as const,
  issues: [{ path, message }],
});

/** Round-trips through Date so 2026-02-31 is refused; an impossible month never reaches toISOString. */
export const isRealDate = (text: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(text);
};

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

const blobPaths = (source: IssueSource): string[] =>
  source.tree.filter((t) => t.type === 'blob').map((t) => t.path);

/**
 * Everything `issue()` needs, read from `source`. Numbers come from the tree's paths, not from the
 * parsed documents, so an issued file that fails validation still blocks its number.
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
  const paths = blobPaths(source);
  const existingNumbers = paths.flatMap((p) => {
    const c = classifyBusinessPath(p);
    return c.kind === 'issued' && c.doc === series ? [c.number] : [];
  });
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
    },
  };
}

/**
 * Paths under `offers/` or `invoices/` that `changes` would overwrite or delete. Issued files are
 * frozen, so any hit means the change must not be committed.
 */
export const frozenClashes = (
  tree: IssueSource['tree'],
  changes: Readonly<FileChanges>,
): string[] => {
  const existing = new Set(tree.filter((t) => t.type === 'blob').map((t) => t.path));
  return Object.entries(changes)
    .filter(([path, content]) => {
      const kind = classifyBusinessPath(path).kind;
      return (kind === 'issued' || kind === 'artifact') && (content === null || existing.has(path));
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
