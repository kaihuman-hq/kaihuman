import { VAT_CATEGORIES, type VatCategory } from '@kaihuman/formats/business';
import {
  EXEMPTION_HINT,
  emptyLine,
  type LineForm,
  previewTotals,
  UNITS,
} from '../../lib/business/draft-form';
import { a11y, INPUT } from './FormField';
import { money } from './money';

const LABEL = 'block text-[10px] text-[var(--los-fg-dim)] mb-1';

const withCurrent = (options: readonly string[], current: string): string[] =>
  options.includes(current) ? [...options] : [...options, current];

/** Line rows (stacked on a phone, one grid row on wide screens) with display-only live totals. */
export function LinesEditor(props: {
  lines: LineForm[];
  onChange: (lines: LineForm[]) => void;
  errors: Record<string, string>;
  currency: string;
  defaultVatRate: string;
  disabled?: boolean;
  /** Shown disabled, with the exemption hint. */
  unsupported?: readonly VatCategory[];
}) {
  const { lines, errors, currency, unsupported = [] } = props;
  const update = (i: number, patch: Partial<LineForm>) =>
    props.onChange(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const totals = previewTotals(lines);

  return (
    <fieldset class="space-y-3" disabled={props.disabled}>
      <legend class="text-xs font-bold mb-2">Lines</legend>
      {lines.map((line, i) => {
        const id = (name: string) => `line-${i}-${name}`;
        const err = (path: string) => errors[`lines[${i}].${path}`];
        const text = (
          name: 'description' | 'quantity' | 'unitPrice' | 'vatRate',
          path: string,
          label: string,
          extra: { inputMode?: 'decimal' } = {},
        ) => (
          <div class={name === 'description' ? 'sm:col-span-6' : 'sm:col-span-2'}>
            <label for={id(name)} class={LABEL}>
              {label}
            </label>
            <input
              id={id(name)}
              type="text"
              class={INPUT}
              value={line[name]}
              {...extra}
              {...a11y(id(name), err(path))}
              onInput={(e) => update(i, { [name]: (e.target as HTMLInputElement).value })}
            />
            {err(path) && (
              <p id={`${id(name)}-error`} class="text-xs text-[var(--los-warning)] mt-1">
                {err(path)}
              </p>
            )}
          </div>
        );
        return (
          <fieldset
            key={i}
            class="grid grid-cols-2 sm:grid-cols-12 gap-2 border border-[var(--los-border)] rounded p-2"
          >
            <legend class="sr-only">Line {i + 1}</legend>
            {text('description', 'description', 'Description')}
            {text('quantity', 'quantity', 'Quantity', { inputMode: 'decimal' })}
            <div class="sm:col-span-2">
              <label for={id('unit')} class={LABEL}>
                Unit
              </label>
              <select
                id={id('unit')}
                class={INPUT}
                value={line.unit}
                onChange={(e) => update(i, { unit: (e.target as HTMLSelectElement).value })}
              >
                {withCurrent(UNITS, line.unit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            {text('unitPrice', 'unit_price', `Unit price (${currency})`, { inputMode: 'decimal' })}
            <div class="sm:col-span-2">
              <label for={id('vatCategory')} class={LABEL}>
                VAT category
              </label>
              <select
                id={id('vatCategory')}
                class={INPUT}
                value={line.vatCategory}
                onChange={(e) =>
                  update(i, { vatCategory: (e.target as HTMLSelectElement).value as VatCategory })
                }
              >
                {VAT_CATEGORIES.map((c) => (
                  <option
                    key={c}
                    value={c}
                    disabled={unsupported.includes(c)}
                    title={unsupported.includes(c) ? EXEMPTION_HINT : undefined}
                  >
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {text('vatRate', 'vat_rate', 'VAT rate (%)', { inputMode: 'decimal' })}
            <div class="col-span-2 sm:col-span-12">
              <button
                type="button"
                class="text-xs text-[var(--los-accent)] hover:underline disabled:opacity-50"
                disabled={lines.length === 1}
                aria-label={`Remove line ${i + 1}`}
                onClick={() => props.onChange(lines.filter((_, n) => n !== i))}
              >
                Remove line
              </button>
            </div>
          </fieldset>
        );
      })}
      {unsupported.length > 0 && (
        <p class="text-[10px] text-[var(--los-fg-dim)]">
          {unsupported.join(', ')}: {EXEMPTION_HINT}
        </p>
      )}
      <button
        type="button"
        class="text-xs text-[var(--los-accent)] hover:underline"
        onClick={() => props.onChange([...lines, emptyLine(props.defaultVatRate)])}
      >
        Add line
      </button>
      <dl class="text-xs grid grid-cols-[auto_auto] justify-end gap-x-4" aria-label="Totals">
        <dt>Net</dt>
        <dd class="text-right">{money(totals.net, currency)}</dd>
        <dt>VAT</dt>
        <dd class="text-right">{money(totals.vat, currency)}</dd>
        <dt class="font-bold">Gross</dt>
        <dd class="text-right font-bold">{money(totals.gross, currency)}</dd>
      </dl>
    </fieldset>
  );
}
