# Vacation research file kind — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** add `*.vacation.json` file kind (metadata + destination list) to formats, core and console UI.
**Architecture:** pure parse/serialize/helpers in `packages/formats/src/vacation.ts`; kind detection in core layout store; widget + forms in `packages/ui`, wired like Travel.
**Tech stack:** TypeScript strict, Vitest, Preact + signals, Tailwind, Biome.
**Spec:** `docs/superpowers/specs/2026-11-18-vacation-research-design.md`

## Global constraints
- Template everything on travel: `packages/formats/src/travel.ts`, `packages/ui/src/LifeOS/Organisms/Widgets/Travel*`, `apps/console/src/travel-widget.test.tsx`.
- Extension exactly `.vacation.json`. Default currency `'EUR'`. Status default `'idea'`.
- Zero Biome warnings, zero type errors, tests pass (`pnpm run check`, `pnpm -r test`).
- ESM, `.js` relative imports. No new dependencies.

## Review focus
1. Empty / invalid JSON / non-object → empty doc, no throw.
2. Unknown status → `'idea'`; rating outside 1-5 or non-integer → dropped; negative/NaN price → dropped.
3. Destination without `name` → dropped; missing id → generated.
4. Invalid ISO `from`/`to` → dropped (not kept as garbage).
5. Round trip `parse(serialize(doc))` deep-equals doc.

---

### Task 1: formats module
**Files:** create `packages/formats/src/vacation.ts`, `packages/formats/src/vacation.test.ts`; modify `packages/formats/src/index.ts` (export).
**Produces:**
- types from spec (`VacationDoc`, `Destination`, `DestinationStatus`), `DESTINATION_STATUSES: readonly DestinationStatus[]`
- `parseVacation(content: string): VacationDoc`, `serializeVacation(doc: VacationDoc): string` (`JSON.stringify(doc, null, 2)`)
- `emptyVacation(title?: string): VacationDoc`, `emptyDestination(): Destination`
- `addDestination(doc, d): VacationDoc`, `updateDestination(doc, id, patch: Partial<Omit<Destination,'id'>>): VacationDoc`, `deleteDestination(doc, id): VacationDoc`, `moveDestination(doc, id, delta: number): VacationDoc` (all immutable)
- `filterDestinations(list, status?: DestinationStatus): Destination[]`, `sortDestinations(list, by: 'price' | 'rating' | 'name'): Destination[]` (price asc, missing last; rating desc, missing last)
- `destinationMapsLink(d): string | undefined` (mapsUrl, else Google Maps search URL from encoded address, else undefined; reuse travel's `mapsLink` if it fits)
- Steps: TDD each Review Focus item + helpers → implement → `pnpm --filter @kaihuman/formats test` → commit `feat(formats): vacation research kind`.

### Task 2: core + UI + console wiring
**Consumes:** Task 1 exports from `@kaihuman/formats`.
**Files:** `packages/core/src/stores/layout.store.ts` (isVacation, ext branch, isWidget list); `packages/ui/src/LifeOS/Organisms/Widgets/VacationWidget.tsx`, `VacationAddForm.tsx`, `VacationEditForm.tsx` (+ meta file if travel has one); `packages/ui/src/LifeOS/Layouts/MainApp.tsx` (every place `isTravel`/`.travel.json` appears, mirror it); `packages/ui/src/LifeOS/Organisms/NewFileWizard.tsx` (entry: name "Vacation research", extension `.vacation.json`, suggestedFilename `vacation.vacation.json`, defaultContent `serializeVacation(emptyVacation('Vacation'))`); `apps/console/src/pages/Dashboard.tsx` (widget-file list); `apps/console/src/lib/kb-skills.ts` (file-kind row); test `apps/console/src/vacation-widget.test.tsx` mirroring travel-widget test (renders destinations, status filter hides dropped, add form adds item, edit form saves meta).
- Steps: write console test → fail → implement → `pnpm run check && pnpm -r test` → commit `feat(ui): vacation research widget`.

### Task 3: docs, version, PR
**Files:** `packages/docspack/docs/70-file-formats.md` (row + section), `packages/docspack/docs/31-console-widgets.md`, `doc/progress.md` (dated entry top), `doc/features.md`; `pnpm --filter @kaihuman/app-console version:bump` → commit `version.json`, `src/version.ts`.
- Steps: edit docs → bump → `pnpm run check` → commit `docs: vacation research kind` → push → open PR.
