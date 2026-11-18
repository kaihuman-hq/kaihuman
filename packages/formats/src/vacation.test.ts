import { describe, expect, it } from 'vitest';
import {
  addDestination,
  DESTINATION_STATUSES,
  deleteDestination,
  destinationMapsLink,
  emptyDestination,
  emptyVacation,
  filterDestinations,
  isUnreadableVacation,
  moveDestination,
  parseVacation,
  serializeVacation,
  sortDestinations,
  toAmount,
  updateDestination,
} from './vacation.js';

const dest = (o: Record<string, unknown>) => ({ ...emptyDestination(), ...o });
const parseOne = (d: unknown) =>
  parseVacation(JSON.stringify({ version: 1, destinations: [d] })).destinations;

describe('parseVacation', () => {
  it('returns empty doc for empty, invalid or non-object input', () => {
    for (const s of ['', 'nope', '[]', '3', 'null']) {
      expect(parseVacation(s)).toEqual(emptyVacation());
    }
  });
  it('defaults currency and status', () => {
    expect(parseVacation('{}').currency).toBe('EUR');
    expect(parseOne({ name: 'A', status: 'weird' })[0]?.status).toBe('idea');
  });
  it('drops invalid rating and price', () => {
    for (const rating of [0, 6, 2.5, '3'])
      expect(parseOne({ name: 'A', rating })[0]?.rating).toBeUndefined();
    for (const price of [-1, Number.NaN, '5'])
      expect(parseOne({ name: 'A', price })[0]?.price).toBeUndefined();
    expect(parseOne({ name: 'A', rating: 4, price: 0 })[0]).toMatchObject({ rating: 4, price: 0 });
  });
  it('drops nameless destinations, generates missing ids, keeps valid ones', () => {
    const r = parseOne({ name: '' });
    expect(r).toEqual([]);
    const doc = parseVacation(JSON.stringify({ destinations: [{ x: 1 }, { name: 'Rome' }, 5] }));
    expect(doc.destinations).toHaveLength(1);
    expect(doc.destinations[0]?.id).toBeTruthy();
  });
  it('drops invalid ISO from/to', () => {
    const doc = parseVacation(JSON.stringify({ from: '2027-07-01', to: 'tomorrow' }));
    expect(doc.from).toBe('2027-07-01');
    expect('to' in doc).toBe(false);
  });
  it('round-trips', () => {
    let doc = emptyVacation('Summer');
    doc = {
      ...doc,
      from: '2027-07-01',
      budget: 2000,
      travelers: 2,
      notes: 'n',
      custom: [{ key: 'k', value: 'v' }],
    };
    doc = addDestination(
      doc,
      dest({ name: 'Rome', rating: 5, price: 900, status: 'shortlist', mapsUrl: 'u' }),
    );
    expect(parseVacation(serializeVacation(doc))).toEqual(doc);
  });
});

describe('helpers', () => {
  const a = dest({ id: 'a', name: 'B', price: 300, rating: 3, status: 'idea' });
  const b = dest({ id: 'b', name: 'A', price: 100, status: 'dropped' });
  const c = dest({ id: 'c', name: 'C', rating: 5, status: 'idea' });
  const doc = { ...emptyVacation(), destinations: [a, b, c] };
  it('statuses', () =>
    expect(DESTINATION_STATUSES).toEqual(['idea', 'shortlist', 'booked', 'dropped']));
  it('immutable add/update/delete', () => {
    const d2 = updateDestination(doc, 'a', { name: 'Z' });
    expect(d2.destinations[0]?.name).toBe('Z');
    expect(doc.destinations[0]?.name).toBe('B');
    expect(deleteDestination(doc, 'a').destinations.map((x) => x.id)).toEqual(['b', 'c']);
    expect(addDestination(doc, dest({ id: 'd', name: 'D' })).destinations).toHaveLength(4);
  });
  it('moves and clamps', () => {
    expect(moveDestination(doc, 'a', 1).destinations.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(moveDestination(doc, 'a', -1)).toEqual(doc);
    expect(moveDestination(doc, 'c', 5).destinations.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('filters', () => {
    expect(filterDestinations(doc.destinations)).toHaveLength(3);
    expect(filterDestinations(doc.destinations, 'dropped')).toEqual([b]);
  });
  it('sorts', () => {
    expect(sortDestinations(doc.destinations, 'price').map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortDestinations(doc.destinations, 'rating').map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(sortDestinations(doc.destinations, 'name').map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
  it('maps link', () => {
    expect(destinationMapsLink(dest({ mapsUrl: 'u', address: 'x' }))).toBe('u');
    expect(destinationMapsLink(dest({ address: 'a b' }))).toBe(
      'https://www.google.com/maps/search/?api=1&query=a%20b',
    );
    expect(destinationMapsLink(dest({}))).toBeUndefined();
  });
});

describe('vacation review fixes', () => {
  it('keeps travelers only as an integer >= 1', () => {
    const t = (travelers: unknown) => parseVacation(JSON.stringify({ travelers })).travelers;
    for (const v of [0, 1.5, -1, '2']) expect(t(v)).toBeUndefined();
    expect(t(3)).toBe(3);
  });
  it('toAmount rejects empty, negative and non-numeric text', () => {
    expect(['', '-1', 'x'].map(toAmount)).toEqual([undefined, undefined, undefined]);
    expect([toAmount('0'), toAmount('12.5')]).toEqual([0, 12.5]);
  });
  it('flags non-blank invalid JSON as unreadable so forms never overwrite it', () => {
    expect(isUnreadableVacation('{oops')).toBe(true);
    for (const s of ['', '  \n', '{}', serializeVacation(emptyVacation())])
      expect(isUnreadableVacation(s)).toBe(false);
  });
});
