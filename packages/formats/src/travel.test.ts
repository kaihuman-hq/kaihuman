import { describe, expect, it } from 'vitest';
import {
  addStep,
  addTrip,
  deleteStep,
  deleteTrip,
  emptyStep,
  mapsLink,
  moveStep,
  nextTrip,
  parseTravel,
  type StepType,
  serializeTravel,
  sortTrips,
  type TravelDoc,
  totalCost,
  tripCost,
  updateStep,
  updateTrip,
} from './travel.js';

const EMPTY: TravelDoc = { version: 1, currency: 'EUR', trips: [] };

describe('parseTravel', () => {
  it('returns an empty doc for empty or invalid input', () => {
    expect(parseTravel('')).toEqual(EMPTY);
    expect(parseTravel('{bad')).toEqual(EMPTY);
    expect(parseTravel('[]')).toEqual(EMPTY);
  });

  it('drops bad steps, coerces cost, keeps website', () => {
    const doc = parseTravel(
      JSON.stringify({
        version: 1,
        currency: 'USD',
        trips: [
          {
            id: 't',
            title: 'T',
            steps: [
              { id: 'a', type: 'boat' },
              { id: 'b', type: 'flight', to: 'X', start: '', end: '', ref: '' },
              { id: 'c', type: 'hotel', from: 'a', to: 'b', ref: 'r', website: 'w' },
            ],
          },
        ],
      }),
    );
    expect(doc.currency).toBe('USD');
    expect(doc.trips[0]?.steps).toEqual([
      { id: 'c', type: 'hotel', from: 'a', to: 'b', ref: 'r', website: 'w', cost: 0, custom: [] },
    ]);
  });

  it('round-trips and serializes with 2 spaces and trailing newline', () => {
    let doc = addTrip(EMPTY, { title: 'Rome', start: '2026-05-01', destination: 'IT' }, 't1');
    doc = addStep(doc, 't1', { ...emptyStep('car', 's1'), tollRef: 'x' } as never);
    const text = serializeTravel(doc);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "version": 1');
    expect(parseTravel(text)).toEqual(doc);
  });
});

describe('emptyStep', () => {
  const cases: Record<StepType, object> = {
    general: { title: '' },
    car: { tollStart: '', tollEnd: '', cost: 0 },
    rental: { from: '', to: '', start: '', end: '', ref: '', cost: 0 },
    flight: { from: '', to: '', start: '', end: '', ref: '', cost: 0 },
    train: { from: '', to: '', start: '', end: '', ref: '', cost: 0 },
    hotel: { from: '', to: '', ref: '', cost: 0 },
  };
  it.each(Object.keys(cases) as StepType[])('%s', (type) => {
    expect(emptyStep(type, 's1')).toEqual({ id: 's1', type, custom: [], ...cases[type] });
  });
});

describe('mutators', () => {
  const base = addTrip(addTrip(EMPTY, { title: 'A' }, 'a'), { title: 'B' }, 'b');

  it('adds, updates and deletes trips immutably', () => {
    expect(base.trips.map((t) => t.id)).toEqual(['a', 'b']);
    expect(EMPTY.trips).toHaveLength(0);
    const up = updateTrip(base, 'a', { title: 'A2', custom: [{ key: 'k', value: 'v' }] });
    expect(up.trips[0]).toMatchObject({ title: 'A2', custom: [{ key: 'k', value: 'v' }] });
    expect(base.trips[0]?.title).toBe('A');
    expect(deleteTrip(base, 'a').trips.map((t) => t.id)).toEqual(['b']);
  });

  it('adds, updates, deletes and moves steps', () => {
    let doc = addStep(base, 'a', emptyStep('flight', 's1'));
    doc = addStep(doc, 'a', emptyStep('hotel', 's2'));
    doc = updateStep(doc, 'a', 's1', { cost: 50, type: 'hotel', id: 'zz' } as never);
    expect(doc.trips[0]?.steps[0]).toMatchObject({ id: 's1', type: 'flight', cost: 50 });
    const ids = (d: TravelDoc) => d.trips[0]?.steps.map((s) => s.id);
    expect(ids(moveStep(doc, 'a', 's1', -1))).toEqual(['s1', 's2']);
    expect(ids(moveStep(doc, 'a', 's2', 1))).toEqual(['s1', 's2']);
    expect(ids(moveStep(doc, 'a', 's1', 1))).toEqual(['s2', 's1']);
    expect(ids(deleteStep(doc, 'a', 's1'))).toEqual(['s2']);
  });
});

