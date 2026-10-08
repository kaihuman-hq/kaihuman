import { describe, expect, it } from 'vitest';
import {
  findGroup,
  isOpenableUrl,
  isPinnedTabsCacheStale,
  isPinnedTabsCacheUsable,
  matchGroup,
  moveGroup,
  normalizeGroupName,
  PINNED_TABS_CACHE_TTL_MS,
  PINNED_TABS_PATH,
  type PinnedTabGroup,
  type PinnedTabsCache,
  type PinnedTabsConfig,
  parsePinnedTabs,
  putGroup,
  removeGroup,
  serializePinnedTabs,
  setGroupFavorite,
  tabsToOpen,
  tabsToUnpin,
  toPinnedTabs,
} from './pinned-tabs';

const group = (id: string, tabs: string[], name = id): PinnedTabGroup => ({
  id,
  name,
  createdAt: '2026-09-03T10:00:00.000Z',
  tabs: tabs.map((url) => ({ url, title: url })),
});

const config = (...groups: PinnedTabGroup[]): PinnedTabsConfig => ({ groups, updatedAt: 'then' });

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
  it('reads groups with their name, createdAt and tabs', () => {
    const parsed = parsePinnedTabs(
      JSON.stringify({
        groups: [
          {
            id: 'g1',
            name: 'Work',
            createdAt: '2026-09-01T08:00:00.000Z',
            tabs: [{ url: 'https://example.com', title: 'Example' }],
          },
        ],
        updatedAt: '2026-09-03T10:00:00.000Z',
      }),
    );
    expect(parsed.groups).toEqual([
      {
        id: 'g1',
        name: 'Work',
        createdAt: '2026-09-01T08:00:00.000Z',
        tabs: [{ url: 'https://example.com', title: 'Example' }],
      },
    ]);
    expect(parsed.updatedAt).toBe('2026-09-03T10:00:00.000Z');
  });

  it('migrates a v1 single-list file into one group', () => {
    const parsed = parsePinnedTabs(
      JSON.stringify({
        tabs: [{ url: 'https://example.com', title: 'Example' }],
        updatedAt: '2026-09-03T10:00:00.000Z',
      }),
    );
    expect(parsed.groups).toEqual([
      {
        id: 'default',
        name: 'Pinned tabs',
        createdAt: '2026-09-03T10:00:00.000Z',
        tabs: [{ url: 'https://example.com', title: 'Example' }],
      },
    ]);
  });

  it('prefers groups over a leftover v1 tabs array', () => {
    const parsed = parsePinnedTabs(
      JSON.stringify({ groups: [{ id: 'g1', tabs: [] }], tabs: [{ url: 'https://stale.com' }] }),
    );
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].tabs).toEqual([]);
  });

  it('falls back to the id when a group has no name, and to empty createdAt', () => {
    const parsed = parsePinnedTabs(JSON.stringify({ groups: [{ id: 'g1', tabs: [] }] }));
    expect(parsed.groups[0].name).toBe('g1');
    expect(parsed.groups[0].createdAt).toBe('');
  });

  it('drops tab entries without a url', () => {
    const parsed = parsePinnedTabs(
      JSON.stringify({ groups: [{ id: 'g1', tabs: [{ title: 'no url' }, 42] }] }),
    );
    expect(parsed.groups[0].tabs).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parsePinnedTabs('{ nope')).toThrow(`${PINNED_TABS_PATH} is not valid JSON`);
  });

  it('throws when neither groups nor a v1 tabs array is present', () => {
    expect(() => parsePinnedTabs('{}')).toThrow(`${PINNED_TABS_PATH} is missing a "groups" array`);
  });

  it('names the offending group when it is malformed', () => {
    expect(() => parsePinnedTabs(JSON.stringify({ groups: [{ tabs: [] }] }))).toThrow(
      'group 0 is missing an "id"',
    );
    expect(() => parsePinnedTabs(JSON.stringify({ groups: [{ id: 'g1' }] }))).toThrow(
      'group "g1" is missing a "tabs" array',
    );
  });
});

