import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkSnapshot } from './types';

type Res = { status: number; body?: unknown; headers?: Record<string, string> };
type Call = { url: string; method: string; auth?: string; ims?: string; body?: any };

const T0 = Date.parse('2026-10-14T10:00:00.000Z');
const MIN = 60_000;

let store: Record<string, unknown>;
let notifResponses: Array<Res | Error | Promise<Res>>;
let gqlResponses: Array<Res | Error>;
let remoteFile: string | null;
let calls: Call[];
let badgeText: ReturnType<typeof vi.fn>;
let badgeColor: ReturnType<typeof vi.fn>;
let storageListeners: Array<(changes: Record<string, unknown>, area: string) => void>;

const streamsJson = (items: Array<{ id: string; url: string; doneAt?: string }>) =>
  JSON.stringify({
    version: 1,
    updatedAt: '2026-09-01T00:00:00.000Z',
    streams: [
      {
        id: 'st_a',
        name: 'A',
        createdAt: '2026-09-01T00:00:00.000Z',
        items: items.map((item) => ({
          title: 'T',
          addedAt: '2026-09-01T00:00:00.000Z',
          labels: [],
          ...item,
        })),
      },
    ],
  });

const prNode = (n: number, extra: Record<string, unknown> = {}) => ({
  __typename: 'PullRequest',
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/o/r/pull/${n}`,
  state: 'OPEN',
  updatedAt: '2026-10-01T00:00:00Z',
  isDraft: false,
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  repository: { owner: { login: 'o' }, name: 'r' },
  commits: { nodes: [] },
  ...extra,
});

const gqlOk = (
  opts: { login?: string; reviewRequested?: unknown[]; pinned?: unknown[] } = {},
): Res => {
  const data: Record<string, unknown> = {
    viewer: { login: opts.login ?? 'me' },
    reviewRequested: { nodes: opts.reviewRequested ?? [] },
    assigned: { nodes: [] },
    failing: { nodes: [] },
    changesRequested: { nodes: [] },
    readyToMerge: { nodes: [] },
    mine: { nodes: [] },
  };
  (opts.pinned ?? []).forEach((node, i) => {
    data[`p${i}`] = { issueOrPullRequest: node };
  });
  return { status: 200, body: { data } };
};

const thread = (id: string, n: number) => ({
  id,
  reason: 'mention',
  unread: true,
  updated_at: '2026-10-02T00:00:00Z',
  subject: {
    title: `Thread ${id}`,
    type: 'PullRequest',
    url: `https://api.github.com/repos/o/r/pulls/${n}`,
  },
  repository: { full_name: 'o/r' },
});

const notifChanged = (
  threads: unknown[] = [],
  lastModified = 'Mon, 01 Jan 2026 00:00:00 GMT',
): Res => ({
  status: 200,
  body: threads,
  headers: { 'last-modified': lastModified, 'x-poll-interval': '60' },
});
const notif304: Res = { status: 304, headers: { 'x-poll-interval': '60' } };

