import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
const router = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/write')>()),
  writeBusiness: writes.writeBusiness,
}));
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => '2026-11-10',
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => router);

const { PaymentFormPage } = await import('./PaymentFormPage');

const PAYMENTS = '.kh/business/payments/2026.jsonl';
const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
/** The fixture invoice is fully paid; without its payment 1001.38 EUR are open. */
const load = (paid: boolean): BusinessRepo => {
  const m = loadFixtureRepo();
  if (!paid) m.delete(PAYMENTS);
  return loadBusinessRepo(m);
};
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});

let built: { ok?: boolean; value?: { changes: Record<string, string | null>; message: string } };
const writeAgainst = (fresh: BusinessRepo, files: Record<string, string> = {}) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({
      repo: fresh,
      headSha: 'h',
      tree: [],
      read: async (p: string) => files[p] ?? null,
    });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const show = (state: BusinessState, invoice = 'RE-2026-0001') => {
  hooks.state = state;
  act(() => render(<PaymentFormPage invoice={invoice} />, host));
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const field = (id: string) => host.querySelector(`#${id}`) as HTMLInputElement;
const type = (id: string, value: string) =>
  act(() => {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const submit = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;
const click = async () => {
  act(() => submit().click());
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('PaymentFormPage', () => {
  it('labels every field and defaults amount to the open amount and date to today', () => {
    show(ready(load(false)));
    for (const id of ['amount', 'date', 'method', 'ref']) {
      expect(host.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
    expect(field('amount').value).toBe('1001.38');
    expect(field('date').value).toBe('2026-11-10');
    expect(host.textContent).toContain('RE-2026-0001');
  });

  it('says so for an unknown invoice and for an offer', () => {
    show(ready(load(false)), 'RE-2026-9999');
    expect(host.textContent).toContain('No invoice RE-2026-9999');
    show(ready(load(false)), 'AN-2026-001');
    expect(host.textContent).toContain('No invoice AN-2026-001');
  });

  it('records a full payment in one write against fresh state and routes to the client', async () => {
    const existing =
      '{"id":"01M5AMBK0038DJQW16BGNTZ49E","date":"2026-01-05","invoice":"RE-2026-0001","amount":1}\n';
    show(ready(load(false)));
    writeAgainst(load(false), { [PAYMENTS]: existing });
    type('method', 'transfer');
    await click();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(built.value?.message).toBe('business: payment 1001.38 EUR for RE-2026-0001');
    const text = built.value?.changes[PAYMENTS] ?? '';
    expect(text.startsWith(existing)).toBe(true);
    expect(text).toContain('"amount":100138,"method":"transfer"');
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });

  it('asks before an overpayment, with real amounts, and writes only after confirming', async () => {
    show(ready(load(false)));
    writeAgainst(load(false));
    type('amount', '1100');
    await click();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      'This is 98.62 EUR more than the open amount. Record anyway?',
    );
    expect(submit().textContent).toBe('Record anyway');
    await click();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(built.value?.changes[PAYMENTS]).toContain('"amount":110000');
  });

  it('asks again when the amount changes after the warning', async () => {
    show(ready(load(false)));
    writeAgainst(load(false));
    type('amount', '1100');
    await click();
    type('amount', '1200');
    expect(host.textContent).not.toContain('98.62');
    await click();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(host.textContent).toContain('198.62 EUR more');
  });

  it('shows a field error for a bad amount, keeps the input and writes nothing', async () => {
    show(ready(load(false)));
    type('amount', 'abc');
    type('ref', 'KTO 7');
    await click();
    expect(host.querySelector('#amount-error')?.textContent).toContain('Enter an amount');
    expect(field('amount').value).toBe('abc');
    expect(field('ref').value).toBe('KTO 7');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('shows the conflict message and keeps the form when the write throws', async () => {
    const { ConflictError } = await import('@kaihuman/core');
    writes.writeBusiness.mockRejectedValue(new ConflictError('moved'));
    show(ready(load(false)));
    await click();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Someone else changed the repository at the same time.',
    );
    expect(field('amount').value).toBe('1001.38');
    expect(router.route).not.toHaveBeenCalled();
  });
});
