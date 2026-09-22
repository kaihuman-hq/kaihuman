import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS } from './bookmarks';

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;

let listener: Listener;
let commandListener: (command: string) => unknown;
let store: Record<string, any>;
let sendMessage: ReturnType<typeof vi.fn>;
let broadcast: ReturnType<typeof vi.fn>;
let tabsCreate: ReturnType<typeof vi.fn>;
let tabsUpdate: ReturnType<typeof vi.fn>;
let tabsGet: ReturnType<typeof vi.fn>;
let executeScript: ReturnType<typeof vi.fn>;
let setBadgeText: ReturnType<typeof vi.fn>;
let getBookmarkTree: ReturnType<typeof vi.fn>;
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
  broadcast = vi.fn(async () => ({ success: true }));
  tabsCreate = vi.fn(async () => ({ id: 1 }));
  tabsUpdate = vi.fn(async () => ({ id: 7 }));
  tabsGet = vi.fn(async () => ({ id: 7, url: 'https://example.com/' }));
  executeScript = vi.fn(async () => []);
  setBadgeText = vi.fn(async () => {});
  getBookmarkTree = vi.fn(async () => [
    {
      title: '',
      children: [
        {
          title: 'Bookmarks bar',
          children: [
            { title: 'Zulip', url: 'https://zulip.example/' },
            { title: 'Dev', children: [{ title: 'Biome', url: 'https://biomejs.dev/' }] },
          ],
        },
      ],
    },
  ]);
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
    action: { setBadgeText, setBadgeBackgroundColor: vi.fn(async () => {}) },
    bookmarks: { getTree: getBookmarkTree },
    permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true) },
    scripting: { executeScript },
    runtime: {
      getManifest: () => ({ content_scripts: [{ js: ['assets/content-loader-abc123.js'] }] }),
      getURL: (path: string) => `chrome-extension://abc/${path}`,
      sendMessage: broadcast,
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
      update: tabsUpdate,
      get: tabsGet,
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
        useCount: 0,
        lastUsedAt: '',
        pinned: false,
      },
    ]);
    expect(store.bookmarksCache).toMatchObject({ repo: 'o/r', sha: 'sha-1', etag: ETAG });
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
      sha: 'sha-1',
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
      sha: 'sha-1',
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
      sha: 'sha-x',
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
      sha: 'sha-1',
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
    store.bookmarksCache = {
      repo: 'o/r',
      bookmarks: [],
      sha: 'sha-1',
      etag: ETAG,
      fetchedAt: Date.now(),
    };

    listener({ type: 'AUTH_TOKEN_UPDATE', token: 'new', repo: 'o/r' }, {}, () => {});
    await settle();

    expect(store.bookmarksCache).toBeUndefined();
  });
});

describe('SET_BOOKMARK_PINNED', () => {
  const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
  const writtenFile = () => JSON.parse(atob(JSON.parse(writes()[0]?.[1].body).content));

  it('commits the pin straight away and answers with the list to show', async () => {
    const response = await call({ type: 'SET_BOOKMARK_PINNED', bookmarkId: 'b1', pinned: true });

    expect(response).toMatchObject({ success: true });
    expect(response.bookmarks[0]).toMatchObject({ id: 'b1', pinned: true });
    expect(writes()).toHaveLength(1);
    expect(writtenFile().bookmarks[0]).toMatchObject({ id: 'b1', pinned: true });
    expect(store.bookmarksCache.bookmarks[0]).toMatchObject({ id: 'b1', pinned: true });
  });

  it('says so when the bookmark is gone from the repo', async () => {
    const response = await call({ type: 'SET_BOOKMARK_PINNED', bookmarkId: 'gone', pinned: true });

    expect(response.error).toMatch(/no longer in the repo/);
    expect(writes()).toHaveLength(0);
  });
});

