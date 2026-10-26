import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import type { Ulid } from './ids.js';
import type { DocEvent, Issued, Payment } from './records.js';
import { deriveInvoiceStatus, deriveOfferStatus } from './status.js';
import { validateIssued } from './validate.js';
import { parseYaml } from './yaml.js';

const load = (path: string): Issued => {
  const parsed = parseYaml(loadFixtureRepo().get(`.kh/business/${path}`) ?? '');
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const r = validateIssued(parsed.value);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

const inv = load('invoices/2026/RE-2026-0001.yaml');
const offer = load('offers/2026/AN-2026-001.yaml');
const offer2: Issued = { ...offer, number: 'AN-2026-002' };

const creditFor = (i: Issued, gross = i.totals.gross): Issued => ({
  ...i,
  number: 'RE-2026-0002',
  kind: 'credit-note',
  type_code: 381,
  corrects: i.number,
  totals: { ...i.totals, gross },
});
const pay = (amount: number, invoice = inv.number): Payment => ({
  id: '01M5KA3Q00W16BGNTZ49EKRX28' as Ulid,
  date: '2026-11-02',
  invoice,
  amount,
});
const event = (doc: string, type: DocEvent['type'], at = '2026-10-27T10:00:00Z'): DocEvent => ({
  id: '01M5KA3Q00W16BGNTZ49EKRX29' as Ulid,
  at,
  doc,
  type,
});

describe('deriveInvoiceStatus', () => {
  it('is issued, then sent, once an event exists', () => {
    expect(deriveInvoiceStatus(inv, [], [], [], '2026-11-01')).toMatchObject({
      state: 'issued',
      open: 100138,
      paid: 0,
      credited: 0,
      overpaid: 0,
    });
    expect(deriveInvoiceStatus(inv, [], [], [event(inv.number, 'sent')], '2026-11-01').state).toBe(
      'sent',
    );
    expect(
      deriveInvoiceStatus(inv, [], [], [event(inv.number, 'downloaded')], '2026-11-01').state,
    ).toBe('sent');
  });

  it('ignores events for other documents', () => {
    expect(
      deriveInvoiceStatus(inv, [], [], [event('RE-2026-0009', 'sent')], '2026-11-01').state,
    ).toBe('issued');
  });

  it('is part-paid, and overdue once the due date has passed', () => {
    expect(deriveInvoiceStatus(inv, [pay(50000)], [], [], '2026-11-01')).toMatchObject({
      state: 'part-paid',
      open: 50138,
    });
    expect(deriveInvoiceStatus(inv, [pay(50000)], [], [], '2026-11-09').state).toBe('part-paid');
    expect(deriveInvoiceStatus(inv, [pay(50000)], [], [], '2026-11-10').state).toBe('overdue');
    expect(deriveInvoiceStatus(inv, [], [], [], '2026-11-10').state).toBe('overdue');
  });

  it('is paid with open 0 and overpaid > 0 when the payment is too large', () => {
    expect(deriveInvoiceStatus(inv, [pay(110000)], [], [], '2026-11-10')).toMatchObject({
      state: 'paid',
      open: 0,
      paid: 110000,
      overpaid: 9862,
    });
  });

  it('is paid with overpaid 0 on an exact payment, also across several payments', () => {
    expect(deriveInvoiceStatus(inv, [pay(50000), pay(50138)], [], [], '2026-11-10')).toMatchObject({
      state: 'paid',
      open: 0,
      overpaid: 0,
    });
  });

  it('is credited once credit notes cover the gross', () => {
    expect(deriveInvoiceStatus(inv, [], [creditFor(inv)], [], '2026-12-01')).toMatchObject({
      state: 'credited',
      credited: 100138,
      open: 0,
    });
    expect(
      deriveInvoiceStatus(inv, [pay(100138)], [creditFor(inv)], [], '2026-12-01'),
    ).toMatchObject({
      state: 'credited',
      overpaid: 100138,
    });
  });

  it('counts a partial credit against what is open', () => {
    expect(deriveInvoiceStatus(inv, [], [creditFor(inv, 38)], [], '2026-11-01')).toMatchObject({
      state: 'issued',
      credited: 38,
      open: 100100,
    });
  });

  it('ignores payments and credit notes of other invoices', () => {
    const other = { ...creditFor(inv), corrects: 'RE-2026-0009' };
    expect(
      deriveInvoiceStatus(inv, [pay(100138, 'RE-2026-0009')], [other], [], '2026-11-01'),
    ).toMatchObject({ state: 'issued', paid: 0, credited: 0 });
  });
});

describe('deriveOfferStatus', () => {
  it('is superseded when another offer replaces it, before anything else', () => {
    expect(
      deriveOfferStatus(
        offer,
        [event(offer.number, 'accepted')],
        [{ ...offer2, supersedes: offer.number }],
        '2026-10-01',
      ),
    ).toBe('superseded');
  });

  it('uses the latest accepted or declined event', () => {
    const events = [
      event(offer.number, 'declined', '2026-09-20T09:00:00Z'),
      event(offer.number, 'accepted', '2026-09-21T09:00:00Z'),
    ];
    expect(deriveOfferStatus(offer, events, [], '2027-01-01')).toBe('accepted');
    expect(deriveOfferStatus(offer, [...events].reverse(), [], '2027-01-01')).toBe('accepted');
    expect(deriveOfferStatus(offer, [event(offer.number, 'declined')], [], '2026-09-20')).toBe(
      'declined',
    );
  });

  it('expires after valid_until, not on it', () => {
    expect(deriveOfferStatus(offer, [], [], '2027-01-01')).toBe('expired');
    expect(deriveOfferStatus(offer, [], [], '2026-10-15')).toBe('issued');
  });

  it('is sent after a sent event, and issued otherwise', () => {
    expect(deriveOfferStatus(offer, [event(offer.number, 'sent')], [], '2026-10-01')).toBe('sent');
    expect(deriveOfferStatus(offer, [], [], '2026-10-01')).toBe('issued');
  });
});
