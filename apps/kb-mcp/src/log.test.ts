import { describe, expect, it } from 'vitest';
import { parseLog } from './log.js';

describe('parseLog', () => {
  it('parses entries newest first, keeping later same-day entries first', () => {
    const log = [
      '# Log',
      '',
      '## [2026-04-01] ingest | First source',
      'Created [[A]].',
      '',
      '## [2026-04-03] lint | Weekly lint',
      '- fixed orphans',
      '## [2026-04-03] ingest | Second source',
      '',
      'not a heading: ## [bad] x | y',
    ].join('\n');

    expect(parseLog(log)).toEqual([
      {
        date: '2026-04-03',
        op: 'ingest',
        title: 'Second source',
        body: 'not a heading: ## [bad] x | y',
      },
      { date: '2026-04-03', op: 'lint', title: 'Weekly lint', body: '- fixed orphans' },
      { date: '2026-04-01', op: 'ingest', title: 'First source', body: 'Created [[A]].' },
    ]);
  });

  it('keeps pipes inside titles', () => {
    expect(parseLog('## [2026-01-01] query | a | b')[0]).toMatchObject({
      op: 'query',
      title: 'a | b',
    });
  });

  it('returns no entries for text without headings', () => {
    expect(parseLog('just text')).toEqual([]);
  });
});
