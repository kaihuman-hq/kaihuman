import { describe, expect, it } from 'vitest';
import { ACTION_WIDTH, fullSwipeThreshold, isFullSwipe } from './swipe-logic.js';

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

describe('contentKeys', () => {
  it('keys by content and suffixes duplicates, stable when another row is removed', async () => {
    const { contentKeys } = await import('./content-keys.js');
    const a = contentKeys();
    expect([a('x'), a('y'), a('x')]).toEqual(['x#0', 'y#0', 'x#1']);
    const b = contentKeys();
    expect([b('y'), b('x')]).toEqual(['y#0', 'x#0']);
  });
});
