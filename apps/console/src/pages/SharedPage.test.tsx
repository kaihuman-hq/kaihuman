import { authStore, demoMode } from '@kaihuman/core';
import { LINKS_PATH, type LinkRecord, type Ulid } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const mocks = vi.hoisted(() => ({
  api: {
    list: vi.fn(),
    revoke: vi.fn(),
    events: vi.fn(),
    deleteAccount: vi.fn(),
    upload: vi.fn(),
  },
  revokeShareLink: vi.fn(),
  syncDownloads: vi.fn(),
  writeBusiness: vi.fn(),
  shareApi: vi.fn(),
}));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/share')>()),
  shareApi: (...args: unknown[]) => {
    mocks.shareApi(...args);
    return mocks.api;
  },
  revokeShareLink: mocks.revokeShareLink,
}));
vi.mock('../lib/business/share-sync', () => ({ syncDownloads: mocks.syncDownloads }));
vi.mock('../lib/business/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/write')>()),
  writeBusiness: mocks.writeBusiness,
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => ({ route: vi.fn() }));

const { SharedPage } = await import('./SharedPage');
const { ShareUnavailableError, SHARE_CONSENT_KEY, SHARE_URL_KEY } = await import(
  '../lib/business/share'
);

const T1 = 'AAAAAAAAAAAAAAAAAAAAAA';
const T2 = 'BBBBBBBBBBBBBBBBBBBBBB';
const T3 = 'CCCCCCCCCCCCCCCCCCCCCC';
const KEY = 'k'.repeat(43);
const rec = (id: string, doc: string, url: string, revoked?: string): LinkRecord => ({
  id: id as Ulid,
  doc,
  url,
  created: '2026-11-01T00:00:00.000Z',
  ...(revoked ? { revoked } : {}),
});
const L1 = rec(
  '01M50ARQ007CHPV05AFMSY38D1',
  'RE-2026-0001',
  `https://docs.kaihuman.com/d/${T1}#${KEY}`,
);
const L2 = rec(
  '01M50ARQ007CHPV05AFMSY38D2',
  'RE-2026-0002',
  `https://docs.kaihuman.com/d/${T2}#${KEY}`,
);
const OTHER = rec(
  '01M50ARQ007CHPV05AFMSY38D3',
  'RE-2026-0003',
  `https://other.example/d/${T3}#${KEY}`,
);
const GONE = rec(
  '01M50ARQ007CHPV05AFMSY38D4',
  'RE-2026-0004',
  `https://docs.kaihuman.com/d/${T3}#${KEY}`,
  '2026-11-02T00:00:00.000Z',
);
const target = { full_name: 'me/biz', default_branch: 'main', private: true };
const FILES = {
  files: [
    {
      token: T1,
      label: 'RE-2026-0001',
      business: 'Acme Studio',
      kind: 'pdf',
      size: 2048,
      created: '2026-11-01T08:00:00.000Z',
      expires: null,
      revoked: null,
      downloads: 3,
    },
    {
      token: T2,
      label: 'RE-2026-0002',
      business: 'Other Ltd',
      kind: 'pdf',
      size: 3 * 1048576,
      created: '2026-10-01T08:00:00.000Z',
      expires: '2026-10-15',
      revoked: null,
      downloads: 0,
    },
    {
      token: T3,
      label: 'RE-2026-0004',
      business: 'Acme Studio',
      kind: 'pdf',
      size: 1000,
      created: '2026-10-01T08:00:00.000Z',
      expires: null,
      revoked: '2026-10-02T00:00:00.000Z',
      downloads: 1,
    },
  ],
  used: Math.round(12.3 * 1048576),
  quota: 524288000,
};
const ready = (links: LinkRecord[]): BusinessState =>
  ({ status: 'ready', repo: target, data: { links }, contents: {}, loadErrors: [] }) as never;

