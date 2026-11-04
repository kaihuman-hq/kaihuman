export type CustomField = { key: string; value: string };

type StepBase = {
  id: string;
  website?: string;
  address?: string;
  mapsUrl?: string;
  custom: CustomField[];
};

export type TravelStep = StepBase &
  (
    | { type: 'general'; title: string; description?: string }
    | { type: 'car'; tollStart: string; tollEnd: string; tollRef?: string; cost: number }
    | {
        type: 'rental';
        from: string;
        to: string;
        start: string;
        end: string;
        ref: string;
        cost: number;
      }
    | {
        type: 'flight' | 'train';
        from: string;
        to: string;
        start: string;
        end: string;
        ref: string;
        cost: number;
      }
    | { type: 'hotel'; from: string; to: string; ref: string; cost: number }
  );

export type StepType = TravelStep['type'];

export type Trip = {
  id: string;
  title: string;
  /** ISO date YYYY-MM-DD. */
  start?: string;
  end?: string;
  destination?: string;
  notes?: string;
  custom: CustomField[];
  steps: TravelStep[];
};

export type TravelDoc = { version: 1; currency: string; trips: Trip[] };

const DEFAULT_CURRENCY = 'EUR';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Required string fields per step type; anything else on a step is optional.
const REQUIRED: Record<StepType, string[]> = {
  general: ['title'],
  car: ['tollStart', 'tollEnd'],
  rental: ['from', 'to', 'start', 'end', 'ref'],
  flight: ['from', 'to', 'start', 'end', 'ref'],
  train: ['from', 'to', 'start', 'end', 'ref'],
  hotel: ['from', 'to', 'ref'],
};
const OPTIONAL: Record<StepType, string[]> = {
  general: ['description'],
  car: ['tollRef'],
  rental: [],
  flight: [],
  train: [],
  hotel: [],
};
const HAS_COST = (type: StepType): boolean => type !== 'general';

const newId = (): string => crypto.randomUUID();

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const parseCustom = (raw: unknown): CustomField[] =>
  Array.isArray(raw)
    ? raw.flatMap((c) =>
        isRecord(c) && typeof c.key === 'string' ? [{ key: c.key, value: str(c.value) ?? '' }] : [],
      )
    : [];

function emptyDoc(): TravelDoc {
  return { version: 1, currency: DEFAULT_CURRENCY, trips: [] };
}

function parseStep(raw: unknown): TravelStep | undefined {
  if (!isRecord(raw)) return undefined;
  const type = raw.type;
  if (typeof type !== 'string' || !Object.hasOwn(REQUIRED, type)) return undefined;
  const t = type as StepType;
  const out: Record<string, unknown> = { id: str(raw.id) || newId(), type: t };
  for (const key of REQUIRED[t]) {
    const v = str(raw[key]);
    if (v === undefined) return undefined;
    out[key] = v;
  }
  for (const key of [...OPTIONAL[t], 'website']) {
    const v = str(raw[key]);
    if (v !== undefined) out[key] = v;
  }
  for (const key of ['address', 'mapsUrl']) {
    const v = str(raw[key]);
    if (v) out[key] = v;
  }
  out.custom = parseCustom(raw.custom);
  if (HAS_COST(t)) {
    out.cost = typeof raw.cost === 'number' && Number.isFinite(raw.cost) ? raw.cost : 0;
  }
  return out as TravelStep;
}

function parseTrip(raw: unknown): Trip | undefined {
  if (!isRecord(raw)) return undefined;
  const trip: Trip = {
    id: str(raw.id) || newId(),
    title: str(raw.title) ?? '',
    custom: [],
    steps: [],
  };
  for (const key of ['start', 'end'] as const) {
    const v = str(raw[key]);
    if (v !== undefined && ISO_DATE.test(v)) trip[key] = v;
  }
  for (const key of ['destination', 'notes'] as const) {
    const v = str(raw[key]);
    if (v !== undefined) trip[key] = v;
  }
  trip.custom = parseCustom(raw.custom);
  if (Array.isArray(raw.steps)) {
    for (const s of raw.steps) {
      const step = parseStep(s);
      if (step) trip.steps.push(step);
    }
  }
  return trip;
}

/** Tolerant: empty or invalid input yields an empty doc, bad steps are dropped. */
export function parseTravel(content: string): TravelDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return emptyDoc();
  }
  if (!isRecord(raw)) return emptyDoc();
  const trips: Trip[] = [];
  if (Array.isArray(raw.trips)) {
    for (const t of raw.trips) {
      const trip = parseTrip(t);
      if (trip) trips.push(trip);
    }
  }
  return { version: 1, currency: str(raw.currency) || DEFAULT_CURRENCY, trips };
}

