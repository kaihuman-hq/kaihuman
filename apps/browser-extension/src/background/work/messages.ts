import {
  isSafeUrl,
  newItemId,
  newStreamId,
  type StreamId,
  type StreamOp,
  type StreamsFile,
} from '@kaihuman/formats';
import type { Message } from '../../types.js';
import type { Dismissed } from './inbox.js';
import { markThreadDone, markThreadRead } from './notifications.js';
import { applyPending } from './pending.js';
import { isPanelOpen, patchSnapshotThreads, runWorkCycle, workPollingToken } from './poller.js';
import { GithubHttpError } from './repo-file.js';
import { enqueueStreamOps, loadStreams } from './streams-store.js';
import { EMPTY_WORK_UI, type StreamsCache, WORK_KEYS, type WorkUi } from './types.js';

export const PIN_MENU_ID = 'kaihuman-pin';
const PIN_MENU_PREFIX = `${PIN_MENU_ID}:`;
const FIRST_STREAM_NAME = 'Inbox';
const BADGE_FLASH_MS = 2000;
const DISMISS_FAILED = 'could not dismiss — retry';

async function getStored<T>(key: string): Promise<T | undefined> {
  const data = await chrome.storage.local.get(key);
  return data[key] as T | undefined;
}

async function rememberStream(streamId: StreamId): Promise<void> {
  const ui = (await getStored<WorkUi>(WORK_KEYS.ui)) ?? EMPTY_WORK_UI;
  await chrome.storage.local.set({ [WORK_KEYS.ui]: { ...ui, lastStreamId: streamId } });
}

/**
 * The streams as they will be once the queue is saved, so a pin right after creating a stream (or
 * a second pin before the first `Inbox` is saved) sees that stream.
 */
async function pendingFile(): Promise<StreamsFile> {
  const cache = await loadStreams();
  if (!cache) throw new Error('Sign in to kaihuman to save streams');
  if (!cache.state.ok) {
    throw new Error('The streams file is read-only until it is valid JSON again');
  }
  return applyPending(cache.state.file, (await getStored<StreamOp[]>(WORK_KEYS.queue)) ?? []);
}

async function pinUrl(
  url: string,
  title: string,
  opts: { streamId?: StreamId; labels?: string[] } = {},
): Promise<StreamId> {
  if (!isSafeUrl(url)) throw new Error('This page cannot be pinned');
  const file = await pendingFile();
  const known = (id: StreamId | undefined) =>
    id !== undefined && file.streams.some((stream) => stream.id === id);
  const lastStreamId = (await getStored<WorkUi>(WORK_KEYS.ui))?.lastStreamId;
  const at = new Date().toISOString();
  const ops: StreamOp[] = [];
  // A menu entry can outlive its stream (deleted elsewhere); pinning into nothing would be a
  // silent no-op behind a ✓, so an unknown stream falls back like no stream at all.
  let streamId = known(opts.streamId)
    ? opts.streamId
    : known(lastStreamId)
      ? lastStreamId
      : file.streams[0]?.id;
  if (streamId === undefined) {
    streamId = newStreamId();
    ops.push({ op: 'addStream', streamId, name: FIRST_STREAM_NAME, at });
  }
  ops.push({
    op: 'pin',
    streamId,
    itemId: newItemId(),
    url,
    title: title || url,
    labels: opts.labels ?? [],
    at,
  });
  await enqueueStreamOps(ops);
  await rememberStream(streamId);
  return streamId;
}

async function pinTab(opts: {
  tabId?: number;
  streamId?: StreamId;
  labels?: string[];
}): Promise<StreamId> {
  const tab =
    opts.tabId === undefined
      ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
      : await chrome.tabs.get(opts.tabId);
  if (!tab?.url) throw new Error('This page cannot be pinned');
  return pinUrl(tab.url, tab.title ?? '', opts);
}

