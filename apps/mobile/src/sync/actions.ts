import type { SyncTrigger } from './status.js';

/**
 * What the content ports need from the sync runtime. A late-bound seam instead of an import:
 * `runtime.ts` pulls in native modules (expo-network, react-native), which would drag them into
 * every controller test. `runtime.ts` registers the real functions when the app loads.
 */
export interface SyncActions {
  refreshAll(opts?: { reason?: SyncTrigger }): Promise<void>;
  notifyLocalWrite(): void;
}

let actions: SyncActions = {
  refreshAll: async () => undefined,
  notifyLocalWrite: () => undefined,
};

export function setSyncActions(next: SyncActions): void {
  actions = next;
}

export const syncActions = (): SyncActions => actions;