const enc = (s: string) => btoa(s);

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  store = { lifeos_token: 'signin', lifeos_repo: 'o/r' };
  notifResponses = [];
  gqlResponses = [];
  remoteFile = null;
  calls = [];
  storageListeners = [];
  badgeText = vi.fn(async () => {});
  badgeColor = vi.fn(async () => {});
  vi.stubGlobal('chrome', {
    action: { setBadgeText: badgeText, setBadgeBackgroundColor: badgeColor },
    storage: {
      onChanged: {
        addListener: (l: (changes: Record<string, unknown>, area: string) => void) => {
          storageListeners.push(l);
        },
      },
      local: {
        get: async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter((k) => k in store)
              .map((k) => [k, structuredClone(store[k])]),
          ),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, structuredClone(items));
        },
        remove: async (keys: string | string[]) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
        },
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const method = init?.method ?? 'GET';
      calls.push({
        url,
        method,
        auth: init?.headers?.Authorization,
        ims: init?.headers?.['If-Modified-Since'],
        body: init?.body ? JSON.parse(init.body) : undefined,
      });
      let r: Res | Error | undefined;
      if (url.startsWith('https://api.github.com/notifications')) r = await notifResponses.shift();
      else if (url === 'https://api.github.com/graphql') r = gqlResponses.shift();
      else if (url.includes('/contents/')) {
        if (method === 'PUT') {
          remoteFile = atob(JSON.parse(init.body).content);
          r = { status: 200, body: { content: { sha: 'sha2' } } };
        } else {
          r =
            remoteFile === null
              ? { status: 404 }
              : { status: 200, body: { content: enc(remoteFile), sha: 'sha1' } };
        }
      }
      if (!r) throw new Error(`unscripted fetch ${method} ${url}`);
      if (r instanceof Error) throw r;
      const res = r;
      const headers = Object.fromEntries(
        Object.entries(res.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      );
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        statusText: '',
        headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
        json: async () => res.body ?? {},
      };
    }),
  );
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const load = () => import('./poller');
const snapshot = () => store.workSnapshot as WorkSnapshot;
const urls = () => calls.map((c) => c.url);
const gqlCalls = () => calls.filter((c) => c.url.endsWith('/graphql'));
const notifCalls = () => calls.filter((c) => c.url.includes('/notifications'));
const at = (now: number) => {
  vi.setSystemTime(now);
  return now;
};

