import { useEffect, useState } from 'preact/hooks';
import type { Dismissed } from '../background/work/inbox.js';
import {
  EMPTY_WORK_UI,
  type StreamsCache,
  WORK_KEYS,
  type WorkSnapshot,
  type WorkUi,
} from '../background/work/types.js';

export interface WorkState {
  snapshot?: WorkSnapshot;
  streams?: StreamsCache;
  dismissed: Dismissed;
  saveError?: string;
  queueLength: number;
  ui: WorkUi;
  /** False until the first read of storage has landed. */
  loaded: boolean;
}

const KEYS = [
  WORK_KEYS.snapshot,
  WORK_KEYS.streamsCache,
  WORK_KEYS.queue,
  WORK_KEYS.saveError,
  WORK_KEYS.dismissed,
  WORK_KEYS.ui,
];

const INITIAL: WorkState = { dismissed: {}, queueLength: 0, ui: EMPTY_WORK_UI, loaded: false };

const read = async (): Promise<WorkState> => {
  const data = await chrome.storage.local.get(KEYS);
  const queue = data[WORK_KEYS.queue];
  return {
    snapshot: data[WORK_KEYS.snapshot] as WorkSnapshot | undefined,
    streams: data[WORK_KEYS.streamsCache] as StreamsCache | undefined,
    dismissed: (data[WORK_KEYS.dismissed] as Dismissed | undefined) ?? {},
    saveError: (data[WORK_KEYS.saveError] as string | undefined) || undefined,
    queueLength: Array.isArray(queue) ? queue.length : 0,
    ui: { ...EMPTY_WORK_UI, ...(data[WORK_KEYS.ui] as Partial<WorkUi> | undefined) },
    loaded: true,
  };
};

/** The work feature's stored state, re-read whenever the worker changes any of it. */
export function useWorkState(): WorkState {
  const [state, setState] = useState<WorkState>(INITIAL);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      read().then((next) => {
        if (live) setState(next);
      });
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && KEYS.some((key) => key in changes)) void refresh();
    };
    void refresh();
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      live = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  return state;
}

let pending: Promise<unknown> = Promise.resolve();

/**
 * Read-modify-write of the panel's own settings. Calls run one after another, so concurrent
 * updates (two streams collapsed at once) each see the previous one's result.
 */
export function updateWorkUi(
  patch: Partial<WorkUi> | ((ui: WorkUi) => Partial<WorkUi>),
): Promise<void> {
  const run = async () => {
    const data = await chrome.storage.local.get(WORK_KEYS.ui);
    const ui = { ...EMPTY_WORK_UI, ...(data[WORK_KEYS.ui] as Partial<WorkUi> | undefined) };
    const change = typeof patch === 'function' ? patch(ui) : patch;
    await chrome.storage.local.set({ [WORK_KEYS.ui]: { ...ui, ...change } });
  };
  // A failed update must not stop the ones queued behind it.
  const result = pending.then(run, run);
  pending = result.catch(() => {});
  return result;
}