async function setDismissed(key: string, updatedAt: string | undefined): Promise<void> {
  const dismissed = (await getStored<Dismissed>(WORK_KEYS.dismissed)) ?? {};
  if (updatedAt === undefined) delete dismissed[key];
  else dismissed[key] = updatedAt;
  await chrome.storage.local.set({ [WORK_KEYS.dismissed]: dismissed });
}

/**
 * GitHub's Last-Modified does not move when a thread is read or done, so the poller's 304s would
 * keep the old thread around; the snapshot is patched here instead. A failed patch only leaves
 * the row until the next change, so it is not reported as the action failing.
 */
const patchThreads = (patch: Parameters<typeof patchSnapshotThreads>[0]) =>
  patchSnapshotThreads(patch).catch((error) =>
    console.warn('kaihuman: updating the work snapshot failed', error),
  );

async function dismiss(key: string, updatedAt: string, threadId?: string): Promise<void> {
  await setDismissed(key, updatedAt);
  if (threadId === undefined) return;
  try {
    const token = await workPollingToken();
    if (!token) throw new Error('No GitHub token');
    await markThreadDone(token, threadId);
  } catch (error) {
    // 404: the thread is already done, which is what was asked for.
    if (!(error instanceof GithubHttpError && error.status === 404)) {
      console.warn('kaihuman: marking the notification done failed', error);
      await setDismissed(key, undefined);
      throw new Error(DISMISS_FAILED);
    }
  }
  await patchThreads((threads) => threads.filter((thread) => thread.threadId !== threadId));
}

async function open(url: string, threadId?: string): Promise<void> {
  if (!isSafeUrl(url)) throw new Error('Only http and https pages can be opened');
  await chrome.tabs.create({ url });
  if (threadId === undefined) return;
  // Opening is what the user asked for; a notification left unread is harmless.
  const token = await workPollingToken();
  if (!token) return;
  const read = await markThreadRead(token, threadId).then(
    () => true,
    () => false,
  );
  if (read) {
    await patchThreads((threads) =>
      threads.map((thread) =>
        thread.threadId === threadId ? { ...thread, unread: false } : thread,
      ),
    );
  }
}

async function refresh() {
  await loadStreams({ force: true }).catch((error) =>
    console.warn('kaihuman: reading the streams file failed', error),
  );
  return runWorkCycle({ force: true, panelOpen: isPanelOpen() });
}

async function setWorkToken(key: string): Promise<void> {
  if (key) await chrome.storage.local.set({ [WORK_KEYS.workToken]: key });
  else await chrome.storage.local.remove(WORK_KEYS.workToken);
  await chrome.storage.local.remove(WORK_KEYS.pollState);
}

const OK = { ok: true } as const;

/** Answers the side panel's messages; `undefined` for any other message. */
export function handleWorkMessage(message: Message): Promise<unknown> | undefined {
  switch (message.type) {
    case 'WORK_OPS': {
      const ops = Array.isArray(message.ops) ? message.ops : [];
      return enqueueStreamOps(ops).then(async () => {
        const pin = [...ops]
          .reverse()
          .find((op): op is Extract<StreamOp, { op: 'pin' }> => op.op === 'pin');
        if (pin) await rememberStream(pin.streamId);
        return OK;
      });
    }
    case 'WORK_REFRESH':
      return refresh();
    case 'WORK_DISMISS': {
      const { key, updatedAt, threadId } = message;
      if (!key || !updatedAt) return Promise.reject(new Error('Nothing to dismiss'));
      return dismiss(key, updatedAt, threadId).then(() => OK);
    }
    case 'WORK_OPEN':
      return open(message.url ?? '', message.threadId).then(() => OK);
    case 'WORK_SET_TOKEN':
      return setWorkToken((message.key ?? '').trim()).then(() => OK);
    case 'WORK_PIN_TAB':
      return pinTab({
        tabId: message.tabId,
        streamId: message.streamId as StreamId | undefined,
        labels: message.labels,
      }).then((streamId) => ({ ...OK, streamId }));
    default:
      return undefined;
  }
}

