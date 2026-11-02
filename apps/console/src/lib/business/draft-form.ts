import {
  computeTotals,
  type DocKind,
  type Draft,
  formatMinor,
  type Line,
  parseDecimal,
  type Result,
  type Totals,
  type VatCategory,
  validateDraft,
} from '@kaihuman/formats/business';
import { parseMoney } from './client-form';

export type LineForm = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatCategory: VatCategory;
  vatRate: string;
};

/** What the editor shows. Everything else on a draft (id, time_entries, from_offer, corrects, ...) comes from the base draft. */
export type DraftForm = {
  project: string;
  serviceStart: string;
  serviceEnd: string;
  validUntil: string;
  notes: string;
  lines: LineForm[];
};

export const UNITS = ['HUR', 'DAY', 'C62'] as const;
export const EXEMPTION_HINT = 'needs an exemption note — not supported yet';

export type DefaultVat = { vat_category: VatCategory; vat_rate: string };

export const emptyLine = (vat: DefaultVat): LineForm => ({
  description: '',
  quantity: '1',
  unit: 'C62',
  unitPrice: '',
  vatCategory: vat.vat_category,
  vatRate: vat.vat_rate,
});

export const emptyDraftForm = (kind: DocKind, vat: DefaultVat, validUntil: string): DraftForm => ({
  project: '',
  serviceStart: '',
  serviceEnd: '',
  validUntil: kind === 'offer' ? validUntil : '',
  notes: '',
  lines: [emptyLine(vat)],
});

export const formFromDraft = (draft: Draft, currency: string): DraftForm => ({
  project: draft.project ?? '',
  serviceStart: draft.service_period?.start ?? '',
  serviceEnd: draft.service_period?.end ?? '',
  validUntil: draft.valid_until ?? '',
  notes: draft.notes ?? '',
  lines: draft.lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    unitPrice: formatMinor(l.unit_price, currency),
    vatCategory: l.vat_category,
    vatRate: l.vat_rate,
  })),
});

/** Round-trips through Date so 2026-02-31 is refused rather than rolled into March. */
const isRealDate = (text: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);

/** `1,5` → `1.5`; `null` when the text is not a positive decimal. */
export const parseQuantity = (input: string): string | null => {
  const text = input.trim().replace(',', '.');
  const d = parseDecimal(text);
  return d && d.units > 0n ? text : null;
};

/** A non-negative VAT rate; a comma is read as a decimal point. */
export const parseRate = (input: string): string | null => {
  const text = input.trim().replace(',', '.');
  const d = parseDecimal(text);
  return d && d.units >= 0n ? text : null;
};

/** A line, or `null` while any of its numbers is unreadable (the live totals skip such rows). */
const readLine = (l: LineForm): Line | null => {
  const quantity = parseQuantity(l.quantity);
  const rate = parseRate(l.vatRate);
  const unitPrice = parseMoney(l.unitPrice.trim());
  if (quantity === null || rate === null || unitPrice === null) return null;
  return {
    description: l.description.trim(),
    quantity,
    unit: l.unit,
    unit_price: unitPrice,
    vat_category: l.vatCategory,
    vat_rate: rate,
  };
};

/** Display-only totals of the readable rows. */
export const previewTotals = (lines: readonly LineForm[]): Totals =>
  computeTotals(lines.map(readLine).filter((l): l is Line => l !== null));

/**
 * Applies the form to `base` (which keeps id, time_entries, from_offer, corrects, ...). Issue
 * paths are record paths (`lines[0].description`, `service_period`, `valid_until`).
 */
export function draftFromForm(form: DraftForm, base: Draft): Result<Draft> {
  const issues: { path: string; message: string }[] = [];
  const lines: Line[] = [];
  form.lines.forEach((l, i) => {
    const at = `lines[${i}]`;
    const description = l.description.trim();
    if (!description) issues.push({ path: `${at}.description`, message: 'Enter a description.' });
    const quantity = parseQuantity(l.quantity);
    if (quantity === null) {
      issues.push({ path: `${at}.quantity`, message: 'Enter a quantity above 0, like 1.5.' });
    }
    const unitPrice = parseMoney(l.unitPrice.trim());
    if (unitPrice === null) {
      issues.push({ path: `${at}.unit_price`, message: 'Enter a price like 95 or 95.00.' });
    }
    const rate = parseRate(l.vatRate);
    if (rate === null) {
      issues.push({ path: `${at}.vat_rate`, message: 'Enter a rate like 19 or 7.5.' });
    }
    if (quantity !== null && unitPrice !== null && rate !== null) {
      lines.push({
        description,
        quantity,
        unit: l.unit,
        unit_price: unitPrice,
        vat_category: l.vatCategory,
        vat_rate: rate,
      });
    }
  });

  const start = form.serviceStart.trim();
  const end = form.serviceEnd.trim();
  if (start || end) {
    if (!isRealDate(start) || !isRealDate(end)) {
      issues.push({
        path: 'service_period',
        message: 'Enter both dates as YYYY-MM-DD, or leave both empty.',
      });
    } else if (end < start) {
      issues.push({ path: 'service_period', message: 'The end is before the start.' });
    }
  }
  const validUntil = form.validUntil.trim();
  if (base.kind === 'offer' && !isRealDate(validUntil)) {
    issues.push({
      path: 'valid_until',
      message: 'An offer needs a valid-until date (YYYY-MM-DD).',
    });
  } else if (validUntil && !isRealDate(validUntil)) {
    issues.push({ path: 'valid_until', message: 'Enter a date as YYYY-MM-DD.' });
  }
  if (issues.length > 0) return { ok: false, issues };

  const {
    project: _project,
    service_period: _period,
    valid_until: _until,
    notes: _notes,
    lines: _lines,
    ...kept
  } = base;
  const notes = form.notes.trim();
  return validateDraft({
    ...kept,
    ...(form.project ? { project: form.project } : {}),
    ...(start ? { service_period: { start, end } } : {}),
    ...(validUntil ? { valid_until: validUntil } : {}),
    ...(notes ? { notes } : {}),
    lines,
  });
}

/** First message per record path. */
export function draftFieldErrors(result: Result<unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (result.ok) return errors;
  for (const issue of result.issues) errors[issue.path] ??= issue.message;
  return errors;
}

/** Categories the editor shows disabled: under `de` regular, invoices and credit notes cannot carry Z/E/K/O yet (phase 1 rule). */
export const unsupportedCategories = (
  profile: { jurisdiction: string; vat_regime: string } | null,
  kind: DocKind,
): readonly VatCategory[] =>
  profile?.jurisdiction === 'de' && profile.vat_regime === 'regular' && kind !== 'offer'
    ? ['Z', 'E', 'K', 'O']
    : [];
