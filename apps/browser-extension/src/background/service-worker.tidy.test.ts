import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;

let listener: Listener;
let store: Record<string, any>;
let query: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

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
  store = { lifeos_token: 't', lifeos_repo: 'o/r', aiSettings: { tabs: false } };
  query = vi.fn(async () => []);
  remove = vi.fn(async () => {});
  fetchMock = vi.fn(async (_url: string, init?: any) =>
    init?.method === 'PUT'
      ? { ok: true, status: 200, json: async () => ({ content: { sha: 'sha-2' } }) }
      : {
          ok: true,
          status: 200,
          json: async () => ({
            content: btoa(JSON.stringify({ groups: [], updatedAt: '2026-09-01T00:00:00.000Z' })),
            sha: 'sha-1',
          }),
          headers: { get: () => null },
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
    tabs: { query, remove, create: vi.fn(), update: vi.fn(), sendMessage: vi.fn() },
  });
  vi.stubGlobal('fetch', fetchMock);
  await import('./service-worker');
});

const call = (msg: any, sender: any = {}) =>
  new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sendResponse never called')), 2000);
    const kept = listener(msg, sender, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    if (kept !== true) {
      clearTimeout(timer);
      reject(new Error(`listener returned ${kept}`));
    }
  });

const tab = (id: number, url: string, extra: object = {}) => ({
  id,
  title: `T${id}`,
  url,
  ...extra,
});

describe('TIDY_TABS', () => {
  it('queries the sender’s window and skips unsafe and pinned tabs', async () => {
    query.mockResolvedValue([
      tab(1, 'https://a.dev/1'),
      tab(2, 'chrome://settings'),
      tab(3, 'https://a.dev/3', { pinned: true }),
      tab(4, 'https://a.dev/4'),
      tab(5, 'https://a.dev/5'),
    ]);
    const response = await call({ type: 'TIDY_TABS' }, { tab: { windowId: 7 } });
    expect(query).toHaveBeenCalledWith({ windowId: 7 });
    expect(response.tabs.map((t: any) => t.id)).toEqual([1, 4, 5]);
    expect(response.proposals).toEqual([{ name: 'a.dev', tabIds: [1, 4, 5] }]);
    expect(Array.isArray(response.streams)).toBe(true);
  });

  it('uses the current window for the popup', async () => {
    await call({ type: 'TIDY_TABS' });
    expect(query).toHaveBeenCalledWith({ currentWindow: true });
  });

  it('caps the tabs at 40', async () => {
    query.mockResolvedValue(Array.from({ length: 55 }, (_, i) => tab(i + 1, `https://a.dev/${i}`)));
    const response = await call({ type: 'TIDY_TABS' });
    expect(response.tabs).toHaveLength(40);
  });
});

describe('closing and saving', () => {
  it('TIDY_CLOSE_TABS removes exactly the given tabs', async () => {
    const response = await call({ type: 'TIDY_CLOSE_TABS', tabIds: [3, 4, 'x'] });
    expect(remove).toHaveBeenCalledWith([3, 4]);
    expect(response.closed).toBe(2);
  });

  it('TIDY_TABS closes nothing', async () => {
    query.mockResolvedValue([tab(1, 'https://a.dev/1')]);
    await call({ type: 'TIDY_TABS' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('SAVE_PINNED_TAB_GROUP saves the given tabs rather than the pinned ones', async () => {
    query.mockResolvedValue([tab(9, 'https://pinned.dev/', { pinned: true })]);
    const response = await call({
      type: 'SAVE_PINNED_TAB_GROUP',
      name: 'Docs',
      tabs: [
        { url: 'https://a.dev/1', title: 'One' },
        { url: 'chrome://settings', title: 'No' },
      ],
    });
    expect(response).toMatchObject({ success: true, count: 1, name: 'Docs' });
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    const written = JSON.parse(atob(JSON.parse(put?.[1].body).content));
    expect(written.groups[0].tabs).toEqual([{ url: 'https://a.dev/1', title: 'One' }]);
  });
});