describe('ADD_BOOKMARK', () => {
  const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');

  const writtenFile = () => JSON.parse(atob(JSON.parse(writes()[0]?.[1].body).content));

  it('prepends the page to the repo file and keeps the existing entries', async () => {
    const response = await call({
      type: 'ADD_BOOKMARK',
      url: 'https://example.com/post',
      title: 'A post',
      tags: ['reading'],
    });

    expect(response).toMatchObject({ success: true, title: 'A post' });
    const file = writtenFile();
    expect(file.bookmarks.map((b: any) => b.title)).toEqual(['A post', 'Vitest']);
    expect(file.bookmarks[0]).toMatchObject({ url: 'https://example.com/post', tags: ['reading'] });
  });

  it('sends the existing sha so the write is not a blind overwrite', async () => {
    await call({ type: 'ADD_BOOKMARK', url: 'https://example.com/post', title: 'A post' });

    expect(JSON.parse(writes()[0]?.[1].body).sha).toBe('sha-1');
  });

  it('puts the new bookmark straight into the cache, with no etag to replay', async () => {
    await call({ type: 'ADD_BOOKMARK', url: 'https://example.com/post', title: 'A post' });

    expect(store.bookmarksCache).toMatchObject({ repo: 'o/r', etag: null });
    expect(store.bookmarksCache.bookmarks.map((b: any) => b.title)).toEqual(['A post', 'Vitest']);
  });

  it('refuses a page that is already bookmarked, and writes nothing', async () => {
    await expect(
      call({ type: 'ADD_BOOKMARK', url: 'https://vitest.dev', title: 'Vitest again' }),
    ).resolves.toMatchObject({ error: expect.stringContaining('already bookmarked') });
    expect(writes()).toHaveLength(0);
  });

  it('refuses a scheme the browser must not navigate to', async () => {
    await expect(
      call({ type: 'ADD_BOOKMARK', url: 'javascript:alert(1)', title: 'Bad' }),
    ).resolves.toMatchObject({ error: expect.stringContaining('http(s)') });
    expect(writes()).toHaveLength(0);
  });

  it('starts a new file when the repo has none yet', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: any) =>
      init?.method === 'PUT'
        ? { ok: true, status: 200, json: async () => ({}) }
        : { ok: false, status: 404, statusText: 'Not Found' },
    );

    await call({ type: 'ADD_BOOKMARK', url: 'https://example.com/post', title: 'A post' });

    expect(writtenFile().bookmarks.map((b: any) => b.title)).toEqual(['A post']);
    expect(JSON.parse(writes()[0]?.[1].body).sha).toBeUndefined();
  });

  it('reports a failed write instead of leaving a wrong cache behind', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: any) =>
      init?.method === 'PUT' ? { ok: false, status: 409, statusText: 'Conflict' } : okFile(),
    );

    await expect(
      call({ type: 'ADD_BOOKMARK', url: 'https://example.com/post', title: 'A post' }),
    ).resolves.toMatchObject({ error: expect.stringContaining('Failed to write') });
    expect(store.bookmarksCache).toBeUndefined();
  });

  it('needs a token', async () => {
    delete store.lifeos_token;

    await expect(
      call({ type: 'ADD_BOOKMARK', url: 'https://example.com/post', title: 'A post' }),
    ).resolves.toMatchObject({ error: 'No token found' });
  });
});

