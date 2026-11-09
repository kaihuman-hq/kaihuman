import { describe, expect, it } from 'vitest';
import { actionLogList, actionLogReport, actionLogStats } from './actionlog-tile.js';

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
