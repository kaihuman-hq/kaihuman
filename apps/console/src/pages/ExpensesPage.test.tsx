import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const downloads = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
const receipts = vi.hoisted(() => ({ openReceipt: vi.fn() }));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/download')>()),
  downloadBlob: downloads.downloadBlob,
}));
vi.mock('../lib/business/receipt', () => receipts);
const yearExport = vi.hoisted(() => ({ buildYearExport: vi.fn() }));
vi.mock('../lib/business/year-export', () => yearExport);
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => '2026-11-10',
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));

const { ExpensesPage } = await import('./ExpensesPage');

const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const PROFILE = '.kh/business/business.yaml';
const EXPENSE = '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.yaml';
const OLD = '.kh/business/expenses/2025/01JZZZZZZZZZZZZZZZZZZZZZZZ.yaml';

const load = (edit: (m: Map<string, string>) => void = () => {}): BusinessRepo => {
  const m = loadFixtureRepo();
  edit(m);
  return loadBusinessRepo(m);
};
const cash = (m: Map<string, string>) => m.set(PROFILE, `${m.get(PROFILE) ?? ''}vat_basis: cash\n`);
const smallBusiness = (m: Map<string, string>) =>
  m.set(
    PROFILE,
    (m.get(PROFILE) ?? '').replace('vat_regime: regular', 'vat_regime: small-business'),
  );
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});

