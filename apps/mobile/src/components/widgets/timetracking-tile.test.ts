import { parseTimeTracking } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  addBreak,
  chartView,
  formatHours,
  labelIndices,
  linePath,
  msToNextBoundary,
  pointDetail,
  pointIndexAt,
  timeHistoryView,
} from './timetracking-tile.js';

// Thursday 2026-11-05, 10:00 local. The week starts Monday 2026-11-02.
const now = new Date(2026, 10, 5, 10, 0, 0);

const csv = [
  'iso date;time',
  '2026-11-05;08:00,09:00,09:30',
  '2026-11-04;08:00,12:00',
  '2026-11-02;09:00,10:30',
  '2026-11-01;09:00,17:00',
  '2026-10-20;09:00,11:00',
  '2026-09-01;09:00,10:00',
  '2026-11-03;09:00',
].join('\n');

describe('timeHistoryView', () => {
  const view = timeHistoryView(csv, now);

  it('totals Monday through today, counting the open interval on today only', () => {
    // today 60 + 30 (the 09:30 start is still open at 10:00), 11-04 240, 11-02 90;
    // the open 11-03 interval is a forgotten clock-out and is ignored.
    expect(view.weekMinutes).toBe(60 + 30 + 240 + 90);
  });

  it('lists the last 14 days newest first without empty or older days', () => {
    expect(view.days.map((d) => d.date)).toEqual([
      '2026-11-05',
      '2026-11-04',
      '2026-11-02',
      '2026-11-01',
    ]);
    expect(view.days[0]).toMatchObject({ minutes: 90, isToday: true });
  });

  it('keeps 14 days inclusive of the cutoff', () => {
    const edge = timeHistoryView(
      'iso date;time\n2026-10-23;09:00,10:00\n2026-10-22;09:00,10:00',
      now,
    );
    expect(edge.days.map((d) => d.date)).toEqual(['2026-10-23']);
  });

  it('builds eight weeks ending with the current one, zero-filled', () => {
    expect(view.weeks).toHaveLength(8);
    expect(view.weeks[7]).toMatchObject({ start: '2026-11-02', isCurrent: true, minutes: 420 });
    expect(view.weeks[6]).toMatchObject({ start: '2026-10-26', minutes: 480 });
    expect(view.weeks[5]).toMatchObject({ start: '2026-10-19', minutes: 120 });
    expect(view.weeks[4]?.minutes).toBe(0);
  });

  it('handles an empty file', () => {
    expect(timeHistoryView('', now)).toMatchObject({ weekMinutes: 0, days: [] });
  });
});

describe('addBreak', () => {
  it('splits the latest long-enough closed interval around the break', () => {
    const r = addBreak('iso date;time\n2026-11-05;08:00,12:00\n', 30, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(parseTimeTracking(r.content).entries[0]?.intervals).toEqual([
      { start: '08:00', end: '09:45' },
      { start: '10:15', end: '12:00' },
    ]);
  });

  it('skips intervals that are too short and still-open ones', () => {
    const r = addBreak('iso date;time\n2026-11-05;08:00,12:00,12:00,12:20,13:00\n', 30, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(parseTimeTracking(r.content).entries[0]?.intervals).toHaveLength(4);
  });

  it('rejects without an entry for today or without room for the break', () => {
    expect(addBreak('iso date;time\n2026-11-04;08:00,12:00\n', 15, now).ok).toBe(false);
    expect(addBreak('iso date;time\n2026-11-05;08:00,08:30\n', 30, now).ok).toBe(false);
    expect(addBreak('iso date;time\n2026-11-05;08:00\n', 15, now).ok).toBe(false);
  });
});

const chartToday = new Date();
const pad2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const content = `iso date;time\n${iso(chartToday)};08:00,12:00,13:00,17:00\n`;

describe('chartView', () => {
  it('daily has work and break hours', () => {
    const v = chartView(content, 'daily');
    expect(v.points).toEqual([{ label: iso(chartToday), work: 8, breaks: 1 }]);
    expect(v.totalHours).toBe(8);
    expect(v.maxHours).toBe(8);
  });

  it('monthly and weekly aggregate work hours', () => {
    const m = chartView(content, 'monthly');
    expect(m.points).toEqual([{ label: iso(chartToday).slice(0, 7), work: 8, breaks: 0 }]);
    expect(chartView(content, 'weekly').points[0]?.work).toBe(8);
  });

  it('empty file keeps a usable scale', () => {
    const v = chartView('iso date;time\n', 'monthly');
    expect(v.points).toEqual([]);
    expect(v.maxHours).toBe(1);
  });
});

describe('helpers', () => {
  it('linePath scales into the box', () => {
    expect(linePath([0, 2], 2, 100, 50)).toBe('M 0.0 50.0 L 100.0 0.0');
    expect(linePath([1], 2, 100, 50)).toBe('M 50.0 25.0');
  });
  it('labelIndices thins long axes', () => {
    expect(labelIndices(3)).toEqual([0, 1, 2]);
    expect(labelIndices(10)).toEqual([0, 3, 6, 9]);
  });
  it('formatHours rounds to one decimal', () => {
    expect(formatHours(7.55)).toBe('7.6h');
  });
  it('msToNextBoundary', () => {
    expect(msToNextBoundary(61_500, 60_000)).toBe(58_500);
    expect(msToNextBoundary(120_000, 60_000)).toBe(60_000);
  });
});

describe('chart point details', () => {
  const p = { label: '2026-11-05', work: 7.5, breaks: 1 };
  it('pointIndexAt snaps to the nearest point and clamps', () => {
    expect(pointIndexAt(0, 100, 5)).toBe(0);
    expect(pointIndexAt(60, 100, 5)).toBe(2);
    expect(pointIndexAt(999, 100, 5)).toBe(4);
    expect(pointIndexAt(-5, 100, 5)).toBe(0);
    expect(pointIndexAt(50, 100, 1)).toBe(0);
  });
  it('pointDetail shows breaks only for daily', () => {
    expect(pointDetail(p, 'daily')).toEqual({
      title: '2026-11-05',
      lines: ['Work: 7.5h', 'Breaks: 1h'],
    });
    expect(pointDetail(p, 'monthly').lines).toEqual(['Work: 7.5h']);
  });
});
