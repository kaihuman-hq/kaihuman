import { drainQueue, type QueueStore } from './queue.js';
import type { SmartCapture } from './smart-capture.js';

/**
 * Files Siri captures once the repo tree is loaded (budget and habit files must be listable).
 * Re-checks on every tree change, so captures made while the app runs are filed on the next sync.
 */
export function startSmartCaptureDrain(deps: {
  store: QueueStore;
  /** Subscribes to repo tree changes; called with whether the tree has files. Returns unsubscribe. */
  onTree: (listener: (loaded: boolean) => void) => () => void;
  save: (capture: SmartCapture) => Promise<{ ok: boolean }>;
  now?: () => Date;
}): () => void {
  let running = false;
  return deps.onTree((loaded) => {
    if (!loaded || running) return;
    running = true;
    void drainQueue(deps.store, deps.save, deps.now?.() ?? new Date())
      .catch(() => 0)
      .finally(() => {
        running = false;
      });
  });
}
