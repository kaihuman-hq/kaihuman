/**
 * Add/remove, zone search, local clock and year progress for `.timezones.json`. `now` is always
 * injected; the only ambient input is the device's IANA zone list, which callers may override.
 */
import {
  AVAILABLE_TIMEZONES,
  parseTimezones,
  serializeTimezones,
  type TimezoneEntry,
} from '@kaihuman/formats';

import { formatOffset, type TileResult, zoneOffsetMinutes } from './tile-controllers.js';

const DAY_MS = 86_400_000;

export interface YearProgress {
  /** 1-based: 1 January is day 1. */
  dayOfYear: number;
  daysLeft: number;
  daysInYear: number;
  /** 0..100, one decimal. */
  percent: number;
}

/** Calendar days, not elapsed hours, so DST shifts never make a day count as 23 or 25 hours. */
export const yearProgress = (now: Date): YearProgress => {
  const year = now.getFullYear();
  const startUtc = Date.UTC(year, 0, 1);
  const todayUtc = Date.UTC(year, now.getMonth(), now.getDate());
  const daysInYear = Math.round((Date.UTC(year + 1, 0, 1) - startUtc) / DAY_MS);
  const dayOfYear = Math.round((todayUtc - startUtc) / DAY_MS) + 1;
  return {
    dayOfYear,
    daysLeft: daysInYear - dayOfYear,
    daysInYear,
    percent: Math.round((dayOfYear / daysInYear) * 1000) / 10,
  };
};

export interface LocalClock {
  /** `HH:mm:ss` on the device. */
  time: string;
  /** Weekday, date and year, e.g. `Thursday, Nov 5, 2026`. */
  date: string;
  zone: string;
}

export const localClock = (now: Date): LocalClock => ({
  time: now.toLocaleTimeString('en-GB', { hour12: false }),
  date: now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  zone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
});

/** `America/Sao_Paulo` -> `Sao Paulo`. */
export const cityOf = (iana: string): string =>
  (iana.split('/').pop() ?? iana).replaceAll('_', ' ');

const curated = new Map(AVAILABLE_TIMEZONES.map((z) => [z.name, z.cities]));

/** Curated zones list their well-known cities; others fall back to the zone's own city name. */
export const citiesFor = (iana: string): string[] => {
  const known = curated.get(iana);
  return known ? [...known] : [cityOf(iana)];
};

/** Every IANA zone the runtime knows, or the curated list on engines without `supportedValuesOf`. */
export const supportedZones = (): string[] => {
  try {
    const all = (
      Intl as unknown as { supportedValuesOf?: (key: 'timeZone') => string[] }
    ).supportedValuesOf?.('timeZone');
    if (all && all.length > 0) return all.includes('UTC') ? all : ['UTC', ...all];
  } catch {
    // Older Hermes builds throw on unknown keys.
  }
  return AVAILABLE_TIMEZONES.map((z) => z.name);
};

export interface ZoneChoice {
  name: string;
  /** Primary city shown as the title. */
  city: string;
}

/**
 * Case-insensitive match over zone names and curated city names, so "berlin" finds both
 * Europe/Berlin and the curated Europe/Paris group it belongs to. Empty queries return nothing so
 * the list stays short until the user types.
 */
export const searchZones = (
  query: string,
  zones: readonly string[] = supportedZones(),
  limit = 8,
): ZoneChoice[] => {
  const q = query.trim().toLowerCase().replaceAll(' ', '_');
  if (!q) return [];
  const spaced = q.replaceAll('_', ' ');
  const hits: ZoneChoice[] = [];
  for (const name of zones) {
    const byName = name.toLowerCase().includes(q);
    const viaCity = citiesFor(name).some((c) => c.toLowerCase().includes(spaced));
    if (byName || viaCity) hits.push({ name, city: cityOf(name) });
    if (hits.length >= limit) break;
  }
  return hits;
};

const isKnownZone = (iana: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: iana });
    return true;
  } catch {
    return false;
  }
};

export const addTimezone = (content: string, iana: string, id: string, now: Date): TileResult => {
  const name = iana.trim();
  if (!isKnownZone(name)) return { ok: false, error: `Unknown time zone: ${name || '(empty)'}.` };
  const data = parseTimezones(content);
  if (data.timezones.some((z) => z.name === name)) {
    return { ok: false, error: `${cityOf(name)} is already on the list.` };
  }
  const entry: TimezoneEntry = {
    id,
    name,
    offset: formatOffset(zoneOffsetMinutes(name, now)),
    cities: citiesFor(name),
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  };
  return {
    ok: true,
    content: serializeTimezones({ ...data, timezones: [...data.timezones, entry] }),
  };
};

export const removeTimezone = (content: string, id: string): TileResult => {
  const data = parseTimezones(content);
  if (!data.timezones.some((z) => z.id === id)) return { ok: false, error: 'Time zone not found.' };
  return {
    ok: true,
    content: serializeTimezones({ ...data, timezones: data.timezones.filter((z) => z.id !== id) }),
  };
};
