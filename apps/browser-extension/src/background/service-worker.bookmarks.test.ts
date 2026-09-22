import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS } from './bookmarks';

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;

let listener: Listener;
let commandListener: (command: string) => unknown;
let store: Record<string, any>;
let sendMessage: ReturnType<typeof vi.fn>;
let tabsCreate: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

const BOOKMARKS_FILE = {
  sha: 'sha-1',
  content: btoa(
    JSON.stringify({
      bookmarks: [
        {
          id: 'b1',
          title: 'Vitest',
          url: 'https://vitest.dev/',
          tags: ['testing'],
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      updatedAt: '2026-09-01T00:00:00.000Z',
    }),
  ),
};

const ETAG = 'W/"etag-1"';

const okFile = async () => ({
  ok: true,
  status: 200,
  json: async () => BOOKMARKS_FILE,
  headers: { get: (name: string) => (name === 'etag' ? ETAG : null) },
});

/** `chrome.storage.local` accepts both a callback and a promise; the worker uses both forms. */
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
  vi.useRealTimers();
  store = { lifeos_token: 't', lifeos_repo: 'o/r' };
  sendMessage = vi.fn(async () => ({ success: true }));
  tabsCreate = vi.fn(async () => ({ id: 1 }));
  fetchMock = vi.fn(okFile);

  vi.stubGlobal('chrome', {
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
    commands: {
      onCommand: {
        addListener: (l: (command: string) => unknown) => {
          commandListener = l;
        },
      },
    },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    runtime: {
      onInstalled: { addListener: vi.fn() },
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
    },
    tabs: {
      query: async () => [{ id: 7, windowId: 1 }],
      create: tabsCreate,
      update: vi.fn(),
      sendMessage,
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  await import('./service-worker');
});

const call = (msg: any) =>
  new Promise<any>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('PORT CLOSED: sendResponse never called')),
      2000,
    );
    const kept = listener(msg, {}, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    if (kept !== true) {
      clearTimeout(timer);
      reject(new Error(`listener returned ${kept}, port closes immediately`));
    }
  });

