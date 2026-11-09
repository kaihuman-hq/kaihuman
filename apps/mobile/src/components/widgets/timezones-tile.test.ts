import { parseTimezones } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  addTimezone,
  citiesFor,
  cityOf,
  localClock,
  removeTimezone,
  searchZones,
  supportedZones,
  yearProgress,
} from './timezones-tile.js';

const now = new Date(2026, 10, 5, 10, 0, 0);
const empty = JSON.stringify({ timezones: [] });

describe('yearProgress', () => {
  it('counts calendar days, 1-based', () => {
    expect(yearProgress(new Date(2026, 0, 1))).toMatchObject({
      dayOfYear: 1,
      daysLeft: 364,
      daysInYear: 365,
    });
    expect(yearProgress(new Date(2026, 10, 5))).toMatchObject({ dayOfYear: 309, daysLeft: 56 });
    expect(yearProgress(new Date(2026, 11, 31, 23, 59))).toMatchObject({
      dayOfYear: 365,
      daysLeft: 0,
      percent: 100,
    });
  });

  it('handles leap years', () => {
    expect(yearProgress(new Date(2028, 11, 31))).toMatchObject({ dayOfYear: 366, daysInYear: 366 });
  });

  it('is not thrown off by DST changeover days', () => {
    expect(yearProgress(new Date(2026, 2, 29, 12)).dayOfYear).toBe(88);
    expect(yearProgress(new Date(2026, 9, 25, 12)).dayOfYear).toBe(298);
  });
});

describe('localClock', () => {
  it('formats a 24h clock with seconds and a full date', () => {
    const c = localClock(new Date(2026, 10, 5, 9, 4, 7));
    expect(c.time).toBe('09:04:07');
    expect(c.date).toBe('Thursday, Nov 5, 2026');
    expect(c.zone.length).toBeGreaterThan(0);
  });
});

describe('city names', () => {
  it('derives a readable city from an IANA name', () => {
    expect(cityOf('America/Sao_Paulo')).toBe('Sao Paulo');
    expect(cityOf('UTC')).toBe('UTC');
  });

  it('prefers the curated city list', () => {
    expect(citiesFor('Europe/Paris')).toContain('Berlin');
    expect(citiesFor('Europe/Berlin')).toEqual(['Berlin']);
  });
});

describe('searchZones', () => {
  const zones = ['Europe/Berlin', 'Europe/Paris', 'America/Sao_Paulo', 'Asia/Tokyo'];

  it('matches zone names and curated cities, ignoring case and spaces', () => {
    expect(searchZones('tokyo', zones).map((z) => z.name)).toEqual(['Asia/Tokyo']);
    expect(searchZones('sao paulo', zones).map((z) => z.name)).toEqual(['America/Sao_Paulo']);
    expect(searchZones('BERLIN', zones).map((z) => z.name)).toEqual([
      'Europe/Berlin',
      'Europe/Paris',
    ]);
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(searchZones('  ', zones)).toEqual([]);
    expect(searchZones('e', zones, 2)).toHaveLength(2);
  });

  it('falls back to a usable zone list', () => {
    expect(supportedZones()).toContain('UTC');
    expect(supportedZones().length).toBeGreaterThan(10);
  });
});

describe('addTimezone / removeTimezone', () => {
  it('adds a zone with its live offset and cities', () => {
    const r = addTimezone(empty, 'Europe/Berlin', 'z1', now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(parseTimezones(r.content).timezones[0]).toEqual({
      id: 'z1',
      name: 'Europe/Berlin',
      offset: '+01:00',
      cities: ['Berlin'],
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    });
  });

  it('works on an empty file', () => {
    expect(addTimezone('', 'UTC', 'z', now).ok).toBe(true);
  });

  it('rejects unknown and duplicate zones', () => {
    expect(addTimezone(empty, 'Mars/Olympus', 'z', now).ok).toBe(false);
    expect(addTimezone(empty, '  ', 'z', now).ok).toBe(false);
    const once = addTimezone(empty, 'Asia/Tokyo', 'a', now);
    if (!once.ok) throw new Error('setup failed');
    expect(addTimezone(once.content, 'Asia/Tokyo', 'b', now).ok).toBe(false);
  });

  it('removes by id and rejects unknown ids', () => {
    const a = addTimezone(empty, 'Asia/Tokyo', 'a', now);
    if (!a.ok) throw new Error('setup failed');
    const b = addTimezone(a.content, 'UTC', 'b', now);
    if (!b.ok) throw new Error('setup failed');
    const r = removeTimezone(b.content, 'a');
    expect(r.ok && parseTimezones(r.content).timezones.map((z) => z.id)).toEqual(['b']);
    expect(removeTimezone(b.content, 'nope').ok).toBe(false);
  });
});
