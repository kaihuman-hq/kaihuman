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
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => router);

const { ClientFormPage } = await import('./ClientFormPage');
const { ProjectFormPage } = await import('./ProjectFormPage');

const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});
const page = () => loadBusinessRepo(loadFixtureRepo());

let built: {
  ok?: boolean;
  value?: { changes: Record<string, string | null>; message: string };
  issues?: { path: string; message: string }[];
};
/** Runs the builder against fresh state, which may differ from the page state on purpose. */
const writeAgainst = (fresh: BusinessRepo) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({ repo: fresh, headSha: 'h', tree: [], read: async () => null });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const field = (id: string) => host.querySelector(`#${id}`) as HTMLInputElement;
const type = (id: string, value: string) =>
  act(() => {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const submit = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;
const fillClient = (name = 'Neu GmbH') => {
  type('name', name);
  type('street', 'Weg 1');
  type('postcode', '10115');
  type('city', 'Berlin');
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

describe('ClientFormPage', () => {
  const show = (state = ready(page())) => {
    hooks.state = state;
    act(() => render(<ClientFormPage />, host));
  };

  it('labels every field and defaults country and stage', () => {
    show();
    for (const el of host.querySelectorAll('input, select')) {
      expect(host.querySelector(`label[for="${el.id}"]`), el.id).not.toBeNull();
    }
    expect(field('country').value).toBe('DE');
    expect(field('stage').value).toBe('lead');
  });

  it('follows the name with the slug until the slug is edited', () => {
    show();
    type('name', 'Müller & Söhne GmbH');
    expect(field('slug').value).toBe('muller-sohne-gmbh');
    type('slug', 'mueller');
    type('name', 'Müller AG');
    expect(field('slug').value).toBe('mueller');
  });

  it('shows a field error for an invalid email, keeps the input and writes nothing', async () => {
    show();
    fillClient();
    type('contactName', 'Max');
    type('email', 'not-an-email');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('#email-error')?.textContent).toContain('email');
    expect(field('email').getAttribute('aria-invalid')).toBe('true');
    expect(field('email').value).toBe('not-an-email');
    expect(field('name').value).toBe('Neu GmbH');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(router.route).not.toHaveBeenCalled();
  });

  it('shows required-field errors without writing', async () => {
    show();
    act(() => submit().click());
    await flush();
    for (const id of ['name', 'street', 'postcode', 'city', 'slug']) {
      expect(host.querySelector(`#${id}-error`), id).not.toBeNull();
    }
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('creates the client in one write and routes to its page', async () => {
    const p = page();
    writeAgainst(p);
    show(ready(p));
    fillClient();
    type('email', '');
    act(() => submit().click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(built.value?.message).toBe('business: new client neu-gmbh');
    expect(Object.keys(built.value?.changes ?? {})).toEqual([
      '.kh/business/clients/neu-gmbh/client.yaml',
    ]);
    expect(router.route).toHaveBeenCalledWith('/clients/neu-gmbh');
  });

  it('shows the slug error when another device created the same slug meanwhile', async () => {
    writeAgainst(page());
    show(ready(page()));
    fillClient('Acme GmbH');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('#slug-error')?.textContent).toContain('already exists');
    expect(field('name').value).toBe('Acme GmbH');
    expect(router.route).not.toHaveBeenCalled();
  });

  it('shows the write error and keeps the input', async () => {
    writes.writeBusiness.mockRejectedValue(new Error('boom'));
    show();
    fillClient();
    act(() => submit().click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Saving failed, nothing was written: boom',
    );
    expect(field('city').value).toBe('Berlin');
    expect(submit().disabled).toBe(false);
  });

  it('ignores a second submit while the first is running', async () => {
    let release: () => void = () => {};
    writes.writeBusiness.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, value: { commitSha: 'c' } });
        }),
    );
    show();
    fillClient();
    act(() => submit().click());
    act(() => submit().click());
    expect(submit().disabled).toBe(true);
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    release();
    await flush();
  });
});

describe('ProjectFormPage', () => {
  const show = (slug: string, state = ready(page())) => {
    hooks.state = state;
    act(() => render(<ProjectFormPage slug={slug} />, host));
  };

  it('says so for an unknown client', () => {
    show('nobody');
    expect(host.textContent).toContain('No client');
    expect(host.querySelector('form')).toBeNull();
  });

  it('shows an amount error for an unquoted rate and writes nothing', async () => {
    show('acme-gmbh');
    type('name', 'Relaunch');
    type('rateAmount', 'abc');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('#rateAmount-error')?.textContent).toContain('Not an amount');
    expect(field('rateAmount').value).toBe('abc');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('creates a project with money in minor units and routes to the client', async () => {
    const p = page();
    writeAgainst(p);
    show('acme-gmbh', ready(p));
    type('name', 'Relaunch');
    type('rateAmount', '90,50');
    act(() => submit().click());
    await flush();
    const file = '.kh/business/clients/acme-gmbh/projects/relaunch.yaml';
    expect(built.value?.changes[file]).toContain('amount: 9050');
    expect(built.value?.changes[file]).toContain('per: hour');
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });
});
