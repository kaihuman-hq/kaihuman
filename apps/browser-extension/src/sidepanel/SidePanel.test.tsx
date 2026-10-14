import type { StreamsFile } from '@kaihuman/formats';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StreamsCache, WorkSnapshot } from '../background/work/types';
import { SidePanel } from './SidePanel';

const NOW = '2026-10-14T10:00:00.000Z';
const FETCHED = new Date('2026-10-14T09:45:00.000Z').getTime();
const timeOf = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const file = (): StreamsFile => ({
  version: 1,
  updatedAt: NOW,
  invalidStreams: [],
  extra: {},
  streams: [
    {
      id: 'st_a' as never,
      name: 'Alpha',
      createdAt: NOW,
      invalidItems: [],
      extra: {},
      items: [
        {
          id: 'it_1' as never,
          url: 'https://example.com/pinned',
          title: 'Pinned page',
          addedAt: NOW,
          labels: [],
          extra: {},
        },
      ],
    },
    { id: 'st_b' as never, name: 'Beta', createdAt: NOW, invalidItems: [], extra: {}, items: [] },
  ],
});

const cache = (state: StreamsCache['state'] = { ok: true, file: file() }): StreamsCache => ({
  repo: 'owner/repo',
  state,
  sha: 'abc',
  etag: null,
  fetchedAt: FETCHED,
});

const snapshot = (patch: Partial<WorkSnapshot> = {}): WorkSnapshot => ({
  login: 'me',
  fetchedAt: FETCHED,
  searches: {} as WorkSnapshot['searches'],
  threads: [],
  pinned: {},
  orgProblems: [],
  problem: null,
  ...patch,
});

let host: HTMLDivElement;
let store: Record<string, unknown>;
let sent: Record<string, unknown>[];
let connected: { name?: string }[];
let changeListeners: ((changes: Record<string, unknown>, area: string) => void)[];
let activeTab: { id: number; url?: string; title?: string };

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error(`Timed out; panel shows: ${host.textContent}`);
};

const mount = async (settled: string) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  render(<SidePanel />, host);
  await waitFor(() => host.textContent?.includes(settled) ?? false);
};

