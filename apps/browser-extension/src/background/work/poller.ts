import { type GithubRef, itemRefOf, type StreamOp, type StreamsFile } from '@kaihuman/formats';
import { readMutedKeys } from '../ai/labels.js';
import { runWorkQueries } from './graphql.js';
import { autoDoneOps, type Dismissed, pinnedKeys, workSummary } from './inbox.js';
import { pollNotifications } from './notifications.js';
import { GithubHttpError } from './repo-file.js';
import { enqueueStreamOps, flushStreams, loadStreams } from './streams-store.js';
import {
  type NotificationThread,
  type PinnedStatus,
  type StreamsCache,
  WORK_KEYS,
  type WorkProblem,
  type WorkSnapshot,
} from './types.js';

export interface WorkPollState {
  notificationsLastModified: string | null;
  nextNotificationsAt: number;
  nextGraphqlAt: number;
  backoffStep: number;
}

export const BACKOFF_MINUTES = [1, 2, 4, 8, 15] as const;

const MINUTE_MS = 60_000;
const MIN_NOTIFICATIONS_INTERVAL_SEC = 60;
const BADGE_COLOR = '#b91c1c';

const initialPollState = (): WorkPollState => ({
  notificationsLastModified: null,
  nextNotificationsAt: 0,
  nextGraphqlAt: 0,
  backoffStep: 0,
});

const emptySnapshot = (): WorkSnapshot => ({
  login: '',
  fetchedAt: 0,
  searches: {
    'review-requested': [],
    assigned: [],
    failing: [],
    'changes-requested': [],
    'ready-to-merge': [],
    mine: [],
  },
  threads: [],
  pinned: {},
  orgProblems: [],
  problem: null,
});

async function getStored<T>(key: string): Promise<T | undefined> {
  const data = await chrome.storage.local.get(key);
  return data[key] as T | undefined;
}

// The worker can hold several side-panel ports at once (one per window).
let openPanels = 0;

export function setPanelOpen(open: boolean): void {
  openPanels = Math.max(0, openPanels + (open ? 1 : -1));
}

export const isPanelOpen = (): boolean => openPanels > 0;

/** The work token when set, else the sign-in token — which, like the streams file, needs a repo. */
export async function workPollingToken(): Promise<string | undefined> {
  const data = await chrome.storage.local.get([WORK_KEYS.workToken, 'lifeos_token', 'lifeos_repo']);
  const workToken = data[WORK_KEYS.workToken] as string | undefined;
  if (workToken) return workToken;
  return data.lifeos_repo ? ((data.lifeos_token as string | undefined) ?? undefined) : undefined;
}

