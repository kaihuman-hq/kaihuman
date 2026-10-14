import { applyOp, type StreamOp, type StreamsFile } from '@kaihuman/formats';
import type { StreamsCache } from './types.js';

/**
 * The streams as they will be once the queue is saved. Ops are applied one by one, and one that
 * throws is skipped, as the flush will drop it, so a bad op never hides the ones after it.
 */
export const applyPending = (file: StreamsFile, queue: readonly StreamOp[]): StreamsFile =>
  queue.reduce((acc, op) => {
    try {
      return applyOp(acc, op);
    } catch {
      return acc;
    }
  }, file);

/**
 * What the panel and the start page show: the cached file with the unsaved queue on top, so a
 * change shows at once instead of after the commit lands (or never, while offline).
 * `null` when there is no cache or the file is read-only.
 */
export const pendingStreams = (
  cache: StreamsCache | undefined,
  queue: unknown,
): StreamsFile | null =>
  cache?.state?.ok
    ? applyPending(cache.state.file, Array.isArray(queue) ? (queue as StreamOp[]) : [])
    : null;
