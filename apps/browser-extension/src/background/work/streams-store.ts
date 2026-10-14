import {
  applyOp,
  applyOps,
  emptyStreams,
  parseStreams,
  STREAMS_PATH,
  type StreamOp,
  type StreamsParse,
  serializeStreams,
} from '@kaihuman/formats';
import { readRepoFile, WriteConflict, writeRepoFile } from './repo-file';
import { type StreamsCache, WORK_KEYS } from './types';

/** How long a cached copy is listed without a refresh. */
export const STREAMS_CACHE_TTL_MS = 15 * 60 * 1000;
const FLUSH_DELAY_MS = 3000;
const MAX_RETRIES = 3;
const COMMIT_MESSAGE = `Update ${STREAMS_PATH} via Extension`;

/** Without a repository there is nowhere to read or write, so a token alone does not connect. */
async function dataRepoCredentials(): Promise<{ token?: string; repo: string }> {
  const data = await chrome.storage.local.get(['lifeos_token', 'lifeos_repo']);
  const repo = (data.lifeos_repo as string | undefined) ?? '';
  return { token: repo ? (data.lifeos_token as string | undefined) : undefined, repo };
}

async function getStored<T>(key: string): Promise<T | undefined> {
  const data = await chrome.storage.local.get(key);
  return data[key] as T | undefined;
}

// Queue changes are read-modify-write on storage; two interleaved ones would lose or repeat ops.
// Everything runs inside the worker, so a promise chain is enough.
let queueLock: Promise<unknown> = Promise.resolve();
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueLock.then(fn, fn);
  queueLock = run.catch(() => undefined);
  return run;
}

const getQueue = async () => (await getStored<StreamOp[]>(WORK_KEYS.queue)) ?? [];

function parseFile(content: string | null, now: number): StreamsParse {
  return content === null
    ? { ok: true, file: emptyStreams(new Date(now).toISOString()) }
    : parseStreams(content);
}

/** The streams file, or `undefined` when signed out. */
export async function loadStreams(
  opts: { force?: boolean } = {},
): Promise<StreamsCache | undefined> {
  const { token, repo } = await dataRepoCredentials();
  if (!token) return undefined;
  const stored = await getStored<StreamsCache>(WORK_KEYS.streamsCache);
  const cache = stored && stored.repo === repo && stored.state ? stored : undefined;
  const now = Date.now();
  if (cache && !opts.force && now - cache.fetchedAt <= STREAMS_CACHE_TTL_MS) return cache;

  const res = await readRepoFile(token, repo, STREAMS_PATH, cache?.etag);
  let next: StreamsCache;
  if (res.status === 'unchanged' && cache) {
    next = { ...cache, fetchedAt: now };
  } else if (res.status === 'ok') {
    next = {
      repo,
      state: parseFile(res.content, now),
      sha: res.sha,
      etag: res.etag,
      fetchedAt: now,
    };
  } else {
    next = { repo, state: parseFile(null, now), sha: null, etag: null, fetchedAt: now };
  }
  await chrome.storage.local.set({ [WORK_KEYS.streamsCache]: next });
  return next;
}

let flushTimer: ReturnType<typeof setTimeout> | undefined;

export async function enqueueStreamOps(ops: StreamOp[]): Promise<void> {
  const cache = await loadStreams();
  if (!cache) throw new Error('Sign in to kaihuman to save streams');
  if (!cache.state.ok) {
    throw new Error('The streams file is read-only until it is valid JSON again');
  }
  await withQueueLock(async () => {
    const queue = await getQueue();
    await chrome.storage.local.set({ [WORK_KEYS.queue]: [...queue, ...ops] });
  });
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flushStreams();
  }, FLUSH_DELAY_MS);
}

/** Applies ops one by one so a single op that throws is dropped instead of wedging the queue. */
function applyQueue(
  file: Extract<StreamsParse, { ok: true }>['file'],
  ops: StreamOp[],
  updatedAt: string,
) {
  const failures: string[] = [];
  const applied = ops.reduce((acc, op) => {
    try {
      return applyOp(acc, op);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      return acc;
    }
  }, file);
  return { file: applyOps(applied, [], updatedAt), failures };
}

let flushing: Promise<{ saved: boolean }> | undefined;

/** One flush at a time; a second caller shares the running one. */
export function flushStreams(): Promise<{ saved: boolean }> {
  flushing ??= runFlush().finally(() => {
    flushing = undefined;
  });
  return flushing;
}

async function runFlush(): Promise<{ saved: boolean }> {
  const { token, repo } = await dataRepoCredentials();
  if (!token) return { saved: false };
  const queue = await getQueue();
  if (queue.length === 0) return { saved: true };
  // Ops appended while the commit is in flight are not in it, so only this many leave the queue.
  const flushed = queue.length;
  const fail = async (message: string) => {
    await chrome.storage.local.set({ [WORK_KEYS.saveError]: message });
    return { saved: false };
  };

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await readRepoFile(token, repo, STREAMS_PATH);
      if (res.status === 'unchanged') continue;
      const now = Date.now();
      const sha = res.status === 'ok' ? res.sha : null;
      const state = parseFile(res.status === 'ok' ? res.content : null, now);
      if (!state.ok)
        return await fail('The streams file is read-only until it is valid JSON again');

      const { file, failures } = applyQueue(
        state.file,
        queue.slice(0, flushed),
        new Date(now).toISOString(),
      );
      const done = async (saved: { file: typeof file; sha: string | null }) => {
        const cache: StreamsCache = {
          repo,
          state: { ok: true, file: saved.file },
          sha: saved.sha,
          etag: null,
          fetchedAt: now,
        };
        await withQueueLock(async () => {
          const current = await getQueue();
          await chrome.storage.local.set({
            [WORK_KEYS.queue]: current.slice(flushed),
            [WORK_KEYS.streamsCache]: cache,
          });
        });
        if (failures.length > 0) {
          await chrome.storage.local.set({ [WORK_KEYS.saveError]: failures.join('; ') });
        } else {
          await chrome.storage.local.remove(WORK_KEYS.saveError);
        }
        return { saved: true };
      };
      const content = serializeStreams(file);
      // Ops that change nothing (an auto-done already applied elsewhere) would still bump
      // `updatedAt` and make a commit; there is nothing to save, so they just leave the queue.
      if (content === serializeStreams({ ...state.file, updatedAt: file.updatedAt })) {
        return await done({ file: state.file, sha });
      }
      try {
        const newSha = await writeRepoFile(token, repo, STREAMS_PATH, content, sha, COMMIT_MESSAGE);
        return await done({ file, sha: newSha });
      } catch (error) {
        if (!(error instanceof WriteConflict)) throw error;
      }
    }
    return await fail('The streams file keeps changing; your changes are not saved yet');
  } catch (error) {
    return await fail(error instanceof Error ? error.message : String(error));
  }
}