export function serializeTravel(doc: TravelDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function emptyStep(type: StepType, id: string = newId()): TravelStep {
  switch (type) {
    case 'general':
      return { id, type, custom: [], title: '' };
    case 'car':
      return { id, type, custom: [], tollStart: '', tollEnd: '', cost: 0 };
    case 'rental':
    case 'flight':
    case 'train':
      return { id, type, custom: [], from: '', to: '', start: '', end: '', ref: '', cost: 0 };
    case 'hotel':
      return { id, type, custom: [], from: '', to: '', ref: '', cost: 0 };
  }
}

const mapTrip = (doc: TravelDoc, tripId: string, fn: (t: Trip) => Trip): TravelDoc => ({
  ...doc,
  trips: doc.trips.map((t) => (t.id === tripId ? fn(t) : t)),
});

export function addTrip(
  doc: TravelDoc,
  input: Pick<Trip, 'title'> & Partial<Omit<Trip, 'id'>>,
  id: string = newId(),
): TravelDoc {
  const trip: Trip = { custom: [], steps: [], ...input, id };
  return { ...doc, trips: [...doc.trips, trip] };
}

export function updateTrip(
  doc: TravelDoc,
  tripId: string,
  patch: Partial<Omit<Trip, 'id' | 'steps'>>,
): TravelDoc {
  return mapTrip(doc, tripId, (t) => ({ ...t, ...patch }));
}

export function deleteTrip(doc: TravelDoc, tripId: string): TravelDoc {
  return { ...doc, trips: doc.trips.filter((t) => t.id !== tripId) };
}

export function addStep(doc: TravelDoc, tripId: string, step: TravelStep): TravelDoc {
  return mapTrip(doc, tripId, (t) => ({ ...t, steps: [...t.steps, step] }));
}

export function updateStep(
  doc: TravelDoc,
  tripId: string,
  stepId: string,
  patch: Partial<TravelStep>,
): TravelDoc {
  return mapTrip(doc, tripId, (t) => ({
    ...t,
    // type and id are fixed: a type change would invalidate the other fields.
    steps: t.steps.map((s) =>
      s.id === stepId ? ({ ...s, ...patch, id: s.id, type: s.type } as TravelStep) : s,
    ),
  }));
}

export function deleteStep(doc: TravelDoc, tripId: string, stepId: string): TravelDoc {
  return mapTrip(doc, tripId, (t) => ({ ...t, steps: t.steps.filter((s) => s.id !== stepId) }));
}

export function moveStep(doc: TravelDoc, tripId: string, stepId: string, dir: -1 | 1): TravelDoc {
  return mapTrip(doc, tripId, (t) => {
    const i = t.steps.findIndex((s) => s.id === stepId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= t.steps.length) return t;
    const steps = [...t.steps];
    [steps[i], steps[j]] = [steps[j] as TravelStep, steps[i] as TravelStep];
    return { ...t, steps };
  });
}

export function tripCost(trip: Trip): number {
  return trip.steps.reduce((sum, s) => sum + ('cost' in s ? s.cost : 0), 0);
}

export function totalCost(doc: TravelDoc): number {
  return doc.trips.reduce((sum, t) => sum + tripCost(t), 0);
}

/** By start ascending, undated last; stable. */
export function sortTrips(trips: Trip[]): Trip[] {
  return [...trips].sort((a, b) => {
    if (a.start === b.start) return 0;
    if (a.start === undefined) return 1;
    if (b.start === undefined) return -1;
    return a.start < b.start ? -1 : 1;
  });
}

/** The trip running today, else the earliest one starting later. Undated trips never match. */
export function nextTrip(doc: TravelDoc, today: string): Trip | undefined {
  const dated = sortTrips(doc.trips).filter((t) => t.start !== undefined);
  const current = dated.find(
    (t) => (t.start as string) <= today && today <= (t.end ?? (t.start as string)),
  );
  return current ?? dated.find((t) => (t.start as string) > today);
}

/** Explicit mapsUrl wins; otherwise a Google Maps search for the address. */
export function mapsLink(step: TravelStep): string | undefined {
  if (step.mapsUrl) return step.mapsUrl;
  if (step.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(step.address)}`;
  }
  return undefined;
}
