import { emptyStep, parseTravel } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  addTravelTrip,
  findTrip,
  moveItem,
  parseCost,
  removeTrip,
  safeHref,
  saveTrip,
  setStepField,
  stepSummary,
} from './travel-tile.js';

const file = JSON.stringify({
  version: 1,
  currency: 'EUR',
  trips: [
    { id: 'a', title: 'Rome', start: '2026-11-20', custom: [], steps: [] },
    { id: 'b', title: 'Oslo', custom: [], steps: [] },
  ],
});

const content = (r: ReturnType<typeof saveTrip>): string => {
  if (!r.ok) throw new Error(r.error);
  return r.content;
};

describe('travel editing', () => {
  it('adds a trip with a destination', () => {
    const r = addTravelTrip(
      file,
      { name: 'Nice', start: '', end: '', destination: ' France ' },
      'c',
    );
    expect(parseTravel(content(r)).trips[2]).toMatchObject({ id: 'c', destination: 'France' });
  });

  it('saves edits over the same id and keeps the other trips', () => {
    const trip = findTrip(file, 'a');
    if (!trip) throw new Error('missing');
    const steps = [setStepField(emptyStep('flight', 's1'), 'from', 'AMS')];
    const out = parseTravel(
      content(saveTrip(file, { ...trip, title: ' Rome 2 ', destination: 'Italy', steps })),
    );
    expect(out.trips.map((t) => t.title)).toEqual(['Rome 2', 'Oslo']);
    expect(out.trips[0]).toMatchObject({ destination: 'Italy' });
    expect(out.trips[0]?.steps[0]).toMatchObject({ id: 's1', from: 'AMS' });
  });

  it('drops blank optional text', () => {
    const trip = { ...(findTrip(file, 'a') as NonNullable<ReturnType<typeof findTrip>>) };
    const out = parseTravel(content(saveTrip(file, { ...trip, start: ' ', destination: '  ' })));
    expect(out.trips[0]?.start).toBeUndefined();
    expect(out.trips[0]?.destination).toBeUndefined();
  });

  it('rejects an empty title, bad or reversed dates and bad step dates', () => {
    const trip = findTrip(file, 'a') as NonNullable<ReturnType<typeof findTrip>>;
    expect(saveTrip(file, { ...trip, title: ' ' })).toEqual({
      ok: false,
      error: 'Give the trip a name',
    });
    expect(saveTrip(file, { ...trip, start: '20/11' }).ok).toBe(false);
    expect(saveTrip(file, { ...trip, end: '2026-11-01' })).toMatchObject({
      error: 'The trip cannot end before it starts',
    });
    const car = setStepField(emptyStep('car', 'c1'), 'tollStart', 'soon');
    expect(saveTrip(file, { ...trip, steps: [car] })).toMatchObject({
      error: 'Step 1: Toll from must look like 2026-11-05',
    });
  });

  it('refuses to save a trip that was deleted meanwhile', () => {
    const trip = findTrip(file, 'a') as NonNullable<ReturnType<typeof findTrip>>;
    expect(saveTrip(removeTrip(file, 'a'), trip)).toMatchObject({ ok: false });
  });

  it('deletes a trip', () => {
    expect(parseTravel(removeTrip(file, 'a')).trips.map((t) => t.id)).toEqual(['b']);
  });
});

describe('step helpers', () => {
  it('moves within bounds only', () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
  it('parses costs without NaN', () => {
    expect(parseCost('12.5')).toBe(12.5);
    expect(parseCost('12,5')).toBe(12.5);
    expect(parseCost('')).toBe(0);
    expect(parseCost('abc')).toBe(0);
  });
  it('summarises steps', () => {
    expect(stepSummary(setStepField(emptyStep('general', 'g'), 'title', 'Dinner'))).toBe('Dinner');
    const f = setStepField(setStepField(emptyStep('flight', 'f'), 'from', 'AMS'), 'to', 'FCO');
    expect(stepSummary(f)).toBe('AMS → FCO');
    expect(stepSummary(emptyStep('hotel', 'h'))).toBe('No route');
  });
  it('links only http(s)', () => {
    expect(safeHref(' https://a.test ')).toBe('https://a.test');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
  });
});
