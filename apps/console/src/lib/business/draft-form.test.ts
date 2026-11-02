import {
  type Draft,
  loadBusinessRepo,
  parseYaml,
  saveDraft,
  type Ulid,
  validateDraft,
} from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import {
  draftFieldErrors,
  draftFromForm,
  emptyDraftForm,
  formFromDraft,
  type LineForm,
  previewTotals,
  unsupportedCategories,
} from './draft-form';
import { loadFixtureRepo } from './fixture.test-helper';

const base: Draft = {
  id: '01M5AMBK0038DJQW16BGNTZ49F' as Ulid,
  kind: 'invoice',
  client: 'acme-gmbh' as Draft['client'],
  lines: [],
  time_entries: ['01M581YW00W16BGNTZ49EKRX27' as Ulid],
};
const first = (f: { lines: LineForm[] }): LineForm => {
  const l = f.lines[0];
  if (!l) throw new Error('line');
  return l;
};
const valid = () => {
  const f = emptyDraftForm('invoice', { vat_category: 'S', vat_rate: '19' }, '');
  const [line] = f.lines;
  if (!line) throw new Error('line');
  f.lines = [{ ...line, description: 'Dev', quantity: '1,5', unitPrice: '95', unit: 'HUR' }];
  return f;
};

describe('draftFromForm', () => {
  it('reads a comma quantity as a decimal point and money via parseMoney', () => {
    const r = draftFromForm(valid(), base);
    expect(r.ok && r.value.lines).toEqual([
      {
        description: 'Dev',
        quantity: '1.5',
        unit: 'HUR',
        unit_price: 9500,
        vat_category: 'S',
        vat_rate: '19',
      },
    ]);
  });

  it('reports an empty description at lines[i].description and keeps the other lines readable', () => {
    const f = valid();
    f.lines = [
      { ...first(f), description: '  ' },
      { ...first(f), description: 'ok' },
    ];
    const r = draftFromForm(f, base);
    expect(r.ok).toBe(false);
    expect(draftFieldErrors(r)).toEqual({ 'lines[0].description': 'Enter a description.' });
  });

  it('reports a bad quantity, price and rate on their lines', () => {
    const f = valid();
    f.lines = [{ ...first(f), quantity: 'abc', unitPrice: '1x', vatRate: '19%' }];
    expect(Object.keys(draftFieldErrors(draftFromForm(f, base)))).toEqual([
      'lines[0].quantity',
      'lines[0].unit_price',
      'lines[0].vat_rate',
    ]);
  });

  it('keeps id and time_entries, and applies the period, project and notes', () => {
    const f = {
      ...valid(),
      serviceStart: '2026-11-01',
      serviceEnd: '2026-11-30',
      project: 'website',
      notes: ' Thanks ',
    };
    const r = draftFromForm(f, base);
    expect(r.ok && r.value).toMatchObject({
      id: base.id,
      time_entries: base.time_entries,
      project: 'website',
      notes: 'Thanks',
      service_period: { start: '2026-11-01', end: '2026-11-30' },
    });
  });

  it('refuses half a period, a backwards period, and an offer without valid_until', () => {
    expect(
      draftFieldErrors(draftFromForm({ ...valid(), serviceStart: '2026-11-01' }, base)),
    ).toHaveProperty('service_period');
    expect(
      draftFieldErrors(
        draftFromForm({ ...valid(), serviceStart: '2026-11-05', serviceEnd: '2026-11-01' }, base),
      ),
    ).toHaveProperty('service_period');
    expect(draftFieldErrors(draftFromForm(valid(), { ...base, kind: 'offer' }))).toHaveProperty(
      'valid_until',
    );
  });

  it('round-trips a draft through the form', () => {
    const draft: Draft = {
      ...base,
      project: 'website' as Draft['project'],
      service_period: { start: '2026-11-01', end: '2026-11-03' },
      notes: 'n',
      lines: [
        {
          description: 'Dev',
          quantity: '2.00',
          unit: 'HUR',
          unit_price: 9500,
          vat_category: 'S',
          vat_rate: '19',
        },
      ],
    };
    const r = draftFromForm(formFromDraft(draft, 'EUR'), draft);
    expect(r).toEqual({ ok: true, value: draft });
  });

  it('saveDraft writes YAML that validateDraft accepts', () => {
    const repo = loadBusinessRepo(loadFixtureRepo());
    const r = draftFromForm(valid(), base);
    if (!r.ok) throw new Error('form');
    const saved = saveDraft(repo, r.value);
    if (!saved.ok) throw new Error('save');
    const text = Object.values(saved.value.changes)[0] ?? '';
    const parsed = parseYaml(text);
    expect(parsed.ok && validateDraft(parsed.value).ok).toBe(true);
  });
});

describe('emptyDraftForm', () => {
  it('starts the first line with the given VAT default', () => {
    const f = emptyDraftForm('invoice', { vat_category: 'E', vat_rate: '0' }, '');
    expect(f.lines[0]).toMatchObject({ vatCategory: 'E', vatRate: '0' });
  });
});

describe('previewTotals', () => {
  it('sums the readable rows and ignores the broken ones', () => {
    const f = valid();
    f.lines = [first(f), { ...first(f), quantity: 'x' }];
    expect(previewTotals(f.lines)).toMatchObject({ net: 14250, vat: 2708, gross: 16958 });
  });
});

describe('unsupportedCategories', () => {
  it('disables Z, E, K and O for de regular invoices only', () => {
    const de = { jurisdiction: 'de', vat_regime: 'regular' };
    expect(unsupportedCategories(de, 'invoice')).toEqual(['Z', 'E', 'K', 'O']);
    expect(unsupportedCategories(de, 'credit-note')).toHaveLength(4);
    expect(unsupportedCategories(de, 'offer')).toEqual([]);
    expect(
      unsupportedCategories({ jurisdiction: 'de', vat_regime: 'small-business' }, 'invoice'),
    ).toEqual([]);
    expect(
      unsupportedCategories({ jurisdiction: 'generic', vat_regime: 'regular' }, 'invoice'),
    ).toEqual([]);
  });
});
