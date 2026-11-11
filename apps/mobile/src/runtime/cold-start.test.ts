import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CacheFs } from '../sync/persistent-storage.js';

// Everything that outlives the process on a phone: the cache files, the Keychain, the App Group.
const device = vi.hoisted(() => ({
  files: new Map<string, string>(),
  keychain: new Map<string, string>(),
  shared: new Map<string, string>(),
  /** Locked before first unlock (or a WHEN_UNLOCKED item while locked): every access throws. */
  locked: false,
}));
const appState = vi.hoisted(() => ({
  current: 'active',
  listeners: new Set<(state: string) => void>(),
}));

// Native edges only; core, the stores, token sync and the bootstrap itself run for real.
const native = vi.hoisted(() => {
  const call = () => Object.assign(Promise.resolve(undefined), { remove() {} });
  // Synchronous getters answer "nothing there"; everything else is an awaitable no-op.
  const pick = (key: string | symbol) =>
    key === 'then' ? undefined : String(key).startsWith('getLast') ? () => null : call;
  return () =>
    new Proxy(
      {},
      {
        get: (_t, key) => (key === '__esModule' ? true : pick(key)),
        has: () => true,
      },
    );
});

vi.mock('../sync/expo-cache-fs.js', () => ({
  createExpoCacheFs: (): CacheFs => {
    const { files } = device;
    return {
      readSync: (p) => files.get(p) ?? null,
      writeSync: (p, t) => void files.set(p, t),
      read: async (p) => files.get(p) ?? null,
      write: async (p, t) => void files.set(p, t),
      remove: async (p) => void files.delete(p),
      list: async (dir) =>
        [...files.keys()]
          .filter((k) => k.startsWith(`${dir}/`))
          .map((k) => k.slice(dir.length + 1)),
    };
  },
}));
vi.mock('expo-secure-store', () => {
  const open = () => {
    if (device.locked) throw new Error('errSecInteractionNotAllowed');
    return device.keychain;
  };
  return {
    AFTER_FIRST_UNLOCK: 0,
    getItem: (k: string) => open().get(k) ?? null,
    setItem: (k: string, v: string) => void open().set(k, v),
    getItemAsync: async (k: string) => open().get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void open().set(k, v),
    deleteItemAsync: async (k: string) => void open().delete(k),
  };
});
vi.mock('../../modules/kaihuman-shared/index.js', () => ({
  KaihumanShared: {
    readSharedFile: (n: string) => device.shared.get(n) ?? null,
    writeSharedFile: (n: string, c: string) => void device.shared.set(n, c),
    reloadWidgets: () => {},
    setSharedToken: () => {},
    consumePendingUrl: () => null,
  },
}));
vi.mock('../../modules/kaihuman-intelligence/index.js', () => ({ KaihumanIntelligence: null }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  AppState: {
    get currentState() {
      return appState.current;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appState.listeners.add(listener);
      return { remove: () => appState.listeners.delete(listener) };
    },
  },
  Linking: { openSettings: async () => {} },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: null } }));
vi.mock('expo-crypto', () => ({
  getRandomValues: <T extends ArrayBufferView>(a: T) => crypto.getRandomValues(a as never) as T,
}));
vi.mock('expo-linking', native);
vi.mock('expo-notifications', native);
vi.mock('expo-background-task', native);
vi.mock('expo-task-manager', native);
vi.mock('expo-battery', native);
vi.mock('expo-network', native);

const repo = { full_name: 'me/life', name: 'life', owner: { login: 'me' }, default_branch: 'main' };
const flush = () => new Promise((r) => setTimeout(r, 10));

/** One app launch: the entry's import order, then the bootstrap the root layout runs. */
async function launch() {
  vi.resetModules();
  await import('./storage-entry.js');
  const core = await import('@kaihuman/core');
  const boot = await import('./bootstrap.js');
  const tokenSync = await import('./token-sync.js');
  const stop = boot.bootstrap();
  await boot.bootstrapReady();
  await flush();
  return {
    core,
    stop,
    tokenSync,
    route: await import('../navigation/start-route.js'),
    prompt: await import('../notifications/soft-prompt.js'),
    dashboards: await import('../screens/dashboards.js'),
    notifications: await import('../notifications/index.js'),
  };
}

beforeAll(() => {
  // The bootstrap fires network calls and logs it never awaits; a real fetch (401 from GitHub)
  // or a log landing after teardown made CI fail with "Closing rpc while onUserConsoleLog was pending".
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation(() => {});
  }
});

afterEach(() => {
  device.files.clear();
  device.keychain.clear();
  device.shared.clear();
  device.locked = false;
  appState.current = 'active';
  appState.listeners.clear();
});

