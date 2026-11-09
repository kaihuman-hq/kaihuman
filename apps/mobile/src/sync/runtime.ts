import { githubFileStore, githubProfileStore } from '@kaihuman/core';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { setSyncActions } from './actions.js';
import { createSyncEngine, type SyncEngine } from './engine.js';
import { rescheduleNotifications } from './notifications-hook.js';
import { createSyncScheduler, type SyncScheduler } from './scheduler.js';
import { type SyncTrigger, syncStatus } from './status.js';

/** The widget bridge as sync uses it; `WidgetBridge` satisfies this. */
export interface SyncWidgets {
  reconcile(): Promise<unknown>;
  sync(): Promise<unknown>;
}

let widgets: SyncWidgets | null = null;
let online = true;
let tokenReady: Promise<unknown> = Promise.resolve();
let runtime: { scheduler: SyncScheduler; engine: SyncEngine } | null = null;

function ensure() {
  if (runtime) return runtime;
  const engine = createSyncEngine({
    store: githubFileStore,
    currentRepo: () => githubProfileStore.currentRepo.peek()?.full_name ?? null,
    widgets: {
      reconcile: async () => widgets?.reconcile(),
      sync: async () => widgets?.sync(),
    },
    reschedule: rescheduleNotifications,
    isOnline: () => online,
    requestWrite: () => notifyLocalWrite(),
  });
  const scheduler = createSyncScheduler({
    // A run needs the Keychain token, which hydrates asynchronously after a cold start.
    run: async (trigger) => {
      await tokenReady.catch(() => undefined);
      return engine.run(trigger);
    },
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  runtime = { scheduler, engine };
  return runtime;
}

/** Runs a sync and waits for it. `pull` by default (always runs). Never throws. */
export async function refreshAll(opts: { reason?: SyncTrigger } = {}): Promise<void> {
  try {
    await ensure().scheduler.trigger(opts.reason ?? 'pull');
  } catch {
    // The engine reports failures through syncStatus.
  }
}

/** Call after any local write: a debounced run pushes it. */
export function notifyLocalWrite(): void {
  void ensure().scheduler.trigger('write');
}

/** Tab focus: runs only when the data is older than the stale window. */
export function requestFocusRefresh(): void {
  void ensure().scheduler.trigger('focus');
}

/** Applies the user's decision for a conflicted file and pushes the result. */
export function resolveConflict(path: string, choice: 'keep_local' | 'use_remote'): void {
  ensure().engine.resolveConflict(path, choice);
}

/** Result of the last run, for the background task to report to the OS. */
export function lastRunFailed(): boolean {
  const { phase } = syncStatus.peek();
  return phase === 'error' || phase === 'offline';
}

const isConnected = (state: Network.NetworkState) =>
  state.isConnected !== false && state.isInternetReachable !== false;

function applyOnline(next: boolean) {
  online = next;
  const { scheduler } = ensure();
  if (!next) syncStatus.value = { ...syncStatus.peek(), phase: 'offline' };
  else if (syncStatus.peek().phase === 'offline') {
    syncStatus.value = { ...syncStatus.peek(), phase: 'idle' };
  }
  scheduler.setOnline(next);
}

/** Some Expo listeners have no web implementation and throw, which blanked the web preview. */
const optional = (subscribe: () => { remove(): void }): { remove(): void } => {
  try {
    return subscribe();
  } catch {
    return { remove: () => {} };
  }
};

/** Wires AppState, network and Low Power Mode to the scheduler and starts the first run. */
export function startSync(opts: {
  bridge: SyncWidgets;
  tokenReady?: Promise<unknown>;
}): () => void {
  widgets = opts.bridge;
  if (opts.tokenReady) tokenReady = opts.tokenReady;
  const { scheduler } = ensure();
  let stopped = false;

  const appSub = AppState.addEventListener('change', (state) => {
    scheduler.setActive(state === 'active');
  });
  const netSub = optional(() =>
    Network.addNetworkStateListener((state) => applyOnline(isConnected(state))),
  );
  const powerSub = optional(() =>
    Battery.addLowPowerModeListener(({ lowPowerMode }) => scheduler.setLowPower(lowPowerMode)),
  );

  void (async () => {
    // Know the network and power state before the first run, so it neither fails offline nor polls.
    const [net, lowPower] = await Promise.all([
      Network.getNetworkStateAsync().catch(() => null),
      Battery.isLowPowerModeEnabledAsync().catch(() => false),
    ]);
    if (stopped) return;
    scheduler.setLowPower(lowPower);
    if (net && !isConnected(net)) applyOnline(false);
    void scheduler.trigger('launch');
    scheduler.setActive(AppState.currentState === 'active');
  })();

  return () => {
    stopped = true;
    appSub.remove();
    netSub.remove();
    powerSub.remove();
    scheduler.dispose();
    runtime?.engine.dispose();
    runtime = null;
  };
}

setSyncActions({ refreshAll, notifyLocalWrite });
