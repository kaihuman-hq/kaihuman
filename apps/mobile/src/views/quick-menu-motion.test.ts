import { describe, expect, it } from 'vitest';
import {
  DISMISS_DISTANCE,
  DISMISS_VELOCITY,
  dragOffset,
  KEEP_VELOCITY,
  OVERPULL_RESISTANCE,
  openFraction,
  releaseState,
  sheetRise,
  shouldDismiss,
} from './quick-menu-motion.js';

describe('dragOffset', () => {
  it('follows a downward pull 1:1', () => {
    expect(dragOffset(0)).toBe(0);
    expect(dragOffset(80)).toBe(80);
  });

  it('resists an upward pull so the sheet stays on the bar', () => {
    expect(dragOffset(-100)).toBeCloseTo(-100 * OVERPULL_RESISTANCE);
  });
});

describe('sheetRise / openFraction', () => {
  it('is zero while closed and the full height while open', () => {
    expect(sheetRise(0, 400, 0)).toBe(0);
    expect(sheetRise(1, 400, 0)).toBe(400);
    expect(openFraction(1, 400, 0)).toBe(1);
  });

  it('drops with the finger, so the ＋ and its turn track the drag', () => {
    expect(sheetRise(1, 400, 100)).toBe(300);
    expect(openFraction(1, 400, 100)).toBe(0.75);
  });

  it('never goes below the bar or past fully open', () => {
    expect(sheetRise(1, 400, 900)).toBe(0);
    expect(openFraction(1, 400, -30)).toBe(1);
  });

  it('falls back to progress before the sheet is measured', () => {
    expect(openFraction(0.5, 0, 0)).toBe(0.5);
  });
});

describe('shouldDismiss', () => {
  it('closes on a fast downward flick, however short', () => {
    expect(shouldDismiss(10, DISMISS_VELOCITY + 1, 400)).toBe(true);
  });

  it('closes on a slow pull past the threshold', () => {
    expect(shouldDismiss(DISMISS_DISTANCE + 1, 0, 600)).toBe(true);
  });

  it('snaps back on a short slow pull', () => {
    expect(shouldDismiss(DISMISS_DISTANCE - 1, 100, 600)).toBe(false);
  });

  it('uses a share of a short sheet as the threshold', () => {
    expect(shouldDismiss(80, 0, 200)).toBe(true);
    expect(shouldDismiss(60, 0, 200)).toBe(false);
  });

  it('stays open when flung back up, even past the threshold', () => {
    expect(shouldDismiss(DISMISS_DISTANCE * 2, -(KEEP_VELOCITY + 1), 600)).toBe(false);
  });
});

describe('releaseState', () => {
  it('folds the drag into progress and converts velocity to progress units', () => {
    expect(releaseState(100, 800, 400)).toEqual({ progress: 0.75, velocity: -2 });
  });

  it('clamps an over-pull and handles an unmeasured sheet', () => {
    expect(releaseState(-20, 0, 400).progress).toBe(1);
    expect(releaseState(50, 500, 0)).toEqual({ progress: 1, velocity: 0 });
  });
});
