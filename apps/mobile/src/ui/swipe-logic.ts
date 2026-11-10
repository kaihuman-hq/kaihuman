/** Width of one revealed swipe button. */
export const ACTION_WIDTH = 80;

/** A swipe past this share of the row width runs the action instead of revealing the button. */
export const FULL_SWIPE_FRACTION = 0.5;

/** Slide-out then height-collapse timings (ms) of a row removed by a full swipe. */
export const FULL_SWIPE_SLIDE_MS = 180;
export const FULL_SWIPE_COLLAPSE_DELAY_MS = 120;
export const FULL_SWIPE_COLLAPSE_MS = 180;

/**
 * Distance the row must travel to count as a full swipe. Never less than 1.5 button widths, so
 * a narrow or not-yet-measured row cannot trigger by merely opening the button.
 */
export function fullSwipeThreshold(rowWidth: number): number {
  'worklet';
  return Math.max(rowWidth * FULL_SWIPE_FRACTION, ACTION_WIDTH * 1.5);
}

/**
 * Whether the row's translation (negative when dragged towards the leading edge, as the
 * swipeable reports it) has crossed the full-swipe threshold.
 */
export function isFullSwipe(translation: number, rowWidth: number): boolean {
  'worklet';
  return translation <= -fullSwipeThreshold(rowWidth);
}

/**
 * Whether an `onSwipeableWillOpen` should run the full-swipe action. ReanimatedSwipeable
 * (gesture-handler 3) names the direction the row travels, so opening the trailing buttons
 * reports 'left', not 'right'.
 */
export function shouldRunFullSwipe(
  direction: 'left' | 'right',
  translation: number,
  rowWidth: number,
): boolean {
  return direction === 'left' && isFullSwipe(translation, rowWidth);
}
