import type { SyncTrigger } from './status.js';

export interface SchedulerDeps {
  /** Performs one sync; resolves to whether it succeeded. Must not throw (a throw counts as failure). */
  run(trigger: SyncTrigger): Promise<boolean>;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Base poll interval while the app is in the foreground. */
  pollMs?: number;
  /** Poll interval ceiling after repeated failures. */
  maxPollMs?: number;
  /** Minimum gap between runs started by the passive triggers (launch, foreground, poll, online). */
  throttleMs?: number;
  /** Data younger than this needs no refresh on tab focus. */
  staleMs?: number;
  writeDebounceMs?: number;
  /**
   * On returning to the foreground with data older than this, a run in flight does not count:
   * it may be a request iOS froze when it suspended the app, so a fresh run is queued behind it.
   */
  foregroundStaleMs?: number;
}

export interface SyncScheduler {
  trigger(trigger: SyncTrigger): Promise<void>;
  setActive(active: boolean): void;
  setOnline(online: boolean): void;
  setLowPower(lowPower: boolean): void;
  lastSuccessAt(): number | null;
  isStale(): boolean;
  dispose(): void;
}

/**
 * Decides when a sync run starts; what a run does lives in the engine. Pure and clock-injected so
 * every rule is testable with fake timers. Only one run is in flight: an explicit request
 * (pull/write) that arrives meanwhile queues exactly one follow-up, because its data may have
 * changed after the run read it; passive triggers just wait for the run in flight.
 */
export function createSyncScheduler(deps: SchedulerDeps): SyncScheduler {
  const pollMs = deps.pollMs ?? 60_000;
  const maxPollMs = deps.maxPollMs ?? 600_000;
  const throttleMs = deps.throttleMs ?? 2_000;
  const staleMs = deps.staleMs ?? 30_000;
  const writeDebounceMs = deps.writeDebounceMs ?? 1_500;
  const foregroundStaleMs = deps.foregroundStaleMs ?? 120_000;

  let active = false;
  let online = true;
  let lowPower = false;
  let disposed = false;
  let running: Promise<void> | null = null;
  let queued: SyncTrigger | null = null;
  let lastStartAt = Number.NEGATIVE_INFINITY;
  let lastSuccess: number | null = null;
  let pollDelay = pollMs;
  let pollTimer: unknown = null;
  let writeTimer: unknown = null;
  // A trigger that arrived while offline: replayed when the network returns.
  let offlineDemand = false;

  const olderThan = (ms: number) => lastSuccess === null || deps.now() - lastSuccess > ms;
  const stale = () => olderThan(staleMs);

  const clearPoll = () => {
    if (pollTimer !== null) deps.clearTimeout(pollTimer);
    pollTimer = null;
  };

  const schedulePoll = () => {
    clearPoll();
    if (disposed || !active || !online || lowPower) return;
    pollTimer = deps.setTimeout(() => {
      pollTimer = null;
      void dispatch('poll').then(() => {
        // A throttled or skipped poll starts no run, which would otherwise end the polling.
        if (!running && pollTimer === null) schedulePoll();
      });
    }, pollDelay);
  };

  const start = (first: SyncTrigger): Promise<void> => {
    const loop = async () => {
      let next: SyncTrigger | null = first;
      while (next) {
        queued = null;
        lastStartAt = deps.now();
        let ok = false;
        try {
          ok = await deps.run(next);
        } catch {
          ok = false;
        }
        if (ok) {
          lastSuccess = deps.now();
          pollDelay = pollMs;
        } else {
          pollDelay = Math.min(pollDelay * 2, maxPollMs);
        }
        next = disposed ? null : queued;
      }
    };
    const promise = loop().finally(() => {
      running = null;
      schedulePoll();
    });
    running = promise;
    return promise;
  };

  async function dispatch(trigger: SyncTrigger): Promise<void> {
    if (disposed) return;
    if (trigger === 'background') return running ?? start(trigger);
    if (!online) {
      offlineDemand = true;
      return;
    }
    if (trigger === 'focus' && !stale()) return;
    const explicit = trigger === 'pull' || trigger === 'write';
    if (running) {
      if (explicit) queued = trigger;
      return running;
    }
    const replay = trigger === 'online' && offlineDemand;
    if (!explicit && !replay && deps.now() - lastStartAt < throttleMs) return;
    offlineDemand = false;
    return start(trigger);
  }

  return {
    async trigger(trigger) {
      if (trigger !== 'write') return dispatch(trigger);
      // Edits arrive in bursts; one run after the burst is enough.
      if (writeTimer !== null) deps.clearTimeout(writeTimer);
      writeTimer = deps.setTimeout(() => {
        writeTimer = null;
        void dispatch('write');
      }, writeDebounceMs);
    },
    setActive(next) {
      const was = active;
      active = next;
      if (!next) {
        clearPoll();
        // iOS suspends the app seconds after it leaves the screen: an edit still waiting for the
        // debounce would stay on the phone, and the web would keep showing the older version.
        if (was && writeTimer !== null) {
          deps.clearTimeout(writeTimer);
          writeTimer = null;
          void dispatch('write');
        }
      } else if (!was) {
        if (running && online && olderThan(foregroundStaleMs)) queued ??= 'foreground';
        schedulePoll();
        void dispatch('foreground');
      }
    },
    setOnline(next) {
      const was = online;
      online = next;
      if (!next) clearPoll();
      else if (!was) {
        schedulePoll();
        void dispatch('online');
      }
    },
    setLowPower(next) {
      lowPower = next;
      schedulePoll();
    },
    lastSuccessAt: () => lastSuccess,
    isStale: stale,
    dispose() {
      disposed = true;
      clearPoll();
      if (writeTimer !== null) deps.clearTimeout(writeTimer);
      writeTimer = null;
    },
  };
}