let host: HTMLDivElement;
const show = (data: BusinessRepo) => {
  hooks.state = ready(data);
  act(() => render(<ExpensesPage />, host));
};
const pick = (id: string, value: string) =>
  act(() => {
    const el = host.querySelector(`#${id}`) as HTMLSelectElement;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const summary = () => host.querySelector('[aria-label="VAT summary"]')?.textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('ExpensesPage list', () => {
  it('lists the year newest first with amounts and an edit link', () => {
    show(
      load((m) =>
        m.set(
          '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV1.yaml',
          'id: 01M55FJ500NTZ49EKRX27CHPV1\ndate: "2026-05-01"\nsupplier: Cafe\ndescription: Lunch\ncategory: Office\nnet: 500\nvat: 35\ngross: 535\nvat_rate: "7"\n',
        ),
      ),
    );
    const rows = [...(host.querySelector('table')?.querySelectorAll('tbody tr') ?? [])].map(
      (r) => r.textContent ?? '',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Hosting AG');
    expect(rows[0]).toContain('2026-10-03');
    expect(rows[0]).toContain('10.00');
    expect(rows[0]).toContain('1.90');
    expect(rows[0]).toContain('11.90');
    expect(rows[1]).toContain('Cafe');
    expect(
      host.querySelector('a[href="/business/expenses/01M55FJ500NTZ49EKRX27CHPV0"]'),
    ).not.toBeNull();
    expect(host.querySelector('a[href="/business/expenses/new"]')).not.toBeNull();
  });

  it('switches the year and says when a year is empty', () => {
    show(load());
    pick('year', '2025');
    expect(host.textContent).toContain('No expenses in 2025.');
  });

  it('opens a receipt through openReceipt only when the expense has one', async () => {
    show(
      load((m) => {
        const text = m.get(EXPENSE) ?? '';
        m.set(EXPENSE, `${text}receipt: 01M55FJ500NTZ49EKRX27CHPV0.pdf\n`);
      }),
    );
    const open = button('Receipt');
    expect(open.getAttribute('aria-label')).toBe('Open receipt for Hosting AG');
    await act(async () => open.click());
    expect(receipts.openReceipt).toHaveBeenCalledTimes(1);
    expect(receipts.openReceipt.mock.calls[0]?.[1]).toMatchObject({ supplier: 'Hosting AG' });
  });

  it('shows a failed receipt open as an alert', async () => {
    receipts.openReceipt.mockRejectedValueOnce(new Error('Not found'));
    show(
      load((m) =>
        m.set(EXPENSE, `${m.get(EXPENSE) ?? ''}receipt: 01M55FJ500NTZ49EKRX27CHPV0.pdf\n`),
      ),
    );
    await act(async () => button('Receipt').click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Not found');
  });

  it('shows no receipt button without a receipt', () => {
    show(load());
    expect(button('Receipt')).toBeUndefined();
  });
});

describe('ExpensesPage VAT summary', () => {
  it('defaults to the current quarter and shows the accrual basis', () => {
    show(load());
    expect(summary()).toContain('2026-Q4');
    expect(summary()).toContain('Soll (accrual)');
    expect(summary()).toContain('Input VAT');
    expect(summary()).toContain('1.90');
    expect(summary()).toContain('Payable');
    // 158.88 output VAT − 1.90 input VAT
    expect(summary()).toContain('156.98 EUR');
  });

  it('lists output VAT by rate', () => {
    show(load());
    expect(summary()).toContain('19%');
    expect(summary()).toContain('7%');
  });

  it('counts the invoice in its issue month on the accrual basis', () => {
    show(load());
    pick('period-kind', 'month');
    pick('period', '2026-10');
    expect(summary()).toContain('Payable');
    expect(summary()).toContain('156.98 EUR');
    pick('period', '2026-11');
    expect(summary()).not.toContain('Refund');
    expect(summary()).toContain('0.00 EUR');
  });

  it('counts the invoice in the month of its payment on the cash basis', () => {
    show(load(cash));
    expect(summary()).toContain('Ist (cash)');
    pick('period-kind', 'month');
    pick('period', '2026-10');
    expect(summary()).toContain('Refund');
    expect(summary()).toContain('1.90 EUR');
    pick('period', '2026-11');
    expect(summary()).toContain('Payable');
    expect(summary()).toContain('158.88 EUR');
  });

  it('shows the whole year', () => {
    show(load());
    pick('period-kind', 'year');
    expect(summary()).toContain('2026');
    expect(host.querySelector('#period')).toBeNull();
  });

  it('shows the not-applicable text for the small-business regime', () => {
    show(load(smallBusiness));
    expect(summary()).toContain('No VAT: small-business regime (§19 UStG).');
    expect(summary()).not.toContain('Payable');
  });

  it('shows reverse-charge net', () => {
    show(load());
    expect(summary()).toContain('Reverse-charge net');
  });
});

describe('ExpensesPage exports', () => {
  const textOf = (blob: Blob) =>
    new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(blob);
    });
  const bytesOf = (blob: Blob) =>
    new Promise<Uint8Array>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(blob);
    });

  it("exports the year's expenses as a BOM CSV named expenses-<year>.csv", async () => {
    show(load());
    act(() => button('Export expenses (CSV)').click());
    expect(downloads.downloadBlob).toHaveBeenCalledTimes(1);
    const [name, blob] = downloads.downloadBlob.mock.calls[0] as [string, Blob];
    expect(name).toBe('expenses-2026.csv');
    expect([...(await bytesOf(blob)).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await textOf(blob);
    expect(text).toContain('Hosting AG');
    expect(text).toContain('10,00;19;1,90;11,90');
    expect(text).toContain('\r\n');
  });

  it('exports only the selected year', async () => {
    show(
      load((m) =>
        m.set(
          OLD,
          'id: 01JZZZZZZZZZZZZZZZZZZZZZZZ\ndate: "2025-03-01"\nsupplier: Old Co\ndescription: x\ncategory: Office\nnet: 100\nvat: 19\ngross: 119\nvat_rate: "19"\n',
        ),
      ),
    );
    pick('year', '2025');
    act(() => button('Export expenses (CSV)').click());
    const [name, blob] = downloads.downloadBlob.mock.calls[0] as [string, Blob];
    expect(name).toBe('expenses-2025.csv');
    const text = await textOf(blob);
    expect(text).toContain('Old Co');
    expect(text).not.toContain('Hosting AG');
  });

  it('exports the VAT of 12 months, 4 quarters and the year as vat-<year>.csv', async () => {
    show(load());
    act(() => button('Export VAT (CSV)').click());
    const [name, blob] = downloads.downloadBlob.mock.calls[0] as [string, Blob];
    expect(name).toBe('vat-2026.csv');
    expect([...(await bytesOf(blob)).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = (await textOf(blob)).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(1 + 12 + 4 + 1);
    expect(lines[1]?.split(';')[0]).toContain('2026-01');
    expect(lines[13]?.split(';')[0]).toBe('2026-Q1');
    expect(lines[17]?.split(';')[0]).toContain('2026');
    expect(lines[10]).toContain(';Soll;');
    expect(lines.find((l) => l.startsWith('﻿Zeitraum') || l.startsWith('Zeitraum'))).toBeDefined();
  });

  it('uses the cash basis in the VAT CSV', async () => {
    show(load(cash));
    act(() => button('Export VAT (CSV)').click());
    const [, blob] = downloads.downloadBlob.mock.calls[0] as [string, Blob];
    const text = await textOf(blob);
    expect(text).toContain(';Ist;');
    expect(text).not.toContain(';Soll;');
  });
});

describe('ExpensesPage year export', () => {
  const exportButton = () => button('Export year for Steuerberater…');
  const status = () => host.querySelector('[aria-label="Year export"] output')?.textContent;

  it('builds the selected year, shows progress, then downloads business-<year>.zip', async () => {
    let report: (done: number, total: number) => void = () => {};
    let finish: (zip: Uint8Array) => void = () => {};
    yearExport.buildYearExport.mockImplementation(
      (_t, _d, _y, onProgress: (d: number, t: number) => void) =>
        new Promise<Uint8Array>((resolve) => {
          report = onProgress;
          finish = resolve;
        }),
    );
    show(load());
    pick('year', '2025');
    act(() => exportButton().click());
    expect(yearExport.buildYearExport.mock.calls[0]?.[0]).toBe(target);
    expect(yearExport.buildYearExport.mock.calls[0]?.[2]).toBe('2025');
    expect(exportButton().disabled).toBe(true);
    act(() => report(12, 87));
    expect(status()).toBe('Reading 12 of 87 files…');
    await act(async () => finish(new Uint8Array([80, 75])));
    const [name, blob] = downloads.downloadBlob.mock.calls[0] as [string, Blob];
    expect(name).toBe('business-2025.zip');
    expect(blob.type).toBe('application/zip');
    expect(exportButton().disabled).toBe(false);
    expect(status()).toBe('Downloaded business-2025.zip.');
  });

  it('shows a failed read as an alert and downloads nothing', async () => {
    yearExport.buildYearExport.mockRejectedValue(new Error('Could not read x.pdf.'));
    show(load());
    await act(async () => exportButton().click());
    expect(downloads.downloadBlob).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Year export"] [role="alert"]')?.textContent).toBe(
      'Could not read x.pdf.',
    );
    expect(exportButton().disabled).toBe(false);
  });
});
