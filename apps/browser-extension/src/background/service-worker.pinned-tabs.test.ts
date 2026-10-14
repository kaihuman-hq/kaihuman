import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PINNED_TABS_CACHE_TTL_MS } from './pinned-tabs';

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;

let listener: Listener;
let store: Record<string, any>;
let fetchMock: ReturnType<typeof vi.fn>;

const ETAG = 'W/"tabs-etag"';

const remoteConfig = {
  groups: [
    {
      id: 'g1',
      name: 'Work',
      createdAt: '2026-09-01T00:00:00.000Z',
      tabs: [{ url: 'https://remote.example/', title: 'Remote' }],
    },
  ],
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const cachedConfig = {
  groups: [{ id: 'g1', name: 'Cached', createdAt: '2026-09-01T00:00:00.000Z', tabs: [] }],
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const localStorageStub = () => ({
  get: (keys: any, cb?: (r: any) => void) => {
    const names =
      typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const result: Record<string, any> = {};
    for (const name of names) if (name in store) result[name] = store[name];
    if (cb) {
      cb(result);
      return undefined;
    }
    return Promise.resolve(result);
  },
  set: (values: Record<string, any>, cb?: () => void) => {
    Object.assign(store, values);
    if (cb) {
      cb();
      return undefined;
    }
    return Promise.resolve();
  },
  remove: (key: string) => {
    delete store[key];
    return Promise.resolve();
  },
});

beforeEach(async () => {
  vi.resetModules();
  store = { lifeos_token: 't', lifeos_repo: 'o/r' };
  fetchMock = vi.fn(async (_url: string, init?: any) =>
    init?.method === 'PUT'
      ? { ok: true, status: 200, json: async () => ({ content: { sha: 'sha-2' } }) }
      : {
          ok: true,
          status: 200,
          json: async () => ({ content: btoa(JSON.stringify(remoteConfig)), sha: 'sha-1' }),
          headers: { get: (name: string) => (name === 'etag' ? ETAG : null) },
        },
  );

  vi.stubGlobal('chrome', {
    alarms: {
      create: vi.fn(),
      get: vi.fn(async () => undefined),
      onAlarm: { addListener: vi.fn() },
    },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
    bookmarks: { getTree: vi.fn(async () => []) },
    commands: { onCommand: { addListener: vi.fn() } },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    scripting: { executeScript: vi.fn(async () => []) },
    runtime: {
      getManifest: () => ({ content_scripts: [] }),
      onInstalled: { addListener: vi.fn() },
      // No desktop palette host in tests.
      sendNativeMessage: vi.fn(async () => {
        throw new Error('Specified native messaging host not found.');
      }),
      onConnect: { addListener: vi.fn() },
      onMessage: {
        addListener: (l: Listener) => {
          listener = l;
        },
      },
    },
    storage: {
      local: localStorageStub(),
      session: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: vi.fn() },
    },
    tabs: { query: async () => [], create: vi.fn(), update: vi.fn(), sendMessage: vi.fn() },
  });
  vi.stubGlobal('fetch', fetchMock);
  await import('./service-worker');
});

const call = (msg: any) =>
  new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sendResponse never called')), 2000);
    const kept = listener(msg, {}, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    if (kept !== true) {
      clearTimeout(timer);
      reject(new Error(`listener returned ${kept}`));
    }
  });

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const reads = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== 'PUT');
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');

const seedCache = (over: Record<string, any> = {}) => {
  store.pinnedTabsCache = {
    repo: 'o/r',
    config: cachedConfig,
    sha: 'sha-cached',
    etag: ETAG,
    fetchedAt: Date.now(),
    ...over,
  };
};