describe('SEARCH_REPO', () => {
  const codeSearch = (items: any[]) => ({ ok: true, status: 200, json: async () => ({ items }) });

  it('scopes one code-search request to the active repo and maps the hits to console links', async () => {
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

    // The hit opens in the console, not on GitHub — that is where the file is worked on.
    expect(response.results).toEqual([
      {
        path: 'apps/console/vite.config.ts',
        name: 'vite.config.ts',
        // The repo rides along so the console opens this repo's file, not the one it happens
        // to have selected.
        url: 'https://app.kaihuman.com/files/apps/console/vite.config.ts?repo=o%2Fr',
      },
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

  // What the start page asks for: it is a blank tab the user is leaving anyway.
  it('navigates the sender\u2019s own tab when it asks to reuse it', async () => {
    const response = await new Promise<any>((resolve) => {
      listener(
        { type: 'OPEN_URL', url: 'https://example.com/', reuse: true },
        { tab: { id: 7 } },
        resolve,
      );
    });

    expect(response).toMatchObject({ success: true });
    expect(tabsUpdate).toHaveBeenCalledWith(7, { url: 'https://example.com/' });
    expect(tabsCreate).not.toHaveBeenCalled();
  });

  it('opens a new tab when the sender has none to reuse', async () => {
    expect(
      await call({ type: 'OPEN_URL', url: 'https://example.com/', reuse: true }),
    ).toMatchObject({
      success: true,
    });
    expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://example.com/', active: true });
    expect(tabsUpdate).not.toHaveBeenCalled();
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
  const NO_RECEIVER = new Error('Could not establish connection. Receiving end does not exist.');

  it('relays the command to the active tab', async () => {
    await commandListener('toggle-command-palette');

    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'TOGGLE_COMMAND_PALETTE' });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('ignores other commands', async () => {
    await commandListener('something-else');

    expect(sendMessage).not.toHaveBeenCalled();
  });

  // Every tab that was already open when the extension was loaded is in this state: declared
  // content scripts only run on page load, so the relay has nothing to talk to yet.
  it('injects the content script when the tab has none, then relays again', async () => {
    sendMessage.mockRejectedValueOnce(NO_RECEIVER);

    await commandListener('toggle-command-palette');

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      // Taken from the manifest, so the bundler's hashed filename is never hard-coded.
      files: ['assets/content-loader-abc123.js'],
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(setBadgeText).not.toHaveBeenCalledWith({ tabId: 7, text: '!' });
  });

  it('keeps retrying while the injected module is still starting up', async () => {
    sendMessage
      .mockRejectedValueOnce(NO_RECEIVER)
      .mockRejectedValueOnce(NO_RECEIVER)
      .mockRejectedValueOnce(NO_RECEIVER)
      .mockResolvedValue({ success: true });

    await commandListener('toggle-command-palette');

    expect(sendMessage).toHaveBeenCalledTimes(4);
    expect(setBadgeText).not.toHaveBeenCalledWith({ tabId: 7, text: '!' });
  });

  // The start page is an extension page: nothing can be injected into it, and it hears the
  // broadcast instead. Badging it would say the palette does not work on a page where it does.
  it('broadcasts instead of injecting when the tab is the extension\u2019s own page', async () => {
    sendMessage.mockRejectedValue(NO_RECEIVER);
    tabsGet.mockResolvedValue({ id: 7, url: 'chrome-extension://abc/newtab.html' });

    await commandListener('toggle-command-palette');

    expect(broadcast).toHaveBeenCalledWith({ type: 'TOGGLE_COMMAND_PALETTE' });
    expect(executeScript).not.toHaveBeenCalled();
    expect(setBadgeText).not.toHaveBeenCalledWith({ tabId: 7, text: '!' });
  });

  it('badges the icon when the page refuses injection', async () => {
    sendMessage.mockRejectedValue(NO_RECEIVER);
    executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'));

    await commandListener('toggle-command-palette');

    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '!' });
  });

  it('badges the icon when injection works but the script never answers', async () => {
    sendMessage.mockRejectedValue(NO_RECEIVER);

    await commandListener('toggle-command-palette');

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '!' });
  });

  it('clears a stale failure badge before trying again', async () => {
    await commandListener('toggle-command-palette');

    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '' });
  });
});

describe('IMPORT_CHROME_BOOKMARKS', () => {
  const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
  const writtenFile = () => JSON.parse(atob(JSON.parse(writes()[0]?.[1].body).content));

  it('copies the browser\u2019s bookmarks into the repo file in one commit', async () => {
    const response = await call({ type: 'IMPORT_CHROME_BOOKMARKS' });

    expect(response).toMatchObject({ success: true, imported: 2, skipped: 0, total: 2 });
    expect(writes()).toHaveLength(1);
  });

  it('appends them in browser order, leaving what the file already had on top', async () => {
    await call({ type: 'IMPORT_CHROME_BOOKMARKS' });

    expect(writtenFile().bookmarks.map((b: any) => b.title)).toEqual(['Vitest', 'Zulip', 'Biome']);
  });

  it('tags a bookmark with the folder it came from', async () => {
    await call({ type: 'IMPORT_CHROME_BOOKMARKS' });

    const imported = writtenFile().bookmarks.slice(1);
    expect(imported.find((b: any) => b.url === 'https://biomejs.dev/').tags).toEqual(['Dev']);
    expect(imported.find((b: any) => b.url === 'https://zulip.example/').tags).toEqual([]);
  });

  it('skips pages already in the file, so a second run is safe', async () => {
    // The seeded file already holds https://vitest.dev/.
    getBookmarkTree.mockResolvedValue([
      {
        title: '',
        children: [
          { title: 'Bookmarks bar', children: [{ title: 'Vitest', url: 'https://vitest.dev/' }] },
        ],
      },
    ]);

    const response = await call({ type: 'IMPORT_CHROME_BOOKMARKS' });

    expect(response).toMatchObject({ imported: 0, skipped: 1 });
    expect(writtenFile().bookmarks.map((b: any) => b.title)).toEqual(['Vitest']);
  });

  it('drops entries the browser must not navigate to', async () => {
    getBookmarkTree.mockResolvedValue([
      {
        title: '',
        children: [
          {
            title: 'Bookmarks bar',
            children: [
              { title: 'Evil', url: 'javascript:alert(1)' },
              { title: 'Fine', url: 'https://fine.example/' },
            ],
          },
        ],
      },
    ]);

    const response = await call({ type: 'IMPORT_CHROME_BOOKMARKS' });

    expect(response).toMatchObject({ imported: 1, skipped: 1 });
    expect(writtenFile().bookmarks.map((b: any) => b.title)).toEqual(['Vitest', 'Fine']);
  });

  it('puts the result straight into the cache', async () => {
    await call({ type: 'IMPORT_CHROME_BOOKMARKS' });

    expect(store.bookmarksCache.bookmarks).toHaveLength(3);
    expect(store.bookmarksCache).toMatchObject({ repo: 'o/r', etag: null });
  });
});

