import { appendAction, parseActionLog, serializeActionLog } from '../action-log.js';
import { parseJsonl, replaceJsonlLines } from './jsonl.js';
import { jurisdictionFor } from './jurisdiction.js';
import { formatMinor } from './money.js';
import { DEFAULT_NUMBERING, nextNumber, parseNumber, seriesOf } from './numbering.js';
import { clientDir, draftPath, issuedPath } from './paths.js';
import {
  type BusinessProfile,
  type Client,
  type Draft,
  type Issued,
  KEY_ORDER,
  type Party,
} from './records.js';
import { computeTotals } from './totals.js';
import { validateDraft, validateTimeEntry } from './validate.js';
import { date, type Issue, type Result } from './validate-kit.js';
import { stringifyYaml } from './yaml.js';

/** Repo-root path → new content; `null` deletes the file. */
export type FileChanges = Record<string, string | null>;

export type IssueContext = {
  draft: Draft;
  profile: BusinessProfile;
  client: Client;
  /** Numbers already issued in this document's series, any year. */
  existingNumbers: readonly string[];
  /**
   * Which of `existingNumbers` are credit notes. A credit note may correct only an invoice, so
   * `corrects` naming one of these is refused. Omitted means none are.
   */
  creditNoteNumbers?: readonly string[];
  issueDate: string;
  /** Path → content for the months of `draft.time_entries`. */
  timeFiles: Readonly<Record<string, string>>;
  /** Current `log.actionlog.md` of the client, or null when there is none yet. */
  clientLog: string | null;
  now: Date;
};

const problem = (path: string, message: string): Issue => ({
  path,
  message: `${path}: ${message}`,
});

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const without = <T extends object>(value: T, key: string): Omit<T, never> =>
  Object.fromEntries(Object.entries(value).filter(([k]) => k !== key)) as T;

const seller = (p: BusinessProfile): Party => ({
  name: p.name,
  address: p.address,
  ...(p.vat_id ? { vat_id: p.vat_id } : {}),
  ...(p.tax_number ? { tax_number: p.tax_number } : {}),
  contact: p.contact,
  ...(p.electronic_address ? { electronic_address: p.electronic_address } : {}),
});

/** A party's contact has no `role`; that stays on the client. */
const partyContact = (c: Client['contacts'][number]): NonNullable<Party['contact']> => ({
  name: c.name,
  ...(c.email ? { email: c.email } : {}),
  ...(c.phone ? { phone: c.phone } : {}),
});

const buyer = (c: Client, draft: Draft): Party => {
  const contact = c.contacts[0];
  const reference = draft.buyer_reference ?? c.buyer_reference;
  return {
    name: c.name,
    address: c.address,
    ...(c.vat_id ? { vat_id: c.vat_id } : {}),
    ...(contact ? { contact: partyContact(contact) } : {}),
    ...(c.electronic_address ? { electronic_address: c.electronic_address } : {}),
    ...(reference ? { buyer_reference: reference } : {}),
    ...(c.leitweg_id ? { leitweg_id: c.leitweg_id } : {}),
  };
};

/** Marks the listed time entries as billed; reports entries that are missing or already billed. */
const billTimeEntries = (
  draft: Draft,
  number: string,
  timeFiles: Readonly<Record<string, string>>,
): { changes: FileChanges; issues: Issue[] } => {
  const ids = draft.time_entries ?? [];
  const found = new Map<string, { file: string; invoice: string | undefined; client: string }>();
  for (const [file, text] of Object.entries(timeFiles)) {
    for (const { value } of parseJsonl(text, (raw) => validateTimeEntry(raw)).entries) {
      found.set(value.id, { file, invoice: value.invoice, client: value.client });
    }
  }
  const issues: Issue[] = [];
  ids.forEach((id, i) => {
    const entry = found.get(id);
    if (!entry) issues.push(problem(`time_entries[${i}]`, `time entry ${id} was not found`));
    else if (entry.client !== draft.client) {
      issues.push(
        problem(
          `time_entries[${i}]`,
          `time entry ${id} belongs to ${entry.client}, not ${draft.client}`,
        ),
      );
    } else if (entry.invoice !== undefined) {
      issues.push(
        problem(`time_entries[${i}]`, `time entry ${id} is already billed on ${entry.invoice}`),
      );
    }
  });
  const changes: FileChanges = {};
  for (const file of new Set([...found.values()].map((e) => e.file))) {
    const text = timeFiles[file] as string;
    const next = replaceJsonlLines(
      text,
      (raw) =>
        typeof raw.id === 'string' && ids.includes(raw.id as never)
          ? { ...raw, invoice: number }
          : null,
      KEY_ORDER.time,
    );
    if (next !== text) changes[file] = next;
  }
  return { changes, issues };
};

