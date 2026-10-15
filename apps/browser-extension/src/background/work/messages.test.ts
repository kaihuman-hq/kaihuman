import type { StreamId, StreamOp, StreamsFile } from '@kaihuman/formats';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types.js';
import { markThreadDone, markThreadRead } from './notifications.js';
import { isPanelOpen, patchSnapshotThreads, runWorkCycle, workPollingToken } from './poller.js';
import { GithubHttpError } from './repo-file.js';
import { enqueueStreamOps, loadStreams } from './streams-store.js';
import { type NotificationThread, type StreamsCache, WORK_KEYS } from './types.js';

vi.mock('./streams-store.js', () => ({
  loadStreams: vi.fn(),
  enqueueStreamOps: vi.fn(),
}));
vi.mock('./poller.js', () => ({
  runWorkCycle: vi.fn(),
  isPanelOpen: vi.fn(() => false),
  workPollingToken: vi.fn(),
  patchSnapshotThreads: vi.fn(),
}));
vi.mock('./notifications.js', () => ({
  markThreadDone: vi.fn(),
  markThreadRead: vi.fn(),
}));

const { handleWorkMessage, handlePinMenuClick, pinCurrentTab, rebuildPinMenu } = await import(
  './messages.js'
);

const AT = '2026-09-01T00:00:00.000Z';

const fileWith = (...streams: Array<[string, string]>): StreamsFile => ({
  version: 1,
  updatedAt: AT,
  streams: streams.map(([id, name]) => ({
    id: id as StreamId,
    name,
    createdAt: AT,
    items: [],
    invalidItems: [],
    extra: {},
  })),
  invalidStreams: [],
  extra: {},
});

const cacheOf = (file: StreamsFile): StreamsCache => ({
  repo: 'me/kb',
  state: { ok: true, file },
  sha: 'abc',
  etag: null,
  fetchedAt: 0,
});

let store: Record<string, unknown>;
let activeTab: chrome.tabs.Tab | undefined;
let menuCreate: ReturnType<typeof vi.fn>;
let menuRemove: ReturnType<typeof vi.fn>;
let tabsCreate: ReturnType<typeof vi.fn>;
let badgeText: ReturnType<typeof vi.fn>;
const runtime: { lastError?: { message: string } } = {};

const send = (message: Partial<Message> & { type: string }) =>
  handleWorkMessage(message as Message);

const enqueued = () => vi.mocked(enqueueStreamOps).mock.calls.map(([ops]) => ops);

beforeEach(() => {
  store = {};
  activeTab = { id: 7, url: 'https://example.com/a', title: 'Page A' } as chrome.tabs.Tab;
  menuCreate = vi.fn((_props: unknown, done?: () => void) => done?.());
  menuRemove = vi.fn((_id: string, done?: () => void) => {
    runtime.lastError = { message: 'Cannot find menu item with id kaihuman-pin' };
    done?.();
    runtime.lastError = undefined;
  });
  tabsCreate = vi.fn(async () => ({}));
  badgeText = vi.fn(async () => undefined);
  vi.stubGlobal('chrome', {
    runtime,
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
        }),
      },
    },
    tabs: {
      query: vi.fn(async () => (activeTab ? [activeTab] : [])),
      get: vi.fn(async (id: number) => ({ ...activeTab, id })),
      create: tabsCreate,
    },
    contextMenus: { create: menuCreate, remove: menuRemove },
    action: { setBadgeText: badgeText },
  });
  vi.mocked(loadStreams).mockResolvedValue(cacheOf(fileWith(['st_a', 'A'], ['st_b', 'B'])));
  vi.mocked(enqueueStreamOps).mockResolvedValue(undefined);
  vi.mocked(workPollingToken).mockResolvedValue('tok');
  vi.mocked(markThreadDone).mockResolvedValue(undefined);
  vi.mocked(markThreadRead).mockResolvedValue(undefined);
  vi.mocked(runWorkCycle).mockResolvedValue(undefined);
  vi.mocked(patchSnapshotThreads).mockResolvedValue(undefined);
});

