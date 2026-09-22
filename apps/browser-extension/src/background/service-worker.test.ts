import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;
let listener: Listener;
let connectListener: (() => void) | undefined;

const file = {
  content: btoa(
    JSON.stringify({
      groups: [{ id: 'g1', name: 'Work', createdAt: '2026-09-01T00:00:00.000Z', tabs: [] }],
      updatedAt: '2026-09-01T00:00:00.000Z',
    }),
  ),
  sha: 'abc',
};

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('chrome', {
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
    commands: { onCommand: { addListener: vi.fn() } },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onConnect: {
        addListener: (l: () => void) => {
          connectListener = l;
        },
      },
      onMessage: {
        addListener: (l: Listener) => {
          listener = l;
        },
      },
    },
    storage: {
      // The worker reads storage both ways: with a callback, and as a promise.
      local: {
        get: (_k: any, cb?: any) => {
          const data = { lifeos_token: 't', lifeos_repo: 'o/r' };
          return cb ? cb(data) : Promise.resolve(data);
        },
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      session: { get: async () => ({}), set: async () => {} },
    },
    tabs: { query: async () => [], create: vi.fn(), update: vi.fn() },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: any) =>
      init?.method === 'PUT'
        ? { ok: true, status: 200, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => file },
    ),
  );
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

describe('service worker keep-alive', () => {
  it('accepts popup connections, which is what keeps MV3 from collecting the worker mid-request', () => {
    expect(connectListener).toBeTypeOf('function');
  });
});

describe('error paths still respond', () => {
  it('responds when the GitHub read fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' })),
    );
    await expect(
      call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'X' }),
    ).resolves.toMatchObject({ error: expect.stringContaining('Failed to read') });
  });

  it('responds when fetch rejects outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(
      call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'X' }),
    ).resolves.toMatchObject({ error: 'network down' });
  });

  it('responds when the name is empty', async () => {
    await expect(
      call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: '  ' }),
    ).resolves.toMatchObject({ error: 'Give the tab group a name' });
  });
});

describe('pinned tab group messages', () => {
  it('responds to LIST', async () => {
    expect(await call({ type: 'LIST_PINNED_TAB_GROUPS' })).toMatchObject({ success: true });
  });
  it('responds to RENAME', async () => {
    expect(
      await call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'Home' }),
    ).toMatchObject({ success: true, name: 'Home' });
  });
  it('responds to DELETE', async () => {
    expect(await call({ type: 'DELETE_PINNED_TAB_GROUP', groupId: 'g1' })).toMatchObject({
      success: true,
    });
  });
  it('responds to SAVE', async () => {
    expect(await call({ type: 'SAVE_PINNED_TAB_GROUP', name: 'New' })).toMatchObject({
      success: true,
    });
  });
});
