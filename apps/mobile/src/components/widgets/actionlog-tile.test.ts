import { describe, expect, it } from 'vitest';
import {
  actionLogList,
  actionLogReport,
  actionLogStats,
  entryTime,
  groupByDay,
  stripTags,
} from './actionlog-tile.js';

const NOW = new Date(2026, 10, 9, 12, 0, 0);
const FILE = `---
---

# Action Log

- 2025-10-01 08:00:00 Old run #run
- 2026-09-15 08:00:00 Read book #read
- 2026-10-20 08:00:00 Ran 5k #run #health
- 2026-11-05 08:00:00 Ran 10k #run
- 2026-11-08 09:00:00 Wrote notes
`;

describe('actionLogList', () => {
  it('orders newest first and reports the match count beyond the limit', () => {
    const r = actionLogList(FILE, { limit: 2 });
    expect(r.entries.map((e) => e.description)).toEqual(['Wrote notes', 'Ran 10k #run']);
    expect(r.matches).toBe(5);
    expect(r.tags).toEqual(['health', 'read', 'run']);
  });
  it('filters by tag and by text, case-insensitively', () => {
    expect(actionLogList(FILE, { tag: 'run' }).matches).toBe(3);
    expect(actionLogList(FILE, { text: 'BOOK' }).entries).toHaveLength(1);
    expect(actionLogList(FILE, { tag: 'run', text: '10k' }).entries).toHaveLength(1);
  });
  it('is empty for an empty file', () => {
    expect(actionLogList('')).toEqual({ entries: [], matches: 0, tags: [] });
  });
});

describe('actionLogStats', () => {
  it('counts the last 7 days, last 30 days and everything', () => {
    expect(actionLogStats(FILE, NOW)).toEqual({ week: 2, month: 3, total: 5 });
  });
});

describe('actionLogReport', () => {
  it('lists 12 months newest first, zeros included', () => {
    const { months } = actionLogReport(FILE, NOW);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: '2026-11', count: 2 });
    expect(months[1]).toEqual({ month: '2026-10', count: 1 });
    expect(months[2]).toEqual({ month: '2026-09', count: 1 });
    expect(months[3]).toEqual({ month: '2026-08', count: 0 });
    expect(months[11]).toEqual({ month: '2025-12', count: 0 });
  });
  it('ranks tags by count then name and caps the list', () => {
    expect(actionLogReport(FILE, NOW).topTags[0]).toEqual({ tag: 'run', count: 3 });
    expect(actionLogReport(FILE, NOW, 2).topTags).toHaveLength(2);
  });
});

describe('groupByDay', () => {
  it('groups newest first under Today, Yesterday and dated headings', () => {
    const { entries } = actionLogList(FILE);
    const groups = groupByDay(entries, new Date(2026, 10, 9, 12, 0, 0));
    expect(groups.map((g) => g.title)).toEqual([
      'Yesterday',
      'Thu, Nov 5, 2026',
      'Tue, Oct 20, 2026',
      'Tue, Sep 15, 2026',
      'Wed, Oct 1, 2025',
    ]);
    expect(groupByDay(entries, new Date(2026, 10, 8, 12))[0]?.title).toBe('Today');
    expect(groups[0]?.day).toBe('2026-11-08');
  });
  it('keeps several entries of one day together', () => {
    const groups = groupByDay(
      actionLogList('- 2026-11-08 09:00:00 B\n- 2026-11-08 07:00:00 A').entries,
      new Date(2026, 10, 8),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((e) => e.description)).toEqual(['B', 'A']);
  });
});

describe('entry text helpers', () => {
  it('reads the time of day and strips inline tags for display', () => {
    expect(entryTime('2026-11-08 09:05:30')).toBe('09:05');
    expect(stripTags('Ran 5k #run #health')).toBe('Ran 5k');
    expect(stripTags('#solo')).toBe('#solo');
  });
});
