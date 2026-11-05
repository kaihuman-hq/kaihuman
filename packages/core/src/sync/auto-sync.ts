import { Logger } from '../logger.js';
import type { GithubFileStore } from '../stores/github-file.store.js';

const logger = new Logger('AutoSync');

/** Triggers closer together than this are one run: focus, visibility and online often fire in a burst. */
const THROTTLE_MS = 2000;

/**
 * Keeps the file store in step with the remote without the user asking: on start, when the tab
 * becomes visible or focused, when the network returns, and on a timer while visible. Each run
 * pulls remote changes (`syncNow`) and then pushes unsaved work (`flushOutbox`), in that order so
 * local edits are merged onto the newest remote before they are sent. Returns a disposer.
 */
export function installAutoSync(
  store: Pick<GithubFileStore, 'syncNow' | 'flushOutbox'>,
  opts: { intervalMs?: number; win?: Window; doc?: Document } = {},
): () => void {
  const win = opts.win ?? window;
  const doc = opts.doc ?? document;
  let lastStart = Number.NEGATIVE_INFINITY;

  const run = async () => {
    const now = Date.now();
    if (now - lastStart < THROTTLE_MS) return;
    lastStart = now;
    try {
      await store.syncNow();
      await store.flushOutbox();
    } catch (e) {
      logger.warn('Auto sync failed', e);
    }
  };
  const visible = () => doc.visibilityState === 'visible';
  const onVisibility = () => {
    if (visible()) void run();
  };
  const onTrigger = () => void run();

  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('focus', onTrigger);
  win.addEventListener('online', onTrigger);
  const interval = setInterval(() => {
    if (visible()) void run();
  }, opts.intervalMs ?? 90_000);
  void run();

  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('focus', onTrigger);
    win.removeEventListener('online', onTrigger);
    clearInterval(interval);
  };
}
