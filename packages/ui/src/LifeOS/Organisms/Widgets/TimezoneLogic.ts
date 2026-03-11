/**
 * Logic for the Timezone Widget (.timezones.json)
 */

export interface TimezoneEntry {
  id: string;
  name: string;
  offset: string; // e.g. "+00:00", "-05:00"
  cities: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TimezoneData {
  timezones: TimezoneEntry[];
}

import { Logger } from '@lifosy/core';

const logger = new Logger('TimezoneLogic');

export const parseTimezones = (json: string): TimezoneData => {
  try {
    if (!json || json.trim() === '') return { timezones: [] };
    const data = JSON.parse(json);
    // Basic validation could go here
    return data && Array.isArray(data.timezones) ? data : { timezones: [] };
  } catch (e) {
    logger.error('Failed to parse timezones JSON', e);
    return { timezones: [] };
  }
};

export const serializeTimezones = (data: TimezoneData): string => {
  return JSON.stringify(data, null, 2);
};

// Static Data for "Add Timezone" functionality
// A curated list of popular timezones
export const AVAILABLE_TIMEZONES = [
  { name: 'UTC', offset: '+00:00', cities: ['UTC'] },
  { name: 'Europe/London', offset: '+00:00', cities: ['London', 'Edinburgh', 'Dublin', 'Lisbon'] },
  {
    name: 'Europe/Paris',
    offset: '+01:00',
    cities: ['Paris', 'Berlin', 'Rome', 'Madrid', 'Amsterdam', 'Brussels', 'Vienna'],
  },
  {
    name: 'Europe/Athens',
    offset: '+02:00',
    cities: ['Athens', 'Bucharest', 'Istanbul', 'Cairo', 'Jerusalem'],
  },
  { name: 'Europe/Moscow', offset: '+03:00', cities: ['Moscow', 'St. Petersburg'] },
  { name: 'Asia/Dubai', offset: '+04:00', cities: ['Dubai', 'Abu Dhabi'] },
  { name: 'Asia/Karachi', offset: '+05:00', cities: ['Karachi', 'Islamabad'] },
  { name: 'Asia/Kolkata', offset: '+05:30', cities: ['Mumbai', 'Delhi', 'Bangalore', 'Kolkata'] },
  { name: 'Asia/Dhaka', offset: '+06:00', cities: ['Dhaka'] },
  { name: 'Asia/Bangkok', offset: '+07:00', cities: ['Bangkok', 'Hanoi', 'Jakarta'] },
  {
    name: 'Asia/Singapore',
    offset: '+08:00',
    cities: ['Singapore', 'Kuala Lumpur', 'Hong Kong', 'Beijing', 'Shanghai', 'Taipei', 'Perth'],
  },
  { name: 'Asia/Tokyo', offset: '+09:00', cities: ['Tokyo', 'Seoul', 'Osaka'] },
  { name: 'Australia/Sydney', offset: '+11:00', cities: ['Sydney', 'Melbourne', 'Canberra'] },
  { name: 'Pacific/Auckland', offset: '+13:00', cities: ['Auckland', 'Wellington'] },

  { name: 'Atlantic/Azores', offset: '-01:00', cities: ['Azores'] },
  {
    name: 'America/Sao_Paulo',
    offset: '-03:00',
    cities: ['São Paulo', 'Rio de Janeiro', 'Brasilia', 'Buenos Aires'],
  },
  {
    name: 'America/New_York',
    offset: '-05:00',
    cities: ['New York', 'Washington DC', 'Boston', 'Miami', 'Toronto', 'Montreal'],
  },
  {
    name: 'America/Chicago',
    offset: '-06:00',
    cities: ['Chicago', 'Houston', 'Dallas', 'Mexico City'],
  },
  { name: 'America/Denver', offset: '-07:00', cities: ['Denver', 'Salt Lake City', 'Calgary'] },
  {
    name: 'America/Los_Angeles',
    offset: '-08:00',
    cities: ['Los Angeles', 'San Francisco', 'Seattle', 'Vancouver', 'Las Vegas'],
  },
  { name: 'America/Anchorage', offset: '-09:00', cities: ['Anchorage'] },
  { name: 'Pacific/Honolulu', offset: '-10:00', cities: ['Honolulu'] },
];

// Helper to calculate year progress
export const getYearProgress = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const percentage = Math.min(100, Math.max(0, (elapsed / total) * 100));

  const dayOfYear = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  const daysInYear = Math.floor(total / (1000 * 60 * 60 * 24));
  const daysRemaining = daysInYear - dayOfYear;

  return { percentage, dayOfYear, daysRemaining, daysInYear };
};

// Helper to get time in a specific timezone
// Note: `offset` in string format "+HH:MM" is tricky to apply directly to Date object reliably across DST without a library like Luxon or date-fns-tz.
// However, standard Intl.DateTimeFormat is robust if we use the IANA Zone Name.
export const getCurrentTimeInZone = (ianaName: string) => {
  try {
    const now = new Date();
    // Use Intl for reliable formatting
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      timeZone: ianaName,
    });

    // For date parts
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: ianaName,
    });

    // For week number, it's a bit complex with pure Intl, usually calculated on local date shifted.
    // Simpler hack: shift UTC time by offset approx? No, safer to just use local calc or ignore week number in specific zone for now if hard.
    // Actually, user wants "Week". We can calculate ISO week number.

    return {
      time: timeFormatter.format(now),
      date: dateFormatter.format(now),
      parts: dateFormatter.formatToParts(now),
    };
  } catch (_e) {
    return { time: '--:--', date: 'Invalid Timezone', parts: [] };
  }
};

export const getISOWeekNumber = (d: Date) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
};
