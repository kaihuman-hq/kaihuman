import { authStore, demoMode } from '@kaihuman/core';
import type { LinkRecord, Ulid } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessState } from '../../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const share = vi.hoisted(() => ({ createShareLink: vi.fn(), revokeShareLink: vi.fn() }));
vi.mock('../../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../../lib/business/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/business/share')>()),
  createShareLink: share.createShareLink,
  revokeShareLink: share.revokeShareLink,
}));

const { ShareActions } = await import('./ShareActions');
const { ShareError } = await import('../../lib/business/share');

const target = { full_name: 'me/biz', default_branch: 'main' };
const URL_ = `https://docs.kaihuman.com/d/AAAAAAAAAAAAAAAAAAAAAA#${'k'.repeat(43)}`;
const doc = {
  number: 'AN-2026-001',
  path: '.kh/business/offers/2026/AN-2026-001.yaml',
  pdf: true,
  expires: '2026-12-01',
};
const NEW_ID = '01M50ARQ007CHPV05AFMSY38DK' as Ulid;
const LINK: LinkRecord = {
  id: '01M50ARQ007CHPV05AFMSY38DJ' as Ulid,
  doc: doc.number,
  url: URL_,
  created: '2026-11-01T00:00:00.000Z',
};

let host: HTMLDivElement;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text) as
    | HTMLButtonElement
    | undefined;
const click = (text: string) => {
  const b = button(text);
  if (!b) throw new Error(`no button "${text}" in: ${host.textContent}`);
  act(() => b.click());
};
const show = (props: Parameters<typeof ShareActions>[0]) =>
  act(() => render(<ShareActions {...props} />, host));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  demoMode.value = false;
  authStore.token.value = 'gho_test';
  host = document.createElement('div');
  document.body.appendChild(host);
  hooks.state = {
    status: 'ready',
    repo: target,
    data: { profile: { name: 'Acme Studio' } },
    contents: {},
    loadErrors: [],
  } as unknown as BusinessState;
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  demoMode.value = false;
});

