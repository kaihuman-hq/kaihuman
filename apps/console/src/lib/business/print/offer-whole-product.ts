import {
  AcceptanceBlock,
  baseCss,
  type Formatter,
  type Labels,
  Letterhead,
  type LineItem,
  type OfferData,
  offerSchema,
  PageFooter,
  Prose,
  type RenderContext,
  VatNote,
} from '@getnarro/pdf';
import { type ComponentChild, Fragment, h } from 'preact';

/**
 * The built-in offer, changed for a client who buys the whole product (a port of the user's own
 * narro template, so no template code is read from the repository):
 *  - no validity date and no offer or customer number are printed (the schema still wants a
 *    number and a validity, so placeholders are supplied and never shown);
 *  - one price column, and the net sum with a note ("zzgl. gesetzlicher USt.") instead of VAT rows;
 *  - the overview: the block from the heading `summaryHeading` ("Teil 1") to the next rule is set
 *    compact in `.summary` so it fits one page. Markdown has no classes, hence the heading marks it;
 *  - a price ladder: items with a negative price are credits. They follow a "Summe der
 *    Einzelpreise" row, each lowers the running sum, and the sum after every credit but the last is
 *    shown (`labels.steps`). The list prices stay visible and the reduction is computed, not typed;
 *  - a rule (`---`) in the body is a page break, a heading stays with its text, a table row is never
 *    split and the items table moves to the next page whole when it does not fit.
 */

export type Wording = {
  /** The running sum after the first, second, ... credit; the last credit's sum is `price`. */
  steps: string[];
  /** Sum after a credit beyond `steps`. */
  subtotal: string;
  price: string;
  vatNote: string;
  listSum: string;
  priceColumn: string;
  /** The total without credits. */
  netTotal: string;
};

export const DEFAULT_WORDING: Wording = {
  steps: ['Komplettpreis (ohne Rahmenvertrag)'],
  subtotal: 'Zwischensumme (netto)',
  price: 'Ihr Preis mit Rahmenvertrag (netto)',
  vatNote: 'zzgl. gesetzlicher USt.',
  listSum: 'Summe der Einzelpreise',
  priceColumn: 'Preis (netto)',
  netTotal: 'Gesamtbetrag (netto)',
};
export const DEFAULT_SUMMARY_HEADING = 'Teil 1';

export type WholeProductData = OfferData & { wording: Wording; summaryHeading: string };
type Ctx = RenderContext<WholeProductData>;

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

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wraps the overview (heading `heading` up to the next `<hr>`) in `.summary`. */
export const withSummary = (html: string, heading: string): string =>
  html.replace(
    new RegExp(`(<h2>${escapeRegExp(heading)}(?![\\w]).*?)(<hr\\s*/?>)`, 's'),
    '<div class="summary">$1</div>$2',
  );

export type TotalsLine = {
  kind: 'first' | 'credit' | 'step' | 'grand';
  label: string;
  cents: number;
};

/**
 * The rows below the numbered items: with credits the ladder from the list prices down to the
 * price; without, net, discount and the net sum. VAT is stated as a note, not computed here.
 */
export function totalsLines(ctx: Pick<Ctx, 'data' | 'totals' | 'fmt' | 'labels'>): TotalsLine[] {
  const { data, totals, fmt, labels } = ctx;
  const w = data.wording;
  const credits = data.items.filter((item) => item.priceCents < 0);
  if (credits.length > 0) {
    const listCents = data.items.reduce((sum, item) => sum + Math.max(item.priceCents, 0), 0);
    let running = listCents;
    return [
      { kind: 'first', label: w.listSum, cents: listCents },
      ...credits.flatMap((credit, i): TotalsLine[] => {
        running += credit.priceCents;
        const last = i === credits.length - 1;
        return [
          { kind: 'credit', label: credit.description, cents: credit.priceCents },
          last
            ? { kind: 'grand', label: w.price, cents: running }
            : { kind: 'step', label: w.steps[i] ?? w.subtotal, cents: running },
        ];
      }),
    ];
  }
  const discount = data.discount;
  return [
    { kind: 'first', label: labels.net, cents: totals.netCents },
    ...(discount && totals.discountCents !== 0
      ? [
          {
            kind: 'credit' as const,
            label:
              'percent' in discount
                ? `${labels.discount} ${fmt.percent(discount.percent)}`
                : labels.discount,
            cents: -totals.discountCents,
          },
        ]
      : []),
    { kind: 'grand', label: w.netTotal, cents: totals.netCents - totals.discountCents },
  ];
}

const ROW_CLASS: Record<TotalsLine['kind'], string> = {
  first: 'totals-row totals-first',
  credit: 'totals-row discount-row',
  step: 'totals-row step-total',
  grand: 'totals-row grand-total',
};