const logText = (draft: Draft, number: string, gross: number, currency: string): string =>
  draft.kind === 'offer'
    ? `Issued offer ${number}`
    : draft.kind === 'credit-note'
      ? `Issued credit note ${number} for ${draft.corrects}`
      : `Issued ${number} (${formatMinor(gross, currency)} ${currency})`;

/**
 * Pure: everything it needs is in `ctx`; the caller writes `changes` in one commit. The action-log
 * timestamp is the local time of `ctx.now`, matching the action-log convention.
 */
export const issue = (
  ctx: IssueContext,
): Result<{ document: Issued; changes: FileChanges; commitMessage: string }> => {
  const { draft, profile, client, issueDate } = ctx;
  const rules = jurisdictionFor(profile.jurisdiction);
  const issues: Issue[] = [];

  const valid = validateDraft(draft);
  if (!valid.ok) issues.push(...valid.issues);
  issues.push(...rules.checkIssue(draft, profile, client));
  date(issueDate, 'issue_date', issues);
  if (draft.kind === 'offer' && (draft.time_entries?.length ?? 0) > 0) {
    issues.push(problem('time_entries', 'an offer cannot bill time entries'));
  }
  if (draft.client !== client.slug) {
    issues.push(problem('client', `draft is for ${draft.client}, not ${client.slug}`));
  }
  if (
    draft.kind === 'credit-note' &&
    !(draft.corrects && ctx.existingNumbers.includes(draft.corrects))
  ) {
    issues.push(problem('corrects', `${draft.corrects ?? ''} is not an issued invoice`));
  } else if (
    draft.kind === 'credit-note' &&
    ctx.creditNoteNumbers?.includes(draft.corrects ?? '')
  ) {
    issues.push(problem('corrects', `${draft.corrects} is a credit note; correct the invoice`));
  }

  const series = seriesOf(draft.kind);
  const pattern = profile.numbering?.[series] ?? DEFAULT_NUMBERING[series];
  const year = Number(issueDate.slice(0, 4));
  const number = nextNumber(pattern, year, ctx.existingNumbers);
  const taken = parseNumber(pattern, number);
  const clash = ctx.existingNumbers.some((n) => {
    const p = parseNumber(pattern, n);
    return n === number || (taken && p && p.year === taken.year && p.seq === taken.seq);
  });
  if (clash)
    issues.push(problem('number', `${number} already exists; check numbering in business.yaml`));
  const billed = billTimeEntries(draft, number, ctx.timeFiles);
  issues.push(...billed.issues);
  if (issues.length > 0) return { ok: false, issues };

  const currency = draft.currency ?? client.currency ?? profile.currency;
  const isInvoice = draft.kind === 'invoice';
  const terms = draft.payment_terms_days ?? client.payment_terms_days ?? profile.payment_terms_days;
  const totals = computeTotals(draft.lines, rules.exemptionReasons(profile));
  const document: Issued = {
    ...(without(draft, 'id') as Omit<Draft, 'id'>),
    currency,
    language: draft.language ?? client.language ?? profile.language,
    number,
    draft_id: draft.id,
    type_code: draft.kind === 'offer' ? null : isInvoice ? 380 : 381,
    issue_date: issueDate,
    ...(isInvoice ? { due_date: addDays(issueDate, terms) } : {}),
    jurisdiction: profile.jurisdiction,
    seller: seller(profile),
    buyer: buyer(client, draft),
    ...(isInvoice
      ? {
          payment: {
            means_code: '58' as const,
            iban: profile.bank.iban,
            ...(profile.bank.bic ? { bic: profile.bank.bic } : {}),
            reference: number,
          },
        }
      : {}),
    totals,
    legal_notes: rules.legalNotes(draft, profile),
    retain_until: `${year + rules.retentionYears}-12-31`,
  };

  const logPath = `${clientDir(client.slug)}/log.actionlog.md`;
  // Same timestamp format as action-log.ts: appending to an empty log yields the formatted line.
  const added = appendAction(
    parseActionLog(''),
    logText(draft, number, totals.gross, currency),
    ['business'],
    ctx.now,
  );
  const line = `- ${added.entries[0]?.timestamp} ${added.entries[0]?.description}\n`;
  // An existing log is kept byte-for-byte; re-serializing would drop prose and custom headings.
  const logContent =
    ctx.clientLog === null
      ? `${serializeActionLog(added)}\n`
      : `${ctx.clientLog}${ctx.clientLog === '' || ctx.clientLog.endsWith('\n') ? '' : '\n'}${line}`;
  const changes: FileChanges = {
    [issuedPath(series, year, number)]: stringifyYaml(document, KEY_ORDER.issued),
    [draftPath(draft.id)]: null,
    ...billed.changes,
    [logPath]: logContent,
  };
  return {
    ok: true,
    value: { document, changes, commitMessage: `business: issue ${number} for ${client.slug}` },
  };
};
