import {
  AcceptanceBlock,
  defineTemplate,
  Letterhead,
  PageFooter,
  Prose,
  resolveTemplate,
  VatNote,
} from '@getnarro/pdf';
import { Fragment, createElement as h } from 'react';

// The built-in offer with changes, because the client buys the whole product:
//  - no validity date: the built-in schema demands `validUntil` or `validDays` and its
//    letterhead prints "Gültig bis";
//  - no offer number and no customer number, in the letterhead or the page header (the
//    schema still demands a number, so a placeholder is supplied and never printed);
//  - one price column instead of quantity, unit price and amount, and the net sum with
//    a note "zzgl. gesetzlicher USt." instead of VAT rows;
//  - the overview page: the block from the heading "Teil 1" to the next rule is wrapped in
//    `.summary` and set compact, so the whole overview (all prices, the next steps and the
//    framework contract) fits one page. Markdown has no classes, hence the heading marks it;
//  - a price ladder: items with a negative price are credits. They are not numbered; they
//    follow a "Summe der Einzelpreise" row, each one lowers the running sum, and the
//    sum after every credit but the last is shown (STEP_LABELS). So the list prices stay
//    visible and the offer's reduction is computed, not typed;
//  - a horizontal rule (`---`) in the body is a page break, a heading stays with the text
//    after it, a row of a table in the letter is never cut by a page break, and the items
//    table never splits across pages (it moves to the next page
//    whole when it does not fit, so keep the price section short enough for one page).
// Letterhead, body, VAT note, signature block and footer are the built-in ones.
const offer = await resolveTemplate('offer');

const PAGE_CSS = `
.prose hr { border: 0; height: 0; margin: 0; break-after: page; }
.prose h2, .prose h3 { break-after: avoid; }
.prose tr { break-inside: avoid; }
.items { break-inside: avoid; }
.items td { padding-top: 1.7mm; padding-bottom: 1.7mm; }
.summary { break-inside: avoid; }
.summary h2 { margin-top: 0; }
.summary h3 { margin: 3.2mm 0 1mm; font-size: 9.5pt; }
.summary p { margin: 0 0 1.4mm; font-size: 8.6pt; }
.summary table { width: 100%; margin: 0 0 1mm; font-size: 8.3pt; }
.summary th, .summary td { padding: 0.55mm 2mm 0.55mm 0; vertical-align: top; }
.summary th:first-child, .summary td:first-child { white-space: nowrap; }
.summary th:last-child, .summary td:last-child { padding-right: 0; white-space: nowrap; }
.items .step-total .totals-label, .items .step-total .totals-amount {
  border-top: 0.5pt solid var(--rule);
  font-weight: 600;
  color: var(--ink);
}
`;

const title = ({ data, labels }) => data.subject ?? labels.offer;

const SUMMARY = /(<h2>Teil 1\b.*?)(<hr\s*\/?>)/s;
const withSummary = (html) => html.replace(SUMMARY, '<div class="summary">$1</div>$2');

// What the sum is called after the first, second, ... credit. The sum after the last credit
// is the price of the offer.
const STEP_LABELS = ['Komplettpreis (ohne Rahmenvertrag)'];
const PRICE_LABEL = 'Ihr Preis mit Rahmenvertrag (netto)';

const totalsRow = (className, label, amount) =>
  h(
    'tr',
    { className, key: `${className}:${label}` },
    h('td', { className: 'totals-spacer' }),
    h('td', { className: 'totals-label' }, label),
    h('td', { className: 'num totals-amount' }, amount),
  );

