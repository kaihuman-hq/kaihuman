import { webcrypto } from 'node:crypto';
import { authStore, decrypt, demoMode, encrypt } from '@kaihuman/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KaihumanSharedModule } from '../../modules/kaihuman-shared/index.js';
import { installCryptoPolyfill } from './crypto-polyfill.js';
import { createNativeContainer } from './native-container.js';
import {
  enterDemoOnce,
  handlePendingUrl,
  handleUrl,
  routeToHref,
  startLinkHandling,
} from './pending-url.js';
import { startTokenSync } from './token-sync.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

const fakeNative = (): KaihumanSharedModule & { files: Map<string, string> } => {
  const files = new Map<string, string>();
  return {
    files,
    readSharedFile: (n) => files.get(n) ?? null,
    writeSharedFile: (n, c) => void files.set(n, c),
    reloadWidgets: vi.fn(),
    setSharedToken: vi.fn(),
    consumePendingUrl: vi.fn(() => null),
  };
};

describe('native container', () => {
  it('maps to module calls', async () => {
    const native = fakeNative();
    const c = createNativeContainer(native);
    await c.write('a.json', '1');
    expect(await c.read('a.json')).toBe('1');
    expect(await c.read('missing')).toBeNull();
    await c.reloadAllTimelines();
    expect(native.reloadWidgets).toHaveBeenCalled();
  });
  it('falls back to memory without the module', async () => {
    const c = createNativeContainer(null);
    await c.write('a', 'b');
    expect(await c.read('a')).toBe('b');
  });
});

describe('token sync', () => {
  let stored: string | null;
  const secure = {
    get: async () => stored,
    set: async (t: string) => {
      stored = t;
    },
    remove: async () => {
      stored = null;
    },
  };
  beforeEach(() => {
    stored = null;
    demoMode.value = false;
    authStore.token.value = null;
  });

  it('mirrors token to keychain and shared copy, clears on sign-out', async () => {
    const shared = fakeNative();
    const stop = startTokenSync({ secure, shared });
    await flush();
    authStore.token.value = 'tok';
    await flush();
    expect(stored).toBe('tok');
    expect(shared.setSharedToken).toHaveBeenLastCalledWith('tok');
    authStore.logout();
    await flush();
    expect(stored).toBeNull();
    expect(shared.setSharedToken).toHaveBeenLastCalledWith(null);
    stop();
  });

  it('restores a keychain token when core has none, without wiping it first', async () => {
    stored = 'saved';
    const shared = fakeNative();
    const stop = startTokenSync({ secure, shared });
    await flush();
    expect(authStore.token.value).toBe('saved');
    expect(stored).toBe('saved');
    expect(shared.setSharedToken).toHaveBeenLastCalledWith('saved');
    stop();
  });

  it('never mirrors demo tokens and stops after dispose', async () => {
    const shared = fakeNative();
    const stop = startTokenSync({ secure, shared });
    await flush();
    demoMode.value = true;
    authStore.token.value = 'demo-token';
    await flush();
    expect(stored).toBeNull();
    stop();
    demoMode.value = false;
    authStore.token.value = 'later';
    await flush();
    expect(stored).toBeNull();
  });
});