const totalsRow = (line: TotalsLine, fmt: Formatter, key: number) =>
  h(
    'tr',
    { className: ROW_CLASS[line.kind], key },
    h('td', { className: 'totals-spacer' }),
    h('td', { className: 'totals-label' }, line.label),
    h(
      'td',
      { className: 'num totals-amount' },
      line.cents < 0 ? `−${fmt.money(-line.cents)}` : fmt.money(line.cents),
    ),
  );

function itemsTable(ctx: Ctx): ComponentChild {
  const { data, totals, fmt, labels } = ctx;
  // Credits are rows of the ladder below the items, not numbered items.
  const rows: ComponentChild[] = data.items.flatMap((item: LineItem, i: number) =>
    item.priceCents < 0
      ? []
      : [
          h(
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
        ],
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
        h('th', { className: 'num' }, data.wording.priceColumn),
      ),
    ),
    rows.length > 0 && h('tbody', null, rows),
    h(
      'tbody',
      { className: 'tail' },
      last,
      ...totalsLines(ctx).map((line, i) => totalsRow(line, fmt, i)),
      h(
        'tr',
        { className: 'totals-row vat-note-row', key: 'vat-note' },
        h('td', { className: 'totals-spacer' }),
        h('td', { className: 'totals-label', colSpan: 2 }, data.wording.vatNote),
      ),
    ),
  );
}

type ZodLikeIssue = { code: string; path: (string | number)[]; message: string; keys?: string[] };
type SafeParse =
  | { success: true; data: WholeProductData }
  | { success: false; error: { issues: ZodLikeIssue[] } };

const WORDING_KEYS = Object.keys(DEFAULT_WORDING) as (keyof Wording)[];

/** `labels:` overrides and `summaryHeading:`; narro's offer schema checks the rest. */
function readExtras(input: Record<string, unknown>, issues: ZodLikeIssue[]) {
  const fail = (path: (string | number)[], message: string) =>
    issues.push({ code: 'custom', path, message });
  const wording: Wording = { ...DEFAULT_WORDING, steps: [...DEFAULT_WORDING.steps] };
  const raw = input.labels;
  if (raw !== undefined) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      fail(['labels'], 'expected a mapping');
    } else {
      for (const [key, value] of Object.entries(raw)) {
        if (!WORDING_KEYS.includes(key as keyof Wording)) {
          fail(['labels', key], `unknown key; use ${WORDING_KEYS.join(', ')}`);
        } else if (key === 'steps') {
          if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
            wording.steps = value as string[];
          } else fail(['labels', key], 'expected a list of texts');
        } else if (typeof value === 'string' && value !== '') {
          (wording as Record<string, unknown>)[key] = value;
        } else fail(['labels', key], 'expected a text');
      }
    }
  }
  const heading = input.summaryHeading ?? DEFAULT_SUMMARY_HEADING;
  if (typeof heading !== 'string' || heading === '') fail(['summaryHeading'], 'expected a text');
  return {
    wording,
    summaryHeading: typeof heading === 'string' ? heading : DEFAULT_SUMMARY_HEADING,
  };
}

const title = ({ data, labels }: Pick<Ctx, 'data' | 'labels'>) => data.subject ?? labels.offer;

const render = (ctx: Ctx) => {
  const { data, labels, fmt } = ctx;
  const meta: ([string, string] | undefined)[] = [
    [labels.date, fmt.date(data.date)],
    data.client.vatId ? [labels.clientVatId, data.client.vatId] : undefined,
  ];
  return h(
    Fragment,
    null,
    h(Letterhead, { ctx, documentTitle: title(ctx), meta } as never),
    h(
      'main',
      null,
      h('h1', { className: 'subject' }, data.subject ?? title(ctx)),
      h(Prose, { html: withSummary(ctx.body.before, data.summaryHeading) }),
      itemsTable(ctx),
      h(VatNote, { ctx } as never),
      h(Prose, { html: ctx.body.after }),
      data.acceptance && h(AcceptanceBlock, { labels: labels as Labels }),
    ),
    h(PageFooter, { ctx } as never),
  );
};

export const offerWholeProduct = {
  name: 'offer-whole-product',
  schema: {
    safeParse: (input: unknown): SafeParse => {
      const issues: ZodLikeIssue[] = [];
      const { labels: _l, summaryHeading: _s, ...rest } = (input ?? {}) as Record<string, unknown>;
      const extras = readExtras((input ?? {}) as Record<string, unknown>, issues);
      const inner = offerSchema.safeParse({ validDays: 1, number: '-', ...rest });
      if (!inner.success) issues.push(...(inner.error.issues as unknown as ZodLikeIssue[]));
      if (issues.length > 0 || !inner.success) return { success: false, error: { issues } };
      return { success: true, data: { ...inner.data, ...extras } };
    },
  },
  title,
  css: `${baseCss}\n${PAGE_CSS}`,
  render,
};