describe('serializePinnedTabs', () => {
  it('round-trips through parse', () => {
    const original = config(group('g1', ['https://example.com/'], 'Work'));
    expect(parsePinnedTabs(serializePinnedTabs(original))).toEqual(original);
  });

  it('writes pretty-printed JSON with a trailing newline', () => {
    const out = serializePinnedTabs(config());
    expect(out.endsWith('\n')).toBe(true);
    expect(out).toContain('\n  "groups": []');
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

describe('findGroup', () => {
  it('returns the matching group', () => {
    expect(findGroup(config(group('g1', [])), 'g1').id).toBe('g1');
  });

  it('throws a named error when the group is gone', () => {
    expect(() => findGroup(config(group('g1', [])), 'g2')).toThrow(
      `Tab group "g2" no longer exists in ${PINNED_TABS_PATH}`,
    );
  });
});

describe('putGroup', () => {
  it('replaces the group with the same id and leaves the others alone', () => {
    const before = config(group('g1', ['https://a.com']), group('g2', ['https://b.com']));
    const after = putGroup(before, group('g1', ['https://c.com'], 'Renamed'), 'now');
    expect(after.groups).toHaveLength(2);
    expect(after.groups[0].name).toBe('Renamed');
    expect(after.groups[0].tabs).toEqual([{ url: 'https://c.com', title: 'https://c.com' }]);
    expect(after.groups[1]).toEqual(before.groups[1]);
    expect(after.updatedAt).toBe('now');
  });

  it('appends a group that does not exist yet', () => {
    const after = putGroup(config(group('g1', [])), group('g2', []), 'now');
    expect(after.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
  });
});

describe('removeGroup', () => {
  it('drops the group and leaves the others alone', () => {
    const before = config(group('g1', []), group('g2', []));
    const after = removeGroup(before, 'g1', 'now');
    expect(after.groups.map((g) => g.id)).toEqual(['g2']);
    expect(after.updatedAt).toBe('now');
  });

  it('throws when the group is already gone', () => {
    expect(() => removeGroup(config(group('g1', [])), 'g2', 'now')).toThrow(
      `Tab group "g2" no longer exists in ${PINNED_TABS_PATH}`,
    );
  });
});

describe('parsePinnedTabs favourites', () => {
  const parseGroups = (favorite: unknown) =>
    parsePinnedTabs(JSON.stringify({ groups: [{ id: 'g', tabs: [], favorite }], updatedAt: '' }))
      .groups;

  it('keeps a favourite and leaves the field out of any other group', () => {
    expect(parseGroups(true)[0]?.favorite).toBe(true);
    expect(parseGroups(false)[0]).not.toHaveProperty('favorite');
    expect(parseGroups('yes')[0]).not.toHaveProperty('favorite');
  });
});

describe('setGroupFavorite', () => {
  const before = config(group('a', []), group('b', []));

  it('marks a group in place and stamps the file', () => {
    const next = setGroupFavorite(before, 'b', true, 'now');
    expect(next.groups.map((g) => [g.id, g.favorite])).toEqual([
      ['a', undefined],
      ['b', true],
    ]);
    expect(next.updatedAt).toBe('now');
  });

  it('drops the field again when unmarked, so the file reads as before', () => {
    const marked = setGroupFavorite(before, 'b', true, 'now');
    const unmarked = setGroupFavorite(marked, 'b', false, 'later');
    expect(unmarked.groups[1]).toEqual(group('b', []));
    expect(serializePinnedTabs(unmarked)).not.toContain('favorite');
  });

  it('throws when the group is gone', () => {
    expect(() => setGroupFavorite(before, 'zz', true, 'now')).toThrow(
      `Tab group "zz" no longer exists in ${PINNED_TABS_PATH}`,
    );
  });
});

describe('moveGroup', () => {
  const before = config(group('a', []), group('b', []), group('c', []));

  it('moves a group towards the front', () => {
    expect(moveGroup(before, 'b', -1, 'now').groups.map((g) => g.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves a group towards the back', () => {
    expect(moveGroup(before, 'b', 1, 'now').groups.map((g) => g.id)).toEqual(['a', 'c', 'b']);
  });

  it('stamps updatedAt on a real move', () => {
    expect(moveGroup(before, 'b', 1, 'now').updatedAt).toBe('now');
  });

  it('returns the config untouched at either end, so no empty write happens', () => {
    expect(moveGroup(before, 'a', -1, 'now')).toBe(before);
    expect(moveGroup(before, 'c', 1, 'now')).toBe(before);
  });

  it('leaves the original config unmutated', () => {
    moveGroup(before, 'b', 1, 'now');
    expect(before.groups.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('throws when the group is gone', () => {
    expect(() => moveGroup(before, 'zz', 1, 'now')).toThrow(
      `Tab group "zz" no longer exists in ${PINNED_TABS_PATH}`,
    );
  });
});

describe('normalizeGroupName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeGroupName('  Work  ')).toBe('Work');
  });

  it('rejects empty, whitespace-only and missing names', () => {
    expect(() => normalizeGroupName('')).toThrow('Give the tab group a name');
    expect(() => normalizeGroupName('   ')).toThrow('Give the tab group a name');
    expect(() => normalizeGroupName(undefined)).toThrow('Give the tab group a name');
  });
});

describe('tabsToOpen', () => {
  const stored = [
    { url: 'https://a.com', title: 'A' },
    { url: 'https://b.com', title: 'B' },
  ];

  it('returns every stored tab when nothing is pinned', () => {
    expect(tabsToOpen(stored, [])).toEqual(stored);
  });

  it('skips tabs already pinned, ignoring Chrome trailing-slash canonicalisation', () => {
    expect(tabsToOpen(stored, ['https://a.com/'])).toEqual([{ url: 'https://b.com', title: 'B' }]);
  });

  it('skips duplicates within the stored list', () => {
    expect(tabsToOpen([...stored, { url: 'https://a.com', title: 'A again' }], [])).toEqual(stored);
  });

  it('skips stored entries that are not openable', () => {
    expect(tabsToOpen([{ url: 'javascript:alert(1)', title: 'bad' }], [])).toEqual([]);
  });
});

describe('tabsToUnpin', () => {
  it('returns pinned tabs the group does not contain', () => {
    const pinned = [
      { id: 1, url: 'https://a.com/' },
      { id: 2, url: 'https://gone.com/' },
    ];
    expect(tabsToUnpin(pinned, [{ url: 'https://a.com', title: 'A' }])).toEqual([
      { id: 2, url: 'https://gone.com/' },
    ]);
  });

  it('returns nothing when the window already matches the group', () => {
    expect(
      tabsToUnpin([{ url: 'https://a.com/' }], [{ url: 'https://a.com', title: 'A' }]),
    ).toEqual([]);
  });

  it('unpins everything when loading an empty group', () => {
    expect(tabsToUnpin([{ url: 'https://a.com/' }], [])).toHaveLength(1);
  });
});

describe('matchGroup', () => {
  const groups = [
    group('work', ['https://a.com', 'https://b.com', 'https://c.com']),
    group('personal', ['https://x.com', 'https://y.com']),
  ];

  it('identifies the group a window is running', () => {
    expect(matchGroup(groups, ['https://x.com/', 'https://y.com/'])).toBe('personal');
  });

  it('still identifies a group after the user edited a pinned tab', () => {
    expect(matchGroup(groups, ['https://a.com/', 'https://b.com/', 'https://new.com/'])).toBe(
      'work',
    );
  });

  it('returns null when no group is more than half present', () => {
    expect(matchGroup(groups, ['https://a.com/'])).toBeNull();
    expect(matchGroup(groups, [])).toBeNull();
  });

  it('ignores empty groups so they never win by default', () => {
    expect(matchGroup([group('empty', [])], [])).toBeNull();
  });

  it('keeps the earlier group on a tie so the answer is stable', () => {
    const tied = [group('first', ['https://a.com']), group('second', ['https://a.com'])];
    expect(matchGroup(tied, ['https://a.com/'])).toBe('first');
  });
});

const cache = (over: Partial<PinnedTabsCache> = {}): PinnedTabsCache => ({
  repo: 'o/r',
  config: config(),
  sha: 'sha-1',
  etag: 'W/"etag-1"',
  fetchedAt: 1000,
  ...over,
});

describe('isPinnedTabsCacheUsable', () => {
  it('accepts a cache taken from the same repo', () => {
    expect(isPinnedTabsCacheUsable(cache(), 'o/r')).toBe(true);
  });

  it('rejects a missing cache, another repo, or one with no groups array', () => {
    expect(isPinnedTabsCacheUsable(undefined, 'o/r')).toBe(false);
    expect(isPinnedTabsCacheUsable(cache({ repo: 'other/repo' }), 'o/r')).toBe(false);
    expect(isPinnedTabsCacheUsable(cache({ config: {} as PinnedTabsConfig }), 'o/r')).toBe(false);
  });
});

describe('isPinnedTabsCacheStale', () => {
  it('is fresh inside the ttl and stale past it', () => {
    expect(
      isPinnedTabsCacheStale(cache({ fetchedAt: 1000 }), 1000 + PINNED_TABS_CACHE_TTL_MS),
    ).toBe(false);
    expect(
      isPinnedTabsCacheStale(cache({ fetchedAt: 1000 }), 1000 + PINNED_TABS_CACHE_TTL_MS + 1),
    ).toBe(true);
  });
});