describe('ShareActions', () => {
  it('renders nothing without a PDF', () => {
    show({ doc: { ...doc, pdf: false }, link: null });
    expect(host.innerHTML).toBe('');
  });

  it('shows the consent dialog first, then the per-document confirm', async () => {
    show({ doc, link: null });
    click('Share…');
    const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = host.querySelector(`#${dialog.getAttribute('aria-labelledby')}`);
    expect(title?.textContent).toBe('Share documents by link');
    expect(document.activeElement?.textContent).toBe('I understand, enable sharing');
    expect(dialog.textContent).toContain('encrypted in your browser');
    expect(host.textContent).not.toContain('Upload AN-2026-001.pdf');

    click('I understand, enable sharing');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(localStorage.getItem('lifeos_share_consent_v1')).not.toBeNull();
    expect(host.textContent).toContain(
      'Upload AN-2026-001.pdf (encrypted) to create a share link?',
    );
    expect(share.createShareLink).not.toHaveBeenCalled();
  });

  it('moves focus to Upload after the consent, and to Revoke when revoking', () => {
    show({ doc, link: null });
    click('Share…');
    click('I understand, enable sharing');
    expect(document.activeElement).toBe(button('Upload'));
    act(() => render(null, host));
    show({ doc, link: LINK });
    click('Revoke…');
    expect(document.activeElement).toBe(button('Revoke'));
  });

  it('names a self-hosted service and that the GitHub sign-in goes to it', () => {
    localStorage.setItem('lifeos_share_url', 'https://self.example/share');
    show({ doc, link: null });
    click('Share…');
    const text = host.querySelector('[role="dialog"]')?.textContent ?? '';
    expect(text).toContain('self.example');
    expect(text).toContain('Your GitHub sign-in is sent to self.example');
    expect(text).not.toContain('kaihuman share service');
  });

  it('says on the default host that the GitHub sign-in goes to the kaihuman share service', () => {
    show({ doc, link: null });
    click('Share…');
    const text = host.querySelector('[role="dialog"]')?.textContent ?? '';
    expect(text).toContain(
      'Your GitHub sign-in is sent to the kaihuman share service (docs.kaihuman.com) to identify you.',
    );
  });

  it('keeps Escape working after a click on the backdrop', () => {
    show({ doc, link: null });
    click('Share…');
    const backdrop = host.querySelector('[role="dialog"]')?.parentElement as HTMLElement;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => {
      backdrop.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('sends the repo owner as the business when the profile name is empty', async () => {
    localStorage.setItem('lifeos_share_consent_v1', 'yes');
    share.createShareLink.mockResolvedValue({ url: URL_, link: LINK });
    hooks.state = { ...(hooks.state as object), data: { profile: { name: '' } } } as BusinessState;
    show({ doc, link: null });
    click('Share…');
    click('Upload');
    await flush();
    expect(share.createShareLink.mock.calls[0]?.[2].business).toBe('me');
  });

  it('Escape and Cancel close the consent without enabling sharing', () => {
    show({ doc, link: null });
    click('Share…');
    const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    click('Share…');
    click('Cancel');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(localStorage.getItem('lifeos_share_consent_v1')).toBeNull();
  });

  it('skips the dialog once consent is given; Upload creates the link once', async () => {
    localStorage.setItem('lifeos_share_consent_v1', 'yes');
    let resolve: (v: { url: string; link: LinkRecord }) => void = () => {};
    share.createShareLink.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    show({ doc, link: null });
    click('Share…');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    const upload = button('Upload') as HTMLButtonElement;
    act(() => {
      upload.click();
      upload.click();
    });
    expect(share.createShareLink).toHaveBeenCalledTimes(1);
    const [repo, sent, deps] = share.createShareLink.mock.calls[0] ?? [];
    expect(repo).toBe(target);
    expect(sent).toEqual({ number: doc.number, path: doc.path, expires: '2026-12-01' });
    expect(deps.business).toBe('Acme Studio');
    resolve({ url: URL_, link: { ...LINK, id: NEW_ID } });
    await flush();
    expect(host.textContent).toContain('Online · link active');
    expect(host.textContent).toContain(URL_);
    expect(button('Copy link')).toBeDefined();

    // The new link can be revoked before the page has reloaded.
    share.revokeShareLink.mockResolvedValue({ ok: true, value: { commitSha: 'c' } });
    click('Revoke…');
    click('Revoke');
    await flush();
    expect(share.revokeShareLink.mock.calls[0]?.[1]).toEqual({ ...LINK, id: NEW_ID });
    expect(button('Share…')).toBeDefined();
  });

  it('shows a service error as an alert and commits nothing', async () => {
    localStorage.setItem('lifeos_share_consent_v1', 'yes');
    share.createShareLink.mockRejectedValue(new ShareError('The share service is not reachable.'));
    show({ doc, link: null });
    click('Share…');
    click('Upload');
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'The share service is not reachable.',
    );
    expect(host.textContent).not.toContain('Online · link active');
  });

  it('active link: badge, Copy link writes to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    show({ doc, link: LINK });
    expect(host.textContent).toContain('Online · link active');
    expect(button('Share…')).toBeUndefined();
    click('Copy link');
    await flush();
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(host.querySelector('output')?.textContent).toBe('Copied.');
  });

  it('falls back to a selected read-only field when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    show({ doc, link: LINK });
    click('Copy link');
    await flush();
    const field = host.querySelector('input') as HTMLInputElement;
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe(URL_);
    expect(document.activeElement).toBe(field);
    expect((field.selectionEnd ?? 0) - (field.selectionStart ?? 0)).toBe(URL_.length);
  });

  it('Revoke… asks first, then revokes that link', async () => {
    share.revokeShareLink.mockResolvedValue({ ok: true, value: { commitSha: 'c' } });
    show({ doc, link: LINK });
    click('Revoke…');
    expect(share.revokeShareLink).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Revoke the link for AN-2026-001?');
    click('Revoke');
    await flush();
    expect(share.revokeShareLink).toHaveBeenCalledTimes(1);
    expect(share.revokeShareLink.mock.calls[0]?.[1]).toBe(LINK);
    expect(host.textContent).not.toContain('Online · link active');
    expect(button('Share…')).toBeDefined();
  });

  it('expired link: offers Share… and Revoke… for the expired link, which still holds the file', async () => {
    share.revokeShareLink.mockResolvedValue({ ok: true, value: { commitSha: 'c' } });
    show({ doc, link: null, expired: LINK });
    expect(host.textContent).toContain('Link expired');
    expect(host.textContent).not.toContain('Online · link active');
    expect(button('Share…')).toBeDefined();
    expect(button('Copy link')).toBeUndefined();
    click('Revoke…');
    expect(document.activeElement).toBe(button('Revoke'));
    click('Revoke');
    await flush();
    expect(share.revokeShareLink.mock.calls[0]?.[1]).toBe(LINK);
    expect(button('Revoke…')).toBeUndefined();
    expect(host.textContent).not.toContain('Link expired');
    expect(button('Share…')).toBeDefined();
  });

  it('is disabled with a note in demo mode', () => {
    demoMode.value = true;
    show({ doc, link: null });
    expect(button('Share…')?.disabled).toBe(true);
    expect(host.textContent).toContain('Sharing is not available in demo mode.');
  });
});
