import { parseVacation } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { addVacationDestination, vacationView } from './vacation-tile.js';

const file = JSON.stringify({
  version: 1,
  title: 'Summer',
  currency: 'EUR',
  from: '2026-07-01',
  to: '2026-07-10',
  custom: [],
  destinations: [
    {
      id: 'a',
      name: 'Rome',
      status: 'booked',
      price: 100,
      rating: 4,
      address: 'Via Roma',
      custom: [],
    },
    { id: 'b', name: 'Oslo', status: 'idea', custom: [] },
  ],
});

describe('vacationView', () => {
  it('shows window, rows and status counts', () => {
    const v = vacationView(file);
    expect(v.window).toBe('2026-07-01 – 2026-07-10');
    expect(v.destinations[0]).toMatchObject({ name: 'Rome', priceLabel: '100.00 EUR', rating: 4 });
    expect(v.destinations[0]?.mapsUrl).toMatch(/^https:/);
    expect(v.destinations[1]?.mapsUrl).toBeUndefined();
    expect(v.counts.find((c) => c.status === 'booked')?.count).toBe(1);
  });
  it('is empty for blank content', () => {
    expect(vacationView('')).toMatchObject({ window: '', destinations: [] });
  });
});

describe('addVacationDestination', () => {
  it('appends to the existing doc', () => {
    const r = addVacationDestination(file, { name: ' Lima ', price: '12,5' }, 'c');
    if (!r.ok) throw new Error(r.error);
    expect(parseVacation(r.content).destinations.at(-1)).toMatchObject({
      id: 'c',
      name: 'Lima',
      price: 12.5,
    });
    expect(parseVacation(r.content).destinations).toHaveLength(3);
  });
  it('rejects blank names and bad prices', () => {
    expect(addVacationDestination('', { name: ' ', price: '' }, 'x').ok).toBe(false);
    expect(addVacationDestination('', { name: 'A', price: 'abc' }, 'x').ok).toBe(false);
  });
  it('never writes over unreadable content', () => {
    expect(addVacationDestination('{oops', { name: 'A', price: '' }, 'x').ok).toBe(false);
  });
});