describe('costs', () => {
  it('sums step costs per trip and across the doc', () => {
    let doc = addTrip(addTrip(EMPTY, { title: 'A' }, 'a'), { title: 'B' }, 'b');
    doc = addStep(doc, 'a', emptyStep('general', 'g'));
    doc = addStep(doc, 'a', { ...emptyStep('hotel', 'h'), cost: 100 } as never);
    doc = addStep(doc, 'b', { ...emptyStep('train', 't'), cost: 25.5 } as never);
    expect(tripCost(doc.trips[0] as never)).toBe(100);
    expect(totalCost(doc)).toBe(125.5);
  });
});

describe('nextTrip', () => {
  const doc = [
    { title: 'none' },
    { title: 'later', start: '2026-08-01', end: '2026-08-05' },
    { title: 'soon', start: '2026-06-01' },
    { title: 'now', start: '2026-05-08', end: '2026-05-12' },
    { title: 'past', start: '2026-01-01', end: '2026-01-05' },
  ].reduce((d, t) => addTrip(d, t, t.title), EMPTY);

  it('prefers the current trip', () => {
    expect(nextTrip(doc, '2026-05-10')?.title).toBe('now');
  });
  it('else the earliest future start, never undated or past', () => {
    expect(nextTrip(doc, '2026-05-20')?.title).toBe('soon');
    expect(nextTrip(doc, '2026-09-01')).toBeUndefined();
    expect(nextTrip(addTrip(EMPTY, { title: 'x' }), '2026-01-01')).toBeUndefined();
  });
  it('sorts undated trips last', () => {
    expect(sortTrips(doc.trips).map((t) => t.title)).toEqual([
      'past',
      'now',
      'soon',
      'later',
      'none',
    ]);
  });
});

describe('step v2 fields', () => {
  const hotel = { id: 'h', type: 'hotel', from: 'a', to: 'b', ref: 'r' };
  const parseStep = (step: object) =>
    parseTravel(JSON.stringify({ trips: [{ id: 't', title: 'T', steps: [step] }] })).trips[0]
      ?.steps[0];

  it('defaults missing or invalid custom to [] and keeps valid entries', () => {
    expect(parseStep(hotel)).toMatchObject({ custom: [] });
    expect(parseStep({ ...hotel, custom: 'x' })).toMatchObject({ custom: [] });
    expect(
      parseStep({ ...hotel, custom: [{ key: 'Seat', value: '1A' }, { value: 'no key' }, 5] }),
    ).toMatchObject({ custom: [{ key: 'Seat', value: '1A' }] });
  });

  it('keeps address/mapsUrl only when non-empty strings', () => {
    expect(parseStep({ ...hotel, address: 'Via 1', mapsUrl: 'https://m' })).toMatchObject({
      address: 'Via 1',
      mapsUrl: 'https://m',
    });
    const s = parseStep({ ...hotel, address: '', mapsUrl: 3 });
    expect(s).not.toHaveProperty('address');
    expect(s).not.toHaveProperty('mapsUrl');
  });

  it('round-trips exactly', () => {
    let doc = addTrip(EMPTY, { title: 'R' }, 't1');
    doc = addStep(doc, 't1', {
      ...emptyStep('hotel', 's1'),
      address: 'Via 1',
      mapsUrl: 'https://m',
      custom: [{ key: 'k', value: 'v' }],
    });
    expect(parseTravel(serializeTravel(doc))).toEqual(doc);
  });

  it('updateStep patches address/mapsUrl/custom but not id/type', () => {
    let doc = addTrip(EMPTY, { title: 'R' }, 't1');
    doc = addStep(doc, 't1', emptyStep('hotel', 's1'));
    doc = updateStep(doc, 't1', 's1', {
      address: 'A',
      mapsUrl: 'U',
      custom: [{ key: 'k', value: 'v' }],
      id: 'x',
      type: 'car',
    } as never);
    expect(doc.trips[0]?.steps[0]).toMatchObject({
      id: 's1',
      type: 'hotel',
      address: 'A',
      mapsUrl: 'U',
      custom: [{ key: 'k', value: 'v' }],
    });
  });
});

describe('mapsLink', () => {
  const step = emptyStep('hotel', 's');
  it('prefers mapsUrl', () => {
    expect(mapsLink({ ...step, address: 'A', mapsUrl: 'https://m' })).toBe('https://m');
  });
  it('builds a search URL from address', () => {
    expect(mapsLink({ ...step, address: 'Via Roma 1, Rome' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Via%20Roma%201%2C%20Rome',
    );
  });
  it('is undefined with neither', () => {
    expect(mapsLink(step)).toBeUndefined();
  });
});
