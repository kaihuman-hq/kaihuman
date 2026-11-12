/**
 * Pure motion math for the ＋ quick menu. `progress` runs 0 (closed, tucked under the tab bar) to
 * 1 (open); `drag` is the finger's downward pull on the open sheet in points. All functions are
 * worklets so the gesture and animated styles can call them on the UI thread.
 */

/** Dimmed backdrop at full open. */
export const SCRIM_OPACITY = 0.42;

/** The ＋ turns this far to read as an ×; past 90° so the turn is visible, not a nudge. */
export const PLUS_TURN_DEG = 135;

/** A slow pull must travel this far (or this share of the sheet, if smaller) to close. */
export const DISMISS_DISTANCE = 120;
export const DISMISS_FRACTION = 0.35;

/** A downward flick faster than this (pt/s) closes regardless of distance. */
export const DISMISS_VELOCITY = 800;

/** An upward flick faster than this (pt/s) keeps the menu open even past the distance. */
export const KEEP_VELOCITY = 300;

/** Upward pulls past the open position move this share of the finger's travel. */
export const OVERPULL_RESISTANCE = 0.15;

/** Snappy, barely-overshooting springs in the spirit of UIKit sheet presentations. */
export const OPEN_SPRING = { damping: 26, stiffness: 340, mass: 0.9 } as const;
export const CLOSE_SPRING = {
  damping: 30,
  stiffness: 420,
  mass: 0.8,
  overshootClamping: true,
} as const;

const clamp01 = (n: number) => {
  'worklet';
  return n < 0 ? 0 : n > 1 ? 1 : n;
};

/**
 * Sheet offset for a finger's vertical translation: down follows 1:1, up resists, so the sheet
 * never detaches from the tab bar.
 */
export function dragOffset(translationY: number): number {
  'worklet';
  return translationY >= 0 ? translationY : translationY * OVERPULL_RESISTANCE;
}

/** How far (pt) the sheet's top edge stands above the tab bar; the ＋ rides on that edge. */
export function sheetRise(progress: number, height: number, drag: number): number {
  'worklet';
  return Math.max(0, progress * height - drag);
}

/** Share of the sheet showing, 0..1: drives the ＋ turn and the scrim so both track the finger. */
export function openFraction(progress: number, height: number, drag: number): number {
  'worklet';
  if (height <= 0) return clamp01(progress);
  return clamp01(sheetRise(progress, height, drag) / height);
}

/** Decides a released drag: close on a fast downward flick, or a long enough pull not flung back up. */
export function shouldDismiss(translationY: number, velocityY: number, height: number): boolean {
  'worklet';
  if (velocityY > DISMISS_VELOCITY) return true;
  if (velocityY < -KEEP_VELOCITY) return false;
  const distance =
    height > 0 ? Math.min(DISMISS_DISTANCE, height * DISMISS_FRACTION) : DISMISS_DISTANCE;
  return translationY > distance;
}

/**
 * Converts a release into the spring hand-off: the progress the sheet is visually at (drag folded
 * in) and the finger's speed in progress units per second (negative while closing).
 */
export function releaseState(
  drag: number,
  velocityY: number,
  height: number,
): { progress: number; velocity: number } {
  'worklet';
  if (height <= 0) return { progress: 1, velocity: 0 };
  return { progress: clamp01(1 - drag / height), velocity: -velocityY / height };
}
