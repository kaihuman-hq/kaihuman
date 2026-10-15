import type { Bookmark } from '@kaihuman/palette';

const MS_PER_DAY = 86_400_000;
/** A use loses half its weight every two weeks. */
const HALF_LIFE_DAYS = 14;

/**
 * How much a bookmark deserves a spot on the start page: use count discounted by how long ago it
 * was last opened, so a habit outranks a one-off but a stale habit fades. Never-used scores 0.
 */
export function frecency(b: Pick<Bookmark, 'useCount' | 'lastUsedAt'>, now: Date): number {
  if (!b.lastUsedAt) return 0;
  const used = Date.parse(b.lastUsedAt);
  if (Number.isNaN(used)) return 0;
  // Clamp: a clock-skewed future timestamp counts as today, not as a bonus.
  const days = Math.max(0, (now.getTime() - used) / MS_PER_DAY);
  return (1 + b.useCount) * 2 ** (-days / HALF_LIFE_DAYS);
}
