import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CacheFs } from '../sync/persistent-storage.js';

// Everything that outlives the process on a phone: the cache files, the Keychain, the App Group.
const device = vi.hoisted(() => ({
  files: new Map<string, string>(),
  keychain: new Map<string, string>(),
  shared: new Map<string, string>(),
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
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItem: (k: string) => device.keychain.get(k) ?? null,
  setItem: (k: string, v: string) => void device.keychain.set(k, v),
  getItemAsync: async (k: string) => device.keychain.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void device.keychain.set(k, v),
  deleteItemAsync: async (k: string) => void device.keychain.delete(k),
}));
vi.mock('../../modules/kaihuman-shared/index.js', () => ({
  KaihumanShared: {
    readSharedFile: (n: string) => device.shared.get(n) ?? null,
    writeSharedFile: (n: string, c: string) => void device.shared.set(n, c),
    reloadWidgets: () => {},
    setSharedToken: () => {},
    consumePendingUrl: () => null,
  },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
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

afterEach(() => {
  device.files.clear();
  device.keychain.clear();
  device.shared.clear();
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

  it('never writes the token into the plain cache files', async () => {
    const app = await launch();
    app.core.authStore.token.value = 'ghp_secret';
    await flush();
    expect([...device.files.values()].join('')).not.toContain('ghp_secret');
    expect([...device.keychain.values()]).toContain('ghp_secret');
    app.stop();
  });
});
