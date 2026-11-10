import { describe, expect, it } from 'vitest';
import { fakeModel, memFiles } from './test-helpers.js';
import {
  buildWeeklyReview,
  generateReview,
  reviewPath,
  templateReview,
  writeWeeklyReview,
} from './weekly-review.js';

const now = new Date(2026, 10, 10, 18, 0);
const ms = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();

const repo = {
  '.kh/inbox.todos.md': [
    `- [x] Ship scan\n::updated:: ${ms(2026, 10, 9)}`,
    `- [x] Old thing\n::updated:: ${ms(2026, 9, 1)}`,
    '- [>] Write review',
    '- [ ] Pay rent #money\n::due:: 2026-11-01',
    '- [ ] Later\n::due:: 2026-12-01',
  ].join('\n'),
  'habits/Run.habit.csv':
    'iso date;reached\n2026-11-08;x\n2026-11-09;x\n2026-11-10;x\n2026-10-01;x',
  'work/me.timetracking.csv': 'iso date;time\n2026-11-09;09:00,12:30\n2026-10-01;09:00,17:00',
  'money/main.budget.csv':
    'name;account;category;date;value\nCoffee;bank;food;2026-11-09;4.5\nSalary;bank;earnings;2026-11-09;5000\nTrain;bank;transport;2026-11-05;20\nOld;bank;food;2026-10-01;99',
};

describe('buildWeeklyReview', () => {
  it('collects the last seven days', () => {
    const files = Object.entries(repo).map(([path, content]) => ({ path, content }));
    const d = buildWeeklyReview(files, now);
    expect(d.start).toBe('2026-11-04');
    expect(d.end).toBe('2026-11-10');
    expect(d.done.map((t) => t.text)).toEqual(['Ship scan']);
    expect(d.openLoops).toEqual([
      { text: 'Write review', reason: 'in progress' },
      { text: 'Pay rent', reason: 'overdue' },
    ]);
    expect(d.habits).toEqual([{ name: 'Run', streak: 3, daysThisWeek: 3 }]);
    expect(d.timeMinutes).toBe(210);
    expect(d.spend).toEqual({
      total: 24.5,
      byCategory: [
        { category: 'transport', amount: 20 },
        { category: 'food', amount: 4.5 },
      ],
    });
  });
});

describe('weekly review text', () => {
  const data = buildWeeklyReview(
    Object.entries(repo).map(([path, content]) => ({ path, content })),
    now,
  );

  it('writes a deterministic template without a model', async () => {
    const md = templateReview(data);
    expect(md).toContain('# Weekly review 2026-11-04 – 2026-11-10');
    expect(md).toContain('## Done (1)\n- Ship scan');
    expect(md).toContain('- Run: 3/7 days, streak 3');
    expect(md).toContain('- 3h 30m tracked');
    expect(md).toContain('- Transport: 20');
    expect(md).toContain('- Pay rent (overdue)');
    expect(await generateReview(data, null)).toEqual({ markdown: md, source: 'template' });
    expect(await generateReview(data, fakeModel({}))).toEqual({ markdown: md, source: 'template' });
  });

  it('prefers Private Cloud Compute, keeps the facts below the prose, and falls back on errors', async () => {
    const pcc = fakeModel({ device: true, server: true, text: 'A good week.' });
    const res = await generateReview(data, pcc);
    expect(res.source).toBe('server');
    expect(
      res.markdown.startsWith('# Weekly review 2026-11-04 – 2026-11-10\n\nA good week.\n\n---\n'),
    ).toBe(true);
    expect(res.markdown).toContain('- Ship scan');
    expect(JSON.parse(pcc.calls[0]?.prompt ?? '{}')).toMatchObject({
      doneCount: 1,
      timeTracked: '3h 30m',
    });
    expect((await generateReview(data, fakeModel({ device: true, text: 'Hi' }))).source).toBe(
      'device',
    );
    const boom = () => {
      throw new Error('context window');
    };
    expect((await generateReview(data, fakeModel({ device: true, text: boom }))).source).toBe(
      'template',
    );
    expect((await generateReview(data, fakeModel({ device: true, text: '  ' }))).source).toBe(
      'template',
    );
  });

  it('saves to logs/ without overwriting an earlier review', async () => {
    const files = memFiles({ ...repo, 'logs/weekly-review-2026-11-10.md': 'edited' });
    const res = await writeWeeklyReview({ files, model: null, now });
    expect(res).toEqual({ path: 'logs/weekly-review-2026-11-10-2.md', source: 'template' });
    expect(files.data[res.path]).toContain('Ship scan');
    expect(files.data['logs/weekly-review-2026-11-10.md']).toBe('edited');
    expect(reviewPath(data, () => false)).toBe('logs/weekly-review-2026-11-10.md');
  });
});