describe('recent actions', () => {
  it('starts empty', async () => {
    expect(await call({ type: 'GET_RECENTS' })).toMatchObject({ success: true, recents: [] });
  });

  it('keeps the newest first', async () => {
    await call({ type: 'ADD_RECENT', entry: { id: 'a', title: 'A' } });
    await call({ type: 'ADD_RECENT', entry: { id: 'b', title: 'B' } });

    const { recents } = await call({ type: 'GET_RECENTS' });
    expect(recents.map((r: any) => r.id)).toEqual(['b', 'a']);
  });

  it('moves a repeat back to the top instead of duplicating it', async () => {
    await call({ type: 'ADD_RECENT', entry: { id: 'a', title: 'A' } });
    await call({ type: 'ADD_RECENT', entry: { id: 'b', title: 'B' } });
    await call({ type: 'ADD_RECENT', entry: { id: 'a', title: 'A' } });

    const { recents } = await call({ type: 'GET_RECENTS' });
    expect(recents.map((r: any) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps only the last ten', async () => {
    for (let i = 0; i < 13; i++) {
      await call({ type: 'ADD_RECENT', entry: { id: `a${i}`, title: `A${i}` } });
    }

    const { recents } = await call({ type: 'GET_RECENTS' });
    expect(recents).toHaveLength(10);
    expect(recents[0].id).toBe('a12');
    expect(recents.at(-1).id).toBe('a3');
  });

  it('ignores an entry with nothing to show', async () => {
    await call({ type: 'ADD_RECENT', entry: { id: '', title: '' } });
    expect((await call({ type: 'GET_RECENTS' })).recents).toEqual([]);
  });
});

describe('repository switching', () => {
  it('reports the current repo and the ones the console shared', async () => {
    store.lifeos_repos = [{ full_name: 'o/r' }, { full_name: 'other/repo' }];

    expect(await call({ type: 'GET_REPOS' })).toMatchObject({
      repo: 'o/r',
      repos: [{ full_name: 'o/r' }, { full_name: 'other/repo' }],
    });
  });

  it('switches the repo, which the caches notice by themselves', async () => {
    store.bookmarksCache = {
      repo: 'o/r',
      bookmarks: [],
      sha: null,
      etag: null,
      fetchedAt: Date.now(),
    };

    await call({ type: 'SET_REPO', repo: 'other/repo' });
    expect(store.lifeos_repo).toBe('other/repo');

    // The stale cache is from the old repo, so the next read fetches rather than serving it.
    const response = await call({ type: 'GET_BOOKMARKS' });
    expect(response.bookmarks.map((b: any) => b.title)).toEqual(['Vitest']);
    expect(store.bookmarksCache.repo).toBe('other/repo');
  });
});

describe('usage counting', () => {
  const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
  const writtenFile = () => JSON.parse(atob(JSON.parse(writes()[0]?.[1].body).content));

  const cachedAt = (fetchedAt: number) => {
    store.bookmarksCache = {
      repo: 'o/r',
      bookmarks: [
        {
          id: 'b1',
          title: 'Vitest',
          url: 'https://vitest.dev/',
          tags: [],
          createdAt: '',
          updatedAt: '',
          useCount: 2,
          lastUsedAt: '',
        },
      ],
      sha: 'sha-1',
      etag: ETAG,
      fetchedAt,
    };
  };

  it('counts an open locally, without touching GitHub', async () => {
    cachedAt(Date.now());

    expect(await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' })).toMatchObject({
      success: true,
      pending: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.bookmarkUsage.deltas.b1.count).toBe(1);
  });

  it('adds what was counted to the list it hands out', async () => {
    cachedAt(Date.now());
    await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' });
    await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' });

    const { bookmarks } = await call({ type: 'GET_BOOKMARKS' });

    // Two counted on top of the two GitHub already knew about.
    expect(bookmarks[0].useCount).toBe(4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the cache holding GitHub\u2019s number, so nothing is counted twice', async () => {
    cachedAt(Date.now());
    await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' });

    await call({ type: 'GET_BOOKMARKS' });
    await call({ type: 'GET_BOOKMARKS' });

    expect(store.bookmarksCache.bookmarks[0].useCount).toBe(2);
    expect((await call({ type: 'GET_BOOKMARKS' })).bookmarks[0].useCount).toBe(3);
  });

  it('pushes the counts on the next sync, on top of what GitHub holds', async () => {
    cachedAt(Date.now() - CACHE_TTL_MS - 1);
    await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' });

    await call({ type: 'SYNC_NOW' });

    // The seeded remote file has useCount 0, so the delta lands on that, not on the cache's 2.
    expect(writtenFile().bookmarks[0]).toMatchObject({ id: 'b1', useCount: 1 });
    expect(store.bookmarkUsage.deltas).toEqual({});
    expect(store.bookmarksCache.bookmarks[0].useCount).toBe(1);
  });

  it('commits nothing when an hour passes with nothing opened', async () => {
    cachedAt(Date.now() - CACHE_TTL_MS - 1);

    await call({ type: 'SYNC_NOW' });

    expect(writes()).toHaveLength(0);
  });

  it('syncs a fresh cache anyway when asked outright, and pushes what was counted', async () => {
    cachedAt(Date.now());
    await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' });

    // "Sync now" is the user asking, which is not background traffic — the budget does not apply.
    expect(await call({ type: 'SYNC_NOW', force: true })).toMatchObject({ synced: true });
    expect(writtenFile().bookmarks[0]).toMatchObject({ id: 'b1', useCount: 1 });
    expect(store.bookmarkUsage.deltas).toEqual({});
  });

  // The groups come along on a forced sync, but a broken groups file must not take the
  // bookmarks sync down with it — this fixture serves the bookmarks file for every read.
  it('still reports success when the pinned-tab groups cannot be read', async () => {
    cachedAt(Date.now());

    expect(await call({ type: 'SYNC_NOW', force: true })).toMatchObject({ synced: true });
  });

  it('holds to the hourly budget while the cache is fresh', async () => {
    cachedAt(Date.now());
    await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' });

    expect(await call({ type: 'SYNC_NOW' })).toMatchObject({ synced: false, reason: 'fresh' });
    expect(fetchMock).not.toHaveBeenCalled();
    // The count is not lost, it is simply waiting for the next hour.
    expect(store.bookmarkUsage.deltas.b1.count).toBe(1);
  });

  it('lets a commit carry the counts along, since it is going out anyway', async () => {
    cachedAt(Date.now());
    await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'b1' });

    await call({ type: 'ADD_BOOKMARK', url: 'https://example.com/post', title: 'A post' });

    expect(writtenFile().bookmarks.find((b: any) => b.id === 'b1').useCount).toBe(1);
    expect(store.bookmarkUsage.deltas).toEqual({});
  });

  it('drops a count for a bookmark deleted in the console', async () => {
    cachedAt(Date.now() - CACHE_TTL_MS - 1);
    await call({ type: 'RECORD_BOOKMARK_USE', bookmarkId: 'gone' });

    await call({ type: 'SYNC_NOW' });

    // GitHub leads on which bookmarks exist, so there is nothing to push.
    expect(writes()).toHaveLength(0);
    expect(store.bookmarksCache.bookmarks.map((b: any) => b.id)).toEqual(['b1']);
  });

  it('ignores counts left over from another repo', async () => {
    cachedAt(Date.now());
    store.bookmarkUsage = { repo: 'other/repo', deltas: { b1: { count: 9, lastUsedAt: '' } } };

    expect((await call({ type: 'GET_BOOKMARKS' })).bookmarks[0].useCount).toBe(2);
  });
});

describe('the optional bookmarks permission', () => {
  it('refuses the import until it is granted, pointing at the popup', async () => {
    (chrome as any).permissions.contains = vi.fn(async () => false);

    await expect(call({ type: 'IMPORT_CHROME_BOOKMARKS' })).resolves.toMatchObject({
      error: expect.stringContaining('popup'),
    });
    expect(getBookmarkTree).not.toHaveBeenCalled();
  });
});
