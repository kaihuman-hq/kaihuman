# Travel file type — design

## Goal
One file per year holds all trips. Dashboard tile shows a short overview; focus (widget) view lets the user add and edit trips, steps and custom fields.

## File
- Suffix `.travel.json`, name e.g. `2026.travel.json`.
- Shape: `{ "version": 1, "currency": "EUR", "trips": Trip[] }`.
- Parse is tolerant: empty/invalid JSON → empty doc; unknown step types and bad fields are dropped, never throw.

## Types (`packages/formats/src/travel.ts`)
```ts
type CustomField = { key: string; value: string };
type Trip = {
  id: string; title: string;
  start?: string; end?: string;            // ISO date YYYY-MM-DD
  destination?: string; notes?: string;
  custom: CustomField[];
  steps: TravelStep[];
};
type StepBase = { id: string; website?: string };
type TravelStep = StepBase & (
  | { type: 'general'; title: string; description?: string }
  | { type: 'car'; tollStart: string; tollEnd: string; tollRef?: string; cost: number }
  | { type: 'rental'; from: string; to: string; start: string; end: string; ref: string; cost: number }
  | { type: 'flight' | 'train'; from: string; to: string; start: string; end: string; ref: string; cost: number }
  | { type: 'hotel'; from: string; to: string; ref: string; cost: number }
);
type TravelDoc = { version: 1; currency: string; trips: Trip[] };
```
- `car.tollStart/tollEnd` = toll vignette validity dates. `hotel.from/to` = check-in/out dates. `rental/flight/train` `from/to` = places, `start/end` = ISO date or datetime.
- `cost` is a number in `doc.currency`.

## API (pure, return new doc)
`parseTravel`, `serializeTravel` (2-space JSON + trailing newline), `emptyStep(type)`, `addTrip`, `updateTrip`, `deleteTrip`, `addStep`, `updateStep`, `deleteStep`, `moveStep(tripId, stepId, dir: -1|1)`, `tripCost(trip)`, `totalCost(doc)`, `nextTrip(doc, today)` (current trip if today within start..end, else earliest future start). IDs via injected generator param with default (`crypto.randomUUID`). Exported from `packages/formats/src/index.ts`.

## UI (`packages/ui/src/LifeOS/Organisms/Widgets/`)
- `TravelWidget.tsx` — props like other widgets `{content, mode, onChange}`.
  - SMALL / MOBILE_COLLAPSED: next trip title, dates, "in N days" / "now", step type icons; footer "N trips · total cost".
  - FOCUS / MOBILE_EXPANDED: trip list sorted by start; each trip expandable; inline edit of trip fields, custom fields (add/edit/remove key-value), steps (add by type, edit fields per type, reorder, delete), delete trip. Every edit → `onChange(serializeTravel(next))`.
- `TravelAddForm.tsx` — new trip (title required, optional dates/destination) for `focusedViewMode === 'ADD'`.
- Follow `BookmarksWidget.tsx` patterns and existing styling.

## Wiring
Add `.travel.json` everywhere suffixes are listed: `packages/core/src/stores/layout.store.ts`, `packages/ui/src/LifeOS/Layouts/MainApp.tsx` (ext chain + dispatch + add form), `apps/console/src/pages/Dashboard.tsx` (`isWidget`), `packages/ui/src/LifeOS/Organisms/NewFileWizard.tsx` (template, default content = empty doc), `apps/console/src/lib/kb-skills.ts`.

## Tests (Vitest)
- `packages/formats/src/travel.test.ts`: parse tolerance, round-trip, every mutator, costs, nextTrip.
- `apps/console/src/travel-widget.test.tsx`: small tile renders next trip + totals; focus edit/add/delete step and custom field calls `onChange` with expected JSON.

## Docs
`doc/progress.md` (dated entry), `doc/features.md`, `doc/roadmap.md` if listed.

## Out of scope
Multi-currency, per-step custom fields, attachments, cross-year views.

## v2: step address, maps link, custom fields (formats only)
- Every step gets optional `address`, optional `mapsUrl` (kept on parse only if non-empty strings) and `custom: CustomField[]` (missing/invalid → `[]`; same entry rules as `Trip.custom`). `emptyStep` returns `custom: []`; old files still parse and round-trip.
- `updateStep` patch may set these; id/type stay fixed.
- `mapsLink(step)`: `mapsUrl` if set, else `https://www.google.com/maps/search/?api=1&query=<encoded address>`, else `undefined`.
- Per-step custom fields are no longer out of scope. UI is a follow-up.
