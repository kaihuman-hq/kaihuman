import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayCache } from './today';

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;

let listener: Listener;
let alarmListener: (alarm: { name: string }) => void;
let store: Record<string, any>;
let fetchMock: ReturnType<typeof vi.fn>;
/** What GitHub holds, by path. */
let remote: Record<string, string>;

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

const utf8ToBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

const pathOf = (url: string) => decodeURIComponent(url.split('/contents/')[1] ?? '');

beforeEach(async () => {
  vi.resetModules();
  store = { lifeos_token: 't', lifeos_repo: 'o/r' };
  remote = {
    '.kh/health.habit.csv': 'iso date;goal reached\n2020-01-01;x',
    '.kh/inbox.todos.md': '- [ ] existing\n',
  };
  fetchMock = vi.fn(async (url: string, init?: any) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body);
      remote[pathOf(url)] = new TextDecoder().decode(
        Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)),
      );
      return { ok: true, status: 200, json: async () => ({ content: { sha: 'new-sha' } }) };
    }
    if (url.includes('/git/trees/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tree: Object.keys(remote).map((path) => ({ path, type: 'blob', sha: `sha-${path}` })),
        }),
        headers: { get: () => null },
      };
    }
    const path = pathOf(url);
    if (!(path in remote)) return { ok: false, status: 404, statusText: 'Not Found' };
    return {
      ok: true,
      status: 200,
      text: async () => remote[path],
      json: async () => ({ content: utf8ToBase64(remote[path] ?? ''), sha: `sha-${path}` }),
    };
  });

  vi.stubGlobal('chrome', {
    alarms: {
      create: vi.fn(),
      onAlarm: {
        addListener: (l: typeof alarmListener) => {
          alarmListener = l;
        },
      },
    },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
    commands: { onCommand: { addListener: vi.fn() } },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    scripting: { executeScript: vi.fn(async () => []) },
    runtime: {
      getManifest: () => ({ content_scripts: [] }),
      onInstalled: { addListener: vi.fn() },
      onConnect: { addListener: vi.fn() },
      onMessage: {
        addListener: (l: Listener) => {
          listener = l;
        },
      },
    },
    storage: { local: localStorageStub(), session: { get: async () => ({}), set: async () => {} } },
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
    if (kept === false) {
      clearTimeout(timer);
    }
  });

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');

const seedCache = (over: Partial<TodayCache> = {}) => {
  store.todayCache = {
    repo: 'o/r',
    appFolder: '.kh',
    actionLogPaths: [],
    files: Object.entries(remote).map(([path, content]) => ({
      path,
      sha: `sha-${path}`,
      content,
    })),
    etag: null,
    fetchedAt: Date.now(),
    ...over,
  } satisfies TodayCache;
};

describe('GET_TODAY', () => {
  it('syncs once when there is no cache, then answers from it', async () => {
    const first = await call({ type: 'GET_TODAY' });
    expect(first.success).toBe(true);
    expect(first.today.inbox).toEqual({ path: '.kh/inbox.todos.md', count: 1 });
    expect(first.today.habits[0]).toMatchObject({ name: 'health', checkedToday: false });

    const requests = fetchMock.mock.calls.length;
    await call({ type: 'GET_TODAY' });
    expect(fetchMock.mock.calls.length).toBe(requests);
  });

  it('answers a stale cache at once and refreshes it behind the page', async () => {
    seedCache({ fetchedAt: 0 });
    const response = await call({ type: 'GET_TODAY' });
    expect(response.today.fetchedAt).toBe(0);
    await settle();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/git/trees/'))).toBe(true);
  });

  it('is refreshed by the hourly alarm', async () => {
    alarmListener({ name: 'repoSync' });
    await settle();
    await settle();
    expect(store.todayCache?.repo).toBe('o/r');
  });
});

