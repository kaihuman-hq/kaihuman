import { loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import { businessNotice } from '../lib/business/notice';
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

const { IssuePage } = await import('./IssuePage');

const DRAFT_ID = '01M5KA3Q00W16BGNTZ49EKRX27';
const DRAFT = `.kh/business/drafts/${DRAFT_ID}.yaml`;
const INVOICE_1 = '.kh/business/invoices/2026/RE-2026-0001.yaml';
const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;

/** The fixture with the draft's (already billed) time entry removed, so it can be issued. */
const files = (edit?: (m: Map<string, string>) => void): Map<string, string> => {
  const m = loadFixtureRepo();
  m.set(DRAFT, (m.get(DRAFT) ?? '').replace(/time_entries:\n(\s+- .*\n?)+/, ''));
  edit?.(m);
  return m;
};
const ready = (m: Map<string, string>): BusinessState => ({
  status: 'ready',
  repo: target,
  data: loadBusinessRepo(m, [...m.keys()]),
  contents: Object.fromEntries(m),
  loadErrors: [],
});
let committed: Record<string, string | null>[];
const writeAgainst = (m: Map<string, string>) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({
      repo: loadBusinessRepo(m, [...m.keys()]),
      headSha: 'h',
      tree: [...m.keys()].map((path) => ({ path, type: 'blob', sha: 's', url: '' })),
      read: async (path: string) => m.get(path) ?? null,
    });
    if (r.ok) committed.push(r.value.changes);
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const show = async (state: BusinessState, id = DRAFT_ID) => {
  hooks.state = state;
  act(() => render(<IssuePage id={id} />, host));
  await flush();
};
const issueButton = () =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Issue')) as
    | HTMLButtonElement
    | undefined;
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map((a) => a.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  committed = [];
  businessNotice.value = null;
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('IssuePage preview', () => {
  it('shows number, client, dates, lines and totals without writing', async () => {
    await show(ready(files()));
    const text = host.textContent ?? '';
    expect(text).toContain('RE-2026-0002');
    expect(text).toContain('Acme GmbH');
    expect(text).toContain('Net842.50 EUR');
    expect(text).toContain('VAT158.88 EUR');
    expect(text).toContain('Gross1001.38 EUR');
    expect(text).toContain('Due2026-11-24');
    expect(text).toContain('Dev');
    expect((host.querySelector('#issue-date') as HTMLInputElement).value).toBe('2026-11-10');
    expect(host.querySelector('label[for="issue-date"]')).not.toBeNull();
    expect(issueButton()?.textContent).toBe('Issue RE-2026-0002');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('follows the issue date into the next year', async () => {
    await show(ready(files()));
    const input = host.querySelector('#issue-date') as HTMLInputElement;
    act(() => {
      input.value = '2027-01-04';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(issueButton()?.textContent).toBe('Issue RE-2027-0001');
  });

  it('refuses an impossible issue date with a field error', async () => {
    await show(ready(files()));
    const input = host.querySelector('#issue-date') as HTMLInputElement;
    act(() => {
      input.value = '2026-02-30';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(host.querySelector('#issue-date-error')?.textContent).toBe(
      'Enter the issue date as YYYY-MM-DD.',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(issueButton()?.disabled).toBe(true);
  });

  it('shows an issue() refusal (de exemption rule) and offers no issue', async () => {
    await show(
      ready(
        files((m) =>
          m.set(DRAFT, (m.get(DRAFT) ?? '').replace('vat_category: S', 'vat_category: Z')),
        ),
      ),
    );
    expect(alerts().join(' ')).toMatch(/lines\[0\]/);
    expect(issueButton()?.disabled).toBe(true);
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('says so for a draft that was already issued', async () => {
    await show(
      ready(
        files((m) => {
          m.delete(DRAFT);
          m.set(
            INVOICE_1,
            (m.get(INVOICE_1) ?? '').replace(/^draft_id: .*$/m, `draft_id: ${DRAFT_ID}`),
          );
        }),
      ),
    );
    expect(host.textContent).toContain('This draft was already issued.');
    expect(issueButton()).toBeUndefined();
  });
});

describe('business notice', () => {
  it('is shown on the next business page until dismissed', async () => {
    businessNotice.value = 'Issued RE-2026-0002.';
    await show(ready(files()));
    const notice = host.querySelector('output');
    expect(notice?.textContent).toContain('Issued RE-2026-0002.');
    act(() => (notice?.querySelector('button') as HTMLButtonElement).click());
    expect(businessNotice.value).toBeNull();
    expect(host.querySelector('output')).toBeNull();
  });
});

describe('IssuePage issue', () => {
  it('commits once, shows the committed number in the notice and goes to the client', async () => {
    const m = files();
    await show(ready(m));
    // Another device issued RE-2026-0002 after this page loaded.
    const fresh = new Map(m);
    fresh.set(
      '.kh/business/invoices/2026/RE-2026-0002.yaml',
      (m.get(INVOICE_1) ?? '').replaceAll('RE-2026-0001', 'RE-2026-0002'),
    );
    writeAgainst(fresh);
    act(() => issueButton()?.click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(Object.keys(committed[0] ?? {})).toContain(
      '.kh/business/invoices/2026/RE-2026-0003.yaml',
    );
    expect(committed[0]?.[DRAFT]).toBeNull();
    expect(businessNotice.value).toBe(
      'Issued RE-2026-0003. Generate the PDF with your generator; kaihuman shows "PDF missing" until it is in the repo.',
    );
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });

  it('shows a refusal found at commit time and writes nothing', async () => {
    await show(ready(files()));
    writeAgainst(
      files((m) =>
        m.set(DRAFT, (m.get(DRAFT) ?? '').replace('vat_category: S', 'vat_category: Z')),
      ),
    );
    act(() => issueButton()?.click());
    await flush();
    expect(committed).toEqual([]);
    expect(alerts().join(' ')).toMatch(/lines\[0\]/);
    expect(router.route).not.toHaveBeenCalled();
    expect(businessNotice.value).toBeNull();
  });

  it('shows the conflict message when the write fails twice', async () => {
    await show(ready(files()));
    const { ConflictError } = await import('@kaihuman/core');
    writes.writeBusiness.mockRejectedValue(new ConflictError('moved'));
    act(() => issueButton()?.click());
    await flush();
    expect(alerts()).toContain(
      'Someone else changed the repository at the same time. Reload and try again.',
    );
    expect(router.route).not.toHaveBeenCalled();
  });

  it('ignores a second click while issuing', async () => {
    await show(ready(files()));
    let release: () => void = () => {};
    writes.writeBusiness.mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ ok: false, issues: [{ path: 'x', message: 'no' }] });
        }),
    );
    act(() => {
      issueButton()?.click();
      issueButton()?.click();
    });
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    const submit = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.textContent).toBe('Issuing...');
    expect(submit.disabled).toBe(true);
    release();
    await flush();
  });
});
