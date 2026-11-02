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

const { BusinessPage } = await import('./BusinessPage');

const repo = { full_name: 'me/biz' } as never;
const files = (edit?: (m: Map<string, string>) => void) => {
  const m = loadFixtureRepo();
  edit?.(m);
  return m;
};
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo,
  data,
  contents: {},
  loadErrors: [],
});
const unpaid = () => files((m) => m.delete('.kh/business/payments/2026.jsonl'));

let host: HTMLDivElement;
const show = (state: BusinessState) => {
  hooks.state = state;
  act(() => render(<BusinessPage />, host));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('BusinessPage', () => {
  it('asks for a repository, shows loading and errors', () => {
    show({ status: 'no-repo' });
    expect(host.textContent).toContain('Select a repository');
    show({ status: 'loading' });
    expect(host.textContent).toContain('Loading');
    show({ status: 'error', message: 'boom' });
    expect(host.textContent).toContain('boom');
  });

  it('warns above the content when the repository is public, still rendering it', () => {
    const data = loadBusinessRepo(unpaid());
    show({ ...ready(data), repo: { full_name: 'me/biz', private: false } } as never);
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('This repository is public');
    expect(host.textContent).toContain('RE-2026-0001');
    show({ ...ready(data), repo: { full_name: 'me/biz', private: true } } as never);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('offers to enable business when it is not set up', () => {
    show({ status: 'disabled', repo });
    expect(host.textContent).toContain('Enable business');
    expect(host.querySelector('a[href="/business/enable"]')).not.toBeNull();
  });

  it('shows receivables, stats and links for an unpaid invoice', () => {
    show(ready(loadBusinessRepo(unpaid())));
    expect(host.textContent).toContain('RE-2026-0001');
    expect(host.textContent).toContain('1001.38 EUR');
    expect(host.textContent).toContain('overdue');
    expect(host.querySelector('a[href="/clients/acme-gmbh"]')).not.toBeNull();
    expect(host.textContent).toContain('Who owes me');
    expect(host.textContent).toContain('Pipeline');
    expect(host.textContent).not.toContain('files have problems');
  });

  it('shows muted notes for empty sections', () => {
    show(
      ready(
        loadBusinessRepo(
          files((m) => m.delete('.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml')),
        ),
      ),
    );
    expect(host.textContent).toContain('No drafts waiting to be issued.');
  });

  it('lists a broken file and still renders the rest', () => {
    const data = loadBusinessRepo(
      files((m) => m.set('.kh/business/clients/bad/client.yaml', 'name: [unclosed')),
    );
    show(ready(data));
    expect(host.textContent).toContain('1 file has problems');
    expect(host.textContent).toContain('clients/bad/client.yaml');
    expect(host.textContent).toContain('Acme GmbH');
  });
});
