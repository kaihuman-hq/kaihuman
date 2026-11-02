import { demoMode } from '@kaihuman/core';
import { loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
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
vi.mock('preact-router', () => ({ route: vi.fn() }));

const { PipelinePage } = await import('./PipelinePage');

const CLIENT = '.kh/business/clients/acme-gmbh/client.yaml';
const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const fixture = () => loadFixtureRepo();
const ready = (m: Map<string, string>): BusinessState => ({
  status: 'ready',
  repo: target,
  data: loadBusinessRepo(m),
  contents: {},
  loadErrors: [],
});

let host: HTMLDivElement;
const show = (state: BusinessState) => {
  hooks.state = state;
  act(() => render(<PipelinePage />, host));
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const heading = (text: string) =>
  [...host.querySelectorAll('h2')].find((h) => h.textContent?.startsWith(text));
const select = () => host.querySelector('select') as HTMLSelectElement;
const choose = async (value: string) => {
  act(() => {
    select().value = value;
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  demoMode.value = false;
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('PipelinePage', () => {
  it('renders the columns with counts and cards, past and lost collapsed', () => {
    const m = fixture();
    m.delete('.kh/business/payments/2026.jsonl');
    show(ready(m));
    expect([...host.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Lead (0)',
      'Contacted (0)',
      'Offer sent (0)',
      'Active (1)',
    ]);
    const card = host.querySelector('li') as HTMLElement;
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/clients/acme-gmbh');
    expect(card.querySelector('a')?.textContent).toBe('Acme GmbH');
    expect(card.textContent).toContain('Open 1001.38 EUR');
    expect(card.textContent).toMatch(/Last activity \d{4}-\d{2}-\d{2}/);
    expect(select().labels?.[0]?.textContent).toBe('Move Acme GmbH to…');
  });

  it('expands past and lost behind the toggle', () => {
    show(ready(fixture()));
    const toggle = host.querySelector('button') as HTMLButtonElement;
    expect(toggle.textContent).toBe('Show past and lost (0)');
    act(() => toggle.click());
    expect(heading('Past (0)')).toBeDefined();
    expect(heading('Lost (0)')).toBeDefined();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => toggle.click());
    expect(heading('Past')).toBeUndefined();
  });

  it('moves a client with only the stage changed and announces it', async () => {
    const m = fixture();
    const original = m.get(CLIENT) ?? '';
    show(ready(m));
    let built: { ok: boolean; value?: { changes: Record<string, string>; message: string } } = {
      ok: false,
    };
    writes.writeBusiness.mockImplementation(async (_t, build) => {
      built = await build({
        repo: loadBusinessRepo(m),
        headSha: 'h',
        tree: [],
        read: async (p: string) => (p === CLIENT ? original : null),
      });
      return { ok: true, value: { commitSha: 'c' } };
    });
    await choose('past');
    expect(Object.keys(built.value?.changes ?? {})).toEqual([CLIENT]);
    expect(built.value?.changes[CLIENT]).toBe(original.replace(/stage: active/, 'stage: past'));
    expect(built.value?.message).toBe('business: acme-gmbh → past');
    expect(host.querySelector('output')?.textContent).toBe('Acme GmbH moved to Past.');
    expect(heading('Active (0)')).toBeDefined();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('button')?.textContent).toBe('Show past and lost (1)');
  });

  it('keeps focus on the moved card select in its new column', async () => {
    show(ready(fixture()));
    writes.writeBusiness.mockResolvedValue({ ok: true, value: { commitSha: 'c' } });
    await choose('contacted');
    const moved = host.querySelector('#move-acme-gmbh') as HTMLSelectElement;
    expect(heading('Contacted (1)')?.parentElement?.contains(moved)).toBe(true);
    expect(document.activeElement).toBe(moved);
  });

  it('focuses the toggle when the client moves into the collapsed columns', async () => {
    show(ready(fixture()));
    writes.writeBusiness.mockResolvedValue({ ok: true, value: { commitSha: 'c' } });
    await choose('lost');
    const toggle = host.querySelector('button') as HTMLButtonElement;
    expect(toggle.textContent).toBe('Show past and lost (1)');
    expect(document.activeElement).toBe(toggle);
  });

  it('does not pull focus back when the data reloads later', async () => {
    const m = fixture();
    show(ready(m));
    writes.writeBusiness.mockResolvedValue({ ok: true, value: { commitSha: 'c' } });
    await choose('contacted');
    const other = host.querySelector('a') as HTMLAnchorElement;
    act(() => other.focus());
    show(ready(m));
    await flush();
    expect(document.activeElement).toBe(other);
  });

  it('keeps the card in place and alerts when saving fails', async () => {
    show(ready(fixture()));
    writes.writeBusiness.mockRejectedValue(new Error('offline'));
    await choose('past');
    expect(document.activeElement).toBe(select());
    expect(select().value).toBe('active');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('nothing was written');
    expect(heading('Active (1)')).toBeDefined();
    expect(host.querySelector('output')?.textContent).toBe('');
  });

  it('shows a refused move as an alert', async () => {
    show(ready(fixture()));
    writes.writeBusiness.mockResolvedValue({
      ok: false,
      issues: [{ path: 'stage', message: 'acme-gmbh is already past.' }],
    });
    await choose('past');
    expect(document.activeElement).toBe(select());
    expect(select().value).toBe('active');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('acme-gmbh is already past.');
    expect(heading('Active (1)')).toBeDefined();
  });

  it('has no selects in demo mode', () => {
    demoMode.value = true;
    show(ready(fixture()));
    expect(host.querySelector('select')).toBeNull();
    expect(host.textContent).toContain('not available in demo mode');
    expect(host.querySelector('li a')?.textContent).toBe('Acme GmbH');
  });
});
