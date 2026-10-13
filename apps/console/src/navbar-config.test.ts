import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NAVBAR,
  getNavbarItem,
  NAVBAR_ITEMS,
} from '../../../packages/ui/src/LifeOS/navbar-items';

describe('navbar catalog', () => {
  it('defaults to the historical desktop navbar items plus Ideas', () => {
    expect(DEFAULT_NAVBAR).toEqual(['dashboard', 'files', 'board', 'ideas', 'shortcuts']);
  });

  it('every default item exists in the catalog', () => {
    const ids = new Set(NAVBAR_ITEMS.map((item) => item.id));
    for (const id of DEFAULT_NAVBAR) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('catalog ids are unique and each item has a label and icon', () => {
    const ids = NAVBAR_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of NAVBAR_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon).toBeTruthy();
    }
  });

  it('exposes the additional magic-menu destinations (e.g. Wiki)', () => {
    const ids = new Set(NAVBAR_ITEMS.map((item) => item.id));
    expect(ids.has('wiki')).toBe(true);
    expect(ids.has('knowledge')).toBe(true);
    expect(ids.has('graph')).toBe(true);
    expect(ids.has('ideas')).toBe(true);
  });

  it('getNavbarItem resolves known ids and ignores unknown ones', () => {
    expect(getNavbarItem('wiki')?.label).toBe('Wiki');
    // @ts-expect-error — exercising the unknown-id branch at runtime
    expect(getNavbarItem('does-not-exist')).toBeUndefined();
  });
});
