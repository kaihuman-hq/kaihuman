import type { signal } from '@preact/signals';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  isDemoMode: undefined as unknown as ReturnType<typeof signal<boolean>>,
  exitDemoMode: vi.fn(),
  login: vi.fn(),
}));
const router = vi.hoisted(() => ({ route: vi.fn() }));

vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  core.isDemoMode = signal(true);
  return {
    isDemoMode: core.isDemoMode,
    exitDemoMode: core.exitDemoMode,
    authStore: { login: core.login },
  };
});
vi.mock('preact-router', () => router);

const { DemoBanner } = await import('./DemoBanner');

let host: HTMLDivElement;

beforeEach(() => {
  core.isDemoMode.value = true;
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<DemoBanner />, host));
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;

describe('DemoBanner', () => {
  it('says the demo saves nothing', () => {
    expect(host.querySelector('[aria-label="Demo mode"]')?.textContent).toContain(
      'nothing you change is saved',
    );
  });

  it('is not there outside demo mode', () => {
    act(() => {
      core.isDemoMode.value = false;
    });
    expect(host.querySelector('[aria-label="Demo mode"]')).toBeNull();
  });

  it('leaves the demo before signing in, so the real session does not mix with demo data', () => {
    act(() => button('Sign in with GitHub').click());
    expect(core.exitDemoMode).toHaveBeenCalledOnce();
    expect(core.login).toHaveBeenCalledOnce();
    const [exited = 0] = core.exitDemoMode.mock.invocationCallOrder;
    const [loggedIn = 0] = core.login.mock.invocationCallOrder;
    expect(exited).toBeLessThan(loggedIn);
  });

  it('exits to the login page', () => {
    act(() => button('Exit').click());
    expect(core.exitDemoMode).toHaveBeenCalledOnce();
    expect(router.route).toHaveBeenCalledWith('/login', true);
  });
});