async function flashBadge(tabId: number, text: string): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    // `null` clears only this tab's text, so the work count shows again; `''` would hide it.
    chrome.action.setBadgeText({ tabId, text: null as unknown as string }).catch(() => undefined);
  }, BADGE_FLASH_MS);
}

/** The `pin-current-tab` command: pin, then say on the badge whether it worked. */
export async function pinCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  let text = '✓';
  try {
    await pinTab({ tabId: tab.id });
  } catch (error) {
    console.warn('kaihuman: pinning the tab failed', error);
    text = '!';
  }
  await flashBadge(tab.id, text);
}

/** A click on the `Pin to stream` menu; `undefined` when the item is not one of its own. */
export function handlePinMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> | undefined {
  const id = String(info.menuItemId);
  if (id !== PIN_MENU_ID && !id.startsWith(PIN_MENU_PREFIX)) return undefined;
  const streamId = id.startsWith(PIN_MENU_PREFIX)
    ? (id.slice(PIN_MENU_PREFIX.length) as StreamId)
    : undefined;
  const [url, title] = info.linkUrl
    ? [info.linkUrl, info.selectionText || info.linkUrl]
    : [tab?.url ?? '', tab?.title ?? ''];
  return pinUrl(url, title, { streamId }).then(
    () => (tab?.id === undefined ? undefined : flashBadge(tab.id, '✓')),
    async (error) => {
      console.warn('kaihuman: pinning from the menu failed', error);
      if (tab?.id !== undefined) await flashBadge(tab.id, '!');
    },
  );
}

const menuCall = (call: (done: () => void) => void) =>
  new Promise<void>((resolve) =>
    call(() => {
      // Read so Chrome does not log it: removing a menu that is not there yet is expected, and a
      // create that fails leaves the menu one entry short rather than broken.
      void chrome.runtime.lastError;
      resolve();
    }),
  );

let menuBuild: Promise<void> = Promise.resolve();

/**
 * Replaces the `Pin to stream` menu. Only its own items are removed, so the other menus stay.
 * Without streams the parent alone is shown; a click on it pins into a new `Inbox`.
 */
export function rebuildPinMenu(file: StreamsFile | null): Promise<void> {
  // Two rebuilds interleaving would create the same id twice.
  menuBuild = menuBuild.then(async () => {
    await menuCall((done) => chrome.contextMenus.remove(PIN_MENU_ID, done));
    if (!file) return;
    await menuCall((done) =>
      chrome.contextMenus.create(
        { id: PIN_MENU_ID, title: 'Pin to stream', contexts: ['page', 'link'] },
        done,
      ),
    );
    for (const stream of file.streams) {
      await menuCall((done) =>
        chrome.contextMenus.create(
          {
            id: `${PIN_MENU_PREFIX}${stream.id}`,
            parentId: PIN_MENU_ID,
            title: stream.name,
            contexts: ['page', 'link'],
          },
          done,
        ),
      );
    }
  });
  return menuBuild;
}

export const pinMenuFile = (cache: StreamsCache | undefined): StreamsFile | null =>
  cache?.state?.ok ? cache.state.file : null;

const menuSignature = (file: StreamsFile | null) =>
  JSON.stringify(file?.streams.map((stream) => [stream.id, stream.name]) ?? null);

/** Rebuilds the menu when the cached streams' ids or names change, not on every refetch. */
export function watchPinMenu(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = changes[WORK_KEYS.streamsCache];
    if (area !== 'local' || !change) return;
    const before = pinMenuFile(change.oldValue as StreamsCache | undefined);
    const after = pinMenuFile(change.newValue as StreamsCache | undefined);
    if (menuSignature(before) === menuSignature(after)) return;
    rebuildPinMenu(after).catch((error) =>
      console.warn('kaihuman: rebuilding the pin menu failed', error),
    );
  });
}
