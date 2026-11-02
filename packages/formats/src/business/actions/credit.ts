import type { Ulid } from '../ids.js';
import type { FileChanges } from '../issue.js';
import type { Draft, Issued } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { deriveInvoiceStatus } from '../status.js';
import type { Result } from '../validate-kit.js';
import { saveDraft } from './drafts.js';

const refuse = (message: string) => ({
  ok: false as const,
  issues: [{ path: 'invoice', message }],
});

/**
 * The credit note draft for an invoice: its lines (editable before issuing), `corrects` set, no time
 * entries, because the time stays billed on the original invoice.
 */
export const creditNoteDraft = (invoice: Issued, id: Ulid): Draft => {
  const buyerReference = invoice.buyer_reference ?? invoice.buyer.buyer_reference;
  return {
    id,
    kind: 'credit-note',
    client: invoice.client,
    ...(invoice.project ? { project: invoice.project } : {}),
    ...(invoice.currency ? { currency: invoice.currency } : {}),
    ...(invoice.language ? { language: invoice.language } : {}),
    ...(invoice.service_period ? { service_period: { ...invoice.service_period } } : {}),
    ...(invoice.service_date ? { service_date: invoice.service_date } : {}),
    lines: invoice.lines.map((l) => ({ ...l })),
    corrects: invoice.number,
    ...(buyerReference ? { buyer_reference: buyerReference } : {}),
  };
};

/** Saves a credit note draft for `number`; refuses a fully credited invoice and a second open draft. */
export const creditInvoice = (
  repo: BusinessRepo,
  number: string,
  id: Ulid,
  today: string,
): Result<{ changes: FileChanges; message: string }> => {
  const invoice = repo.issued.find((i) => i.doc.number === number)?.doc;
  if (!invoice || invoice.kind !== 'invoice') return refuse(`unknown invoice "${number}"`);
  const creditNotes = repo.issued.filter((i) => i.doc.kind === 'credit-note').map((i) => i.doc);
  const status = deriveInvoiceStatus(invoice, repo.payments, creditNotes, repo.events, today);
  if (status.state === 'credited') return refuse(`${number} is already fully credited.`);
  if (repo.drafts.some((d) => d.kind === 'credit-note' && d.corrects === number)) {
    return refuse(`A credit note draft for ${number} already exists.`);
  }
  return saveDraft(repo, creditNoteDraft(invoice, id));
};
