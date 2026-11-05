import { diff3Lines } from './diff3.js';

export type MergeResult = { clean: true; content: string } | { clean: false };

/** `null` means the input cannot be merged structurally (e.g. a lossy round-trip); diff3 takes over. */
export type StructuralMerger = (base: string, local: string, remote: string) => MergeResult | null;

// Core must not import the formats package, so the app registers format-aware merges at startup.
const mergers = new Map<string, StructuralMerger>();

/** Use `merger` for paths ending in `suffix` (case-insensitive); a later registration replaces an earlier one. */
export function registerStructuralMerger(suffix: string, merger: StructuralMerger): void {
  mergers.set(suffix.toLowerCase(), merger);
}

/**
 * Line-based diff3 (Myers diff of base→local and base→remote, then classic diff3 chunking).
 * Non-overlapping changes merge; identical changes on both sides merge; overlapping different
 * changes → `{ clean: false }`. Changes that only touch (e.g. both sides appending different
 * lines at the end) also conflict, because their order cannot be decided.
 */
export function diff3Merge(base: string, local: string, remote: string): MergeResult {
  const result = diff3Lines(base.split('\n'), local.split('\n'), remote.split('\n'));
  return result.clean ? { clean: true, content: result.lines.join('\n') } : { clean: false };
}

/**
 * Dispatch by path: a registered structural merger for the path's suffix, else diff3Merge.
 * Trivial cases first: local===remote → local; local===base → remote; remote===base → local.
 */
export function mergeFile(path: string, base: string, local: string, remote: string): MergeResult {
  if (local === remote) return { clean: true, content: local };
  if (local === base) return { clean: true, content: remote };
  if (remote === base) return { clean: true, content: local };

  const lower = path.toLowerCase();
  let suffixLength = -1;
  let merger: StructuralMerger | undefined;
  for (const [suffix, candidate] of mergers) {
    // The longest matching suffix is the most specific format.
    if (lower.endsWith(suffix) && suffix.length > suffixLength) {
      suffixLength = suffix.length;
      merger = candidate;
    }
  }
  return merger?.(base, local, remote) ?? diff3Merge(base, local, remote);
}
