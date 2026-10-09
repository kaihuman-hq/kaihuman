import type { signal } from '@preact/signals';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => ({
  token: undefined as unknown as ReturnType<typeof signal<string | null>>,
}));

vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  stores.token = signal<string | null>('tok');
  return {
    authStore: { token: stores.token },
    githubProfileStore: {
      currentRepo: signal({ full_name: 'o/r' }),
      repos: signal([{ full_name: 'o/r' }]),
    },
  };
});

const { ExtensionAuthBridge } = await import('./ExtensionAuthBridge');

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('ExtensionAuthBridge', () => {
  // Installed extensions update after the console deploys; older ones read the lifosy names.
  it.each([
    'kaihuman',
    'lifosy',
  ])('hands the login to extensions reading the %s names', (prefix) => {
    const events: unknown[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener(`${prefix}-auth-update`, listener);

    act(() => render(<ExtensionAuthBridge />, host));
    window.removeEventListener(`${prefix}-auth-update`, listener);

    expect(document.getElementById(`${prefix}-extension-bridge`)).not.toBeNull();
    expect(document.body.getAttribute(`data-${prefix}-auth`)).toBe('tok');
    expect(document.body.getAttribute(`data-${prefix}-repo`)).toBe('o/r');
    expect(JSON.parse(document.body.getAttribute(`data-${prefix}-repos`) ?? '')).toEqual([
      { full_name: 'o/r' },
    ]);
    expect(events).toEqual([{ token: 'tok', repo: 'o/r', repos: [{ full_name: 'o/r' }] }]);
  });

  it('clears both sets of names on logout', () => {
    act(() => render(<ExtensionAuthBridge />, host));
    act(() => {
      stores.token.value = null;
    });

    expect(document.body.hasAttribute('data-kaihuman-auth')).toBe(false);
    expect(document.body.hasAttribute('data-lifosy-auth')).toBe(false);
  });
});
