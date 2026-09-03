import { describe, expect, it } from 'vitest';
import {
  isOpenableUrl,
  PINNED_TABS_PATH,
  parsePinnedTabs,
  serializePinnedTabs,
  tabsToOpen,
  toPinnedTabs,
} from './pinned-tabs';

describe('isOpenableUrl', () => {
  it('accepts http and https', () => {
    expect(isOpenableUrl('http://example.com')).toBe(true);
    expect(isOpenableUrl('https://example.com/a')).toBe(true);
  });

  it('rejects other schemes and malformed urls', () => {
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableUrl('file:///etc/passwd')).toBe(false);
    expect(isOpenableUrl('chrome://extensions')).toBe(false);
    expect(isOpenableUrl('not a url')).toBe(false);
  });
});

describe('parsePinnedTabs', () => {
  it('reads tabs and updatedAt', () => {
    const config = parsePinnedTabs(
      JSON.stringify({
        tabs: [{ url: 'https://example.com', title: 'Example' }],
        updatedAt: '2026-09-03T10:00:00.000Z',
      }),
    );
    expect(config.tabs).toEqual([{ url: 'https://example.com', title: 'Example' }]);
    expect(config.updatedAt).toBe('2026-09-03T10:00:00.000Z');
  });

  it('defaults a missing title and updatedAt to empty strings', () => {
    const config = parsePinnedTabs(JSON.stringify({ tabs: [{ url: 'https://example.com' }] }));
    expect(config.tabs).toEqual([{ url: 'https://example.com', title: '' }]);
    expect(config.updatedAt).toBe('');
  });

  it('drops entries without a url', () => {
    const config = parsePinnedTabs(JSON.stringify({ tabs: [{ title: 'no url' }, 42] }));
    expect(config.tabs).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parsePinnedTabs('{ nope')).toThrow(`${PINNED_TABS_PATH} is not valid JSON`);
  });

  it('throws when the tabs array is missing', () => {
    expect(() => parsePinnedTabs('{}')).toThrow(`${PINNED_TABS_PATH} is missing a "tabs" array`);
  });
});

describe('serializePinnedTabs', () => {
  it('round-trips through parse', () => {
    const config = { tabs: [{ url: 'https://example.com/', title: 'Example' }], updatedAt: 'now' };
    expect(parsePinnedTabs(serializePinnedTabs(config))).toEqual(config);
  });

  it('writes pretty-printed JSON with a trailing newline', () => {
    const out = serializePinnedTabs({ tabs: [], updatedAt: 'now' });
    expect(out.endsWith('\n')).toBe(true);
    expect(out).toContain('\n  "tabs": []');
  });
});

describe('toPinnedTabs', () => {
  it('keeps openable tabs and defaults missing titles', () => {
    expect(
      toPinnedTabs([
        { url: 'https://example.com', title: 'Example' },
        { url: 'https://no-title.com' },
      ]),
    ).toEqual([
      { url: 'https://example.com', title: 'Example' },
      { url: 'https://no-title.com', title: '' },
    ]);
  });

  it('drops tabs without a url or with an unopenable scheme', () => {
    expect(toPinnedTabs([{ title: 'blank' }, { url: 'chrome://newtab' }])).toEqual([]);
  });
});

describe('tabsToOpen', () => {
  const stored = [
    { url: 'https://a.com', title: 'A' },
    { url: 'https://b.com', title: 'B' },
  ];

  it('returns every stored tab when the window is empty', () => {
    expect(tabsToOpen(stored, [])).toEqual(stored);
  });

  it('skips tabs already open, ignoring Chrome trailing-slash canonicalisation', () => {
    expect(tabsToOpen(stored, ['https://a.com/'])).toEqual([{ url: 'https://b.com', title: 'B' }]);
  });

  it('skips duplicates within the stored list', () => {
    expect(tabsToOpen([...stored, { url: 'https://a.com', title: 'A again' }], [])).toEqual(stored);
  });

  it('skips stored entries that are not openable', () => {
    expect(tabsToOpen([{ url: 'javascript:alert(1)', title: 'bad' }], [])).toEqual([]);
  });
});
