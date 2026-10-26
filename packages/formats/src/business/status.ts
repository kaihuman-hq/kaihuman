import type { DocEvent, Issued, Payment } from './records.js';

export type InvoiceStatus = {
  state: 'issued' | 'sent' | 'part-paid' | 'paid' | 'overdue' | 'credited';
  /** Minor units still to pay; never negative. */
  open: number;
  paid: number;
  credited: number;
  /** Minor units received or credited beyond the gross; 0 when nothing is overpaid. */
  overpaid: number;
};

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/**
 * Status is derived, never stored. Callers may pass unfiltered lists: payments for other invoices
 * and credit notes that correct other invoices are ignored here.
 */
export const deriveInvoiceStatus = (
  invoice: Issued,
  payments: readonly Payment[],
  creditNotes: readonly Issued[],
  events: readonly DocEvent[],
  today: string,
): InvoiceStatus => {
  const gross = invoice.totals.gross;
  const paid = sum(payments.filter((p) => p.invoice === invoice.number).map((p) => p.amount));
  const credited = sum(
    creditNotes.filter((c) => c.corrects === invoice.number).map((c) => c.totals.gross),
  );
  const open = Math.max(0, gross - paid - credited);
  const overpaid = Math.max(0, paid + credited - gross);
  const base = { open, paid, credited, overpaid };
  if (credited >= gross) return { state: 'credited', ...base };
  if (open === 0) return { state: 'paid', ...base };
  if (invoice.due_date !== undefined && invoice.due_date < today) {
    return { state: 'overdue', ...base };
  }
  if (paid > 0) return { state: 'part-paid', ...base };
  const sent = events.some(
    (e) => e.doc === invoice.number && (e.type === 'sent' || e.type === 'downloaded'),
  );
  return { state: sent ? 'sent' : 'issued', ...base };
};

export type OfferStatus = 'issued' | 'sent' | 'accepted' | 'declined' | 'expired' | 'superseded';

export const deriveOfferStatus = (
  offer: Issued,
  events: readonly DocEvent[],
  offers: readonly Issued[],
  today: string,
): OfferStatus => {
  if (offers.some((o) => o.supersedes === offer.number)) return 'superseded';
  const mine = events.filter((e) => e.doc === offer.number);
  const decision = mine
    .filter((e) => e.type === 'accepted' || e.type === 'declined')
    .reduce<DocEvent | null>((latest, e) => (latest && latest.at > e.at ? latest : e), null);
  if (decision) return decision.type === 'accepted' ? 'accepted' : 'declined';
  if (offer.valid_until !== undefined && offer.valid_until < today) return 'expired';
  return mine.some((e) => e.type === 'sent' || e.type === 'downloaded') ? 'sent' : 'issued';
};