describe('writes from the start page', () => {
  it('checks a habit in and answers with the new summary', async () => {
    seedCache();
    const response = await call({ type: 'TODAY_CHECK_IN', path: '.kh/health.habit.csv' });

    expect(response.success).toBe(true);
    expect(response.today.habits[0]).toMatchObject({ checkedToday: true, streak: 1 });
    expect(writes()).toHaveLength(1);
    expect(store.todayCache.files.find((f: any) => f.path === '.kh/health.habit.csv').sha).toBe(
      'new-sha',
    );
  });

  it('refuses to write a file of another kind, or one the page does not show', async () => {
    seedCache();
    const wrongKind = await call({ type: 'TODAY_CHECK_IN', path: '.kh/inbox.todos.md' });
    expect(wrongKind.error).toContain('not one of the start page');
    const unknown = await call({ type: 'TODAY_TOGGLE_TIMER', path: 'secret.timetracking.csv' });
    expect(unknown.error).toContain('not one of the start page');
    expect(writes()).toHaveLength(0);
  });

  it('adds a todo to the inbox as the console does, keeping what was there', async () => {
    seedCache();
    const response = await call({ type: 'ADD_TODO', text: 'Buy milk #home' });

    expect(response.today.inbox.count).toBe(2);
    expect(remote['.kh/inbox.todos.md']).toMatch(
      /^- \[ \] existing\n- \[ \] Buy milk #home\n::updated:: \d+ ::created:: \S+\n$/,
    );
  });

  it('adds an action log entry as the console does, over the version read', async () => {
    remote['.lifeos/dump.actionlog.md'] = '---\n---\n\n# Action Log\n\n- 2026-09-23 10:00:00 Old';
    const response = await call({
      type: 'ADD_ACTION_LOG',
      description: 'Shipped it',
      tags: ['work'],
    });
    expect(response.success).toBe(true);
    expect(remote['.lifeos/dump.actionlog.md']).toMatch(
      /^---\n---\n\n# Action Log\n\n- 2026-09-23 10:00:00 Old\n- \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} Shipped it #work$/,
    );
    expect(JSON.parse(writes()[0]?.[1].body).sha).toBe('sha-.lifeos/dump.actionlog.md');
  });

  it('only adds action log entries to action logs', async () => {
    for (const path of ['README.md', '../x.actionlog.md', '.kh/inbox.todos.md']) {
      const response = await call({ type: 'ADD_ACTION_LOG', path, description: 'x', tags: [] });
      expect(response.error).toContain('Refusing');
    }
    expect(writes()).toHaveLength(0);
  });

  it('saves a page for later in a new list when the repo has none', async () => {
    seedCache();
    const response = await call({
      type: 'READ_LATER_ADD',
      url: 'https://example.com/a',
      title: 'An article',
    });

    expect(response.today.readLater).toEqual([
      expect.objectContaining({ url: 'https://example.com/a', name: 'An article' }),
    ]);
    expect(JSON.parse(remote['.kh/reading.readitlater.json'] ?? '').items).toHaveLength(1);
  });

  it('writes over a known list when GitHub will not read it back', async () => {
    remote['.kh/.readitlater.json'] = JSON.stringify({
      items: [{ id: 'old', url: 'https://example.com/old', name: 'Old', status: 'new' }],
    });
    seedCache();
    const serve = fetchMock.getMockImplementation();
    // GitHub, like the real API, refuses to replace a file without its sha.
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT' && !JSON.parse(init.body).sha) {
        return {
          ok: false,
          status: 422,
          statusText: '',
          json: async () => ({ message: 'Invalid request. "sha" wasn\'t supplied.' }),
        };
      }
      if (!init?.method && pathOf(url) === '.kh/.readitlater.json') {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      return serve?.(url, init);
    });

    const response = await call({
      type: 'READ_LATER_ADD',
      url: 'https://example.com/a',
      title: 'An article',
    });

    expect(response.error).toBeUndefined();
    expect(JSON.parse(writes()[0]?.[1].body).sha).toBe('sha-.kh/.readitlater.json');
    expect(
      JSON.parse(remote['.kh/.readitlater.json'] ?? '').items.map((item: any) => item.url),
    ).toEqual(['https://example.com/old', 'https://example.com/a']);
  });

  it('says why GitHub refused to save a page for later', async () => {
    seedCache();
    const read = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url: string, init?: any) =>
      init?.method === 'PUT'
        ? {
            ok: false,
            status: 404,
            statusText: '',
            json: async () => ({ message: 'Not Found' }),
          }
        : read?.(url, init),
    );
    const response = await call({
      type: 'READ_LATER_ADD',
      url: 'https://example.com/a',
      title: 'An article',
    });

    expect(response.error).toBe(
      'Failed to write .kh/reading.readitlater.json: 404 Not Found — check that the token may write to this repository',
    );
  });

  it('only saves web pages for later', async () => {
    seedCache();
    const response = await call({ type: 'READ_LATER_ADD', url: 'javascript:alert(1)' });
    expect(response.error).toContain('Only web pages');
    expect(writes()).toHaveLength(0);
  });
});