const threadOf = (threadId: string): NotificationThread => ({
  threadId,
  key: `thread:${threadId}`,
  reason: 'mention',
  title: `Thread ${threadId}`,
  url: 'https://github.com/o/r/pull/1',
  repo: 'o/r',
  updatedAt: AT,
  unread: true,
});

/** What the snapshot patches sent so far do to two unread threads, 8 and 9. */
const patchedThreads = () =>
  vi
    .mocked(patchSnapshotThreads)
    .mock.calls.reduce((threads, [patch]) => patch(threads), [threadOf('8'), threadOf('9')]);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('work messages', () => {
  it('queues ops from the panel', async () => {
    store[WORK_KEYS.ui] = { collapsed: ['st_a'], label: 'x' };
    const ops: StreamOp[] = [
      { op: 'renameStream', streamId: 'st_a' as StreamId, name: 'AA' },
      {
        op: 'pin',
        streamId: 'st_b' as StreamId,
        itemId: 'it_1' as never,
        url: 'https://example.com/x',
        title: 'X',
        labels: [],
        at: AT,
      },
    ];
    await expect(send({ type: 'WORK_OPS', ops })).resolves.toEqual({ ok: true });
    expect(enqueued()).toEqual([ops]);
    expect(store[WORK_KEYS.ui]).toEqual({ collapsed: ['st_a'], label: 'x', lastStreamId: 'st_b' });

    expect(send({ type: 'GET_TODAY' })).toBeUndefined();
  });

  it('pins the active tab to the last stream used', async () => {
    store[WORK_KEYS.ui] = { lastStreamId: 'st_b', collapsed: [] };
    await expect(send({ type: 'WORK_PIN_TAB', labels: ['read'] })).resolves.toMatchObject({
      ok: true,
    });
    expect(enqueued()).toEqual([
      [
        expect.objectContaining({
          op: 'pin',
          streamId: 'st_b',
          url: 'https://example.com/a',
          title: 'Page A',
          labels: ['read'],
        }),
      ],
    ]);

    // An explicit stream wins and becomes the last one used.
    await send({ type: 'WORK_PIN_TAB', streamId: 'st_a' });
    expect(enqueued()[1]?.[0]).toMatchObject({ op: 'pin', streamId: 'st_a', labels: [] });
    expect(store[WORK_KEYS.ui]).toEqual({ lastStreamId: 'st_a', collapsed: [] });

    activeTab = { id: 8, url: 'chrome://settings', title: 'Settings' } as chrome.tabs.Tab;
    await expect(send({ type: 'WORK_PIN_TAB' })).rejects.toThrow('This page cannot be pinned');
    expect(enqueued()).toHaveLength(2);
  });

  it('creates an Inbox stream for the first pin', async () => {
    vi.mocked(loadStreams).mockResolvedValue(cacheOf(fileWith()));
    await send({ type: 'WORK_PIN_TAB' });
    expect(enqueued()).toHaveLength(1);
    const [add, pin] = enqueued()[0] ?? [];
    expect(add).toMatchObject({ op: 'addStream', name: 'Inbox' });
    expect(pin).toMatchObject({ op: 'pin', url: 'https://example.com/a' });
    const streamId = (add as Extract<StreamOp, { op: 'addStream' }>).streamId;
    expect((pin as Extract<StreamOp, { op: 'pin' }>).streamId).toBe(streamId);
    expect(store[WORK_KEYS.ui]).toEqual({ collapsed: [], lastStreamId: streamId });
  });

  it('dismisses locally and on GitHub, and undoes the local part when GitHub fails', async () => {
    await expect(
      send({ type: 'WORK_DISMISS', key: 'o/r#1', updatedAt: AT, threadId: '11' }),
    ).resolves.toEqual({ ok: true });
    expect(markThreadDone).toHaveBeenCalledWith('tok', '11');
    expect(store[WORK_KEYS.dismissed]).toEqual({ 'o/r#1': AT });

    // Already done on GitHub.
    vi.mocked(markThreadDone).mockRejectedValueOnce(new GithubHttpError('gone', 404));
    await expect(
      send({ type: 'WORK_DISMISS', key: 'o/r#2', updatedAt: AT, threadId: '12' }),
    ).resolves.toEqual({ ok: true });
    expect(store[WORK_KEYS.dismissed]).toEqual({ 'o/r#1': AT, 'o/r#2': AT });

    vi.mocked(markThreadDone).mockRejectedValueOnce(new GithubHttpError('boom', 500));
    await expect(
      send({ type: 'WORK_DISMISS', key: 'o/r#3', updatedAt: AT, threadId: '13' }),
    ).rejects.toThrow('could not dismiss — retry');
    expect(store[WORK_KEYS.dismissed]).toEqual({ 'o/r#1': AT, 'o/r#2': AT });

    vi.mocked(workPollingToken).mockResolvedValueOnce(undefined);
    await expect(
      send({ type: 'WORK_DISMISS', key: 'o/r#4', updatedAt: AT, threadId: '14' }),
    ).rejects.toThrow('could not dismiss — retry');
    expect(store[WORK_KEYS.dismissed]).toEqual({ 'o/r#1': AT, 'o/r#2': AT });

    // No thread: local only.
    await send({ type: 'WORK_DISMISS', key: 'o/r#5', updatedAt: AT });
    expect(markThreadDone).toHaveBeenCalledTimes(3);
    expect(store[WORK_KEYS.dismissed]).toMatchObject({ 'o/r#5': AT });
  });

  it('opens only safe urls and marks the thread read', async () => {
    await expect(send({ type: 'WORK_OPEN', url: 'javascript:alert(1)' })).rejects.toThrow(
      'Only http and https pages can be opened',
    );
    expect(tabsCreate).not.toHaveBeenCalled();

    vi.mocked(markThreadRead).mockRejectedValueOnce(new GithubHttpError('boom', 500));
    await expect(
      send({ type: 'WORK_OPEN', url: 'https://github.com/o/r/pull/1', threadId: '9' }),
    ).resolves.toEqual({ ok: true });
    expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://github.com/o/r/pull/1' });
    expect(markThreadRead).toHaveBeenCalledWith('tok', '9');

    await send({ type: 'WORK_OPEN', url: 'https://example.com/' });
    expect(markThreadRead).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the pin menu with one entry per stream', async () => {
    await rebuildPinMenu(fileWith(['st_a', 'A'], ['st_b', 'B']));
    expect(menuRemove).toHaveBeenCalledWith('kaihuman-pin', expect.any(Function));
    expect(menuCreate.mock.calls.map(([props]) => props)).toEqual([
      { id: 'kaihuman-pin', title: 'Pin to stream', contexts: ['page', 'link'] },
      {
        id: 'kaihuman-pin:suggested',
        parentId: 'kaihuman-pin',
        title: 'Suggested stream',
        contexts: ['page', 'link'],
      },
      {
        id: 'kaihuman-pin:separator',
        parentId: 'kaihuman-pin',
        type: 'separator',
        contexts: ['page', 'link'],
      },
      { id: 'kaihuman-pin:st_a', parentId: 'kaihuman-pin', title: 'A', contexts: ['page', 'link'] },
      { id: 'kaihuman-pin:st_b', parentId: 'kaihuman-pin', title: 'B', contexts: ['page', 'link'] },
    ]);

    // Without streams there is nothing to suggest: the parent alone pins into a new `Inbox`.
    menuCreate.mockClear();
    await rebuildPinMenu(fileWith());
    expect(menuCreate.mock.calls.map(([props]) => props.id)).toEqual(['kaihuman-pin']);

    menuCreate.mockClear();
    await rebuildPinMenu(null);
    expect(menuCreate).not.toHaveBeenCalled();
  });

  it('refreshes the streams file and the snapshot', async () => {
    const snapshot = { login: 'me' };
    vi.mocked(runWorkCycle).mockResolvedValue(snapshot as never);
    vi.mocked(isPanelOpen).mockReturnValue(true);
    await expect(send({ type: 'WORK_REFRESH' })).resolves.toBe(snapshot);
    expect(loadStreams).toHaveBeenCalledWith({ force: true });
    expect(runWorkCycle).toHaveBeenCalledWith({ force: true, panelOpen: true });
  });

  it('stores or forgets the work token and resets polling', async () => {
    store[WORK_KEYS.pollState] = { backoffStep: 3 };
    await expect(send({ type: 'WORK_SET_TOKEN', key: ' ghp_x ' })).resolves.toEqual({ ok: true });
    expect(store[WORK_KEYS.workToken]).toBe('ghp_x');
    expect(store).not.toHaveProperty(WORK_KEYS.pollState);

    await send({ type: 'WORK_SET_TOKEN', key: '' });
    expect(store).not.toHaveProperty(WORK_KEYS.workToken);
  });

  it('flashes the badge after the pin command', async () => {
    vi.useFakeTimers();
    await pinCurrentTab();
    expect(enqueued()).toHaveLength(1);
    expect(badgeText).toHaveBeenLastCalledWith({ tabId: 7, text: '✓' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(badgeText).toHaveBeenLastCalledWith({ tabId: 7, text: null });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    activeTab = { id: 8, url: 'chrome://settings', title: 'Settings' } as chrome.tabs.Tab;
    await pinCurrentTab();
    expect(badgeText).toHaveBeenLastCalledWith({ tabId: 8, text: '!' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('pins a link from the menu, or else the page', async () => {
    const tab = { id: 7, url: 'https://example.com/a', title: 'Page A' } as chrome.tabs.Tab;
    expect(
      handlePinMenuClick(
        { menuItemId: 'kaihuman-save-knowledge' } as chrome.contextMenus.OnClickData,
        tab,
      ),
    ).toBeUndefined();

    await handlePinMenuClick(
      {
        menuItemId: 'kaihuman-pin:st_b',
        linkUrl: 'https://example.com/link',
      } as chrome.contextMenus.OnClickData,
      tab,
    );
    expect(enqueued()[0]?.[0]).toMatchObject({
      streamId: 'st_b',
      url: 'https://example.com/link',
      title: 'https://example.com/link',
    });

    await handlePinMenuClick(
      { menuItemId: 'kaihuman-pin:st_a' } as chrome.contextMenus.OnClickData,
      tab,
    );
    expect(enqueued()[1]?.[0]).toMatchObject({
      streamId: 'st_a',
      url: 'https://example.com/a',
      title: 'Page A',
    });
    expect(store[WORK_KEYS.ui]).toMatchObject({ lastStreamId: 'st_a' });
  });

  it('marks an opened thread read in the snapshot once GitHub has it', async () => {
    vi.mocked(markThreadRead).mockRejectedValueOnce(new GithubHttpError('boom', 500));
    await send({ type: 'WORK_OPEN', url: 'https://github.com/o/r/pull/1', threadId: '9' });
    expect(patchSnapshotThreads).not.toHaveBeenCalled();

    await send({ type: 'WORK_OPEN', url: 'https://github.com/o/r/pull/1', threadId: '9' });
    expect(patchedThreads().map((t) => [t.threadId, t.unread])).toEqual([
      ['8', true],
      ['9', false],
    ]);
  });

  it('drops a dismissed thread from the snapshot once GitHub has it done', async () => {
    vi.mocked(markThreadDone).mockRejectedValueOnce(new GithubHttpError('boom', 500));
    await expect(
      send({ type: 'WORK_DISMISS', key: 'o/r#1', updatedAt: AT, threadId: '9' }),
    ).rejects.toThrow();
    expect(patchSnapshotThreads).not.toHaveBeenCalled();

    await send({ type: 'WORK_DISMISS', key: 'o/r#1', updatedAt: AT, threadId: '9' });
    expect(patchedThreads().map((t) => t.threadId)).toEqual(['8']);

    // Already done on GitHub is done here too.
    vi.mocked(patchSnapshotThreads).mockClear();
    vi.mocked(markThreadDone).mockRejectedValueOnce(new GithubHttpError('gone', 404));
    await send({ type: 'WORK_DISMISS', key: 'o/r#1', updatedAt: AT, threadId: '8' });
    expect(patchedThreads().map((t) => t.threadId)).toEqual(['9']);
  });

  it('pins into the default stream when the menu names a stream that is gone', async () => {
    store[WORK_KEYS.ui] = { lastStreamId: 'st_b', collapsed: [] };
    const tab = { id: 7, url: 'https://example.com/a', title: 'Page A' } as chrome.tabs.Tab;
    await handlePinMenuClick(
      { menuItemId: 'kaihuman-pin:st_gone' } as chrome.contextMenus.OnClickData,
      tab,
    );
    expect(enqueued()).toEqual([[expect.objectContaining({ op: 'pin', streamId: 'st_b' })]]);
    expect(store[WORK_KEYS.ui]).toMatchObject({ lastStreamId: 'st_b' });
  });

  it('sees a queued stream when pinning before it is saved', async () => {
    store[WORK_KEYS.queue] = [
      { op: 'addStream', streamId: 'st_new', name: 'New', at: AT },
    ] satisfies StreamOp[];
    await send({ type: 'WORK_PIN_TAB', streamId: 'st_new' });
    expect(enqueued()[0]?.[0]).toMatchObject({ op: 'pin', streamId: 'st_new' });
  });

  describe('filing into the suggested stream', () => {
    const answer = (value: object) => {
      vi.stubGlobal('LanguageModel', {
        availability: async () => 'available',
        create: async () => ({ prompt: async () => JSON.stringify(value), destroy: () => {} }),
      });
    };

    it('files the shortcut pin where the model suggests, with its labels', async () => {
      answer({ stream: 'B', labels: ['docs'] });
      store[WORK_KEYS.ui] = { lastStreamId: 'st_a', collapsed: [] };
      await pinCurrentTab();
      expect(enqueued()).toEqual([
        [expect.objectContaining({ op: 'pin', streamId: 'st_b', labels: ['docs'] })],
      ]);
      expect(store[WORK_KEYS.ui]).toMatchObject({ lastStreamId: 'st_b' });
    });

    it('creates the stream the model names when none fits', async () => {
      answer({ stream: '(new stream)', newStreamName: 'Hiring', labels: [] });
      await pinCurrentTab();
      const [ops] = enqueued();
      expect(ops?.[0]).toMatchObject({ op: 'addStream', name: 'Hiring' });
      expect(ops?.[1]).toMatchObject({
        op: 'pin',
        streamId: ops?.[0] && (ops[0] as { streamId: string }).streamId,
      });
    });

    it('keeps the last stream when filing is turned off', async () => {
      answer({ stream: 'B', labels: [] });
      store[WORK_KEYS.ui] = { lastStreamId: 'st_a', collapsed: [], autoFile: false };
      await pinCurrentTab();
      expect(enqueued()).toEqual([[expect.objectContaining({ op: 'pin', streamId: 'st_a' })]]);
    });

    it('falls back to the last stream when nothing can be suggested', async () => {
      store[WORK_KEYS.ui] = { lastStreamId: 'st_b', collapsed: [] };
      await pinCurrentTab();
      expect(enqueued()).toEqual([[expect.objectContaining({ op: 'pin', streamId: 'st_b' })]]);
    });

    it('files from the menu’s Suggested stream entry even with filing off', async () => {
      answer({ stream: 'B', labels: [] });
      store[WORK_KEYS.ui] = { lastStreamId: 'st_a', collapsed: [], autoFile: false };
      await handlePinMenuClick(
        { menuItemId: 'kaihuman-pin:suggested' } as chrome.contextMenus.OnClickData,
        { id: 7, url: 'https://example.com/a', title: 'Page A' } as chrome.tabs.Tab,
      );
      expect(enqueued()).toEqual([[expect.objectContaining({ op: 'pin', streamId: 'st_b' })]]);
    });
  });
});
