import { describe, expect, it } from 'vitest';
import { pullDistance, pullIntent, REFRESH_PULL, SEARCH_PULL } from './pull-search.js';

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