describe('GET_SYNC_STATUS', () => {
  it('reports the oldest cache and the opens still to push', async () => {
    seedCache({ fetchedAt: 5_000 });
    store.bookmarksCache = {
      repo: 'o/r',
      bookmarks: [],
      sha: null,
      etag: null,
      fetchedAt: 9_000,
    };
    store.bookmarkUsage = {
      repo: 'o/r',
      deltas: { a: { count: 2, lastUsedAt: '' }, b: { count: 1, lastUsedAt: '' } },
    };

    expect(await call({ type: 'GET_SYNC_STATUS' })).toEqual({
      success: true,
      syncedAt: 5_000,
      pendingOpens: 3,
    });
  });

  it('says nothing was synced for another repo’s caches', async () => {
    seedCache({ repo: 'other/repo' });
    expect((await call({ type: 'GET_SYNC_STATUS' })).syncedAt).toBeNull();
  });
});

describe('the palette’s widget entries', () => {
  it('lists the files it can add to, with their console links', async () => {
    remote['notes/plain.md'] = 'x';
    remote['family.events.csv'] = '';
    const response = await call({ type: 'LIST_ENTRY_FILES' });
    expect(response.files.map((file: any) => file.path)).toEqual([
      '.kh/inbox.todos.md',
      'family.events.csv',
    ]);
    expect(response.files[0]).toMatchObject({
      name: 'inbox.todos.md',
      url: expect.stringContaining('/files/.kh/inbox.todos.md?repo=o%2Fr'),
    });
  });

  it('reads a file with its version, and a missing one as empty', async () => {
    expect(await call({ type: 'READ_ENTRY_FILE', path: '.kh/inbox.todos.md' })).toMatchObject({
      content: '- [ ] existing\n',
      sha: 'sha-.kh/inbox.todos.md',
    });
    const missing = await call({ type: 'READ_ENTRY_FILE', path: 'new.events.csv' });
    expect(missing).toMatchObject({ success: true, content: '' });
    expect(missing.sha).toBeUndefined();
  });

  it('writes over the version read and keeps the start page’s cache in step', async () => {
    seedCache();
    const content = '- [ ] existing\n- [ ] added\n';
    const response = await call({
      type: 'WRITE_ENTRY_FILE',
      path: '.kh/inbox.todos.md',
      content,
      sha: 'sha-.kh/inbox.todos.md',
    });
    expect(response.success).toBe(true);
    expect(remote['.kh/inbox.todos.md']).toBe(content);
    expect(JSON.parse(writes()[0]?.[1].body).sha).toBe('sha-.kh/inbox.todos.md');
    expect(store.todayCache.files.find((f: any) => f.path === '.kh/inbox.todos.md')).toEqual({
      path: '.kh/inbox.todos.md',
      sha: 'new-sha',
      content,
    });
  });

  it('refuses any other file, or a path out of the repository', async () => {
    for (const path of ['secret.md', '../x.todos.md', '/x.todos.md', 'a//x.todos.md']) {
      expect((await call({ type: 'READ_ENTRY_FILE', path })).error).toContain('Refusing');
      expect((await call({ type: 'WRITE_ENTRY_FILE', path, content: 'x' })).error).toContain(
        'Refusing',
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
