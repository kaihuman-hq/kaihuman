/**
 * Index maths for an endless pager. With 2+ pages the list is rendered as
 * `[last, ...pages, first]`; after a swipe settles on a clone the list jumps (unanimated)
 * to the matching real page, so the wrap-around looks continuous.
 */

/** Pages are cloned only when there is somewhere to wrap to. */
export const isLooped = (count: number): boolean => count > 1;

/** Number of slots rendered for `count` real pages. */
export const slotCount = (count: number): number => (isLooped(count) ? count + 2 : count);

/** Slot that shows real page `index`. */
export const slotOf = (index: number, count: number): number =>
  isLooped(count) ? index + 1 : index;

/** Real page shown in `slot` (clones resolve to the page they copy). */
export function pageOfSlot(slot: number, count: number): number {
  if (count <= 0) return 0;
  if (!isLooped(count)) return 0;
  return (((slot - 1) % count) + count) % count;
}

/** Real page nearest to a horizontal scroll offset; updates as soon as it is half visible. */
export function pageAtOffset(offset: number, width: number, count: number): number {
  if (width <= 0) return 0;
  return pageOfSlot(Math.round(offset / width), count);
}

/** Slot to silently jump to when `slot` is a clone, otherwise null. */
export function jumpSlot(slot: number, count: number): number | null {
  if (!isLooped(count)) return null;
  if (slot <= 0) return count;
  if (slot >= count + 1) return 1;
  return null;
}
