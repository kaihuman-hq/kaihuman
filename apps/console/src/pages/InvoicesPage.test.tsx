import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => '2026-11-10',
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => ({ route: vi.fn() }));

const { InvoicesPage } = await import('./InvoicesPage');

const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: { full_name: 'me/biz', private: true } as never,
  data,
  contents: {},
  loadErrors: [],
});

let host: HTMLDivElement;
const show = (edit?: (m: Map<string, string>) => void) => {
  const m = loadFixtureRepo();
  edit?.(m);
  hooks.state = ready(loadBusinessRepo(m));
  act(() => render(<InvoicesPage />, host));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('InvoicesPage', () => {
  it('points to adding a client first when there are none', () => {
    show((m) => {
      for (const k of [...m.keys()]) if (k !== '.kh/business/business.yaml') m.delete(k);
    });
    expect(host.querySelector('a[href="/clients/new"]')?.textContent).toBe('Add your first client');
  });

  it('lists issued invoices with client name and status, and the drafts', () => {
    show((m) => m.delete('.kh/business/payments/2026.jsonl'));
    expect(host.textContent).toContain('RE-2026-0001');
    expect(host.textContent).toContain('Acme GmbH');
    expect(host.textContent).toContain('overdue');
    expect(
      host.querySelector('a[href="/business/payments/new?invoice=RE-2026-0001"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('a[href="/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27"]'),
    ).not.toBeNull();
    expect(host.querySelector('nav [aria-current="page"]')?.getAttribute('href')).toBe(
      '/business/invoices',
    );
  });

  it('offers no payment for a paid invoice', () => {
    show();
    expect(host.textContent).toContain('RE-2026-0001');
    expect(host.querySelector('a[href^="/business/payments/new"]')).toBeNull();
  });

  it('explains how invoices start when there are none', () => {
    show((m) => {
      for (const k of [...m.keys()]) {
        if (/^\.kh\/business\/(invoices|offers|drafts)\//.test(k)) m.delete(k);
      }
    });
    expect(host.textContent).toContain('No invoices yet. An invoice starts as a draft');
    expect(host.querySelector('a[href="/business/drafts/new"]')?.textContent).toBe('New draft');
  });
});
