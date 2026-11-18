import { describe, expect, it } from 'vitest';
import {
  createPullTracker,
  pullDistance,
  pullIntent,
  REFRESH_PULL,
  SEARCH_PULL,
} from './pull-search.js';

describe('pullIntent', () => {
  it('ignores small bounces', () => {
    expect(pullIntent(0)).toBe('none');
    expect(pullIntent(SEARCH_PULL - 1)).toBe('none');
  });
  it('opens search for a short pull', () => {
    expect(pullIntent(SEARCH_PULL)).toBe('search');
    expect(pullIntent(REFRESH_PULL - 1)).toBe('search');
  });
  it('leaves a long pull to refresh', () => {
    expect(pullIntent(REFRESH_PULL)).toBe('refresh');
    expect(pullIntent(300)).toBe('refresh');
  });
});

describe('pullDistance', () => {
  it('measures overscroll from the resting offset', () => {
    expect(pullDistance(-144, -100)).toBe(44);
    expect(pullDistance(0, 0)).toBe(0);
  });
  it('is zero when scrolled down', () => {
    expect(pullDistance(200, -100)).toBe(0);
  });
});

describe('createPullTracker', () => {
  it('decides from the deepest pull of the drag, measured from where it began', () => {
    const t = createPullTracker();
    t.begin(-100);
    t.move(-120);
    t.move(-150); // 50pt: search range
    t.move(-135); // finger drifting back must not lower the peak
    expect(t.end()).toBe('search');
  });
  it('refreshes only after a long pull, and never mid-drag', () => {
    const t = createPullTracker();
    t.begin(-100);
    t.move(-100 - REFRESH_PULL + 1);
    expect(t.end()).toBe('search'); // regression: native control used to sync here
    t.begin(-100);
    t.move(-100 - REFRESH_PULL);
    expect(t.end()).toBe('refresh');
  });
  it('ignores scroll events outside a drag (momentum bounce-back)', () => {
    const t = createPullTracker();
    t.move(-300);
    expect(t.end()).toBe('none');
  });
  it('resets between drags', () => {
    const t = createPullTracker();
    t.begin(0);
    t.move(-50);
    t.end();
    t.begin(0);
    expect(t.end()).toBe('none');
  });
});