let host: HTMLDivElement;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const show = async (state: BusinessState) => {
  hooks.state = state;
  act(() => render(<SharedPage />, host));
  await flush();
};
const button = (text: string | RegExp) =>
  [...host.querySelectorAll('button')].find((b) =>
    typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
const click = async (text: string | RegExp) => {
  const b = button(text);
  if (!b) throw new Error(`no button ${text} in: ${host.textContent}`);
  act(() => b.click());
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem(SHARE_CONSENT_KEY, '2026-11-01T00:00:00.000Z');
  demoMode.value = false;
  // Setting the token makes the store validate it against GitHub; keep that offline.
  vi.spyOn(authStore as unknown as { fetchUser(): Promise<void> }, 'fetchUser').mockResolvedValue();
  authStore.token.value = 'gho_test';
  mocks.api.list.mockResolvedValue(FILES);
  mocks.syncDownloads.mockResolvedValue({ added: 0 });
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('SharedPage', () => {
  it('lists the files with status, size, downloads and the quota, and syncs once on open', async () => {
    await show(ready([L1, L2]));
    const text = host.textContent ?? '';
    expect(text).toContain('12.3 MB of 500 MB');
    const rows = [...host.querySelectorAll('tbody tr')].map((r) => r.textContent ?? '');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('RE-2026-0001');
    expect(rows[0]).toContain('2 KB');
    expect(rows[0]).toContain('Active');
    expect(rows[1]).toContain('3 MB');
    expect(rows[1]).toContain('Expired');
    expect(rows[2]).toContain('Revoked');
    expect(button('Revoke')).toBeUndefined();
    // Active and expired files can be revoked (an expired file still takes storage); revoked cannot.
    const actions = [...host.querySelectorAll('tbody button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(actions).toEqual([
      'Revoke the share link for RE-2026-0001',
      'Revoke the share link for RE-2026-0002',
    ]);
    expect(text).toContain('approximate');
    expect(mocks.syncDownloads).toHaveBeenCalledTimes(1);
  });

  it('names the business of each file, since the service lists every repository', async () => {
    await show(ready([L1, L2]));
    const headers = [...host.querySelectorAll('thead th')].map((h) => h.textContent);
    expect(headers).toContain('Business');
    const cells = [...host.querySelectorAll('tbody tr')].map(
      (r) => r.children[headers.indexOf('Business')]?.textContent,
    );
    expect(cells).toEqual(['Acme Studio', 'Other Ltd', 'Acme Studio']);
  });

  it('revokes an expired file after a confirm', async () => {
    mocks.revokeShareLink.mockResolvedValue({ ok: true, value: { commitSha: 'c' } });
    await show(ready([L1, L2]));
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Revoke the share link for RE-2026-0002"]',
    );
    act(() => trigger?.click());
    await flush();
    await click('Revoke');
    expect(mocks.revokeShareLink).toHaveBeenCalledWith(target, L2, { api: mocks.api });
  });

  it('syncs again on request and reports what was added', async () => {
    await show(ready([L1]));
    mocks.syncDownloads.mockResolvedValue({ added: 2 });
    await click('Sync downloads');
    expect(mocks.syncDownloads).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('2 new downloads');
  });

  it('revokes a file after a confirm, through revokeShareLink when the repo has its link', async () => {
    mocks.revokeShareLink.mockResolvedValue({ ok: true, value: { commitSha: 'c' } });
    await show(ready([L1]));
    await click('Revoke…');
    expect(mocks.revokeShareLink).not.toHaveBeenCalled();
    await click('Revoke');
    expect(mocks.revokeShareLink).toHaveBeenCalledWith(target, L1, { api: mocks.api });
    expect(mocks.api.list).toHaveBeenCalledTimes(2);
  });

  it('revokes on the service only when the repo has no record of the file', async () => {
    await show(ready([]));
    await click('Revoke…');
    await click('Revoke');
    expect(mocks.api.revoke).toHaveBeenCalledWith(T1);
    expect(mocks.revokeShareLink).not.toHaveBeenCalled();
  });

  it('delete all: confirms, deletes the account, then revokes only own-service active links in one commit', async () => {
    mocks.api.deleteAccount.mockResolvedValue(undefined);
    const text = [L1, L2, OTHER, GONE].map((l) => JSON.stringify(l)).join('\n');
    mocks.writeBusiness.mockImplementation(async (_t, build) => {
      const built = await build({ read: async () => `${text}\n` });
      written.push(built);
      return { ok: true, value: { commitSha: 'c' } };
    });
    const written: { ok: boolean; value: { changes: Record<string, string> } }[] = [];
    await show(ready([L1, L2, OTHER, GONE]));
    await click('Delete all my shared files…');
    expect(mocks.api.deleteAccount).not.toHaveBeenCalled();
    await click('Yes, delete everything');
    expect(mocks.api.deleteAccount).toHaveBeenCalledTimes(1);
    expect(mocks.writeBusiness).toHaveBeenCalledTimes(1);
    const lines = (written[0]?.value.changes[LINKS_PATH] ?? '')
      .trimEnd()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines[0].revoked).toBeTypeOf('string');
    expect(lines[1].revoked).toBeTypeOf('string');
    expect(lines[2].revoked).toBeUndefined();
    expect(lines[3].revoked).toBe('2026-11-02T00:00:00.000Z');
    expect(host.textContent).toContain('1 link on another share service was not changed.');
    expect(host.textContent).toContain('Records in other repositories are not updated.');
  });

  it('delete all: leaves the repo alone when the service refuses', async () => {
    mocks.api.deleteAccount.mockRejectedValue(new ShareUnavailableError());
    await show(ready([L1]));
    await click('Delete all my shared files…');
    await click('Yes, delete everything');
    expect(mocks.writeBusiness).not.toHaveBeenCalled();
    expect(host.textContent).toContain('The share service is not reachable.');
  });

  it('says the service is not reachable and keeps the URL setting working', async () => {
    mocks.api.list.mockRejectedValue(new ShareUnavailableError());
    mocks.syncDownloads.mockRejectedValue(new ShareUnavailableError());
    await show(ready([L1]));
    expect(host.textContent).toContain('The share service is not reachable.');
    const input = host.querySelector('input[type="url"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    act(() => {
      input.value = 'https://share.example';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Save');
    expect(localStorage.getItem(SHARE_URL_KEY)).toBe('https://share.example');
    await click('Reset');
    expect(localStorage.getItem(SHARE_URL_KEY)).toBeNull();
  });

  it('asks for the consent before any call to the service', async () => {
    localStorage.clear();
    await show(ready([L1]));
    expect(mocks.api.list).not.toHaveBeenCalled();
    expect(mocks.syncDownloads).not.toHaveBeenCalled();
    await click('Enable sharing…');
    await click('I understand, enable sharing');
    expect(localStorage.getItem(SHARE_CONSENT_KEY)).not.toBeNull();
    expect(mocks.api.list).toHaveBeenCalledTimes(1);
  });

  it('makes no service call in demo mode', async () => {
    demoMode.value = true;
    await show(ready([L1]));
    expect(host.textContent).toContain('Sharing is not available in demo mode.');
    expect(mocks.api.list).not.toHaveBeenCalled();
    expect(mocks.syncDownloads).not.toHaveBeenCalled();
  });

  it('moves focus into an inline confirm and back to its trigger on Cancel', async () => {
    await show(ready([L1]));
    await click('Revoke…');
    expect(document.activeElement).toBe(button('Revoke'));
    await click('Cancel');
    expect((document.activeElement as HTMLElement).textContent).toBe('Revoke…');
    await click('Delete all my shared files…');
    expect(document.activeElement).toBe(button('Yes, delete everything'));
    await click('Cancel');
    expect((document.activeElement as HTMLElement).textContent).toBe('Delete all my shared files…');
  });

  it('keeps the visible text in the confirm button name', async () => {
    await show(ready([L1]));
    await click('Revoke…');
    expect(button('Revoke')?.getAttribute('aria-label')).toBe('Revoke RE-2026-0001');
    expect(host.querySelector('table')?.getAttribute('aria-label')).toBe('Shared files');
  });

  it('says nothing about downloads when the automatic sync found none', async () => {
    await show(ready([L1]));
    expect(host.textContent).not.toContain('new downloads recorded');
  });

  it('focuses Sync downloads after the consent, when its opener is gone', async () => {
    localStorage.removeItem(SHARE_CONSENT_KEY);
    await show(ready([L1]));
    await click('Enable sharing…');
    await click('I understand, enable sharing');
    expect(document.activeElement).toBe(button('Sync downloads'));
  });

  it('treats "no longer in the repository" as a neutral outcome and reloads', async () => {
    mocks.revokeShareLink.mockResolvedValue({
      ok: false,
      issues: [{ path: LINKS_PATH, message: 'This link is no longer in the repository.' }],
    });
    await show(ready([L1]));
    await click('Revoke…');
    await click('Revoke');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('The link was revoked.');
    expect(mocks.api.list).toHaveBeenCalledTimes(2);
  });

  it('refuses to revoke a file whose repo record is on another host, calling nothing', async () => {
    const { revokeShareLink } =
      await vi.importActual<typeof import('../lib/business/share')>('../lib/business/share');
    mocks.revokeShareLink.mockImplementation(revokeShareLink);
    const foreign = rec(
      '01M50ARQ007CHPV05AFMSY38D5',
      'RE-2026-0001',
      `https://other.example/d/${T1}#${KEY}`,
    );
    await show(ready([foreign]));
    await click('Revoke…');
    await click('Revoke');
    expect(mocks.api.revoke).not.toHaveBeenCalled();
    expect(mocks.writeBusiness).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('other.example');
  });
});
