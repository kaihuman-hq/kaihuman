import { describe, expect, it } from 'vitest';
import { activeTabForPath, getNavbarItem } from './navbar-items';

describe('activeTabForPath', () => {
  it('marks the Stream tab on the stream routes and the board', () => {
    for (const p of ['/stream', '/streams', '/board']) expect(activeTabForPath(p)).toBe('BOARD');
  });
  it('falls back to HOME', () => {
    expect(activeTabForPath('/')).toBe('HOME');
    expect(activeTabForPath('/streamline')).toBe('HOME');
  });
});

describe('board navbar item', () => {
  it('is labelled Stream', () => {
    expect(getNavbarItem('board')?.label).toBe('Stream');
  });
});