async function setBadge(snapshot: WorkSnapshot, file: StreamsFile | null): Promise<void> {
  let text = '';
  if (snapshot.problem?.kind === 'auth') text = '!';
  else if (snapshot.problem?.kind !== 'signed-out') {
    const dismissed = (await getStored<Dismissed>(WORK_KEYS.dismissed)) ?? {};
    const { waiting } = workSummary(
      snapshot,
      file,
      dismissed,
      // Labels are optional: a failed read must not leave the badge stale.
      await readMutedKeys().catch(() => new Set<string>()),
    );
    text = waiting ? String(waiting) : '';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

/** A failure's problem and the poll state that waits it out. */
function failure(
  error: unknown,
  now: number,
  state: WorkPollState,
): { problem: WorkProblem; state: WorkPollState } {
  if (error instanceof GithubHttpError && error.status === 401) {
    return { problem: { kind: 'auth' }, state };
  }
  if (error instanceof GithubHttpError && error.retryAt !== undefined) {
    const until = error.retryAt;
    return {
      problem: { kind: 'rate-limit', until },
      state: { ...state, nextNotificationsAt: until, nextGraphqlAt: until },
    };
  }
  // Network errors, 5xx, GraphQL errors and other 4xx all keep the last data and retry later.
  const step = Math.min(state.backoffStep, BACKOFF_MINUTES.length - 1);
  const retryAt = now + BACKOFF_MINUTES[step] * MINUTE_MS;
  return {
    problem: { kind: 'offline', retryAt },
    state: {
      ...state,
      nextNotificationsAt: retryAt,
      nextGraphqlAt: retryAt,
      backoffStep: Math.min(step + 1, BACKOFF_MINUTES.length - 1),
    },
  };
}

const writableFile = (cache: StreamsCache | undefined): StreamsFile | null =>
  cache?.state?.ok ? cache.state.file : null;

const cachedStreams = async () =>
  writableFile(await getStored<StreamsCache>(WORK_KEYS.streamsCache));

/** The streams file when it is writable; a failed read falls back to the stored copy. */
async function writableStreams(): Promise<StreamsFile | null> {
  try {
    return writableFile(await loadStreams());
  } catch (error) {
    console.warn('kaihuman: reading the streams file failed', error);
    return cachedStreams();
  }
}

function pinnedRefs(file: StreamsFile | null): GithubRef[] {
  if (!file) return [];
  const refs = new Map<string, GithubRef>();
  for (const stream of file.streams) {
    for (const item of stream.items) {
      if (item.doneAt) continue;
      const ref = itemRefOf(item.url);
      if (ref && ref.kind !== 'link') refs.set(ref.key, ref);
    }
  }
  return [...refs.values()];
}

/** Auto-done ops not already waiting in the queue, so a failing flush does not pile up repeats. */
async function newAutoDoneOps(
  file: StreamsFile,
  pinned: Record<string, PinnedStatus>,
  now: number,
): Promise<StreamOp[]> {
  const queue = (await getStored<StreamOp[]>(WORK_KEYS.queue)) ?? [];
  const queued = new Set(queue.flatMap((op) => (op.op === 'markDone' ? [op.itemId] : [])));
  return autoDoneOps(file, pinned, new Date(now).toISOString()).filter(
    (op) => op.op !== 'markDone' || !queued.has(op.itemId),
  );
}

interface CycleOptions {
  force?: boolean;
  panelOpen: boolean;
  now?: number;
}

/** `reset` starts from a fresh poll state: a new token owes nothing to the old one's schedule. */
type CycleRequest = CycleOptions & { reset?: boolean };

async function cycle(opts: CycleRequest): Promise<WorkSnapshot | undefined> {
  const now = opts.now ?? Date.now();
  const force = opts.force === true;
  const prev = (await getStored<WorkSnapshot>(WORK_KEYS.snapshot)) ?? emptySnapshot();
  let state = opts.reset
    ? initialPollState()
    : ((await getStored<WorkPollState>(WORK_KEYS.pollState)) ?? initialPollState());

  const token = await workPollingToken();
  if (!token) {
    const snapshot: WorkSnapshot = { ...prev, problem: { kind: 'signed-out' } };
    await chrome.storage.local.set({ [WORK_KEYS.snapshot]: snapshot });
    await setBadge(snapshot, null);
    return snapshot;
  }
  // A rejected token is not retried on a timer; a force or a token change starts over.
  if (prev.problem?.kind === 'auth' && !force) return prev;

  let snapshot: WorkSnapshot = { ...prev, problem: null };
  let file: StreamsFile | null = null;
  // A cycle with nothing due calls nobody, so it must not clear a problem or the backoff.
  let reached = false;
  let problem: WorkProblem | null =
    prev.problem?.kind === 'signed-out' ? null : (prev.problem ?? null);
  try {
    let notificationsChanged = false;
    if (force || now >= state.nextNotificationsAt) {
      const poll = await pollNotifications(token, state.notificationsLastModified);
      const interval =
        Number.isFinite(poll.pollIntervalSec) && poll.pollIntervalSec > 0
          ? poll.pollIntervalSec
          : MIN_NOTIFICATIONS_INTERVAL_SEC;
      state = {
        ...state,
        nextNotificationsAt: now + Math.max(MIN_NOTIFICATIONS_INTERVAL_SEC, interval) * 1000,
      };
      snapshot.fetchedAt = now;
      reached = true;
      if (poll.status === 'changed') {
        notificationsChanged = true;
        state.notificationsLastModified = poll.lastModified;
        snapshot.threads = poll.threads;
      }
    }

    if (force || notificationsChanged || now >= state.nextGraphqlAt) {
      file = await writableStreams();
      const refs = pinnedRefs(file);
      const result = await runWorkQueries(token, refs);
      state = { ...state, nextGraphqlAt: now + (opts.panelOpen ? 1 : 5) * MINUTE_MS };

      if (prev.login && result.login !== prev.login) {
        // Another account: nothing of the old one's inbox or dismissals applies.
        snapshot = { ...emptySnapshot(), threads: notificationsChanged ? snapshot.threads : [] };
        await chrome.storage.local.remove(WORK_KEYS.dismissed);
      }
      const stillPinned = file ? pinnedKeys(file) : new Set<string>();
      const pinned: Record<string, PinnedStatus> = {};
      for (const [key, status] of Object.entries(snapshot.pinned)) {
        if (stillPinned.has(key)) pinned[key] = status;
      }
      Object.assign(pinned, result.pinned);
      snapshot = {
        ...snapshot,
        login: result.login,
        searches: result.searches,
        pinned,
        orgProblems: result.orgProblems,
        fetchedAt: now,
      };
      reached = true;

      if (file) {
        const ops = await newAutoDoneOps(file, pinned, now);
        if (ops.length > 0) {
          await enqueueStreamOps(ops).catch((error) =>
            console.warn('kaihuman: queueing auto-done items failed', error),
          );
        }
      }
    }
    if (reached) {
      problem = null;
      state = { ...state, backoffStep: 0 };
    }
  } catch (error) {
    const failed = failure(error, now, state);
    problem = failed.problem;
    state = failed.state;
  }

  snapshot = { ...snapshot, problem };
  await chrome.storage.local.set({ [WORK_KEYS.snapshot]: snapshot, [WORK_KEYS.pollState]: state });
  // Pinned items leave the inbox count, so the badge needs the file even when GraphQL did not run.
  await setBadge(snapshot, file ?? (await cachedStreams()));

  const queue = (await getStored<StreamOp[]>(WORK_KEYS.queue)) ?? [];
  if (queue.length > 0) await flushStreams();
  return snapshot;
}

// Cycles and thread patches both read-modify-write the snapshot; run one after another so
// neither writes over the other's change.
let snapshotLock: Promise<unknown> = Promise.resolve();
function withSnapshotLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = snapshotLock.then(fn, fn);
  snapshotLock = run.catch(() => undefined);
  return run;
}

/** Changes the stored threads, after any running cycle, and updates the badge to match. */
export function patchSnapshotThreads(
  patch: (threads: NotificationThread[]) => NotificationThread[],
): Promise<void> {
  return withSnapshotLock(async () => {
    const prev = await getStored<WorkSnapshot>(WORK_KEYS.snapshot);
    if (!prev) return;
    const snapshot = { ...prev, threads: patch(prev.threads) };
    await chrome.storage.local.set({ [WORK_KEYS.snapshot]: snapshot });
    await setBadge(snapshot, await cachedStreams());
  });
}

let running: Promise<WorkSnapshot | undefined> | undefined;
let followUp:
  | {
      opts: CycleRequest;
      promise: Promise<WorkSnapshot | undefined>;
      resolve: (run: Promise<WorkSnapshot | undefined>) => void;
    }
  | undefined;

function start(opts: CycleRequest): Promise<WorkSnapshot | undefined> {
  const run = withSnapshotLock(() => cycle(opts)).finally(() => {
    running = undefined;
    // Started in the same callback, so no other caller can slip a cycle in between.
    const next = followUp;
    followUp = undefined;
    if (next) next.resolve(start(next.opts));
  });
  running = run;
  return run;
}

/**
 * One cycle at a time. A plain call during a run shares it; a forced, panel-open or reset one
 * asks for a run of its own, so it waits for the current run and then gets exactly one more
 * (requests made meanwhile merge into it).
 */
function requestCycle(opts: CycleRequest): Promise<WorkSnapshot | undefined> {
  if (!running) return start(opts);
  if (!opts.force && !opts.panelOpen && !opts.reset) return running;
  if (followUp) {
    followUp.opts = {
      force: followUp.opts.force || opts.force,
      reset: followUp.opts.reset || opts.reset,
      panelOpen: opts.panelOpen,
      now: opts.now,
    };
    return followUp.promise;
  }
  let resolve: (run: Promise<WorkSnapshot | undefined>) => void = () => {};
  const promise = new Promise<WorkSnapshot | undefined>((r) => {
    resolve = r;
  });
  followUp = { opts, promise, resolve };
  return promise;
}

export function runWorkCycle(opts: CycleOptions): Promise<WorkSnapshot | undefined> {
  return requestCycle(opts);
}

const WORK_ALARM = 'work';

/**
 * Creates the minute alarm the work cycle runs on, unless it is there. `create` replaces an
 * existing alarm and restarts its period, so a worker restarted more often than once a minute
 * would push it back every time and it would never fire.
 */
export async function ensureWorkAlarm(): Promise<void> {
  if (await chrome.alarms.get(WORK_ALARM)) return;
  await chrome.alarms.create(WORK_ALARM, { periodInMinutes: 1 });
}

/** The side panel opened: reread the streams file and refresh everything now. */
export async function connectWorkPanel(port: chrome.runtime.Port): Promise<void> {
  setPanelOpen(true);
  port.onDisconnect.addListener(() => setPanelOpen(false));
  await loadStreams({ force: true }).catch((error) =>
    console.warn('kaihuman: reading the streams file failed', error),
  );
  await runWorkCycle({ force: true, panelOpen: true });
}

/** A new token may be another account or a fixed one; either way polling starts over. */
export function watchWorkTokens(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!('lifeos_token' in changes) && !(WORK_KEYS.workToken in changes)) return;
    // A cycle still running with the old token finishes first; this one then starts afresh and
    // writes over whatever poll state that cycle left.
    requestCycle({ force: true, reset: true, panelOpen: isPanelOpen() }).catch((error) =>
      console.warn('kaihuman: work refresh failed', error),
    );
  });
}
