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

const { ClientsPage } = await import('./ClientsPage');

const repo = { full_name: 'me/biz' } as never;
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo,
  data,
  contents: {},
  loadErrors: [],
});
const load = (edit?: (m: Map<string, string>) => void) => {
  const m = loadFixtureRepo();
  edit?.(m);
  return loadBusinessRepo(m);
};

let host: HTMLDivElement;
const show = (state: BusinessState) => {
  hooks.state = state;
  act(() => render(<ClientsPage />, host));
};
const chip = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('ClientsPage', () => {
  it('offers to enable business when it is not set up', () => {
    show({ status: 'disabled', repo });
    expect(host.textContent).toContain('Enable business');
  });

  it('lists clients with links and filters by stage', () => {
    show(ready(load()));
    expect(host.querySelector('a[href="/clients/acme-gmbh"]')?.textContent).toBe('Acme GmbH');
    expect(host.textContent).toContain('1001.38 EUR');
    act(() => chip('lead').click());
    expect(host.textContent).toContain('No clients in this stage.');
    expect(host.querySelector('a[href="/clients/acme-gmbh"]')).toBeNull();
    act(() => chip('active').click());
    expect(host.querySelector('a[href="/clients/acme-gmbh"]')).not.toBeNull();
    act(() => chip('all').click());
    expect(chip('all').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the empty state without clients', () => {
    show(
      ready(
        load((m) => {
          for (const k of [...m.keys()]) if (k.includes('/clients/')) m.delete(k);
        }),
      ),
    );
    expect(host.textContent).toContain('No clients yet. Ask the agent to add one');
    expect(host.textContent).toContain('.kh/business/clients/<slug>/client.yaml');
  });

  it('names a broken client file and still lists the others', () => {
    show(ready(load((m) => m.set('.kh/business/clients/bad/client.yaml', 'name: [unclosed'))));
    expect(host.textContent).toContain('1 file has problems');
    expect(host.textContent).toContain('Acme GmbH');
  });

  it('pluralises the problem count', () => {
    show(
      ready(
        load((m) => {
          m.set('.kh/business/clients/bad/client.yaml', 'name: [unclosed');
          m.set('.kh/business/clients/bad2/client.yaml', 'name: [unclosed');
        }),
      ),
    );
    expect(host.textContent).toContain('2 files have problems');
  });
});