describe('cold start', () => {
  it('restores every piece of state after the process is killed', async () => {
    const first = await launch();
    const { core } = first;
    core.authStore.token.value = 'ghp_saved';
    core.githubProfileStore.currentRepo.value = repo as never;
    const storage = core.getCoreStorage();
    await storage.putRecord('files', 'notes.md', { path: 'notes.md', content: 'clean' });
    await storage.putRecord('files', 'todo.md', { path: 'todo.md', content: 'edit', dirty: true });
    await storage.putPendingMutation({
      id: 'm1',
      repoFullName: 'me/life',
      path: 'todo.md',
      content: 'edit',
      timestamp: 1,
    });
    core.passwordStore.setPassword('secret.md', 'pw', true);
    first.prompt.markReminderPromptShown();
    first.dashboards.rememberDashboard('work');
    await first.notifications.updateNotificationSettings((s) => ({ ...s, enabled: true }));
    await flush();
    first.stop();

    const next = await launch();
    expect(next.core.authStore.token.value).toBe('ghp_saved');
    expect(next.core.githubProfileStore.currentRepo.value).toMatchObject({ full_name: 'me/life' });
    const files = await next.core
      .getCoreStorage()
      .listRecords<{ path: string; dirty?: boolean }>('files');
    expect(files.map((f) => f.path).sort()).toEqual(['notes.md', 'todo.md']);
    expect(files.find((f) => f.path === 'todo.md')?.dirty).toBe(true);
    expect(await next.core.getCoreStorage().listPendingMutations()).toHaveLength(1);
    expect(next.prompt.reminderPromptShown()).toBe(true);
    expect(next.dashboards.lastDashboardId()).toBe('work');
    expect(next.notifications.notificationSettings.value.enabled).toBe(true);
    expect(next.core.passwordStore.getPassword('secret.md')).toBe('pw');
    expect(next.tokenSync.tokenHydrated.value).toBe(true);
    const session = {
      token: next.core.authStore.token.value,
      repo: next.core.githubProfileStore.currentRepo.value,
    };
    expect(next.route.resolveStartRoute(session)).toBe('/dashboard');
    expect(next.route.guardRedirect({ ...session, hydrated: true }, 'login')).toBe('/dashboard');
    next.stop();
  });

  it('keeps the repo and dashboard when a crash tore kv.json mid-write', async () => {
    const first = await launch();
    first.core.authStore.token.value = 'ghp_saved';
    first.core.githubProfileStore.currentRepo.value = repo as never;
    first.dashboards.rememberDashboard('work');
    await flush();
    first.stop();
    // The crash: the main file is cut short while being rewritten.
    const whole = device.files.get('kv.json') ?? '';
    device.files.set('kv.json', whole.slice(0, whole.length / 2));

    const next = await launch();
    expect(next.core.githubProfileStore.currentRepo.value).toMatchObject({ full_name: 'me/life' });
    expect(next.dashboards.lastDashboardId()).toBe('work');
    const session = {
      token: next.core.authStore.token.value,
      repo: next.core.githubProfileStore.currentRepo.value,
    };
    expect(next.route.resolveStartRoute(session)).toBe('/dashboard');
    next.stop();
  });

  it('renews an expired GitHub App token before the first sync instead of losing the login', async () => {
    // Regression: only access_token was kept, so the session ended once its 8 hours were up.
    const first = await launch();
    first.core.githubProfileStore.currentRepo.value = repo as never;
    expect(
      first.core.authStore.handleCallbackUrl(
        'kaihuman://auth/callback?access_token=ghu_old&refresh_token=ghr_old&expires_in=60',
      ),
    ).toBe(true);
    await flush();
    first.stop();

    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      calls.push(String(input));
      // GitHub rejects the expired token; that must not end the session.
      if (String(input) === 'https://api.github.com/user')
        return new Response('{}', { status: 401 });
      if (String(input) !== 'https://auth.kaihuman.com/refresh') return new Promise(() => {});
      expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'ghr_old' });
      return Response.json({
        access_token: 'ghu_new',
        refresh_token: 'ghr_new',
        expires_in: 28800,
      });
    });
    try {
      const next = await launch();
      await flush();
      expect(calls.filter((c) => c === 'https://auth.kaihuman.com/refresh')).toHaveLength(1);
      expect(next.core.authStore.token.value).toBe('ghu_new');
      expect(next.core.authStore.refreshToken.value).toBe('ghr_new');
      await flush();
      // The rotated refresh token survives the next restart, and only in the Keychain.
      const keychain = [...device.keychain.values()].join('');
      expect(keychain).toContain('ghr_new');
      expect(keychain).not.toContain('ghr_old');
      expect([...device.files.values()].join('')).not.toContain('ghr_');
      next.stop();
    } finally {
      vi.stubGlobal('fetch', () => new Promise(() => {}));
    }
  });

  it('keeps the session through a background launch while the Keychain is locked', async () => {
    // Regression: background sync launched the app while the phone was locked; the Keychain
    // read failed, the token read as "none" and the user found the login screen when opening it.
    const first = await launch();
    first.core.githubProfileStore.currentRepo.value = repo as never;
    first.core.authStore.handleCallbackUrl(
      'kaihuman://auth/callback?access_token=ghu_saved&refresh_token=ghr_saved&expires_in=28800',
    );
    await flush();
    first.stop();

    device.locked = true;
    appState.current = 'background';
    const next = await launch();
    const { authStore } = next.core;
    expect(authStore.token.value).toBeNull();
    // No route is decided on a session that could not be read.
    expect(next.tokenSync.tokenHydrated.value).toBe(false);

    device.locked = false;
    appState.current = 'active';
    for (const listener of [...appState.listeners]) listener('active');
    await flush();
    expect(authStore.token.value).toBe('ghu_saved');
    expect(authStore.refreshToken.value).toBe('ghr_saved');
    expect(authStore.tokenExpiresAt.value).toBeGreaterThan(Date.now());
    expect(next.tokenSync.tokenHydrated.value).toBe(true);
    const session = {
      token: authStore.token.value,
      repo: next.core.githubProfileStore.currentRepo.value,
    };
    expect(next.route.resolveStartRoute(session)).toBe('/dashboard');
    next.stop();

    // Nothing was deleted while locked: the next cold start still has the whole session.
    const later = await launch();
    expect(later.core.authStore.token.value).toBe('ghu_saved');
    expect(later.core.authStore.refreshToken.value).toBe('ghr_saved');
    later.stop();
  });

  it('never writes the token into the plain cache files', async () => {
    const app = await launch();
    app.core.authStore.token.value = 'ghp_secret';
    await flush();
    expect([...device.files.values()].join('')).not.toContain('ghp_secret');
    expect([...device.keychain.values()]).toContain('ghp_secret');
    app.stop();
  });
});
