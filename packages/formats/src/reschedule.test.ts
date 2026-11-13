import { describe, expect, it } from 'vitest';
import { RESCHEDULE_OPTIONS, rescheduleDate, rescheduleDue, withDate } from './reschedule.js';

const at = (s: string) => new Date(`${s}T12:00:00`).getTime();

describe('rescheduleDate', () => {
  it('tomorrow and day after, across month and year ends', () => {
    expect(rescheduleDate('tomorrow', at('2026-11-12'))).toBe('2026-11-13');
    expect(rescheduleDate('day-after', at('2026-11-30'))).toBe('2026-12-02');
    expect(rescheduleDate('tomorrow', at('2026-12-31'))).toBe('2027-01-01');
    expect(rescheduleDate('day-after', at('2028-02-28'))).toBe('2028-03-01');
  });

  it('next Saturday is strictly after today', () => {
    // 2026-11-13 is a Friday, 11-14 a Saturday, 11-15 a Sunday.
    expect(rescheduleDate('saturday', at('2026-11-13'))).toBe('2026-11-14');
    expect(rescheduleDate('saturday', at('2026-11-14'))).toBe('2026-11-21');
    expect(rescheduleDate('saturday', at('2026-11-15'))).toBe('2026-11-21');
  });

  it('next Monday is strictly after today', () => {
    expect(rescheduleDate('monday', at('2026-11-13'))).toBe('2026-11-16');
    expect(rescheduleDate('monday', at('2026-11-15'))).toBe('2026-11-16');
    expect(rescheduleDate('monday', at('2026-11-16'))).toBe('2026-11-23');
  });

  it('is stable across a DST change', () => {
    expect(rescheduleDate('monday', at('2026-11-01'))).toBe('2026-11-02');
    expect(rescheduleDate('day-after', at('2026-03-07'))).toBe('2026-03-09');
  });
});

describe('due building', () => {
  it('keeps time-of-day when present, date only otherwise', () => {
    expect(withDate({ dueTime: '15:00' }, '2026-11-20')).toEqual({
      date: '2026-11-20',
      time: '15:00',
    });
    expect(rescheduleDue({}, 'tomorrow', at('2026-11-12'))).toEqual({ date: '2026-11-13' });
    expect(rescheduleDue({ dueTime: '09:30' }, 'tomorrow', at('2026-11-12'))).toEqual({
      date: '2026-11-13',
      time: '09:30',
    });
  });

  it('exposes four quick options', () => {
    expect(RESCHEDULE_OPTIONS.map((o) => o.id)).toEqual([
      'tomorrow',
      'day-after',
      'saturday',
      'monday',
    ]);
  });
});