describe('listing groups', () => {
  it('reads the repo file when nothing is cached, and caches it', async () => {
    const response = await call({ type: 'LIST_PINNED_TAB_GROUPS' });

    expect(response.groups.map((g: any) => g.name)).toEqual(['Work']);
    expect(store.pinnedTabsCache).toMatchObject({ repo: 'o/r', sha: 'sha-1', etag: ETAG });
    expect(reads()).toHaveLength(1);
  });

  it('serves a fresh cache without calling GitHub at all', async () => {
    seedCache();

    const response = await call({ type: 'LIST_PINNED_TAB_GROUPS' });

    expect(response.groups.map((g: any) => g.name)).toEqual(['Cached']);
    expect(reads()).toHaveLength(0);
  });

  it('answers from a stale cache and refreshes it in the background', async () => {
    seedCache({ fetchedAt: Date.now() - PINNED_TABS_CACHE_TTL_MS - 1 });

    const response = await call({ type: 'LIST_PINNED_TAB_GROUPS' });

    expect(response.groups.map((g: any) => g.name)).toEqual(['Cached']);
    await settle();
    expect(reads()).toHaveLength(1);
    expect(store.pinnedTabsCache.config.groups[0].name).toBe('Work');
  });

  it('ignores a cache left behind by another repo', async () => {
    seedCache({ repo: 'other/repo' });

    const response = await call({ type: 'LIST_PINNED_TAB_GROUPS' });

    expect(response.groups.map((g: any) => g.name)).toEqual(['Work']);
    expect(store.pinnedTabsCache.repo).toBe('o/r');
  });

  it('replays the ETag and keeps the cache on a 304', async () => {
    seedCache({ fetchedAt: Date.now() - PINNED_TABS_CACHE_TTL_MS - 1 });
    fetchMock.mockResolvedValue({ ok: false, status: 304, statusText: 'Not Modified' });

    await call({ type: 'LIST_PINNED_TAB_GROUPS' });
    await settle();

    expect((reads()[0] as any)[1].headers['If-None-Match']).toBe(ETAG);
    expect(store.pinnedTabsCache.config.groups[0].name).toBe('Cached');
  });
});

describe('writing groups', () => {
  // A write commits against a sha. Trusting the cached one would clobber whatever changed in
  // the repo since it was cached, so a write always re-reads first.
  it('re-reads the file rather than committing against the cached sha', async () => {
    seedCache();

    await call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'Renamed' });

    expect(reads()).toHaveLength(1);
    expect(JSON.parse(writes()[0]?.[1].body).sha).toBe('sha-1');
  });

  it('commits a favourite and answers with the updated list', async () => {
    seedCache();

    const response = await call({
      type: 'FAVORITE_PINNED_TAB_GROUP',
      groupId: 'g1',
      favorite: true,
    });

    // Committed to the repo file itself, on top of the version just re-read.
    const [url, init] = writes()[0] ?? [];
    expect(url).toBe('https://api.github.com/repos/o/r/contents/.kh/browser.pinnedtabs.json');
    expect(JSON.parse(init.body).sha).toBe('sha-1');
    const written = JSON.parse(atob(JSON.parse(init.body).content));
    expect(written.groups[0]).toMatchObject({ id: 'g1', name: 'Work', favorite: true });
    expect(response.success).toBe(true);
    expect(response.groups).toEqual([
      expect.objectContaining({ id: 'g1', name: 'Work', favorite: true }),
    ]);
  });

  it('keeps a favourite through a rename or an update, and drops the field when unset', async () => {
    const favourite = { ...remoteConfig.groups[0], favorite: true };
    fetchMock.mockImplementation(async (_url: string, init?: any) =>
      init?.method === 'PUT'
        ? { ok: true, status: 200, json: async () => ({ content: { sha: 'sha-2' } }) }
        : {
            ok: true,
            status: 200,
            json: async () => ({
              content: btoa(JSON.stringify({ ...remoteConfig, groups: [favourite] })),
              sha: 'sha-1',
            }),
            headers: { get: () => null },
          },
    );
    const committed = (index: number) =>
      JSON.parse(atob(JSON.parse(writes()[index]?.[1].body).content)).groups[0];

    await call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'Renamed' });
    expect(committed(0)).toMatchObject({ name: 'Renamed', favorite: true });

    await call({ type: 'SAVE_PINNED_TAB_GROUP', groupId: 'g1' });
    expect(committed(1)).toMatchObject({ tabs: [], favorite: true });

    await call({ type: 'FAVORITE_PINNED_TAB_GROUP', groupId: 'g1', favorite: false });
    expect(committed(2)).not.toHaveProperty('favorite');
  });

  it('puts what it committed into the cache, with no ETag left to replay', async () => {
    await call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'Renamed' });

    expect(store.pinnedTabsCache).toMatchObject({ repo: 'o/r', sha: 'sha-2', etag: null });
    expect(store.pinnedTabsCache.config.groups[0].name).toBe('Renamed');
  });

  it('leaves the cache alone when the write fails', async () => {
    seedCache();
    fetchMock.mockImplementation(async (_url: string, init?: any) =>
      init?.method === 'PUT'
        ? { ok: false, status: 409, statusText: 'Conflict' }
        : {
            ok: true,
            status: 200,
            json: async () => ({ content: btoa(JSON.stringify(remoteConfig)), sha: 'sha-1' }),
            headers: { get: () => ETAG },
          },
    );

    await expect(
      call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'Renamed' }),
    ).resolves.toMatchObject({ error: expect.stringContaining('Failed to write') });

    expect(store.pinnedTabsCache.config.groups[0].name).toBe('Cached');
  });
});
