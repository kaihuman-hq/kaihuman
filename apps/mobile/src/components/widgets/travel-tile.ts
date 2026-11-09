/**
 * The travel tile (`.travel.json`): presenter for the list, and the pure edits behind the trip
 * sheet. Trips and steps are edited on a draft; `saveTrip` writes it back over the same id.
 */
import {
  addTrip,
  type CustomField,
  deleteTrip,
  nextTrip,
  parseTravel,
  STEP_FIELDS,
  serializeTravel,
  sortTrips,
  type TravelStep,
  type Trip,
  totalCost,
  tripCost,
} from '@kaihuman/formats';

import type { TileResult } from './tile-controllers.js';

const ok = (content: string): TileResult => ({ ok: true, content });
const fail = (error: string): TileResult => ({ ok: false, error });
const pad = (n: number): string => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoLocalDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
};

export interface TripRow {
  id: string;
  name: string;
  destination?: string;
  dateRange: string;
  cost: number;
  costLabel: string;
  steps: number;
  status: 'upcoming' | 'current' | 'past';
}

export interface TravelView {
  currency: string;
  totalLabel: string;
  next: { name: string; daysUntil: number } | null;
  trips: TripRow[];
}

export const travelView = (content: string, now: Date): TravelView => {
  const doc = parseTravel(content);
  const today = isoLocalDay(now);
  const label = (n: number) => `${n.toFixed(2)} ${doc.currency}`;
  const trips = sortTrips(doc.trips).map((trip): TripRow => {
    const { start, end } = trip;
    const last = end ?? start;
    const status: TripRow['status'] =
      start === undefined || start > today
        ? 'upcoming'
        : last !== undefined && last < today
          ? 'past'
          : 'current';
    const cost = tripCost(trip);
    return {
      id: trip.id,
      name: trip.title || 'Untitled trip',
      ...(trip.destination ? { destination: trip.destination } : {}),
      dateRange: start ? (end && end !== start ? `${start} – ${end}` : start) : 'No dates',
      cost,
      costLabel: label(cost),
      steps: trip.steps.length,
      status,
    };
  });
  const next = nextTrip(doc, today);
  return {
    currency: doc.currency,
    totalLabel: label(totalCost(doc)),
    next: next?.start
      ? { name: next.title, daysUntil: Math.max(0, dayNumber(next.start) - dayNumber(today)) }
      : null,
    trips,
  };
};

/** Why the trip's title and dates cannot be saved, or null. */
const tripProblem = (t: { title: string; start?: string; end?: string }): string | null => {
  if (!t.title.trim()) return 'Give the trip a name';
  if ((t.start && !ISO_DATE.test(t.start)) || (t.end && !ISO_DATE.test(t.end))) {
    return 'Dates must look like 2026-11-05';
  }
  if (t.end && !t.start) return 'Add a start date';
  if (t.start && t.end && t.end < t.start) return 'The trip cannot end before it starts';
  return null;
};

export const addTravelTrip = (
  content: string,
  draft: { name: string; start: string; end: string; destination?: string },
  id: string,
): TileResult => {
  const name = draft.name.trim();
  const start = draft.start.trim();
  const end = draft.end.trim();
  const destination = draft.destination?.trim() ?? '';
  const problem = tripProblem({ title: name, start, end });
  if (problem) return fail(problem);
  const doc = addTrip(
    parseTravel(content),
    {
      title: name,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(destination ? { destination } : {}),
    },
    id,
  );
  return ok(serializeTravel(doc));
};

export const findTrip = (content: string, tripId: string): Trip | undefined =>
  parseTravel(content).trips.find((t) => t.id === tripId);

/** Date-typed step fields must be ISO dates (or empty); the rest is free text. */
const stepProblem = (step: TravelStep, index: number): string | null => {
  const values = step as unknown as Record<string, unknown>;
  for (const f of STEP_FIELDS[step.type]) {
    const v = values[f.key];
    if (f.type === 'date' && typeof v === 'string' && v && !ISO_DATE.test(v)) {
      return `Step ${index + 1}: ${f.label} must look like 2026-11-05`;
    }
  }
  return null;
};

/** Writes the edited trip over the one with the same id; the rest of the file is re-read, not overwritten. */
export const saveTrip = (content: string, draft: Trip): TileResult => {
  const { start: s, end: e, destination: d, notes: n, ...rest } = draft;
  // Blank optional text is dropped, as in the web form.
  const clean: Trip = {
    ...rest,
    title: draft.title.trim(),
    ...(s?.trim() ? { start: s.trim() } : {}),
    ...(e?.trim() ? { end: e.trim() } : {}),
    ...(d?.trim() ? { destination: d.trim() } : {}),
    ...(n?.trim() ? { notes: n } : {}),
  };
  const problem = tripProblem(clean);
  if (problem) return fail(problem);
  for (const [i, step] of clean.steps.entries()) {
    const p = stepProblem(step, i);
    if (p) return fail(p);
  }
  const doc = parseTravel(content);
  if (!doc.trips.some((t) => t.id === clean.id)) return fail('That trip no longer exists');
  return ok(
    serializeTravel({ ...doc, trips: doc.trips.map((t) => (t.id === clean.id ? clean : t)) }),
  );
};

export const removeTrip = (content: string, tripId: string): string =>
  serializeTravel(deleteTrip(parseTravel(content), tripId));

/** `list` with the entry at `index` moved one place; unchanged at the ends. */
export const moveItem = <T>(list: readonly T[], index: number, dir: -1 | 1): T[] => {
  const j = index + dir;
  const next = [...list];
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return next;
  [next[index], next[j]] = [next[j] as T, next[index] as T];
  return next;
};

/** Empty or non-numeric text must not become NaN, which JSON stores as null. */
export const parseCost = (text: string): number => {
  const v = text.trim().replace(',', '.');
  return v !== '' && Number.isFinite(Number(v)) ? Number(v) : 0;
};

export const setStepField = (
  step: TravelStep,
  key: string,
  value: string | number | CustomField[] | undefined,
): TravelStep => ({ ...step, [key]: value }) as TravelStep;

export const stepValue = (step: TravelStep, key: string): string => {
  const v = (step as unknown as Record<string, unknown>)[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
};

/** One line describing a step in the sheet's list. */
export const stepSummary = (step: TravelStep): string => {
  const v = (key: string) => stepValue(step, key);
  switch (step.type) {
    case 'general':
      return v('title') || 'Untitled';
    case 'car':
      return [v('tollStart'), v('tollEnd')].filter(Boolean).join(' – ') || 'Car';
    default:
      return [v('from'), v('to')].filter(Boolean).join(' → ') || 'No route';
  }
};

/** User-typed URLs open only if http(s); anything else (e.g. javascript:) is not linked. */
export const safeHref = (url?: string): string | undefined =>
  url && /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
