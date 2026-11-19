/** The vacation tile (`.vacation.json`): presenter and the add-destination edit. */
import {
  addDestination,
  DESTINATION_STATUSES,
  type DestinationStatus,
  destinationMapsLink,
  emptyDestination,
  isUnreadableVacation,
  parseVacation,
  serializeVacation,
  toAmount,
} from '@kaihuman/formats';

import type { TileResult } from './tile-controllers.js';

export interface DestinationRow {
  id: string;
  name: string;
  status: DestinationStatus;
  rating?: number;
  priceLabel?: string;
  mapsUrl?: string;
}

export interface VacationView {
  title: string;
  /** "2026-12-01 – 2026-12-10", or empty without dates. */
  window: string;
  destinations: DestinationRow[];
  /** Per-status counts, in `DESTINATION_STATUSES` order. */
  counts: { status: DestinationStatus; count: number }[];
}

export const vacationView = (content: string): VacationView => {
  const doc = parseVacation(content);
  const window = doc.from
    ? doc.to && doc.to !== doc.from
      ? `${doc.from} – ${doc.to}`
      : doc.from
    : '';
  const destinations = doc.destinations.map(
    (d): DestinationRow => ({
      id: d.id,
      name: d.name || 'Untitled destination',
      status: d.status,
      ...(d.rating !== undefined ? { rating: d.rating } : {}),
      ...(d.price !== undefined ? { priceLabel: `${d.price.toFixed(2)} ${doc.currency}` } : {}),
      ...(destinationMapsLink(d) ? { mapsUrl: destinationMapsLink(d) as string } : {}),
    }),
  );
  return {
    title: doc.title,
    window,
    destinations,
    counts: DESTINATION_STATUSES.map((status) => ({
      status,
      count: destinations.filter((d) => d.status === status).length,
    })),
  };
};

/** Never writes over content that is not JSON: the parse would have dropped it. */
export const addVacationDestination = (
  content: string,
  draft: { name: string; price: string },
  id: string,
): TileResult => {
  if (isUnreadableVacation(content)) return { ok: false, error: 'This file is not readable JSON' };
  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'Give the destination a name' };
  const price = toAmount(draft.price.trim().replace(',', '.'));
  if (draft.price.trim() && price === undefined)
    return { ok: false, error: 'Price must be a number' };
  const d = { ...emptyDestination(), id, name, ...(price !== undefined ? { price } : {}) };
  return { ok: true, content: serializeVacation(addDestination(parseVacation(content), d)) };
};
