import type { signal } from '@preact/signals';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  currentRepo: undefined as unknown as ReturnType<typeof signal<unknown>>,
  loadTree: vi.fn(),
}));
const setup = vi.hoisted(() => ({ enableBusiness: vi.fn() }));
const kb = vi.hoisted(() => ({ syncKB: vi.fn() }));
const router = vi.hoisted(() => ({ route: vi.fn() }));

vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  core.currentRepo = signal<unknown>(null);
  return {
    githubProfileStore: { currentRepo: core.currentRepo },
    githubFileStore: { loadTree: core.loadTree },
  };
});
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => router);
vi.mock('../lib/github-kb', () => kb);
vi.mock('../lib/business-setup', () => {
  class PublicRepoError extends Error {}
  class AlreadyEnabledError extends Error {}
  return { enableBusiness: setup.enableBusiness, PublicRepoError, AlreadyEnabledError };
});

const { BusinessEnablePage } = await import('./BusinessEnablePage');

const repo = { full_name: 'me/biz', default_branch: 'main', private: true };
let host: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  kb.syncKB.mockResolvedValue('current');
  setup.enableBusiness.mockResolvedValue(undefined);
  core.loadTree.mockResolvedValue(undefined);
  core.currentRepo.value = repo;
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<BusinessEnablePage />, host));
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

const input = (id: string) => host.querySelector(`#${id}`) as HTMLInputElement;
const submit = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;
const type = (id: string, value: string) =>
  act(() => {
    const el = input(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const tick = (id: string) => act(() => input(id).click());
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

function fillValid() {
  type('name', 'Muster GmbH');
  type('street', 'Weg 1');
  type('postcode', '10115');
  type('city', 'Berlin');
  type('contactName', 'Max');
  type('email', 'max@example.com');
  type('iban', 'DE89 3704 0044 0532 0130 00');
  tick('confirmRetention');
  tick('confirmBranchProtection');
  tick('confirmAccess');
}

describe('BusinessEnablePage', () => {
  it('asks for a repository when none is selected', () => {
    act(() => {
      core.currentRepo.value = null;
    });
    expect(host.textContent).toContain('Select a repository');
    expect(host.querySelector('form')).toBeNull();
  });

  it('blocks a public repo and writes nothing', async () => {
    act(() => {
      core.currentRepo.value = { ...repo, private: false };
    });
    expect(host.textContent).toContain('This repository is public.');
    expect(submit().disabled).toBe(true);
    expect(input('name').disabled).toBe(true);
    act(() => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    await flush();
    expect(setup.enableBusiness).not.toHaveBeenCalled();
    expect(kb.syncKB).not.toHaveBeenCalled();
  });

  it('has labelled fields and keeps submit disabled until all confirmations are ticked', () => {
    for (const id of ['name', 'iban', 'confirmRetention', 'confirmAccess']) {
      expect(host.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
    expect(submit().disabled).toBe(true);
    tick('confirmRetention');
    tick('confirmBranchProtection');
    expect(submit().disabled).toBe(true);
    tick('confirmAccess');
    expect(submit().disabled).toBe(false);
  });

  it('shows inline field errors and does not write', async () => {
    tick('confirmRetention');
    tick('confirmBranchProtection');
    tick('confirmAccess');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('#name-error')).not.toBeNull();
    expect(host.querySelector('#iban-error')).not.toBeNull();
    expect(setup.enableBusiness).not.toHaveBeenCalled();
  });

  it('enables business, reloads the tree and opens /business', async () => {
    fillValid();
    act(() => submit().click());
    await flush();
    expect(setup.enableBusiness).toHaveBeenCalledWith(
      repo,
      expect.objectContaining({ name: 'Muster GmbH', bank: { iban: 'DE89370400440532013000' } }),
    );
    expect(kb.syncKB).toHaveBeenCalledTimes(1);
    expect(core.loadTree).toHaveBeenCalled();
    expect(router.route).toHaveBeenCalledWith('/business');
  });

  it('installs the knowledge base first when it is missing', async () => {
    kb.syncKB.mockResolvedValueOnce('missing').mockResolvedValueOnce('updated');
    fillValid();
    act(() => submit().click());
    await flush();
    expect(kb.syncKB).toHaveBeenLastCalledWith(repo, { install: true });
    const [kbOrder = 0] = kb.syncKB.mock.invocationCallOrder.slice(-1);
    const [bizOrder = 0] = setup.enableBusiness.mock.invocationCallOrder;
    expect(kbOrder).toBeLessThan(bizOrder);
  });

  it('shows a failure and stays on the page', async () => {
    setup.enableBusiness.mockRejectedValue(new Error('boom'));
    fillValid();
    act(() => submit().click());
    await flush();
    expect(host.textContent).toContain('Setup failed, nothing was written: boom');
    expect(router.route).not.toHaveBeenCalled();
  });
});
