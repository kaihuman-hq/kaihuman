import { demoMode } from '@kaihuman/core';
import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import { businessNotice } from '../lib/business/notice';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
const router = vi.hoisted(() => ({ route: vi.fn() }));
const today = vi.hoisted(() => ({ value: '2026-11-10' }));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/write')>()),
  writeBusiness: writes.writeBusiness,
}));
vi.mock('../lib/business/receipt', () => ({ openReceipt: vi.fn() }));
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => today.value,
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => router);

const { ExpenseFormPage } = await import('./ExpenseFormPage');

const ID = '01M55FJ500NTZ49EKRX27CHPV0';
const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const load = (edit: (m: Map<string, string>) => void = () => {}): BusinessRepo => {
  const m = loadFixtureRepo();
  edit(m);
  return loadBusinessRepo(m);
};
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});

type Built = {
  ok?: boolean;
  value?: { changes: Record<string, string | Uint8Array | null>; message: string };
};
let built: Built;
const writeAgainst = (fresh: BusinessRepo) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({ repo: fresh, headSha: 'h', tree: [], read: async () => null });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const show = (state: BusinessState, id?: string) => {
  hooks.state = state;
  act(() => render(<ExpenseFormPage id={id} />, host));
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const field = (id: string) => host.querySelector(`#${id}`) as HTMLInputElement;
const type = (id: string, value: string) =>
  act(() => {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const choose = (name: string, bytes: number | Uint8Array<ArrayBuffer>) => {
  const file = new File([typeof bytes === 'number' ? new Uint8Array(bytes) : bytes], name);
  const input = field('receipt');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const submit = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;
const click = async () => {
  act(() => submit().click());
  await flush();
};
const buttonNamed = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const fillValid = () => {
  type('supplier', 'Cafe');
  type('description', 'Lunch');
  type('category', 'Office');
  type('net', '10');
};

beforeEach(() => {
  vi.clearAllMocks();
  today.value = '2026-11-10';
  demoMode.value = false;
  businessNotice.value = null;
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('ExpenseFormPage new expense', () => {
  it('labels every field, defaults date and rate, and offers the categories', () => {
    show(ready(load()));
    for (const id of [
      'date',
      'supplier',
      'description',
      'category',
      'net',
      'vatRate',
      'vat',
      'gross',
      'client',
      'project',
      'receipt',
    ]) {
      expect(host.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
    expect(field('date').value).toBe('2026-11-10');
    expect(field('vatRate').value).toBe('19');
    expect(field('gross').readOnly).toBe(true);
    const options = [...host.querySelectorAll('#category-list option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(options).toContain('Phone & internet');
    // A category already used shows up too.
    expect(options).toContain('hosting');
    expect(field('receipt').getAttribute('accept')).toBe('.pdf,.jpg,.jpeg,.png,.webp,.heic');
  });

  it('suggests VAT from net and rate, computes gross, and lets the user override the VAT', () => {
    show(ready(load()));
    type('net', '100');
    expect(field('vat').value).toBe('19.00');
    expect(field('gross').value).toBe('119.00');
    type('vatRate', '7');
    expect(field('vat').value).toBe('7.00');
    type('vat', '6.99');
    expect(field('gross').value).toBe('106.99');
    type('net', '200');
    expect(field('vat').value).toBe('6.99');
  });

  it('saves in one write with the YAML and the receipt bytes, then routes with a notice', async () => {
    show(ready(load()));
    writeAgainst(load());
    fillValid();
    const bytes = new Uint8Array([1, 2, 3, 255]);
    choose('Scan.PNG', bytes);
    await click();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    const changes = built.value?.changes ?? {};
    const yamlPath = Object.keys(changes).find((p) => p.endsWith('.yaml')) ?? '';
    const receiptPathKey = Object.keys(changes).find((p) => p.endsWith('.png')) ?? '';
    expect(yamlPath).toMatch(/^\.kh\/business\/expenses\/2026\/[0-9A-Z]{26}\.yaml$/);
    expect(typeof changes[yamlPath]).toBe('string');
    expect(changes[yamlPath]).toContain('net: 1000');
    expect(changes[yamlPath]).toContain('gross: 1190');
    expect(changes[yamlPath]).toMatch(/receipt: [0-9A-Z]{26}\.png/);
    expect([...(changes[receiptPathKey] as Uint8Array)]).toEqual([1, 2, 3, 255]);
    expect(Object.keys(changes)).toHaveLength(2);
    expect(built.value?.message).toBe('business: expense Cafe 2026-11-10');
    expect(router.route).toHaveBeenCalledWith('/business/expenses');
    expect(businessNotice.value).toEqual({
      text: 'Saved expense Cafe.',
      path: '/business/expenses',
    });
  });

  it('saves without a receipt as YAML only', async () => {
    show(ready(load()));
    writeAgainst(load());
    fillValid();
    await click();
    expect(Object.keys(built.value?.changes ?? {})).toHaveLength(1);
  });

  it('refuses an 11 MB file on select with the formats message and never writes', async () => {
    show(ready(load()));
    writeAgainst(load());
    fillValid();
    choose('big.pdf', 11 * 1024 * 1024);
    expect(host.textContent).toContain('Receipts can be up to 10 MB.');
    expect(field('receipt').getAttribute('aria-invalid')).toBe('true');
    await click();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('refuses a wrong type on select and never writes', async () => {
    show(ready(load()));
    writeAgainst(load());
    fillValid();
    choose('notes.txt', 10);
    expect(host.textContent).toContain('Receipts must be PDF, JPG, PNG, WEBP or HEIC.');
    await click();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('clears the file error when a valid file replaces the bad one', async () => {
    show(ready(load()));
    choose('big.pdf', 11 * 1024 * 1024);
    choose('ok.pdf', 10);
    expect(host.textContent).not.toContain('Receipts can be up to 10 MB.');
  });

  it('shows field errors without writing', async () => {
    show(ready(load()));
    writeAgainst(load());
    type('net', 'abc');
    await click();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Some fields need attention.');
    expect(host.querySelector('#net-error')?.textContent).toMatch(/amount/);
    expect(host.querySelector('#supplier-error')).not.toBeNull();
  });

  it('shows a failed commit and keeps the form', async () => {
    show(ready(load()));
    writes.writeBusiness.mockRejectedValue(new Error('boom'));
    fillValid();
    await click();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('nothing was written');
    expect(router.route).not.toHaveBeenCalled();
    expect(field('supplier').value).toBe('Cafe');
  });

  it('is read-only in demo mode', async () => {
    demoMode.value = true;
    show(ready(load()));
    expect(host.textContent).toContain('Saving is not available in demo mode.');
    expect(submit().disabled).toBe(true);
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
  });
});

describe('ExpenseFormPage existing expense', () => {
  it('says so for an unknown id', () => {
    show(ready(load()), '01JZZZZZZZZZZZZZZZZZZZZZZZ');
    expect(host.textContent).toContain('No expense');
  });

  it('prefills the form and keeps VAT as stored', () => {
    show(ready(load()), ID);
    expect(field('supplier').value).toBe('Hosting AG');
    expect(field('net').value).toBe('10.00');
    expect(field('vat').value).toBe('1.90');
    expect(field('gross').value).toBe('11.90');
  });

  it('deletes with the retention text while inside the retention period', async () => {
    show(ready(load()), ID);
    writeAgainst(load());
    act(() => buttonNamed('Delete').click());
    // Fixture jurisdiction de: 8 years after 2026 -> 2034-12-31
    expect(host.textContent).toContain(
      'This record must be kept until 2034-12-31 (retention). Delete anyway?',
    );
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    act(() => buttonNamed('Yes, delete expense').click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(built.value?.message).toBe('business: delete expense Hosting AG 2026-10-03');
    expect(built.value?.changes).toEqual({
      '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.yaml': null,
    });
    expect(router.route).toHaveBeenCalledWith('/business/expenses');
  });

  it('shows a plain confirm once the retention period is over', () => {
    today.value = '2035-01-01';
    show(ready(load()), ID);
    act(() => buttonNamed('Delete').click());
    expect(host.textContent).not.toContain('(retention)');
    expect(host.textContent).toContain('Delete this expense? This cannot be undone.');
  });

  it('shows the retention text on the last day and not the day after', () => {
    today.value = '2034-12-31';
    show(ready(load()), ID);
    act(() => buttonNamed('Delete').click());
    expect(host.textContent).toContain('(retention)');
  });

  it('keeps the expense when the user declines', () => {
    show(ready(load()), ID);
    act(() => buttonNamed('Delete').click());
    act(() => buttonNamed('Keep it').click());
    expect(host.textContent).not.toContain('(retention)');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('replaces the receipt with the new bytes and names the new extension', async () => {
    show(
      ready(
        load((m) => {
          const p = '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.yaml';
          m.set(p, `${m.get(p) ?? ''}receipt: ${ID}.pdf\n`);
        }),
      ),
      ID,
    );
    writeAgainst(
      load((m) => {
        const p = '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.yaml';
        m.set(p, `${m.get(p) ?? ''}receipt: ${ID}.pdf\n`);
      }),
    );
    expect(host.textContent).toContain(`${ID}.pdf`);
    choose('new.jpg', new Uint8Array([9]));
    await click();
    const changes = built.value?.changes ?? {};
    expect(changes[`.kh/business/expenses/2026/${ID}.pdf`]).toBeNull();
    expect([...(changes[`.kh/business/expenses/2026/${ID}.jpg`] as Uint8Array)]).toEqual([9]);
  });
});
