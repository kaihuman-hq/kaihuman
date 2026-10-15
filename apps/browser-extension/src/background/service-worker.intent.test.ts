import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayCache } from './today';

const rerankSpy = vi.hoisted(() => vi.fn());
vi.mock('./ai/rank.js', async (original) => ({
  ...(await original<typeof import('./ai/rank')>()),
  rerank: rerankSpy,
}));

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;

let listener: Listener;
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

let putStatus: number;

beforeEach(async () => {
  vi.resetModules();
  rerankSpy.mockReset();
  rerankSpy.mockResolvedValue(null);
  putStatus = 200;
  store = { lifeos_token: 't', lifeos_repo: 'o/r' };
  remote = { '.kh/inbox.todos.md': '- [ ] existing\n' };
  fetchMock = vi.fn(async (url: string, init?: any) => {
    if (url.endsWith('/api/v2/status.json')) {
      return { ok: true, status: 200, json: async () => ({ status: { indicator: 'none' } }) };
    }
    if (init?.method === 'PUT') {
      if (putStatus !== 200) return { ok: false, status: putStatus, statusText: 'Server Error' };
      const body = JSON.parse(init.body);
      remote[pathOf(url)] = new TextDecoder().decode(
        Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)),
      );
      return { ok: true, status: 200, json: async () => ({ content: { sha: 'new-sha' } }) };
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
      onAlarm: { addListener: vi.fn() },
    },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
    commands: { onCommand: { addListener: vi.fn() } },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    permissions: { contains: vi.fn(async () => true) },
    scripting: { executeScript: vi.fn(async () => []) },
    runtime: {
      getManifest: () => ({ content_scripts: [] }),
      onInstalled: { addListener: vi.fn() },
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
    listener(msg, {}, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
  });

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

const PAGE = { url: 'https://example.com/a', title: 'A' };

describe('INTENT_RUN', () => {
  it('refuses a forged intent and sends nothing', async () => {
    seedCache();
    const forged = [
      { action: 'add-todo', text: 'x', path: 'secret.todos.md' },
      { action: 'add-todo', text: 'x', path: '.kh/health.habit.csv' },
      { action: 'open-bookmark', bookmarkId: 'nope' },
      { action: 'timer', path: '.kh/none.timer.csv', toggle: 'start' },
      { action: 'delete-everything' },
    ];
    for (const intent of forged) {
      const response = await call({ type: 'INTENT_RUN', intent, ...PAGE });
      expect(response.error).toBe('That no longer fits — try again');
    }
    expect(writes()).toHaveLength(0);
  });

  it('refuses read-later off a web page', async () => {
    seedCache();
    const response = await call({
      type: 'INTENT_RUN',
      intent: { action: 'read-later' },
      url: 'chrome://newtab/',
      title: '',
    });
    expect(response.error).toBeDefined();
    expect(writes()).toHaveLength(0);
  });

  it('dispatches exactly one ADD_TODO for a valid add-todo intent', async () => {
    seedCache();
    const response = await call({
      type: 'INTENT_RUN',
      intent: { action: 'add-todo', text: 'Buy milk', path: '.kh/inbox.todos.md', tags: [] },
      ...PAGE,
    });
    expect(response.success).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(remote['.kh/inbox.todos.md']).toContain('- [ ] Buy milk\n');
    expect(remote['.kh/inbox.todos.md'].match(/Buy milk/g)).toHaveLength(1);
  });

  it('answers a handler error as an error', async () => {
    seedCache();
    putStatus = 500;
    const response = await call({
      type: 'INTENT_RUN',
      intent: { action: 'add-todo', text: 'Buy milk', path: '.kh/inbox.todos.md', tags: [] },
      ...PAGE,
    });
    expect(response.error).toBeTruthy();
    expect(response.success).toBeUndefined();
  });
});

describe('INTENT_PARSE', () => {
  it('returns no intent when palette AI is off', async () => {
    seedCache();
    store.aiSettings = { palette: false };
    const response = await call({
      type: 'INTENT_PARSE',
      text: 'add a todo to buy milk',
      url: PAGE.url,
    });
    expect(response).toMatchObject({ success: true, intent: null, preview: '' });
  });
});

describe('LIST_NOTES', () => {
  const seedNotes = (repo = 'o/r') => {
    remote['.kh/braindumps/1700000000000.md'] = `# Plans\n${'long '.repeat(300)}`;
    remote['.kh/ideas/fast-sync.md'] = '# Fast sync\n\nSummary of the idea';
    seedCache({ repo });
  };

  it('lists braindumps and ideas from the cache, with their text capped', async () => {
    seedNotes();
    const response = await call({ type: 'LIST_NOTES' });
    const ids = response.notes.map((n: any) => n.id).sort();
    expect(ids).toEqual(['.kh/braindumps/1700000000000.md', '.kh/ideas/fast-sync.md']);
    const dump = response.notes.find((n: any) => n.id.includes('braindumps'));
    expect(dump.title).toBe('Plans');
    expect(dump.text).toHaveLength(500);
  });

  it('does not list the notes of another repo', async () => {
    seedNotes('other/repo');
    const response = await call({ type: 'LIST_NOTES' });
    expect(response.error).toBeDefined();
    expect(response.notes).toBeUndefined();
  });
});

describe('RERANK', () => {
  const items = [{ id: 'a', text: 'x'.repeat(900) }];

  it('returns no ids when palette AI is off', async () => {
    store.aiSettings = { palette: false };
    const response = await call({ type: 'RERANK', query: 'q', items });
    expect(response).toMatchObject({ success: true, ids: null });
    expect(rerankSpy).not.toHaveBeenCalled();
  });

  it('asks interactively with a deadline and capped text', async () => {
    rerankSpy.mockResolvedValue({ ids: ['a'], reasons: {}, computedAt: 0 });
    const response = await call({ type: 'RERANK', query: 'q', items });
    expect(response.ids).toEqual(['a']);
    const [, sent, , opts] = rerankSpy.mock.calls[0] ?? [];
    expect(sent[0].text).toHaveLength(500);
    expect(opts).toEqual({ priority: 'interactive', timeoutMs: 8000 });
  });
});
