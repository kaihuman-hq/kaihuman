import { type CustomField, mapsLink } from './travel.js';

export type DestinationStatus = 'idea' | 'shortlist' | 'booked' | 'dropped';
export const DESTINATION_STATUSES: readonly DestinationStatus[] = [
  'idea',
  'shortlist',
  'booked',
  'dropped',
];

export type Destination = {
  id: string;
  name: string;
  status: DestinationStatus;
  /** Integer 1-5. */
  rating?: number;
  price?: number;
  /** Free text, e.g. "5 nights". */
  duration?: string;
  website?: string;
  address?: string;
  mapsUrl?: string;
  notes?: string;
  custom: CustomField[];
};

export type VacationDoc = {
  version: 1;
  title: string;
  /** ISO YYYY-MM-DD. */
  from?: string;
  /** ISO YYYY-MM-DD. */
  to?: string;
  budget?: number;
  currency: string;
  travelers?: number;
  notes?: string;
  custom: CustomField[];
  destinations: Destination[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const newId = (): string => crypto.randomUUID();
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
const isTravelers = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1;
const isStatus = (v: unknown): v is DestinationStatus =>
  DESTINATION_STATUSES.includes(v as DestinationStatus);

const parseCustom = (raw: unknown): CustomField[] =>
  Array.isArray(raw)
    ? raw.flatMap((c) =>
        isRecord(c) && typeof c.key === 'string' ? [{ key: c.key, value: str(c.value) ?? '' }] : [],
      )
    : [];

export function emptyVacation(title = ''): VacationDoc {
  return { version: 1, title, currency: 'EUR', custom: [], destinations: [] };
}

export function emptyDestination(): Destination {
  return { id: newId(), name: '', status: 'idea', custom: [] };
}

function parseDestination(raw: unknown): Destination | undefined {
  if (!isRecord(raw)) return undefined;
  const name = str(raw.name);
  if (!name) return undefined;
  const d: Destination = {
    id: str(raw.id) || newId(),
    name,
    status: isStatus(raw.status) ? raw.status : 'idea',
    custom: parseCustom(raw.custom),
  };
  const r = raw.rating;
  if (typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 5) d.rating = r;
  const price = num(raw.price);
  if (price !== undefined) d.price = price;
  for (const k of ['duration', 'website', 'address', 'mapsUrl', 'notes'] as const) {
    const v = str(raw[k]);
    if (v !== undefined) d[k] = v;
  }
  return d;
}

/** Tolerant: never throws; keeps every valid destination and drops garbage fields. */
export function parseVacation(content: string): VacationDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return emptyVacation();
  }
  if (!isRecord(raw)) return emptyVacation();
  const doc = emptyVacation(str(raw.title) ?? '');
  doc.currency = str(raw.currency) || 'EUR';
  for (const k of ['from', 'to'] as const) {
    const v = str(raw[k]);
    if (v !== undefined && ISO_DATE.test(v)) doc[k] = v;
  }
  const budget = num(raw.budget);
  if (budget !== undefined) doc.budget = budget;
  if (isTravelers(raw.travelers)) doc.travelers = raw.travelers;
  const notes = str(raw.notes);
  if (notes !== undefined) doc.notes = notes;
  doc.custom = parseCustom(raw.custom);
  if (Array.isArray(raw.destinations)) {
    doc.destinations = raw.destinations.flatMap((d) => {
      const p = parseDestination(d);
      return p ? [p] : [];
    });
  }
  return doc;
}

/** Form text to a non-negative amount; empty or invalid text must not become NaN (JSON null). */
export const toAmount = (v: string): number | undefined =>
  v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined;

/** Non-blank text that is not JSON parses to an empty doc, so a save would overwrite it. */
export const isUnreadableVacation = (content: string): boolean => {
  if (content.trim() === '') return false;
  try {
    JSON.parse(content);
    return false;
  } catch {
    return true;
  }
};

export const serializeVacation = (doc: VacationDoc): string => JSON.stringify(doc, null, 2);

export const addDestination = (doc: VacationDoc, d: Destination): VacationDoc => ({
  ...doc,
  destinations: [...doc.destinations, d],
});

export const updateDestination = (
  doc: VacationDoc,
  id: string,
  patch: Partial<Omit<Destination, 'id'>>,
): VacationDoc => ({
  ...doc,
  destinations: doc.destinations.map((d) => (d.id === id ? { ...d, ...patch } : d)),
});

export const deleteDestination = (doc: VacationDoc, id: string): VacationDoc => ({
  ...doc,
  destinations: doc.destinations.filter((d) => d.id !== id),
});

export function moveDestination(doc: VacationDoc, id: string, delta: number): VacationDoc {
  const from = doc.destinations.findIndex((d) => d.id === id);
  if (from < 0) return doc;
  const to = Math.min(doc.destinations.length - 1, Math.max(0, from + delta));
  if (to === from) return doc;
  const list = [...doc.destinations];
  const [item] = list.splice(from, 1);
  if (item) list.splice(to, 0, item);
  return { ...doc, destinations: list };
}

export const filterDestinations = (
  list: Destination[],
  status?: DestinationStatus,
): Destination[] => (status ? list.filter((d) => d.status === status) : [...list]);

export function sortDestinations(
  list: Destination[],
  by: 'price' | 'rating' | 'name',
): Destination[] {
  const out = [...list];
  if (by === 'name') return out.sort((a, b) => a.name.localeCompare(b.name));
  const dir = by === 'price' ? 1 : -1;
  return out.sort((a, b) => {
    const x = a[by];
    const y = b[by];
    if (x === undefined || y === undefined)
      return Number(x === undefined) - Number(y === undefined);
    return (x - y) * dir;
  });
}

export const destinationMapsLink = (d: Destination): string | undefined =>
  mapsLink({ ...d, type: 'general', title: d.name });