// The rows below the numbered items: with credits the ladder from the list prices down to the
// price; without, net, discount and the net sum. The VAT is not computed here but stated as a note.
function totalsRows({ data, totals, fmt, labels }) {
  const vatNote = h(
    'tr',
    { className: 'totals-row vat-note-row', key: 'vat-note' },
    h('td', { className: 'totals-spacer' }),
    h('td', { className: 'totals-label', colSpan: 2 }, 'zzgl. gesetzlicher USt.'),
  );
  const credits = data.items.filter((item) => item.priceCents < 0);
  if (credits.length > 0) {
    const listCents = data.items.reduce((sum, item) => sum + Math.max(item.priceCents, 0), 0);
    let running = listCents;
    const ladder = credits.flatMap((credit, i) => {
      running += credit.priceCents;
      const last = i === credits.length - 1;
      return [
        totalsRow(
          'totals-row discount-row',
          credit.description,
          `−${fmt.money(-credit.priceCents)}`,
        ),
        totalsRow(
          last ? 'totals-row grand-total' : 'totals-row step-total',
          last ? PRICE_LABEL : (STEP_LABELS[i] ?? 'Zwischensumme (netto)'),
          fmt.money(running),
        ),
      ];
    });
    return [
      totalsRow('totals-row totals-first', 'Summe der Einzelpreise', fmt.money(listCents)),
      ...ladder,
      vatNote,
    ];
  }
  const discount = data.discount;
  return [
    totalsRow('totals-row totals-first', labels.net, fmt.money(totals.netCents)),
    discount &&
      totals.discountCents !== 0 &&
      totalsRow(
        'totals-row discount-row',
        'percent' in discount
          ? `${labels.discount} ${fmt.percent(discount.percent)}`
          : labels.discount,
        `−${fmt.money(totals.discountCents)}`,
      ),
    totalsRow(
      'totals-row grand-total',
      'Gesamtbetrag (netto)',
      fmt.money(totals.netCents - totals.discountCents),
    ),
    vatNote,
  ];
}

function itemsTable(ctx) {
  const { data, totals, fmt, labels } = ctx;
  // Credits are rows of the ladder below the items, not numbered items.
  const rows = data.items.flatMap((item, i) =>
    item.priceCents < 0
      ? []
      : h(
          'tr',
          { className: 'item', key: i },
          h('td', { className: 'pos' }, i + 1),
          h(
            'td',
            { className: 'description' },
            h('div', null, item.description),
            item.details && h('div', { className: 'details' }, item.details),
          ),
          h('td', { className: 'num' }, fmt.money(totals.lines[i]?.netCents ?? 0)),
        ),
  );
  const last = rows.pop();
  return h(
    'table',
    { className: 'items' },
    h(
      'colgroup',
      null,
      h('col', { className: 'col-pos' }),
      h('col', { className: 'col-description' }),
      h('col', { className: 'col-amount' }),
    ),
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { className: 'pos' }, labels.position),
        h('th', null, labels.description),
        h('th', { className: 'num' }, 'Preis (netto)'),
      ),
    ),
    rows.length > 0 && h('tbody', null, rows),
    h('tbody', { className: 'tail' }, last, ...totalsRows(ctx)),
  );
}

export default defineTemplate({
  name: 'offer-whole-product',
  schema: {
    safeParse: (input) => offer.schema.safeParse({ validDays: 1, number: '-', ...input }),
  },
  title,
  css: `${offer.css}\n${PAGE_CSS}`,
  render: (ctx) => {
    const { data, labels, fmt } = ctx;
    return h(
      Fragment,
      null,
      h(Letterhead, {
        ctx,
        documentTitle: title(ctx),
        meta: [
          [labels.date, fmt.date(data.date)],
          data.client.vatId ? [labels.clientVatId, data.client.vatId] : undefined,
        ],
      }),
      h(
        'main',
        null,
        h('h1', { className: 'subject' }, data.subject ?? title(ctx)),
        h(Prose, { html: withSummary(ctx.body.before) }),
        itemsTable(ctx),
        h(VatNote, { ctx }),
        h(Prose, { html: ctx.body.after }),
        data.acceptance && h(AcceptanceBlock, { labels }),
      ),
      h(PageFooter, { ctx }),
    );
  },
});