/** Lets a background refresh the handler deliberately did not await finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const fileRequests = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('browser.bookmarks.json'));

describe('GET_BOOKMARKS', () => {
  it('reads the repo file when nothing is cached and caches what it read', async () => {
    const response = await call({ type: 'GET_BOOKMARKS' });

    expect(response).toMatchObject({ success: true, stale: false });
    expect(response.bookmarks).toEqual([
      {
        id: 'b1',
        title: 'Vitest',
        url: 'https://vitest.dev/',
        tags: ['testing'],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    expect(store.bookmarksCache).toMatchObject({ repo: 'o/r', etag: ETAG });
    expect(fileRequests()).toHaveLength(1);
  });

  it('serves a fresh cache without calling GitHub at all', async () => {
    store.bookmarksCache = {
      repo: 'o/r',
      bookmarks: [
        {
          id: 'c1',
          title: 'Cached',
          url: 'https://cached.example/',
          tags: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      etag: ETAG,
      fetchedAt: Date.now(),
    };

    const response = await call({ type: 'GET_BOOKMARKS' });

    expect(response.bookmarks.map((b: any) => b.title)).toEqual(['Cached']);
    expect(response.stale).toBe(false);
    expect(fileRequests()).toHaveLength(0);
  });

  it('answers from a stale cache and refreshes it in the background', async () => {
    store.bookmarksCache = {
      repo: 'o/r',
      bookmarks: [
        {
          id: 'c1',
          title: 'Cached',
          url: 'https://cached.example/',
          tags: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      etag: 'W/"old-etag"',
      fetchedAt: Date.now() - CACHE_TTL_MS - 1,
    };

    const response = await call({ type: 'GET_BOOKMARKS' });

    // The stale copy is what the caller gets — the palette never waits on GitHub.
    expect(response).toMatchObject({ stale: true });
    expect(response.bookmarks.map((b: any) => b.title)).toEqual(['Cached']);

    await settle();
    expect(fileRequests()).toHaveLength(1);
    expect(store.bookmarksCache.bookmarks.map((b: any) => b.title)).toEqual(['Vitest']);
  });

  it('ignores a cache left behind by another repo', async () => {
    store.bookmarksCache = {
      repo: 'other/repo',
      bookmarks: [
        {
          id: 'x',
          title: 'Foreign',
          url: 'https://foreign.example/',
          tags: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      etag: 'W/"etag-x"',
      fetchedAt: Date.now(),
    };

    const response = await call({ type: 'GET_BOOKMARKS' });

    expect(response.bookmarks.map((b: any) => b.title)).toEqual(['Vitest']);
    expect(store.bookmarksCache.repo).toBe('o/r');
  });

  it("replays GitHub's ETag and keeps the cache on a 304", async () => {
    store.bookmarksCache = {
      repo: 'o/r',
      bookmarks: [
        {
          id: 'c1',
          title: 'Cached',
          url: 'https://cached.example/',
          tags: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      etag: ETAG,
      fetchedAt: Date.now() - CACHE_TTL_MS - 1,
    };
    fetchMock.mockResolvedValue({ ok: false, status: 304, statusText: 'Not Modified' });

    await call({ type: 'GET_BOOKMARKS' });
    await settle();

    const [, init] = fileRequests()[0] as [string, any];
    expect(init.headers['If-None-Match']).toBe(ETAG);
    expect(store.bookmarksCache.bookmarks.map((b: any) => b.title)).toEqual(['Cached']);
  });

  it('treats a repo without the file as an empty list', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    expect(await call({ type: 'GET_BOOKMARKS' })).toMatchObject({ success: true, bookmarks: [] });
    expect(store.bookmarksCache).toMatchObject({ repo: 'o/r', bookmarks: [], etag: null });
  });

  it('reports a failed read instead of pretending the list is empty', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });

    await expect(call({ type: 'GET_BOOKMARKS' })).resolves.toMatchObject({
      error: expect.stringContaining('Failed to read'),
    });
  });

  it('says to log in when there is no token and no cache', async () => {
    delete store.lifeos_token;

    await expect(call({ type: 'GET_BOOKMARKS' })).resolves.toMatchObject({
      error: expect.stringContaining('No token found'),
    });
    expect(fileRequests()).toHaveLength(0);
  });

  it('drops the cache when a new token arrives, since the account may differ', async () => {
    store.bookmarksCache = { repo: 'o/r', bookmarks: [], etag: ETAG, fetchedAt: Date.now() };

    listener({ type: 'AUTH_TOKEN_UPDATE', token: 'new', repo: 'o/r' }, {}, () => {});
    await settle();

    expect(store.bookmarksCache).toBeUndefined();
  });
});

describe('SEARCH_REPO', () => {
  const codeSearch = (items: any[]) => ({ ok: true, status: 200, json: async () => ({ items }) });

  it('scopes one code-search request to the active repo and maps the hits', async () => {
    fetchMock.mockResolvedValue(
      codeSearch([
        {
          path: 'apps/console/vite.config.ts',
          name: 'vite.config.ts',
          html_url: 'https://github.test/1',
        },
      ]),
    );

    const response = await call({ type: 'SEARCH_REPO', query: 'defineConfig' });

    expect(response.results).toEqual([
      { path: 'apps/console/vite.config.ts', name: 'vite.config.ts', url: 'https://github.test/1' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `q=${encodeURIComponent('defineConfig repo:o/r')}`,
    );
  });

  it('does not call GitHub for an empty query', async () => {
    expect(await call({ type: 'SEARCH_REPO', query: '   ' })).toMatchObject({ results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a 403 into an actionable rate-limit message', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

    await expect(call({ type: 'SEARCH_REPO', query: 'anything' })).resolves.toMatchObject({
      error: expect.stringContaining('rate limited'),
    });
  });
});

describe('OPEN_URL', () => {
  it('opens an http(s) url in a new tab', async () => {
    expect(await call({ type: 'OPEN_URL', url: 'https://example.com/' })).toMatchObject({
      success: true,
    });
    expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://example.com/', active: true });
  });

  it('refuses a scheme the palette must never be able to trigger', async () => {
    const refused = await new Promise<any>((resolve) => {
      listener({ type: 'OPEN_URL', url: 'javascript:alert(1)' }, {}, resolve);
    });

    expect(refused).toMatchObject({ error: expect.stringContaining('Refusing') });
    expect(tabsCreate).not.toHaveBeenCalled();
  });
});

describe('the palette shortcut', () => {
  it('relays the command to the active tab', async () => {
    await commandListener('toggle-command-palette');

    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'TOGGLE_COMMAND_PALETTE' });
  });

  it('ignores other commands', async () => {
    await commandListener('something-else');

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('survives a page with no content script', async () => {
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

    await expect(commandListener('toggle-command-palette')).resolves.toBeUndefined();
  });
});
