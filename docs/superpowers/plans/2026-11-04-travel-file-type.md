# Travel File Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.travel.json` yearly file with trips, typed steps, custom fields; dashboard tile + editable focus view.

**Architecture:** Pure parse/serialize/mutators in `packages/formats/src/travel.ts`. Preact widget in `packages/ui/.../Widgets/` calls mutators and `onChange(serializeTravel(doc))`. Suffix registered in every existing suffix list.

**Tech Stack:** TypeScript strict, Preact + signals, Tailwind, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-11-04-travel-file-type-design.md` (types, API names, wiring list — read it first).

## Global Constraints
- ESM, `.js` extensions in relative imports, `node:` built-ins.
- Zero Biome warnings (`pnpm run check`), zero type errors, `pnpm -r test` green.
- No new dependencies.
- Cost is `number` in `doc.currency`; dates ISO `YYYY-MM-DD`.
- `rental` step HAS `cost` (spec is authoritative).

## Review Focus
- Empty file / `""` / invalid JSON → empty doc `{version:1,currency:'EUR',trips:[]}`, no throw. (Task 1 test)
- Step with unknown `type` or missing required string → dropped; missing `cost` → 0. (Task 1 test)
- Trip without start date → sorted last, never chosen by `nextTrip`. (Task 1 test)
- Editing cost input with empty/non-number text → stored as 0, not NaN. (Task 2 test)
- File with zero trips → small tile shows empty-state text, no crash. (Task 2 test)

---

### Task 1: Format logic

**Files:**
- Create: `packages/formats/src/travel.ts`, `packages/formats/src/travel.test.ts`
- Modify: `packages/formats/src/index.ts` (re-export)

**Interfaces — Produces:** types `TravelDoc`, `Trip`, `TravelStep`, `StepType = TravelStep['type']`, `CustomField`; functions
`parseTravel(content: string): TravelDoc`, `serializeTravel(doc: TravelDoc): string`,
`emptyStep(type: StepType, id?: string): TravelStep`,
`addTrip(doc, input: Pick<Trip,'title'> & Partial<Omit<Trip,'id'>>, id?: string): TravelDoc`,
`updateTrip(doc, tripId, patch: Partial<Omit<Trip,'id'|'steps'>>): TravelDoc`, `deleteTrip(doc, tripId)`,
`addStep(doc, tripId, step: TravelStep)`, `updateStep(doc, tripId, stepId, patch: Partial<TravelStep>)` (cannot change `type`/`id`), `deleteStep(doc, tripId, stepId)`, `moveStep(doc, tripId, stepId, dir: -1|1)`,
`tripCost(trip): number`, `totalCost(doc): number`, `sortTrips(trips): Trip[]` (by start asc, undated last),
`nextTrip(doc, today: string): Trip | undefined`. All return new objects; ids default `crypto.randomUUID()`.

- [ ] **Step 1: Failing tests** in `travel.test.ts`:
  - `parseTravel('')`, `parseTravel('{bad')` → `{version:1,currency:'EUR',trips:[]}`.
  - parse drops step `{type:'boat'}`, drops flight missing `from`; coerces missing `cost` to 0; keeps `website`.
  - round-trip: `parseTravel(serializeTravel(doc))` deep-equals doc; `serializeTravel` ends with `\n`, 2-space indent.
  - `emptyStep('rental','s1')` → `{id:'s1',type:'rental',from:'',to:'',start:'',end:'',ref:'',cost:0}`; same check for each of 6 types.
  - add/update/delete trip; add/update/delete/move step (move first up = no-op; move down swaps).
  - `tripCost` sums step costs (general = 0); `totalCost` sums trips.
  - `nextTrip(doc,'2026-05-10')`: returns trip with start≤today≤end if any, else earliest start>today; undated never; none → undefined.
- [ ] **Step 2:** `pnpm --filter @kaihuman/formats test travel` → FAIL (module missing). (Check real package name in `packages/formats/package.json`.)
- [ ] **Step 3:** Implement `travel.ts` per Interfaces; validate per step type with a `REQUIRED: Record<StepType, string[]>` table.
- [ ] **Step 4:** Tests PASS; `pnpm run check` clean.
- [ ] **Step 5:** Commit `feat(formats): travel file type logic`.

### Task 2: Widget + wiring

**Files:**
- Create: `packages/ui/src/LifeOS/Organisms/Widgets/TravelWidget.tsx`, `TravelAddForm.tsx`, `apps/console/src/travel-widget.test.tsx`
- Modify: `packages/core/src/stores/layout.store.ts`, `packages/ui/src/LifeOS/Layouts/MainApp.tsx`, `apps/console/src/pages/Dashboard.tsx`, `packages/ui/src/LifeOS/Organisms/NewFileWizard.tsx`, `apps/console/src/lib/kb-skills.ts`

**Interfaces — Consumes:** Task 1 exports. **Produces:** `TravelWidget({content, mode, onChange})`, `TravelAddForm({content, onChange, onDone?})` — mirror `BookmarksWidget.tsx` / `BookmarkAddForm.tsx` prop names exactly.

- [ ] **Step 1: Failing tests** (pattern: `apps/console/src/bookmarks-widget.test.tsx`):
  - SMALL with 2 trips, today mocked (`vi.setSystemTime`): shows next trip title, "in N days", "2 trips", total cost.
  - SMALL with `''` content: shows empty-state text.
  - FOCUS: add a `flight` step to a trip → `onChange` JSON has step with `type:'flight'`.
  - FOCUS: edit step cost input to `''` → stored `cost: 0`.
  - FOCUS: add custom field key/value, then delete step → `onChange` JSON reflects both.
  - AddForm: submit title → new trip in JSON.
- [ ] **Step 2:** Run `pnpm --filter <console pkg> test travel-widget` → FAIL.
- [ ] **Step 3:** Implement widget. SMALL/MOBILE_COLLAPSED = overview (spec). FOCUS/MOBILE_EXPANDED = `sortTrips` list, expandable trip, inline inputs for trip fields, custom fields (add/edit/remove), steps (type select to add via `emptyStep`, per-type inputs, ↑/↓ via `moveStep`, delete). Labels: car `tollStart`/`tollEnd` = "Toll from/until", hotel `from`/`to` = "Check-in/Check-out". Date inputs `type="date"`; flight/train/rental start/end `type="datetime-local"`-compatible text.
- [ ] **Step 4:** Register `.travel.json` in every file listed above (search each for `.bookmarks.json` and add alongside); NewFileWizard template default content = `serializeTravel(parseTravel(''))`, suggested name `<currentYear>.travel.json`; MainApp ADD mode renders `TravelAddForm`.
- [ ] **Step 5:** Tests PASS; `pnpm run build && pnpm run check && pnpm -r test` green.
- [ ] **Step 6:** Commit `feat(console): travel widget and file type wiring`.

### Task 3: Docs + review
- [ ] `doc/progress.md` dated entry (2026-11-04) at top; `doc/features.md` travel section; `doc/roadmap.md` tick if present; demo seed only if `demo.test.ts` requires all types.
- [ ] Whole-branch review vs spec (superpowers:requesting-code-review); fix findings; full check green.
- [ ] Commit `docs: travel file type`.
