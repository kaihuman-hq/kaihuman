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
    if (url.endsWith('/api/v2/status.json')) {
      return { ok: true, status: 200, json: async () => ({ status: { indicator: 'none' } }) };
    }
    if (init?.method === 'DELETE') {
      const path = pathOf(url);
      if (!(path in remote)) return { ok: false, status: 404, statusText: 'Not Found' };
      delete remote[path];
      return { ok: true, status: 200, json: async () => ({}) };
    }
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
      get: vi.fn(async () => undefined),
      onAlarm: {
        addListener: (l: typeof alarmListener) => {
          alarmListener = l;
        },
      },
    },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
    commands: { onCommand: { addListener: vi.fn() } },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    permissions: { contains: vi.fn(async () => true) },
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

    // The sync starts the AI jobs behind the answer; they read the bookmarks, so let them finish.
    for (let i = 0; i < 20; i++) await settle();
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

  it('adds a todo to another known list, with its tags and milestone', async () => {
    remote['work.todos.md'] = '- [ ] existing\n';
    seedCache();
    const response = await call({
      type: 'ADD_TODO',
      text: 'Call the bank #urgent',
      path: 'work.todos.md',
      tags: ['bank'],
      milestoneId: 'q4',
    });
    expect(response.success).toBe(true);
    expect(remote['work.todos.md']).toMatch(/- \[ \] Call the bank #bank #urgent !q4\n/);
    expect(remote['.kh/inbox.todos.md']).toBe('- [ ] existing\n');
  });

  it('refuses a todo for a list the page does not know', async () => {
    seedCache();
    for (const path of ['secret.todos.md', '.kh/health.habit.csv']) {
      const response = await call({ type: 'ADD_TODO', text: 'x', path });
      expect(response.error).toContain('not one of the start page');
    }
    expect(writes()).toHaveLength(0);
  });

  it('adds an event to a known events file, and only there', async () => {
    remote['.kh/dates.events.csv'] = 'name;type;start;end\nOld;general;2026-01-01;2026-01-01\n';
    seedCache();
    const response = await call({
      type: 'ADD_EVENT',
      path: '.kh/dates.events.csv',
      name: 'Lunch with Anna',
      eventType: 'general',
      startDate: '2026-10-16',
      endDate: '2026-10-16',
    });
    expect(response.success).toBe(true);
    expect(remote['.kh/dates.events.csv']).toContain(
      'Lunch with Anna;general;2026-10-16;2026-10-16',
    );

    const refused = await call({
      type: 'ADD_EVENT',
      path: '.kh/inbox.todos.md',
      name: 'x',
      startDate: '2026-10-16',
    });
    expect(refused.error).toContain('not one of the start page');
  });

  it('classifies a capture to no guesses without the model', async () => {
    seedCache();
    const response = await call({ type: 'CAPTURE_CLASSIFY', text: 'Call the bank' });
    expect(response).toEqual({ success: true, guesses: [] });
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

  it('saves the summary, known tags and read time with the page', async () => {
    remote['.kh/a.readitlater.json'] = JSON.stringify({
      items: [
        { id: 'old', url: 'https://example.com/old', name: 'Old', status: 'read', tags: ['rust'] },
      ],
    });
    seedCache();
    vi.stubGlobal('Summarizer', {
      availability: async () => 'available',
      create: async () => ({ summarize: async () => 'A tldr.', destroy: () => {} }),
    });
    vi.stubGlobal('LanguageModel', {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => JSON.stringify({ tags: ['rust'] }),
        destroy: () => {},
      }),
    });
    const response = await call({
      type: 'READ_LATER_ADD',
      url: 'https://example.com/a',
      title: 'An article',
      text: 'word '.repeat(500),
    });
    expect(response.error).toBeUndefined();
    const added = JSON.parse(remote['.kh/a.readitlater.json'] ?? '').items[1];
    expect(added).toMatchObject({ summary: 'A tldr.', tags: ['rust'], readMinutes: 3 });
    vi.unstubAllGlobals();
  });

  it('READ_LATER_ADD commits after 8 s even if the Summarizer hangs', async () => {
    seedCache();
    vi.stubGlobal('Summarizer', {
      availability: async () => 'available',
      create: async () => ({ summarize: () => new Promise<string>(() => {}), destroy: () => {} }),
    });
    vi.useFakeTimers();
    try {
      const pending = new Promise<any>((resolve) => {
        listener(
          { type: 'READ_LATER_ADD', url: 'https://example.com/a', title: 'A', text: 'some text' },
          {},
          resolve,
        );
      });
      await vi.advanceTimersByTimeAsync(7_900);
      expect(writes()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(200);
      const response = await pending;
      expect(response.error).toBeUndefined();
      const item = JSON.parse(remote['.kh/reading.readitlater.json'] ?? '').items[0];
      expect(item).toMatchObject({ url: 'https://example.com/a', readMinutes: 1 });
      expect(item.summary).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a page already on the list before asking the model', async () => {
    remote['.kh/a.readitlater.json'] = JSON.stringify({
      items: [{ id: 'old', url: 'https://example.com/a', name: 'A', status: 'new' }],
    });
    seedCache();
    const create = vi.fn(async () => ({ summarize: async () => 'x', destroy: () => {} }));
    vi.stubGlobal('Summarizer', { availability: async () => 'available', create });
    try {
      const response = await call({
        type: 'READ_LATER_ADD',
        url: 'https://example.com/a',
        title: 'A',
        text: 'some text',
      });
      expect(response.error).toBe('Already on the read-later list');
      expect(create).not.toHaveBeenCalled();
      expect(writes()).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
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

describe('the palette’s business captures', () => {
  const TODOS = '.kh/business/clients/acme/todos.todos.md';

  it('reads no context without business set up, and the capture files with it', async () => {
    remote['.kh/business/clients/acme/client.yaml'] = 'name: Acme\n';
    expect((await call({ type: 'READ_BUSINESS_CONTEXT' })).files).toEqual([]);
    remote['.kh/business/business.yaml'] = 'name: Me\n';
    remote['.kh/business/clients/acme/notes.md'] = 'private';
    const { files } = await call({ type: 'READ_BUSINESS_CONTEXT' });
    expect(files.map((f: any) => f.path).sort()).toEqual([
      '.kh/business/business.yaml',
      '.kh/business/clients/acme/client.yaml',
    ]);
  });

  it('reads a capture file with its version, a missing one as null', async () => {
    remote[TODOS] = '- [ ] x\n';
    expect(await call({ type: 'READ_BUSINESS_FILE', path: TODOS })).toMatchObject({
      content: '- [ ] x\n',
      sha: `sha-${TODOS}`,
    });
    const missing = await call({
      type: 'READ_BUSINESS_FILE',
      path: '.kh/business/time/running.yaml',
    });
    expect(missing).toMatchObject({ success: true, content: null });
  });

  it('writes in one commit with the capture’s message, over the version read', async () => {
    const response = await call({
      type: 'WRITE_BUSINESS_FILE',
      path: TODOS,
      content: 'new\n',
      message: 'business: todo for acme',
      sha: 'v1',
    });
    expect(response.success).toBe(true);
    expect(remote[TODOS]).toBe('new\n');
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0]?.[1].body)).toMatchObject({
      message: 'business: todo for acme',
      sha: 'v1',
    });
  });

  it('refuses any file a capture does not write', async () => {
    for (const path of [
      '.kh/business/clients/acme/client.yaml',
      '.kh/business/clients/../todos.todos.md',
      '.kh/business/time/2026-11.jsonl',
      '.kh/inbox.todos.md',
    ]) {
      expect((await call({ type: 'READ_BUSINESS_FILE', path })).error).toContain('Refusing');
      expect(
        (await call({ type: 'WRITE_BUSINESS_FILE', path, content: 'x', message: 'm' })).error,
      ).toContain('Refusing');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET_PALETTE_SETTINGS', () => {
  const reads = () =>
    fetchMock.mock.calls.filter(([url]) => pathOf(url) === '.kh/command-palette.settings.json');

  it('answers null when the repository has no settings file', async () => {
    expect(await call({ type: 'GET_PALETTE_SETTINGS' })).toMatchObject({ content: null });
  });

  it('answers the file, then from the cache until it is stale', async () => {
    remote['.kh/command-palette.settings.json'] = '{"searchEngines": []}';
    expect(await call({ type: 'GET_PALETTE_SETTINGS' })).toMatchObject({
      content: '{"searchEngines": []}',
    });
    remote['.kh/command-palette.settings.json'] = '{"tools": []}';
    expect(await call({ type: 'GET_PALETTE_SETTINGS' })).toMatchObject({
      content: '{"searchEngines": []}',
    });
    expect(reads()).toHaveLength(1);

    store.paletteSettingsCache.fetchedAt = 0;
    await call({ type: 'GET_PALETTE_SETTINGS' });
    await vi.waitFor(() => expect(store.paletteSettingsCache.content).toBe('{"tools": []}'));
  });

  it('reads again after a repository switch', async () => {
    await call({ type: 'GET_PALETTE_SETTINGS' });
    store.lifeos_repo = 'o/other';
    await call({ type: 'GET_PALETTE_SETTINGS' });
    expect(reads()).toHaveLength(2);
  });
});

describe('braindumps on the start page', () => {
  const BRAINDUMP = '.kh/braindumps/1790000000000.md';
  const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

  it('lists them from the tree, newest first, with their title and version', async () => {
    remote[BRAINDUMP] = '# Plan\n- one';
    remote['.kh/braindumps/1790000000500.md'] = 'newer';
    remote['.kh/braindumps/archive/1.md'] = 'not one of them';
    const { today } = await call({ type: 'GET_TODAY' });
    expect(today.braindumpCount).toBe(2);
    expect(today.braindumps).toEqual([
      expect.objectContaining({ title: 'newer', createdAt: 1790000000500 }),
      {
        path: BRAINDUMP,
        sha: `sha-${BRAINDUMP}`,
        title: 'Plan',
        text: '# Plan\n- one',
        createdAt: 1790000000000,
      },
    ]);
  });

  it('deletes the version the page showed', async () => {
    remote[BRAINDUMP] = 'done with this';
    seedCache();
    const response = await call({
      type: 'DELETE_BRAINDUMP',
      path: BRAINDUMP,
      sha: `sha-${BRAINDUMP}`,
    });
    expect(response.today.braindumps).toEqual([]);
    expect(BRAINDUMP in remote).toBe(false);
    expect(JSON.parse(deletes()[0]?.[1].body)).toEqual({
      message: `braindump: delete ${BRAINDUMP}`,
      sha: `sha-${BRAINDUMP}`,
    });
  });

  it('deletes nothing written since the page showed it, and answers the newer text', async () => {
    remote[BRAINDUMP] = 'more, typed on the desktop';
    seedCache();
    const response = await call({
      type: 'DELETE_BRAINDUMP',
      path: BRAINDUMP,
      sha: 'what-the-page-saw',
    });
    expect(response.refused).toContain('changed since');
    expect(deletes()).toEqual([]);
    expect(response.today.braindumps[0].text).toBe('more, typed on the desktop');
  });

  it('takes one already gone off the page', async () => {
    seedCache({
      files: [{ path: BRAINDUMP, sha: 'v1', content: 'x' }],
    });
    const response = await call({ type: 'DELETE_BRAINDUMP', path: BRAINDUMP, sha: 'v1' });
    expect(response.today.braindumps).toEqual([]);
    expect(deletes()).toEqual([]);
  });

  it('refuses to delete anything but a braindump', async () => {
    seedCache();
    for (const path of ['.kh/inbox.todos.md', '.kh/braindumps/../inbox.todos.md', '']) {
      const response = await call({ type: 'DELETE_BRAINDUMP', path, sha: 'x' });
      expect(response.error).toContain('is not a braindump');
    }
    expect(deletes()).toEqual([]);
  });

  it('checks the repository when a page opens on a cache older than a minute', async () => {
    seedCache({ fetchedAt: Date.now() });
    expect((await call({ type: 'REFRESH_TODAY' })).today).toBeNull();

    seedCache({ fetchedAt: Date.now() - 61_000 });
    remote[BRAINDUMP] = 'written a minute ago';
    const response = await call({ type: 'REFRESH_TODAY' });
    expect(response.today.braindumps[0].text).toBe('written a minute ago');
  });
});

describe('GET_SERVICE_STATUS', () => {
  const statusRequests = () =>
    fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/v2/status.json')).length;

  it('checks the services the repo lists, then answers from the cache', async () => {
    remote['.kh/browser.status.json'] = JSON.stringify({
      services: [{ name: 'GitHub', type: 'statuspage', url: 'https://www.githubstatus.com' }],
    });
    seedCache();

    const first = await call({ type: 'GET_SERVICE_STATUS' });
    expect(first.statuses).toMatchObject([{ name: 'GitHub', level: 'operational' }]);
    expect(statusRequests()).toBe(1);

    await call({ type: 'GET_SERVICE_STATUS' });
    expect(statusRequests()).toBe(1);
  });

  it('checks again once the cache is five minutes old', async () => {
    remote['.kh/browser.status.json'] = JSON.stringify({
      services: [{ name: 'GitHub', type: 'statuspage', url: 'https://www.githubstatus.com' }],
    });
    seedCache();
    await call({ type: 'GET_SERVICE_STATUS' });
    store.serviceStatusCache.fetchedAt -= 5 * 60 * 1000 + 1;

    await call({ type: 'GET_SERVICE_STATUS' });
    expect(statusRequests()).toBe(2);
  });

  it('watches the default services when the repo lists none', async () => {
    seedCache();
    const response = await call({ type: 'GET_SERVICE_STATUS' });
    expect(response.statuses.map((status: any) => status.name)).toEqual([
      'GitHub',
      'Claude',
      'AWS',
      'Cloudflare',
      'GCP',
    ]);
  });

  it('reports a broken config instead of guessing', async () => {
    remote['.kh/browser.status.json'] = '{"services": {}}';
    seedCache();
    const response = await call({ type: 'GET_SERVICE_STATUS' });
    expect(response.error).toContain('missing a "services" array');
  });
});

describe('the palette’s ideas', () => {
  const IDEA = '.kh/ideas/palette-sync.md';

  it('lists the ideas with their versions and console links, from the start page’s sync', async () => {
    remote[IDEA] = '# Palette sync\n';
    remote['.kh/ideas/sub/nested.md'] = 'x';
    const response = await call({ type: 'LIST_IDEAS' });
    expect(response.ideas).toEqual([
      {
        path: IDEA,
        sha: `sha-${IDEA}`,
        text: '# Palette sync\n',
        url: 'https://app.kaihuman.com/files/.kh/ideas/palette-sync.md?repo=o%2Fr',
      },
    ]);
    expect(store.todayCache.files.some((file: any) => file.path === IDEA)).toBe(true);
  });

  it('creates an idea without a sha, and keeps the cache in step', async () => {
    seedCache();
    const response = await call({ type: 'SAVE_IDEA', path: IDEA, content: '# New\n' });
    expect(response).toEqual({
      success: true,
      url: 'https://app.kaihuman.com/files/.kh/ideas/palette-sync.md?repo=o%2Fr',
    });
    expect(remote[IDEA]).toBe('# New\n');
    expect(JSON.parse(writes()[0]?.[1].body).sha).toBeUndefined();
    expect(store.todayCache.files.find((f: any) => f.path === IDEA)).toEqual({
      path: IDEA,
      sha: 'new-sha',
      content: '# New\n',
    });
  });

  it('writes over the version listed', async () => {
    remote[IDEA] = 'old';
    await call({ type: 'SAVE_IDEA', path: IDEA, content: 'new', sha: `sha-${IDEA}` });
    expect(JSON.parse(writes()[0]?.[1].body).sha).toBe(`sha-${IDEA}`);
    expect(remote[IDEA]).toBe('new');
  });

  it('says the slug is taken when GitHub refuses to create it', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 422,
      statusText: '',
      json: async () => ({ message: 'Invalid request. "sha" wasn\'t supplied.' }),
    }));
    expect(await call({ type: 'SAVE_IDEA', path: IDEA, content: 'x' })).toEqual({
      error: 'There is an idea palette-sync already',
    });
  });

  it('refuses any path that is not an idea’s own file', async () => {
    for (const path of [
      'README.md',
      '.kh/ideas/../x.md',
      '.kh/ideas/sub/ab.md',
      '.kh/ideas/A.md',
    ]) {
      expect(await call({ type: 'SAVE_IDEA', path, content: 'x' })).toEqual({
        error: `Refusing to write ${path}`,
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AI precompute jobs', () => {
  const rankPrompts = () => {
    const prompts: string[] = [];
    vi.stubGlobal('LanguageModel', {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (input: string) => {
          prompts.push(input);
          return JSON.stringify({
            ranked: [
              { id: 'b', reason: 'Short' },
              { id: 'a', reason: 'Long' },
            ],
          });
        },
        destroy: () => {},
      }),
    });
    return prompts;
  };
  const twoItems = () => {
    remote['.kh/reading.readitlater.json'] = JSON.stringify({
      items: [
        { id: 'a', url: 'https://example.com/a', name: 'A', status: 'new', createdAt: 1 },
        { id: 'b', url: 'https://example.com/b', name: 'B', status: 'new', createdAt: 2 },
      ],
    });
    seedCache();
  };
  const runAlarm = async () => {
    alarmListener({ name: 'ai' });
    for (let i = 0; i < 20; i++) await settle();
  };

  it('asks the model for the read-later ranking once while the cache is fresh', async () => {
    twoItems();
    const prompts = rankPrompts();
    await runAlarm();
    await runAlarm();
    expect(prompts.filter((input) => input.includes('saved pages'))).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('GET_TODAY shows the cached read-later order with its reasons', async () => {
    twoItems();
    rankPrompts();
    await runAlarm();
    const response = await call({ type: 'GET_TODAY' });
    expect(response.today.readLater.map((item: any) => item.id)).toEqual(['b', 'a']);
    expect(response.today.readLaterReasons).toEqual({ b: 'Short', a: 'Long' });
    vi.unstubAllGlobals();
  });

  it('shows no ranking and no cards when the new tab group is off, even if cached', async () => {
    twoItems();
    rankPrompts();
    await runAlarm();
    store.aiSettings = { newTab: false };
    const response = await call({ type: 'GET_TODAY' });
    expect(response.today.readLater.map((item: any) => item.id)).toEqual(['a', 'b']);
    expect(response.ranking.likely).toBeUndefined();
    store.aiCache = { 'card:focus': { value: 'Do it', at: Date.now(), ttl: 3_600_000 } };
    const cards = await call({ type: 'GET_AI_CARDS' });
    expect(cards.success).toBe(true);
    expect(cards.focus).toBeUndefined();
    store.aiSettings = { newTab: true };
    expect((await call({ type: 'GET_AI_CARDS' })).focus).toBe('Do it');
    vi.unstubAllGlobals();
  });
});