describe('runWorkCycle', () => {
  it('reports signed-out without calling GitHub', async () => {
    store = {};
    const { runWorkCycle } = await load();
    const result = await runWorkCycle({ panelOpen: false, now: T0 });
    expect(result?.problem).toEqual({ kind: 'signed-out' });
    expect(snapshot().problem).toEqual({ kind: 'signed-out' });
    expect(calls).toEqual([]);
    expect(badgeText).toHaveBeenLastCalledWith({ text: '' });
  });

  it('skips GraphQL on a 304 until five minutes have passed', async () => {
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(gqlCalls()).toHaveLength(1);

    for (let m = 1; m < 5; m++) {
      notifResponses.push(notif304);
      await runWorkCycle({ panelOpen: false, now: at(T0 + m * MIN) });
    }
    expect(notifCalls()).toHaveLength(5);
    expect(gqlCalls()).toHaveLength(1);
    expect(notifCalls()[1].url).toContain('participating=true');

    notifResponses.push(notif304);
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: false, now: at(T0 + 5 * MIN) });
    expect(gqlCalls()).toHaveLength(2);
  });

  it('runs GraphQL at once when notifications changed', async () => {
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: false, now: at(T0) });

    notifResponses.push(notifChanged([thread('9', 9)], 'Tue, 02 Jan 2026 00:00:00 GMT'));
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: false, now: at(T0 + MIN) });
    expect(gqlCalls()).toHaveLength(2);
    expect(snapshot().threads.map((t) => t.threadId)).toEqual(['9']);
    expect((store.workPollState as any).notificationsLastModified).toBe(
      'Tue, 02 Jan 2026 00:00:00 GMT',
    );
  });

  it('refreshes every minute while the panel is open', async () => {
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: true, now: at(T0) });
    notifResponses.push(notif304);
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: true, now: at(T0 + MIN) });
    expect(gqlCalls()).toHaveLength(2);
    expect((store.workPollState as any).nextGraphqlAt).toBe(T0 + 2 * MIN);
  });

  it('stops on 401 and shows ! on the badge', async () => {
    const { runWorkCycle } = await load();
    notifResponses.push({ status: 401, body: { message: 'Bad credentials' } });
    const result = await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(result?.problem).toEqual({ kind: 'auth' });
    expect(badgeText).toHaveBeenLastCalledWith({ text: '!' });
    expect(badgeColor).toHaveBeenLastCalledWith({ color: '#b91c1c' });

    await runWorkCycle({ panelOpen: false, now: at(T0 + 10 * MIN) });
    expect(calls).toHaveLength(1);

    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    const forced = await runWorkCycle({ force: true, panelOpen: false, now: at(T0 + 11 * MIN) });
    expect(forced?.problem).toBeNull();
  });

  it('resets the poll state and runs a full cycle when a token changes', async () => {
    const { runWorkCycle, watchWorkTokens } = await load();
    notifResponses.push({ status: 401, body: { message: 'Bad credentials' } });
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    watchWorkTokens();
    expect(storageListeners).toHaveLength(1);

    store.workToken = 'work2';
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    storageListeners[0]({ workToken: { newValue: 'work2' } }, 'local');
    await vi.waitFor(() => expect(snapshot().problem).toBeNull());
    expect(notifCalls()[1].auth).toBe('Bearer work2');

    // Unrelated keys do nothing.
    storageListeners[0]({ bookmarksCache: {} }, 'local');
    await Promise.resolve();
    expect(notifCalls()).toHaveLength(2);
  });

  it('pauses until the rate-limit reset', async () => {
    const { runWorkCycle } = await load();
    const resetSec = Math.floor((T0 + 30 * MIN) / 1000);
    notifResponses.push({
      status: 403,
      body: { message: 'rate limited' },
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetSec) },
    });
    const result = await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(result?.problem).toEqual({ kind: 'rate-limit', until: resetSec * 1000 });
    const state = store.workPollState as any;
    expect(state.nextNotificationsAt).toBe(resetSec * 1000);
    expect(state.nextGraphqlAt).toBe(resetSec * 1000);

    await runWorkCycle({ panelOpen: false, now: at(T0 + 10 * MIN) });
    expect(calls).toHaveLength(1);

    notifResponses.push(notif304);
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: false, now: at(resetSec * 1000) });
    expect(notifCalls()).toHaveLength(2);
    expect(gqlCalls()).toHaveLength(1);
  });

  it('backs off 1, 2, 4, 8, 15, 15 minutes when offline and resets after a success', async () => {
    const { runWorkCycle, BACKOFF_MINUTES } = await load();
    expect(BACKOFF_MINUTES).toEqual([1, 2, 4, 8, 15]);
    let now = T0;
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      notifResponses.push(i % 2 ? { status: 502 } : new TypeError('Failed to fetch'));
      const result = await runWorkCycle({ panelOpen: false, now: at(now) });
      const problem = result?.problem as { kind: 'offline'; retryAt: number };
      expect(problem.kind).toBe('offline');
      delays.push((problem.retryAt - now) / MIN);
      // Nothing is called before the retry time, and the problem stays.
      const before = calls.length;
      const waiting = await runWorkCycle({ panelOpen: false, now: at(problem.retryAt - 1) });
      expect(calls.length).toBe(before);
      expect(waiting?.problem).toEqual(problem);
      now = problem.retryAt;
    }
    expect(delays).toEqual([1, 2, 4, 8, 15, 15]);

    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    const ok = await runWorkCycle({ panelOpen: false, now: at(now) });
    expect(ok?.problem).toBeNull();
    expect((store.workPollState as any).backoffStep).toBe(0);

    now += MIN;
    notifResponses.push(new TypeError('Failed to fetch'));
    const again = await runWorkCycle({ panelOpen: false, now: at(now) });
    expect(again?.problem).toEqual({ kind: 'offline', retryAt: now + MIN });
  });

  it('keeps the last data when a call fails', async () => {
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged([thread('1', 1)]));
    gqlResponses.push(gqlOk({ reviewRequested: [prNode(5)] }));
    const first = await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(first?.searches['review-requested']).toHaveLength(1);

    notifResponses.push(notif304);
    gqlResponses.push({ status: 200, body: { errors: [{ message: 'boom' }] } });
    const failed = await runWorkCycle({ force: true, panelOpen: false, now: at(T0 + MIN) });
    expect(failed?.problem?.kind).toBe('offline');
    expect(failed?.searches['review-requested']).toHaveLength(1);
    expect(failed?.threads).toHaveLength(1);
    expect(failed?.login).toBe('me');
    expect(failed?.fetchedAt).toBe(T0 + MIN);
  });

  it('rereads the streams file and runs a full cycle when a panel connects', async () => {
    const { connectWorkPanel, isPanelOpen, runWorkCycle } = await load();
    remoteFile = streamsJson([]);
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    const contentReads = () => calls.filter((c) => c.url.includes('/contents/')).length;
    expect(contentReads()).toBe(1);

    let disconnect: (() => void) | undefined;
    const port = {
      name: 'work-panel',
      onDisconnect: {
        addListener: (l: () => void) => {
          disconnect = l;
        },
      },
    };
    at(T0 + MIN);
    notifResponses.push(notif304);
    gqlResponses.push(gqlOk());
    await connectWorkPanel(port as unknown as chrome.runtime.Port);
    expect(isPanelOpen()).toBe(true);
    // The streams cache is fresh, yet the panel forces a reread, and GraphQL runs off-schedule.
    expect(contentReads()).toBe(2);
    expect(gqlCalls()).toHaveLength(2);
    expect((store.workPollState as any).nextGraphqlAt).toBe(T0 + 2 * MIN);

    disconnect?.();
    expect(isPanelOpen()).toBe(false);
  });

  it('uses the work token for polling and the sign-in token for the streams file', async () => {
    store.workToken = 'work';
    remoteFile = streamsJson([{ id: 'it_1', url: 'https://github.com/o/r/pull/7' }]);
    const { runWorkCycle, workPollingToken } = await load();
    expect(await workPollingToken()).toBe('work');
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk({ pinned: [prNode(7)] }));
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    const byUrl = Object.fromEntries(calls.map((c) => [c.url.split('?')[0], c.auth]));
    expect(byUrl).toEqual({
      'https://api.github.com/notifications': 'Bearer work',
      'https://api.github.com/graphql': 'Bearer work',
      'https://api.github.com/repos/o/r/contents/.kh/browser.streams.json': 'Bearer signin',
    });
    expect(gqlCalls()[0].body.variables).toEqual({ o0: 'o', r0: 'r', n0: 7 });
    expect(Object.keys(snapshot().pinned)).toEqual(['o/r#7']);
  });

  it('falls back to the sign-in token only when a repository is set', async () => {
    const { workPollingToken } = await load();
    expect(await workPollingToken()).toBe('signin');
    delete store.lifeos_repo;
    expect(await workPollingToken()).toBeUndefined();
    store.workToken = 'work';
    expect(await workPollingToken()).toBe('work');
  });

  it('clears the snapshot and dismissals when the viewer login changes', async () => {
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk({ login: 'alice', reviewRequested: [prNode(5)] }));
    store.workDismissed = { 'o/r#4': '2026-10-01T00:00:00Z' };
    // First run: no stored login, so dismissals survive.
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(store.workDismissed).toBeDefined();
    expect(snapshot().login).toBe('alice');

    notifResponses.push(notif304);
    gqlResponses.push(gqlOk({ login: 'bob' }));
    await runWorkCycle({ force: true, panelOpen: false, now: at(T0 + MIN) });
    expect(store.workDismissed).toBeUndefined();
    expect(snapshot().login).toBe('bob');
    expect(snapshot().searches['review-requested']).toEqual([]);
  });

  it('queues auto-done ops for merged pinned PRs', async () => {
    remoteFile = streamsJson([
      { id: 'it_1', url: 'https://github.com/o/r/pull/7' },
      { id: 'it_2', url: 'https://github.com/o/r/pull/8' },
    ]);
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk({ pinned: [prNode(7, { state: 'MERGED' }), prNode(8)] }));
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put).toBeDefined();
    const saved = JSON.parse(remoteFile ?? '');
    const items = saved.streams[0].items;
    expect(items.find((i: any) => i.id === 'it_1').doneAt).toBe(new Date(T0).toISOString());
    expect(items.find((i: any) => i.id === 'it_2').doneAt).toBeUndefined();
    expect(store.streamsWriteQueue).toEqual([]);
  });

  it('skips auto-done when the streams file is read-only', async () => {
    remoteFile = '{ not json';
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    const result = await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(result?.problem).toBeNull();
    expect(gqlCalls()[0].body.variables).toEqual({});
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('keeps an omitted pinned status only while the item is still pinned', async () => {
    remoteFile = streamsJson([
      { id: 'it_1', url: 'https://github.com/o/r/pull/7' },
      { id: 'it_2', url: 'https://github.com/o/r/pull/8' },
    ]);
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk({ pinned: [prNode(7), prNode(8)] }));
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(Object.keys(snapshot().pinned).sort()).toEqual(['o/r#7', 'o/r#8']);

    // #8 unpinned; #7's lookup fails transiently and is omitted.
    remoteFile = streamsJson([{ id: 'it_1', url: 'https://github.com/o/r/pull/7' }]);
    store.streamsCache = undefined;
    notifResponses.push(notif304);
    gqlResponses.push(gqlOk());
    await runWorkCycle({ force: true, panelOpen: false, now: at(T0 + MIN) });
    expect(Object.keys(snapshot().pinned)).toEqual(['o/r#7']);
  });

  it('sets the badge to the waiting count', async () => {
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk({ reviewRequested: [prNode(5), prNode(6)] }));
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(badgeText).toHaveBeenLastCalledWith({ text: '2' });
    expect(badgeColor).toHaveBeenLastCalledWith({ color: '#b91c1c' });

    notifResponses.push(notif304);
    gqlResponses.push(gqlOk());
    await runWorkCycle({ force: true, panelOpen: false, now: at(T0 + MIN) });
    expect(badgeText).toHaveBeenLastCalledWith({ text: '' });
  });

  it('shares one running cycle between concurrent callers', async () => {
    const { runWorkCycle } = await load();
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    const a = runWorkCycle({ panelOpen: false, now: at(T0) });
    const b = runWorkCycle({ panelOpen: false, now: T0 });
    expect(b).toBe(a);
    await a;
    expect(notifCalls()).toHaveLength(1);
    expect(urls().filter((u) => u.endsWith('/graphql'))).toHaveLength(1);
  });

  it('runs a forced cycle after the running one when forced mid-cycle', async () => {
    const { runWorkCycle } = await load();
    // GraphQL is not due, so only a forced cycle runs it.
    store.workPollState = {
      notificationsLastModified: null,
      nextNotificationsAt: 0,
      nextGraphqlAt: T0 + 5 * MIN,
      backoffStep: 0,
    };
    let release: (r: Res) => void = () => {};
    notifResponses.push(
      new Promise<Res>((resolve) => {
        release = resolve;
      }),
    );
    const alarm = runWorkCycle({ panelOpen: false, now: at(T0) });
    await vi.waitFor(() => expect(notifCalls()).toHaveLength(1));

    notifResponses.push(notif304);
    gqlResponses.push(gqlOk());
    const forced = runWorkCycle({ force: true, panelOpen: true, now: T0 });
    const again = runWorkCycle({ force: true, panelOpen: true, now: T0 });
    expect(forced).not.toBe(alarm);
    expect(again).toBe(forced);
    release(notif304);
    await alarm;
    expect(gqlCalls()).toHaveLength(0);
    const result = await forced;
    expect(result?.problem).toBeNull();
    expect(notifCalls()).toHaveLength(2);
    expect(gqlCalls()).toHaveLength(1);
    expect((store.workPollState as any).nextGraphqlAt).toBe(T0 + MIN);
  });

  it('tries the new token after a 401 even if an alarm cycle is running', async () => {
    const { runWorkCycle, watchWorkTokens } = await load();
    store.workToken = 'work1';
    notifResponses.push({ status: 401, body: { message: 'Bad credentials' } });
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(snapshot().problem).toEqual({ kind: 'auth' });
    watchWorkTokens();

    store.workToken = 'work2';
    notifResponses.push(notifChanged());
    gqlResponses.push(gqlOk());
    storageListeners[0]({ workToken: { newValue: 'work2' } }, 'local');
    // The minute alarm fires in the same tick as the token change.
    const alarm = runWorkCycle({ panelOpen: false });
    await alarm;
    await vi.waitFor(() => expect(snapshot().problem).toBeNull());
    expect(notifCalls().map((c) => c.auth)).toEqual(['Bearer work1', 'Bearer work2']);
  });

  it('does not let a cycle running across a token change keep the old poll state', async () => {
    const { runWorkCycle, watchWorkTokens } = await load();
    watchWorkTokens();
    store.workPollState = {
      notificationsLastModified: 'old',
      nextNotificationsAt: 0,
      nextGraphqlAt: T0 + 5 * MIN,
      backoffStep: 3,
    };
    let release: (r: Res) => void = () => {};
    notifResponses.push(
      new Promise<Res>((resolve) => {
        release = resolve;
      }),
    );
    const alarm = runWorkCycle({ panelOpen: false, now: at(T0) });
    await vi.waitFor(() => expect(notifCalls()).toHaveLength(1));

    store.workToken = 'work2';
    notifResponses.push(notifChanged([], 'new'));
    gqlResponses.push(gqlOk());
    storageListeners[0]({ workToken: { newValue: 'work2' } }, 'local');
    release({ status: 502 });
    await alarm;
    await vi.waitFor(() => expect(gqlCalls()).toHaveLength(1));
    await vi.waitFor(() =>
      expect((store.workPollState as any).notificationsLastModified).toBe('new'),
    );
    // The new token's first poll is unconditional, and the old backoff is gone.
    expect(notifCalls()[0].ims).toBe('old');
    expect(notifCalls()[1].ims).toBeUndefined();
    expect((store.workPollState as any).backoffStep).toBe(0);
  });

  it('applies a thread patch after a running cycle, so the cycle does not write over it', async () => {
    const { runWorkCycle, patchSnapshotThreads } = await load();
    store.workPollState = {
      notificationsLastModified: null,
      nextNotificationsAt: 0,
      nextGraphqlAt: T0 + 5 * MIN,
      backoffStep: 0,
    };
    let release: (r: Res) => void = () => {};
    notifResponses.push(
      new Promise<Res>((resolve) => {
        release = resolve;
      }),
    );
    gqlResponses.push(gqlOk());
    const cycle = runWorkCycle({ panelOpen: false, now: at(T0) });
    await vi.waitFor(() => expect(notifCalls()).toHaveLength(1));

    const patch = patchSnapshotThreads((threads) =>
      threads.map((t) => (t.threadId === '9' ? { ...t, unread: false } : t)),
    );
    release(notifChanged([thread('9', 9), thread('8', 8)]));
    await cycle;
    await patch;
    expect(snapshot().threads.map((t) => [t.threadId, t.unread])).toEqual([
      ['9', false],
      ['8', true],
    ]);
  });

  it('patches the stored snapshot when no cycle is running', async () => {
    const { runWorkCycle, patchSnapshotThreads } = await load();
    notifResponses.push(notifChanged([thread('9', 9), thread('8', 8)]));
    gqlResponses.push(gqlOk());
    await runWorkCycle({ panelOpen: false, now: at(T0) });
    await patchSnapshotThreads((threads) => threads.filter((t) => t.threadId !== '9'));
    expect(snapshot().threads.map((t) => t.threadId)).toEqual(['8']);
  });

  it('pauses until the reset when GraphQL says RATE_LIMITED in a 200', async () => {
    const { runWorkCycle } = await load();
    const resetSec = Math.floor((T0 + 20 * MIN) / 1000);
    notifResponses.push(notif304);
    gqlResponses.push({
      status: 200,
      body: { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] },
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetSec) },
    });
    const result = await runWorkCycle({ panelOpen: false, now: at(T0) });
    expect(result?.problem).toEqual({ kind: 'rate-limit', until: resetSec * 1000 });
    expect((store.workPollState as any).nextGraphqlAt).toBe(resetSec * 1000);
  });
});

describe('ensureWorkAlarm', () => {
  it('creates the work alarm only when it does not exist', async () => {
    const { ensureWorkAlarm } = await load();
    let existing: unknown;
    const create = vi.fn();
    vi.stubGlobal('chrome', {
      alarms: { get: vi.fn(async () => existing), create },
    });
    existing = { name: 'work', periodInMinutes: 1 };
    await ensureWorkAlarm();
    expect(create).not.toHaveBeenCalled();
    existing = undefined;
    await ensureWorkAlarm();
    expect(create).toHaveBeenCalledWith('work', { periodInMinutes: 1 });
  });
});
