import { describe, expect, it } from 'vitest';
import {
  ACTION_WIDTH,
  fullSwipeThreshold,
  isFullSwipe,
  shouldRunFullSwipe,
} from './swipe-logic.js';

describe('full swipe threshold', () => {
  it('is half the row width on a normal row', () => {
    expect(fullSwipeThreshold(400)).toBe(200);
  });

  it('never drops below 1.5 buttons, even for an unmeasured row', () => {
    expect(fullSwipeThreshold(0)).toBe(ACTION_WIDTH * 1.5);
    expect(fullSwipeThreshold(100)).toBe(ACTION_WIDTH * 1.5);
  });

  it('does not trigger when the button is merely revealed', () => {
    expect(isFullSwipe(-ACTION_WIDTH, 400)).toBe(false);
    expect(isFullSwipe(-199, 400)).toBe(false);
  });

  it('triggers at and past the threshold', () => {
    expect(isFullSwipe(-200, 400)).toBe(true);
    expect(isFullSwipe(-350, 400)).toBe(true);
  });

  it('ignores a swipe towards the other edge', () => {
    expect(isFullSwipe(300, 400)).toBe(false);
    expect(isFullSwipe(0, 400)).toBe(false);
  });
});

describe('shouldRunFullSwipe', () => {
  // Regression: gesture-handler 3 reports 'left' when the trailing buttons open; checking
  // 'right' meant a full swipe slid the row but never marked the RSS item read.
  it('runs on a full right-to-left swipe, which opens towards the left', () => {
    expect(shouldRunFullSwipe('left', -300, 400)).toBe(true);
  });

  it('does not run when the leading side opens or the swipe is short', () => {
    expect(shouldRunFullSwipe('right', -300, 400)).toBe(false);
    expect(shouldRunFullSwipe('left', -ACTION_WIDTH, 400)).toBe(false);
  });
});

describe('contentKeys', () => {
  it('keys by content and suffixes duplicates, stable when another row is removed', async () => {
    const { contentKeys } = await import('./content-keys.js');
    const a = contentKeys();
    expect([a('x'), a('y'), a('x')]).toEqual(['x#0', 'y#0', 'x#1']);
    const b = contentKeys();
    expect([b('y'), b('x')]).toEqual(['y#0', 'x#0']);
  });
});