describe('links', () => {
  beforeEach(() => {
    authStore.token.value = null;
  });

  it('routeToHref', () => {
    expect(routeToHref({ name: 'quick-capture', kind: 'idea' })).toBe('/quick-idea');
    expect(routeToHref({ name: 'board' })).toBe('/board');
    expect(routeToHref({ name: 'file', path: '.kh/a b/c.md' })).toBe('/files/.kh/a%20b/c.md');
    expect(routeToHref({ name: 'auth-callback', accessToken: 'x' })).toBe('/');
  });

  it('kaihuman://demo enters demo mode once and opens the dashboard', () => {
    const nav = vi.fn();
    expect(routeToHref({ name: 'demo' })).toBe('/dashboard');
    handleUrl('kaihuman://demo', nav);
    expect(demoMode.value).toBe(true);
    expect(authStore.token.value).toBeTruthy();
    expect(nav).toHaveBeenCalledWith('/dashboard');
    const token = authStore.token.value;
    enterDemoOnce();
    expect(authStore.token.value).toBe(token);
    handleUrl('kaihuman://demo/extra', nav);
    expect(nav).toHaveBeenCalledTimes(1);
    demoMode.value = false;
  });

  it('routes a consumed pending url, ignores empty and foreign', () => {
    const nav = vi.fn();
    expect(handlePendingUrl(() => null, nav)).toBe(false);
    expect(handlePendingUrl(() => 'https://x.dev', nav)).toBe(true);
    expect(nav).not.toHaveBeenCalled();
    handlePendingUrl(() => 'kaihuman://quick-todo', nav);
    expect(nav).toHaveBeenCalledWith('/quick-todo');
  });

  it('handles initial url, url events (auth callback) and foreground', async () => {
    const nav = vi.fn();
    let onUrl: (u: string) => void = () => {};
    let onFg: () => void = () => {};
    const pending = vi.fn<() => string | null>().mockReturnValueOnce('kaihuman://board');
    const off = vi.fn();
    const stop = startLinkHandling({
      navigate: nav,
      consumePendingUrl: pending,
      getInitialUrl: async () => 'kaihuman://quick-note',
      onUrl: (l) => {
        onUrl = l;
        return off;
      },
      onForeground: (l) => {
        onFg = l;
        return off;
      },
    });
    await flush();
    expect(nav).toHaveBeenCalledWith('/board');
    expect(nav).toHaveBeenCalledWith('/quick-note');
    onUrl('kaihuman://auth/callback?access_token=abc');
    expect(authStore.token.value).toBe('abc');
    expect(nav).toHaveBeenLastCalledWith('/');
    nav.mockClear();
    onUrl('kaihuman://auth/callback');
    expect(nav).not.toHaveBeenCalled();
    pending.mockReturnValueOnce('kaihuman://quick-log');
    onFg();
    expect(nav).toHaveBeenCalledWith('/quick-log');
    stop();
    expect(off).toHaveBeenCalledTimes(2);
  });
});

describe('crypto polyfill', () => {
  const rand = (a: Uint8Array) => webcrypto.getRandomValues(a);
  const fake = () => {
    const g: Record<string, unknown> = {};
    installCryptoPolyfill(g, { getRandomValues: rand });
    return g;
  };

  afterEach(() => vi.unstubAllGlobals());

  it('installs only what is missing', () => {
    const g: Record<string, unknown> = {};
    expect(installCryptoPolyfill(g, { getRandomValues: rand })).toBe(true);
    expect(g.window).toBe(g);
    expect(installCryptoPolyfill(g, { getRandomValues: rand })).toBe(false);
    const native = { crypto: webcrypto, window: {} };
    expect(installCryptoPolyfill(native)).toBe(false);
    expect(native.crypto.subtle).toBe(webcrypto.subtle);
  });

  it('core encrypt/decrypt round-trips with the polyfill', async () => {
    vi.stubGlobal('window', fake());
    const cipher = await encrypt('hello wörld', 'pw');
    expect(await decrypt(cipher, 'pw')).toBe('hello wörld');
    await expect(decrypt(cipher, 'wrong')).rejects.toThrow();
  });

  it('interoperates with Node WebCrypto in both directions', async () => {
    const polyfilled = fake();
    vi.stubGlobal('window', polyfilled);
    const fromPoly = await encrypt('secret', 'pw');
    vi.stubGlobal('window', { crypto: webcrypto });
    expect(await decrypt(fromPoly, 'pw')).toBe('secret');
    const fromNode = await encrypt('other', 'pw2');
    vi.stubGlobal('window', polyfilled);
    expect(await decrypt(fromNode, 'pw2')).toBe('other');
  });
});
