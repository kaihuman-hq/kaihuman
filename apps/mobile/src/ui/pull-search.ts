/**
 * Pull distance (pt past the resting offset) at which releasing opens search. Below it the pull is
 * just a bounce.
 */
export const SEARCH_PULL = 36;

export type PullIntent = 'none' | 'search';

/** What releasing a pull-down of `pull` points should do: past the threshold opens search. */
export function pullIntent(pull: number): PullIntent {
  if (pull >= SEARCH_PULL) return 'search';
  return 'none';
}

/** Pull distance from a scroll offset, given the offset the list rests at (negative under a header). */
export function pullDistance(offsetY: number, restingY: number): number {
  return Math.max(0, restingY - offsetY);
}

/**
 * Tracks one finger drag so the decision is made on release, from the deepest pull. Nothing here syncs; sync is
 * automatic (see src/sync/README.md) and manual from Settings. The resting offset is read when the drag begins rather
 * than computed from the header height, so it is right whatever inset iOS applied.
 */
export function createPullTracker() {
  let resting: number | null = null;
  let peak = 0;
  return {
    begin(offsetY: number) {
      resting = offsetY;
      peak = 0;
    },
    move(offsetY: number) {
      if (resting === null) return;
      peak = Math.max(peak, pullDistance(offsetY, resting));
    },
    end(): PullIntent {
      const intent = resting === null ? 'none' : pullIntent(peak);
      resting = null;
      peak = 0;
      return intent;
    },
  };
}
