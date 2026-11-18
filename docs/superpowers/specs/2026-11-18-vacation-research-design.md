# Vacation research file kind — design

## Intent
Structured scratchpad to collect and compare potential vacation destinations. One file = one search (e.g. "Summer 2027"). Standalone: no link to `.travel.json`.

## Goals / non-goals
- Goals: per-file metadata; list of destination items with all info needed to decide; add/edit/filter/sort in console.
- Non-goals: mobile app tiles, kb-mcp/CLI support, demo seed, conversion to travel trips.
- Anti-goal: losing user data on partly invalid JSON (parse must be tolerant, keep valid items).

## Approaches
1. New JSON kind modelled on `.travel.json` (picked: same pattern, widgets/forms exist to copy).
2. Extend travel with "candidates" (rejected: user wants standalone).
3. Markdown + frontmatter (rejected: no precedent, more work).

## Format: `*.vacation.json`
```ts
type VacationDoc = {
  version: 1;
  title: string;
  from?: string;      // ISO YYYY-MM-DD, time window start
  to?: string;        // ISO YYYY-MM-DD, time window end
  budget?: number;
  currency: string;   // default 'EUR'
  travelers?: number;
  notes?: string;
  custom: CustomField[];          // reuse travel's CustomField
  destinations: Destination[];
};
type DestinationStatus = 'idea' | 'shortlist' | 'booked' | 'dropped';
type Destination = {
  id: string; name: string; status: DestinationStatus; // default 'idea'
  rating?: number;    // integer 1-5
  price?: number; duration?: string; // free text, e.g. "5 nights"
  website?: string; address?: string; mapsUrl?: string; notes?: string;
  custom: CustomField[];
};
```

## UI (desktop/console)
Widget lists destinations: filter by status, sort by price or rating; maps link from `mapsUrl` or built from `address`. Header/meta shows time window, budget, travelers. Add + edit forms like travel. New-file wizard entry "Vacation research".

## Left to builder
Visual details, following Travel widget conventions.