const click = (label: string) => {
  const button = [...host.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (!button) throw new Error(`No button labelled "${label}"`);
  button.click();
};

beforeEach(() => {
  store = {};
  sent = [];
  connected = [];
  changeListeners = [];
  activeTab = { id: 7, url: 'https://example.com/new', title: 'New page' };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(wanted.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        set: async (items: Record<string, unknown>) => {
          store = { ...store, ...items };
        },
      },
      onChanged: {
        addListener: (l: (changes: Record<string, unknown>, area: string) => void) =>
          changeListeners.push(l),
        removeListener: (l: (changes: Record<string, unknown>, area: string) => void) => {
          changeListeners = changeListeners.filter((c) => c !== l);
        },
      },
    },
    tabs: {
      query: async () => [activeTab],
      onActivated: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      connect: (info: { name?: string }) => {
        connected.push(info);
        return { disconnect: () => {} };
      },
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        respond?.({ ok: true });
      },
      lastError: undefined,
    },
  };
  window.prompt = () => null;
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('SidePanel', () => {
  it('shows the sign-in message when signed out', async () => {
    store = { workSnapshot: snapshot({ problem: { kind: 'signed-out' } }) };
    await mount('Sign in to kaihuman in the console to see your work.');
    expect(host.querySelector('a[href="https://app.kaihuman.com"]')).not.toBeNull();
  });

  it('shows the read-only banner with a console link', async () => {
    store = {
      streamsCache: cache({ ok: false, error: 'bad json' }),
      workSnapshot: snapshot(),
    };
    await mount('The streams file is not valid JSON, so it is read-only.');
    const link = [...host.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Open it in the console'),
    );
    expect(link?.getAttribute('href')).toContain('/files/.kh/browser.streams.json');
    expect(link?.getAttribute('href')).toContain('repo=owner%2Frepo');
  });

  it('shows one banner per org problem with the right link', async () => {
    store = {
      streamsCache: cache(),
      workSnapshot: snapshot({
        orgProblems: [
          { org: 'acme', fix: 'oauth', url: 'https://github.com/settings/connections' },
          { org: 'corp', fix: 'sso', url: 'https://github.com/orgs/corp/sso' },
        ],
      }),
    };
    await mount('acme hides its items from kaihuman.');
    expect(host.textContent).toContain('corp hides its items from kaihuman.');
    const link = (text: string) =>
      [...host.querySelectorAll('a')].find((a) => a.textContent === text)?.getAttribute('href');
    expect(link('Request access')).toBe('https://github.com/settings/connections');
    expect(link('Authorise SSO')).toBe('https://github.com/orgs/corp/sso');
  });

  it('shows offline with the data time', async () => {
    store = {
      streamsCache: cache(),
      workSnapshot: snapshot({ problem: { kind: 'offline', retryAt: FETCHED + 60_000 } }),
    };
    await mount(`Offline — showing data as of ${timeOf(FETCHED)}.`);
  });

  it('pins the active tab to the last stream used', async () => {
    store = {
      streamsCache: cache(),
      workSnapshot: snapshot(),
      workUi: { collapsed: [], lastStreamId: 'st_b' },
    };
    await mount('Pin');
    const labels = host.querySelector('input[aria-label="Labels"]') as HTMLInputElement;
    labels.value = ' read, ,later ';
    labels.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    click('Pin');
    await waitFor(() => sent.some((m) => m.type === 'WORK_OPS'));
    const message = sent.find((m) => m.type === 'WORK_OPS') as { ops: Record<string, unknown>[] };
    expect(message.ops).toHaveLength(1);
    expect(message.ops[0]).toMatchObject({
      op: 'pin',
      streamId: 'st_b',
      url: 'https://example.com/new',
      title: 'New page',
      labels: ['read', 'later'],
    });
    expect(message.ops[0]?.itemId).toMatch(/^it_/);
    await waitFor(() => (store.workUi as { lastStreamId?: string }).lastStreamId === 'st_b');
  });

  it('shows where an already pinned tab is and marks it done', async () => {
    activeTab = { id: 7, url: 'https://example.com/pinned', title: 'Pinned page' };
    store = { streamsCache: cache(), workSnapshot: snapshot() };
    await mount('In Alpha');
    click('Done');
    await waitFor(() => sent.some((m) => m.type === 'WORK_OPS'));
    const message = sent.find((m) => m.type === 'WORK_OPS') as { ops: Record<string, unknown>[] };
    expect(message.ops[0]).toMatchObject({ op: 'markDone', itemId: 'it_1' });
  });

  it('refuses chrome:// pages', async () => {
    activeTab = { id: 7, url: 'chrome://extensions', title: 'Extensions' };
    store = { streamsCache: cache(), workSnapshot: snapshot() };
    await mount('This page cannot be pinned.');
    expect(host.querySelector('input[aria-label="Labels"]')).toBeNull();
  });

  it('connects a work-panel port on mount', async () => {
    store = { streamsCache: cache(), workSnapshot: snapshot() };
    await mount('Work');
    expect(connected).toEqual([{ name: 'work-panel' }]);
  });

  it('tells a dropped op apart from an unsaved queue', async () => {
    store = {
      streamsCache: cache(),
      workSnapshot: snapshot(),
      streamsSaveError: 'offline',
      streamsWriteQueue: [{ op: 'prune', now: NOW }],
    };
    await mount('Not saved yet: offline');
    render(null, host);
    host.remove();
    store = { ...store, streamsWriteQueue: [] };
    await mount('Could not apply a change: offline');
  });

  it('shows the 401 message with a work token and no data repo', async () => {
    store = { workSnapshot: snapshot({ problem: { kind: 'auth' } }) };
    await mount('GitHub refused the token. Sign in again.');
    expect(host.textContent).not.toContain('Sign in to kaihuman in the console');
  });

  it('shows the rate-limit pause', async () => {
    const until = new Date('2026-10-14T11:30:00.000Z').getTime();
    store = {
      streamsCache: cache(),
      workSnapshot: snapshot({ problem: { kind: 'rate-limit', until } }),
    };
    await mount(`Paused by GitHub until ${timeOf(until)}.`);
  });

  it('shows org banners without a streams cache', async () => {
    store = {
      workSnapshot: snapshot({
        orgProblems: [{ org: 'acme', fix: 'sso', url: 'https://github.com/orgs/acme/sso' }],
      }),
    };
    await mount('acme hides its items from kaihuman.');
    expect(host.textContent).not.toContain('Sign in to kaihuman in the console');
  });

  it('disables pinning when the file is read-only', async () => {
    store = { streamsCache: cache({ ok: false, error: 'bad' }), workSnapshot: snapshot() };
    await mount('read-only');
    await waitFor(() => host.textContent?.includes('Pin') ?? false);
    const pin = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Pin');
    expect(pin?.disabled).toBe(true);
  });

  it('re-renders when storage changes', async () => {
    store = { streamsCache: cache(), workSnapshot: snapshot() };
    await mount('Work');
    store = { ...store, workSnapshot: snapshot({ problem: { kind: 'auth' } }) };
    for (const l of changeListeners) l({ workSnapshot: {} }, 'local');
    await waitFor(() => host.textContent?.includes('GitHub refused the token.') ?? false);
  });
});
