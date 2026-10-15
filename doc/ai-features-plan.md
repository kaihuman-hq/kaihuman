# On-device AI features: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 21 features in `doc/ai-features.md` on a shared on-device AI layer in the browser extension.

**Architecture:** `apps/browser-extension/src/background/ai/` owns every model call (one queue, one cache, timeouts, fallbacks). The service worker precomputes new tab rankings and cards on an `ai` alarm. Interactive surfaces (capture box, palette, side panel) ask the worker through messages. Every feature degrades to plain rules.

**Tech Stack:** TypeScript (strict), Preact, Vitest with stubbed `LanguageModel`, `Summarizer`, `Translator` and `LanguageDetector` globals, `@kaihuman/formats`, `@kaihuman/palette`, Biome.

**Spec:** `doc/ai-features.md`

## Global constraints

- ESM, `.js` extensions in relative imports, `node:` built-ins. Runtime deps in the package that uses them, dev deps in the root. No new packages.
- Model output is always held to a JSON schema whose choices are enums of existing tags, files, streams, labels and ids (plus an explicit "new" where the spec allows), and is validated again after `JSON.parse` (D4).
- Repo writes only happen inside a save the user started (D5). Generated rankings, cards and labels live in `aiCache` only.
- The new tab page never calls the model: it reads `aiCache` through worker messages (D2). A ranking is recomputed at most hourly and never reorders an open page (D7).
- Sessions declare `en`, plus `de` when `detectLanguage` says German (D8). The supported set is en, de, es, fr, ja.
- Interactive timeouts:
  - capture classify: 4,000 ms
  - save enrichment (read later, knowledge base, bookmark draft): 8,000 ms
  - palette summarize and ask: 30,000 ms
  - background jobs: no timeout, `background` priority
- Input caps:
  - page text: 12,000 characters
  - PR body: 1,000 characters
  - tabs: 40
  - rerank candidates: 20
  - braindumps per digest: 30
  - inbox rows per label batch: 20
- Done means zero Biome warnings on changed files, `tsc -b` clean, and `pnpm -r test` green. `doc/progress.md` gets a dated entry per phase.
- Tests for model-backed code stub the globals as `src/background/work/suggest.test.ts` does, and cover: the schema sent, the validated answer, refusal of an invalid answer, the fallback without the model, and a cache hit.

## Review focus

1. **A slow or hung model.** Saves and the capture box must never wait longer than their timeout; they fall back to the rule result. Tests: `promptJson` timeout (Task 1), read-later save with a hanging Summarizer still commits (Task 8).
2. **The model goes missing mid-session** (`downloading` or `unavailable` after an update). There is no thrown error in the UI, and cached results still show. Test: `promptJson` returns null without calling `create` (Task 1); the NT renders rule order with an empty cache (Task 10).
3. **A cached ranking names items that no longer exist** (a deleted bookmark, a read item, a removed stream). Unknown ids are dropped and missing ones appended in rule order. Test: `applyRanking` (Task 10).
4. **German input.** It classifies with `languages: ['en','de']` and still validates against the enums. Test: Task 6.
5. **Oversized input** (a long article, 100 tabs, 500 bookmarks). It is capped before prompting, per the input caps above. Tests: Task 19 (12,000 characters), Task 22 (40 tabs), Task 10 (20 candidates).

---

## Phase 0: AI layer

### Task 1: Model access, queue and cache

**Files:**
- Create: `src/background/ai/model.ts`, `queue.ts`, `cache.ts`, and `model.test.ts`, `queue.test.ts`, `cache.test.ts` beside them
- Modify: `src/background/work/suggest.ts` (move the `LanguageModel` types, `modelAvailability` and `downloadModel` into `model.ts`, and re-export them from `suggest.ts` so `WorkSettings.tsx` keeps working)

(Paths in this plan are relative to `apps/browser-extension/` unless they start with `packages/` or `doc/`.)

**Interfaces (produces):**
```ts
export type Capability = 'prompt' | 'summarizer' | 'translator' | 'detector';
export type ModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
export type Priority = 'interactive' | 'background';
export function availability(cap: Capability): Promise<ModelAvailability>;
export function promptJson<T>(task: {
  system: string; input: string; schema: object;
  validate: (raw: unknown) => T | null;
  priority?: Priority; timeoutMs?: number; languages?: string[];
}): Promise<T | null>;
export function summarize(text: string, opts: {
  type: 'tldr' | 'key-points' | 'headline'; length?: 'short' | 'medium' | 'long';
  context?: string; priority?: Priority; timeoutMs?: number;
}): Promise<string | null>;
export function detectLanguage(text: string): Promise<string | null>; // BCP-47 base, e.g. 'de'
export function translate(text: string, source: string, target: string): Promise<string | null>;
export function downloadModel(onProgress: (fraction: number) => void): Promise<void>; // moved
// queue.ts
export function enqueue<T>(run: () => Promise<T>, priority: Priority): Promise<T>;
// cache.ts
export const AI_CACHE_KEY = 'aiCache';
export function hashKey(...parts: string[]): string; // FNV-1a, 8 hex chars
export function cached<T>(key: string, ttlMs: number, compute: () => Promise<T | null>): Promise<T | null>;
export function peek<T>(key: string): Promise<T | undefined>;
export function put<T>(key: string, value: T, ttlMs: number): Promise<void>;
```

- [ ] **Step 1: Write the failing tests.**
  - `model.test.ts`:
    - `promptJson sends the schema and returns the validated answer`: `prompts[0].options.responseConstraint` equals the schema, and the result equals `validate(JSON.parse(answer))`.
    - `promptJson returns null for invalid JSON or a refused answer`: `validate` returns null, so the result is null.
    - `promptJson returns null without calling create when not available`: availability `'downloading'` leads to `create` not being called.
    - `promptJson gives up after timeoutMs`: a prompt that never resolves with `timeoutMs: 50` gives `null` within 100 ms.
    - `promptJson destroys its session`: `destroyed.length === 1`.
    - `summarize and translate return null without their globals`.
    - `detectLanguage returns the top language`: the stub returns `[{detectedLanguage:'de', confidence:0.9}]`, giving `'de'`.
  - `queue.test.ts`:
    - `runs one job at a time`: the second starts after the first resolves.
    - `interactive jobs jump queued background jobs`: order `[bg1, inter, bg2]` when enqueued as bg1, bg2, inter while bg1 runs.
  - `cache.test.ts`:
    - `cached computes once within ttl`: compute is called once across two calls.
    - `cached recomputes after ttl`, using fake timers.
    - `null results are not cached`.
    - `keeps at most 500 entries, dropping the oldest`.
    - `hashKey is stable`: `hashKey('a','b') === hashKey('a','b')`, and it differs from `hashKey('ab')`.
- [ ] **Step 2:** Run `pnpm --filter browser-extension exec vitest run src/background/ai`. Expected: FAIL, modules missing.
- [ ] **Step 3: Implement.**
  - `promptJson` runs inside `enqueue`: it creates a fresh session with `initialPrompts: [{role:'system', content: system}]` and `expectedInputs/expectedOutputs` languages (default `['en']`), prompts with `responseConstraint`, then destroys the session in `finally`.
  - The timeout races the whole job with `Promise.race`.
  - The cache is stored as `Record<key, {value, at, ttl}>` under `AI_CACHE_KEY`.
- [ ] **Step 4:** Move `suggest.ts` onto `promptJson`, keeping its exported names. Run `vitest run src/background src/sidepanel`. Expected: PASS, including the existing `suggest.test.ts`, `messages.test.ts` and `Suggestions.test.tsx`.
- [ ] **Step 5:** Commit: `AI layer: one model queue, cache and timeouts`.

### Task 2: AI settings and the precompute pipeline

**Files:**
- Create: `src/background/ai/settings.ts`, `precompute.ts`, `precompute.test.ts`
- Modify:
  - `src/background/service-worker.ts` (an `ai` alarm every 60 min; call `runPrecompute` after `syncToday` and after the work cycle)
  - `src/sidepanel/WorkSettings.tsx` (rename the section to **On-device AI**, add the group switches)
  - `src/sidepanel/Suggestions.test.tsx`

**Interfaces (produces):**
```ts
export const AI_SETTINGS_KEY = 'aiSettings';
export interface InboxLabel { name: string; hint: string; mute: boolean }
export interface AiSettings {
  newTab: boolean; enrichment: boolean; sidePanel: boolean; palette: boolean; tabs: boolean; // default true
  inboxLabels: InboxLabel[]; // max 6, default []
}
export function readAiSettings(): Promise<AiSettings>;
export function writeAiSettings(patch: Partial<AiSettings>): Promise<void>;
// precompute.ts
export interface PrecomputeJob { id: string; group: keyof Omit<AiSettings, 'inboxLabels'>; run: () => Promise<void> }
export function registerPrecompute(job: PrecomputeJob): void;
export function runPrecompute(reason: 'alarm' | 'today' | 'work'): Promise<void>; // serial, skips disabled groups, swallows job errors
```

- [ ] **Step 1: Failing tests** in `precompute.test.ts`:
  - `runs registered jobs in order`.
  - `skips jobs whose group is off`.
  - `one failing job does not stop the rest`.
  - `a second runPrecompute while one runs is coalesced`: the run count is 1 for two overlapping calls.
- [ ] **Step 2:** Run `vitest run src/background/ai/precompute.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `settings.ts`: merge the stored value over defaults.
  - The `ai` alarm is created only when missing, like `ensureWorkAlarm`.
  - Settings UI: one checkbox per group with these labels:
    - "Rank and summarize on the new tab page"
    - "Suggest when saving"
    - "Triage in the side panel"
    - "Palette actions"
    - "Tidy tabs"
- [ ] **Step 4:** Add a test to `Suggestions.test.tsx`: `stores the AI group switches`. Turning off `newTab` writes `aiSettings.newTab === false`. Run `vitest run src/sidepanel src/background/ai`. Expected: PASS.
- [ ] **Step 5:** Commit: `AI layer: settings and background precompute`.

## Phase 1: ranking without the model

### Task 3: F1 frecency bookmarks

**Files:**
- Create: `src/background/ranking.ts`, `ranking.test.ts`
- Modify: `src/background/bookmarks.ts:160-196`, where `recentlyUsedBookmarks` and `startPageBookmarks` gain `now = new Date()`

**Interfaces (produces):** `export function frecency(b: Pick<Bookmark,'useCount'|'lastUsedAt'>, now: Date): number`. The score is `(1 + useCount) * 2 ** (-daysSince(lastUsedAt) / 14)`, and `0` when `lastUsedAt` is empty.

- [ ] **Step 1: Failing tests:**
  - `30 uses 10 days ago outrank 1 use today`.
  - `1 use today outranks 5 uses 60 days ago`.
  - `never used scores 0 and sorts last`.
  - `recentlyUsedBookmarks orders by frecency, ties by lastUsedAt then file order`.
- [ ] **Step 2:** Run `vitest run src/background/ranking.test.ts src/background/service-worker.bookmarks.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement `frecency`, and sort in `recentlyUsedBookmarks` with it.
- [ ] **Step 4:** Run the same command. Expected: PASS. Update existing bookmark tests only where they asserted pure recency.
- [ ] **Step 5:** Commit: `New tab: rank recently used bookmarks by frecency`.

### Task 4: F5 inbox urgency

**Files:** Modify `src/background/work/inbox.ts` (`buildInbox` sorting) and `inbox.test.ts`.

**Interfaces (produces):** `export function urgencyOf(row: InboxRow, now: Date): number`. It takes the maximum over the row's reasons:

| Reason | Score |
|---|---|
| `failing` | 60 |
| `review-requested` with `updatedAt` 24 h or more ago | 50 |
| `changes-requested` | 40 |
| `review-requested` under 24 h | 35 |
| `ready-to-merge` | 30 |
| `assigned` | 25 |
| any thread reason | 20 |
| otherwise | 0 |

`buildInbox(snapshot, file, dismissed, now = new Date())` sorts `waiting` and `activity` by urgency, then newest.

- [ ] **Step 1: Failing tests:**
  - `failing CI outranks an old review request, which outranks changes requested`.
  - `a fresh review request ranks below changes requested`.
  - `equal urgency keeps newest first`.
  - `WorkCard shows the most urgent first`: an update to `StartPage.test.tsx`.
- [ ] **Step 2:** Run `vitest run src/background/work/inbox.test.ts src/newtab`. Expected: FAIL.
- [ ] **Step 3:** Implement `urgencyOf` and the sort.
- [ ] **Step 4:** Run the same command, plus `src/sidepanel`. Expected: PASS (fix side panel order assertions that assumed newest-first).
- [ ] **Step 5:** Commit: `Inbox: order by urgency`.

### Task 5: F4a doing, F6 resurfaced ideas, trackers at risk

**Files:**
- Modify: `src/background/today.ts:303-446` (`TodaySummary`, `buildToday`), `src/newtab/Today.tsx` (new `Resurface` component; `Trackers` shows at-risk first), `src/newtab/StartPage.tsx` (renders `Resurface` after `Braindumps`)
- Test: `src/background/today.test.ts`, `src/newtab/StartPage.test.tsx`

**Interfaces (produces):**
- `TodaySummary.overdue[]` gains `dueDate: string`.
- `inProgress[]` gains `dueDate?: string`.
- `habits[]` gains `atRisk: boolean` (`streak > 0 && !checkedToday`).
- New `resurface: { slug: string; title: string; status: 'seed' | 'exploring'; lastActivity: string; path: string }[]` (at most 2).
- `export function Resurface(props: { today: TodaySummary; onOpenIdea: (title: string) => void })`. `onOpenIdea` opens the start page palette with `>id <title>`, through the same function the search box uses for Enter.

- [ ] **Step 1: Failing tests:**
  - `overdue sorted by most days overdue`.
  - `in progress sorted by milestone due date, none last`.
  - `habits at risk come first`.
  - `resurfaces up to 2 seed or exploring ideas idle for 30 days, oldest first`. `lastActivity` is the maximum of `updated`, `created` and log `at`. Ideas idle 29 days, and committed ones, are excluded.
  - StartPage: `shows Resurface and opens the palette with >id`.
- [ ] **Step 2:** Run `vitest run src/background/today.test.ts src/newtab`. Expected: FAIL.
- [ ] **Step 3:** Implement. Ideas come from the `ideaSlugOf(path)` files already in `cache.files`, parsed with `parseIdea`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `New tab: due-date order, resurfaced ideas, streaks at risk first`.

## Phase 2: enrichment at save time

### Task 6: F9 one capture box

**Files:**
- Create: `src/background/ai/capture.ts`, `capture.test.ts`
- Modify:
  - `src/background/service-worker.ts`:
    - message `CAPTURE_CLASSIFY`
    - `ADD_TODO` accepts `path?`, `milestoneId?`, `tags?`
    - new `ADD_EVENT`, using `addEventEntry` from `@kaihuman/formats`
  - `src/types.ts` (message union and fields), `src/newtab/StartPage.tsx`, `StartPage.test.tsx`

**Interfaces (produces):**
```ts
export type CaptureGuess =
  | { kind: 'note'; text: string }
  | { kind: 'todo'; text: string; tags: string[]; path: string; milestoneId?: string }
  | { kind: 'log'; description: string; tags: string[] }
  | { kind: 'event'; name: string; type: string; startDate: string; endDate: string; path: string };
export interface CaptureContext {
  today: string; // YYYY-MM-DD
  todoFiles: { path: string; milestones: { id: string; name: string }[] }[];
  eventFiles: string[]; tags: string[];
}
export function captureContext(cache: TodayCache, now: Date): CaptureContext;
export function classifyCapture(text: string, ctx: CaptureContext): Promise<CaptureGuess[]>; // up to 3, best first; [] without model
```
The start page adds `CaptureKind` `'auto'`, the default when `availability('prompt') === 'available'`.

- [ ] **Step 1: Failing tests:**
  - `capture.test.ts`:
    - `schema limits path and milestone to known files`: the schema `path.enum` equals the todo and event file paths.
    - `refuses unknown paths and invalid dates`.
    - `resolves 'Lunch with Anna Fri 12' to an event on the coming Friday`: the stub answers `startDate` as that date; validation accepts a date within 366 days.
    - `German text declares de` (Review focus 4): `create` gets `languages ['en','de']` when the detector says `de`.
    - `returns [] without the model`.
  - StartPage:
    - `Auto shows a preview and saves the top guess`: the preview text is `Todo → work.todos.md · #bank`, and Enter sends `ADD_TODO` with `path: 'work.todos.md', tags: ['bank']`.
    - `Tab cycles guesses`.
    - `falls back to Note when nothing comes back within 4 s`.
- [ ] **Step 2:** Run `vitest run src/background/ai/capture.test.ts src/newtab`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The prompt includes today's date and weekday.
  - Tags are an enum of known tags; `#tags` typed in the text are kept by rules.
  - The worker answers `CAPTURE_CLASSIFY` within 4,000 ms.
  - The start page asks 400 ms after the last keystroke.
- [ ] **Step 4:** Run the same command, plus `src/background/service-worker*.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `New tab: one capture box that files notes, todos, log entries and events`.

### Task 7: F10 bookmark draft and F12 duplicate warning

**Files:**
- Create: `src/background/ai/bookmark-draft.ts`, `bookmark-draft.test.ts`
- Modify:
  - `src/background/service-worker.ts`: message `BOOKMARK_DRAFT` returns `{ draft, duplicates }`
  - `src/components/BookmarkPageForm.tsx`: prefill, plus a duplicate line with "Open existing"
  - `src/content/index.ts`: the palette `bookmark-page` prompt `initial` reads a draft requested when the palette opens
  - `packages/formats/src/streams.ts`: export the URL normalisation `findItemByUrl` uses, as `normalizeUrl`, if not already exported

**Interfaces (produces):**
```ts
export function tidyTitle(title: string, url: string): string; // rule: drops " - Site", " | Site", " · GitHub", leading "(12) "
export interface BookmarkDraftResult { title: string; tags: string[]; environment: Environment | null }
export function draftBookmark(page: { url: string; title: string }, knownTags: string[]): Promise<BookmarkDraftResult>;
export interface Duplicate { kind: 'bookmark' | 'read-later' | 'stream'; title: string; url: string; exact: boolean }
export function findDuplicates(page: { url: string; title: string }, data: {
  bookmarks: Bookmark[]; readLater: ReadItLaterItem[]; streams: StreamsFile | null;
}): Promise<Duplicate[]>;
```

- [ ] **Step 1: Failing tests:**
  - `tidyTitle strips site suffixes and counters`: `'(3) Fix auth race by x · Pull Request #12 · acme/web · GitHub'` becomes `'Fix auth race by x · Pull Request #12 · acme/web'`.
  - `draft tags come only from known tags`.
  - `environment uses the rule first, then the model`.
  - `exact duplicate found by normalised URL without the model`.
  - `near duplicate confirmed by the model from the top 5 title matches on the same host`.
  - BookmarkPageForm: `prefills the draft and shows Open existing`.
- [ ] **Step 2:** Run `vitest run src/background/ai/bookmark-draft.test.ts src/components`. Expected: FAIL.
- [ ] **Step 3:** Implement. The model title is held to `maxLength: 60`. The draft is answered within 8,000 ms; on timeout it returns the rule draft.
- [ ] **Step 4:** Run the same command, plus `pnpm --filter @kaihuman/formats exec vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit: `Bookmarks: tidy title, tag and environment suggestions, duplicate warning`.

### Task 8: F11 read later and knowledge base enrichment

**Files:**
- Create: `src/background/ai/enrich.ts`, `enrich.test.ts`
- Modify:
  - `packages/formats/src/read-later.ts`: item gains `summary?: string`, `readMinutes?: number`
  - `packages/formats/src/entries.ts:124`: `addReadLaterEntry(content, page: { url; title; summary?; tags?; readMinutes? }, id, now)`
  - `src/background/kb-capture.ts:45`: `buildRawNote` gains optional `summary?: string[]` and `type?: CaptureType`, written as `type: how-to` and a `summary:` YAML list
  - `src/background/service-worker.ts:1868, :1890, :1922`: `READ_LATER_ADD` accepts `text?`; `PIN_ARTICLE` and `SAVE_SELECTION` enrich before writing; alt text for up to 3 localized images
  - `src/content/index.ts` and `src/app.tsx`: send `text` from `extractArticle()` / `EXTRACT_ARTICLE` with `READ_LATER_ADD`
  - `src/newtab/Today.tsx` `ReadLater`: shows the summary and "N min"

**Interfaces (produces):**
```ts
export type CaptureType = 'snippet' | 'decision' | 'how-to' | 'reference' | 'idea';
export function readMinutes(text: string): number; // ceil(words / 230), min 1
export function enrichReadLater(page: { url: string; title: string; text: string }, knownTags: string[]): Promise<{ summary?: string; tags: string[] }>;
export function enrichCapture(note: { title: string; text: string; images: Blob[] }, knownTags: string[]): Promise<{ summary?: string[]; type?: CaptureType; tags: string[]; alts: string[] }>;
```

- [ ] **Step 1: Failing tests:**
  - `enrich.test.ts`:
    - `readMinutes is ceil(words/230)`.
    - `tldr from the Summarizer, tags from known tags only`.
    - `capture type and key points held to the schema`.
    - `alt text for at most 3 images`.
    - `everything optional when the model is missing`.
  - Formats:
    - `addReadLaterEntry keeps summary, tags and readMinutes`.
    - `buildRawNote writes type and summary list and keeps processed: false`.
  - Worker: `READ_LATER_ADD commits after 8 s even if the Summarizer hangs` (Review focus 1).
- [ ] **Step 2:** Run `vitest run src/background/ai/enrich.test.ts src/background` and `pnpm --filter @kaihuman/formats exec vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement. Text is capped at 12,000 characters before summarizing. Enrichment is wrapped in the 8,000 ms timeout.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit: `Read later and knowledge base: summaries, types and tags when saving`.

## Phase 3: model ranking and cards (precomputed)

### Task 9: Shared work context

**Files:** Create `src/background/ai/context.ts`, `context.test.ts`.

**Interfaces (produces):**
```ts
export interface WorkContext {
  streams: { name: string; repos: string[]; hosts: string[]; labels: string[]; titles: string[] }[]; // open items, titles <= 5 per stream
  todos: string[]; todoTags: string[]; eventsToday: string[];
  waiting: string[]; redCi: string[]; openIdeas: string[];
}
export function buildWorkContext(input: {
  today: TodaySummary; todayCache: TodayCache; streams: StreamsFile | null; snapshot: WorkSnapshot | undefined;
}): WorkContext;
export function contextText(ctx: WorkContext): string; // compact prompt block, <= 2,000 characters
```

- [ ] **Step 1: Failing tests:**
  - `collects repos and hosts per stream from open items`.
  - `waiting is the top 3 by urgency`.
  - `contextText stays under 2,000 characters for 50 streams`.
- [ ] **Step 2–4:** Run `vitest run src/background/ai/context.test.ts`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `AI layer: shared work context`.

### Task 10: F2 likely next and F3 read later for today

**Files:**
- Create: `src/background/ai/rank.ts`, `rank.test.ts`
- Modify:
  - `src/background/service-worker.ts`: register precompute jobs `rank:likely` and `rank:readLater` (group `newTab`); `GET_TODAY` attaches `ranking`
  - `src/background/today.ts`: `TodaySummary.readLater` is ordered by the cached ranking; it gains `readLaterReasons: Record<string, string>` and `archive: string[]` (ids)
  - `src/newtab/StartPage.tsx`: "Recently used" becomes "Likely next", in cached order; `Today.tsx` `ReadLater` shows reasons and "Archive?" (sends `READ_LATER_DONE`)

**Interfaces (produces):**
```ts
export interface Ranking { ids: string[]; reasons: Record<string, string>; computedAt: number }
export function rerank(task: string, items: { id: string; text: string }[], ctx: WorkContext): Promise<Ranking | null>; // <= 20 items; schema {ranked:[{id enum, reason maxLength 80}]}
export function applyRanking<T extends { id: string }>(items: T[], ranking: Ranking | undefined): T[]; // drops unknown ids, appends missing in rule order
export function streamBoost(b: Bookmark, ctx: WorkContext): number; // 1 when host or owner/repo matches a stream, 0.5 when a tag matches a stream label, else 0
export function likelyNext(bookmarks: Bookmark[], ctx: WorkContext, now: Date): Promise<Ranking>; // top 20 by frecency*(1+boost), model reorders top 12
export function readLaterForToday(items: ReadItLaterItem[], ctx: WorkContext): Promise<Ranking>; // rule: oldest first
export function archiveCandidates(items: ReadItLaterItem[], now: Date): string[]; // status new and createdAt older than 60 days
```

- [ ] **Step 1: Failing tests:**
  - `rerank refuses duplicate or unknown ids`.
  - `applyRanking drops missing and appends new items` (Review focus 3).
  - `likelyNext boosts stream matches without the model`.
  - `likelyNext sends at most 12 to the model` (Review focus 5).
  - `readLaterForToday falls back to oldest first`.
  - `archiveCandidates picks unread older than 60 days`.
  - NT: `renders rule order with an empty cache` (Review focus 2), `shows reasons and Archive`.
- [ ] **Step 2:** Run `vitest run src/background/ai/rank.test.ts src/newtab`. Expected: FAIL.
- [ ] **Step 3:** Implement. Jobs store `rank:likely` and `rank:readLater` with `put(key, ranking, 60 * 60 * 1000)`; `GET_TODAY` reads them with `peek`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `New tab: likely-next bookmarks and read later for today`.

### Task 11: F4b focus line and F7 morning brief

**Files:**
- Create: `src/background/ai/brief.ts`, `brief.test.ts`
- Modify: `src/background/service-worker.ts` (precompute jobs `card:focus` hourly and `card:brief` daily; message `GET_AI_CARDS`), `src/newtab/Today.tsx` (`FocusLine`, `MorningBrief`), `StartPage.tsx`, and its test

**Interfaces (produces):**
```ts
export function focusLine(ctx: WorkContext): Promise<string | null>;       // schema {focus: string maxLength 120}
export function morningBrief(ctx: WorkContext): Promise<string[] | null>;  // schema {sentences: string[3], each maxLength 160}
// GET_AI_CARDS -> { focus?: string; brief?: string[]; briefDate?: string }
```

- [ ] **Step 1: Failing tests:**
  - `brief is generated once per date after 05:00`: no job before 05:00, and one call across two runs on the same date.
  - `focus refused when empty or over 120 characters`.
  - NT: `brief card collapses and stays dismissed for the day` (stored in `briefDismissed: 'YYYY-MM-DD'`); `no focus line without a cached focus`.
- [ ] **Step 2–4:** Run `vitest run src/background/ai/brief.test.ts src/newtab`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `New tab: focus line and morning brief`.

### Task 12: F8 braindump digest

**Files:**
- Create: `src/background/ai/digest.ts`, `digest.test.ts`
- Modify:
  - `src/background/service-worker.ts`: message `BRAINDUMP_DIGEST`, interactive, cached by `hashKey` of ids
  - `src/newtab/Today.tsx` `Braindumps`: a "Digest" button and themes list
  - `StartPage.tsx`: "Make a todo" fills the capture box (kind `todo`, text `theme.todo`); "Make an idea" sends `SAVE_IDEA` with the theme title and `status: 'seed'`, using the payload shape `saveIdea` (`service-worker.ts:1375`) expects

**Interfaces (produces):**
```ts
export interface Theme { title: string; ids: string[]; todo: string }
export function digestBraindumps(dumps: { id: string; title: string; text: string }[]): Promise<Theme[] | null>; // <= 30 in, <= 5 themes; ids enum of input ids
```

- [ ] **Step 1: Failing tests:**
  - `themes reference only given ids`.
  - `caps input at 30 braindumps`.
  - `null without the model, and no Digest button shown` (NT).
  - `Make a todo fills the capture box`.
- [ ] **Step 2–4:** Run `vitest run src/background/ai/digest.test.ts src/newtab`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `New tab: braindump digest into todos and ideas`.

## Phase 4: side panel

### Task 13: F15a reasons on suggestions

**Files:** Modify `src/background/work/suggest.ts` (schema `reason` maxLength 80; `Suggestion.reason?: string`; the rule reason is `Most items from <owner/repo> are here`), `src/sidepanel/ThisTabBar.tsx`, `InboxSection.tsx`, and tests.

- [ ] **Step 1: Failing tests:**
  - `parseModelAnswer keeps a reason of 80 characters or fewer and drops a longer one`.
  - Panel: `shows the reason under Suggested`.
- [ ] **Step 2–4:** Run `vitest run src/background/work/suggest.test.ts src/sidepanel`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Suggestions: say why`.

### Task 14: F15b grow a stream

**Files:**
- Create: `src/background/ai/grow.ts`, `grow.test.ts`, `src/sidepanel/RelatedPicker.tsx`, `RelatedPicker.test.tsx`
- Modify: `src/sidepanel/StreamSection.tsx` (⋯ "Find related"), `SidePanel.tsx` (opens the picker after a stream is created)

**Interfaces (produces):**
```ts
export interface Candidate { id: string; title: string; url: string }
export function relatedTo(stream: { name: string; titles: string[]; repos: string[]; hosts: string[] }, candidates: Candidate[]): Promise<string[]>; // <= 8 ids; rule: same repo or host
```
`RelatedPicker` gets its candidates from `chrome.tabs.query({ currentWindow: true })` (capped at 40), plus inbox rows, minus already pinned URLs. It shows checkboxes and "Add N", which sends one `WORK_OPS` with `pin` ops.

- [ ] **Step 1: Failing tests:**
  - `relatedTo returns only candidate ids, at most 8`.
  - `rule fallback matches repo and host`.
  - Picker: `adds the checked items to the stream in one message`; `excludes already pinned URLs`.
- [ ] **Step 2–4:** Run `vitest run src/background/ai/grow.test.ts src/sidepanel`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Side panel: find related tabs and items for a stream`.

### Task 15: F14 inbox labels in your own words

**Files:**
- Create: `src/background/ai/labels.ts`, `labels.test.ts`
- Modify:
  - `src/background/work/inbox.ts`: `buildInbox(..., muted: Set<string> = new Set())` drops muted keys from `waiting` and `activity`; `workSummary` takes the same parameter
  - `src/background/work/poller.ts`: the badge passes the muted keys from the cache
  - `src/background/service-worker.ts`: precompute job `inbox:labels` (group `sidePanel`) after the work cycle
  - `src/sidepanel/InboxSection.tsx`: a label chip, and filter chips above the sections
  - `src/sidepanel/WorkSettings.tsx`: a label editor, up to 6 labels, each with name, hint and a mute checkbox

**Interfaces (produces):**
```ts
export function labelRows(rows: { key: string; title: string; repo: string; reasons: string[] }[], labels: InboxLabel[]): Promise<Record<string, string>>; // batches of 20; schema per row label enum of names + 'none'
export const INBOX_LABELS_CACHE = 'inbox:labels'; // value Record<key, labelName>, cached per key@updatedAt and labels hash
export function mutedKeys(assigned: Record<string, string>, labels: InboxLabel[]): Set<string>;
```

- [ ] **Step 1: Failing tests:**
  - `labels only from the user's list`.
  - `batches of 20 rows`.
  - `a muted label removes rows from waiting and the badge count`.
  - `no labels when the list is empty, and no model call`.
  - Panel: `filter chips show only that label's rows`.
- [ ] **Step 2–4:** Run `vitest run src/background/ai/labels.test.ts src/background/work src/sidepanel`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Inbox: labels in your own words, filters and mute`.

### Task 16: F13 PR and issue TL;DR

**Files:**
- Modify:
  - `src/background/work/graphql.ts:25-36`: add `bodyText` to a fragment used by the five waiting searches only (not `mine`); `toStatus` maps it to `body` (first 1,000 characters)
  - `src/background/work/types.ts:29`: `WorkItemStatus.body?: string`
  - `src/background/service-worker.ts`: precompute job `inbox:tldr`, summarizing `tldr` short per waiting row, cached as `tldr:<key>@<updatedAt>`; message `GET_TLDRS` returns `Record<key, string>`
  - `src/sidepanel/InboxSection.tsx`: one muted line under the title
- Test: `graphql.test.ts`, `src/background/ai/tldr.test.ts` (new, for the job function `summarizeWaiting(rows): Promise<Record<string,string>>` in `src/background/ai/tldr.ts`), `src/sidepanel/InboxSection.test.tsx`

- [ ] **Step 1: Failing tests:**
  - `waiting searches request bodyText, mine does not`.
  - `body is cut to 1,000 characters`.
  - `summarizeWaiting skips rows without body and reuses the cache for an unchanged updatedAt`.
  - Panel: `shows the TL;DR line`.
- [ ] **Step 2–4:** Run `vitest run src/background/work/graphql.test.ts src/background/ai/tldr.test.ts src/sidepanel`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Inbox: one-line TL;DR for waiting PRs and issues`.

### Task 17: F16 standup and week review

**Files:**
- Create: `src/background/ai/review.ts`, `review.test.ts`, `src/sidepanel/ReviewDraft.tsx`, `ReviewDraft.test.tsx`
- Modify: `src/background/service-worker.ts` (message `REVIEW_DRAFT { range }`; action log content is read through the existing GitHub file read used by `addActionLog`), `src/sidepanel/SidePanel.tsx` (header ⋯ menu: "Standup", "Week review")

**Interfaces (produces):**
```ts
export type ReviewRange = 'standup' | 'week'; // standup: since yesterday 00:00; week: Monday 00:00 to now
export interface ReviewSources { log: ActionLogEntry[]; done: { title: string; url: string }[]; merged: { title: string; url: string }[]; minutes: { name: string; minutes: number }[] }
export function reviewSources(range: ReviewRange, now: Date, data: { logs: string[]; streams: StreamsFile | null; snapshot?: WorkSnapshot; todayCache: TodayCache }): ReviewSources;
export function bulletsOf(s: ReviewSources): string; // the rule fallback
export function draftReview(s: ReviewSources, range: ReviewRange): Promise<string | null>; // prose markdown, at most 8 bullets
```
`ReviewDraft` shows an editable textarea. "Save to action log" sends `ADD_ACTION_LOG { description, tags: ['standup'] or ['review'] }`.

- [ ] **Step 1: Failing tests:**
  - `standup range starts yesterday 00:00, week range starts Monday 00:00` (fixed clock).
  - `merged comes from pinned statuses merged in range, done from stream doneAt`.
  - `bulletsOf lists every source without the model`.
  - ReviewDraft: `saves the edited text with #standup`.
- [ ] **Step 2–4:** Run `vitest run src/background/ai/review.test.ts src/sidepanel`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Side panel: standup and week review drafts`.

## Phase 5: palette

### Task 18: F17 on-device translation

**Files:** Modify `src/background/service-worker.ts:992` (`translate`) and `src/sidepanel/WorkSettings.tsx` (a "Download English ↔ German" button, which calls `Translator.create` from the click for `en→de` and `de→en`). Test: `src/background/service-worker.test.ts`.

**Interfaces (produces):** `translateOnDevice(text: string, targets: string[]): Promise<Translation[]>` in `src/background/ai/translate.ts`.
- `EN-US` maps to `en`, `DE` to `de`.
- `detectedSource` is the upper-cased detector result.
- It throws `On-device translation needs the language pack: download it in the side panel settings, or set a DeepL key.` when a pair is not available.

- [ ] **Step 1: Failing tests:**
  - `uses DeepL when a key is set`.
  - `falls back to on-device when DeepL fails offline`.
  - `uses on-device without a key`.
  - `explains a missing language pack`.
- [ ] **Step 2–4:** Run `vitest run src/background/service-worker.test.ts src/background/ai/translate.test.ts`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Palette: translate on-device without a DeepL key`.

### Task 19: F18 summarize and ask this page

**Files:** Modify `src/content/index.ts` (actions `summarize-page`, and `ask-page` with prompt step `Question`; both use `children` to list result lines as copyable actions plus "Save to knowledge base") and `src/background/service-worker.ts` (messages `PAGE_SUMMARIZE { title, url, text }` and `PAGE_ASK { title, url, text, question }`, both interactive with a 30,000 ms timeout). Create `src/background/ai/page.ts` and `page.test.ts`.

**Interfaces (produces):**
```ts
export const PAGE_TEXT_LIMIT = 12_000;
export function pageSummary(text: string): Promise<string[] | null>;            // key-points medium, split into lines
export function askPage(text: string, question: string): Promise<string | null>; // promptJson schema {answer: string maxLength 600}
```

- [ ] **Step 1: Failing tests:**
  - `text is cut to 12,000 characters` (Review focus 5).
  - `summary lines come from key points`.
  - `ask answers from the page text`.
  - `null without the model, shown as "The on-device model is not available."`.
  - Content: `Save to knowledge base sends CAPTURE_KNOWLEDGE with the summary`.
- [ ] **Step 2–4:** Run `vitest run src/background/ai/page.test.ts src/content`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Palette: summarize and ask this page`.

### Task 20: F19 plain-language actions

**Files:**
- Create: `src/background/ai/intent.ts`, `intent.test.ts`
- Modify:
  - `packages/palette/src/command-palette.ts:162`: `PaletteHandlers.ask?: (query: string) => Promise<ModeItem | null>`. It is called 300 ms after typing stops, when the query has no mode prefix, is not a URL, and has at least 3 words. It renders as the first row. Desktop leaves it unset.
  - `packages/palette/src/command-palette.test.ts`
  - `src/content/index.ts` and `src/newtab/StartPage.tsx`: provide `ask`
  - `src/background/service-worker.ts`: messages `INTENT_PARSE { text, url, title }` returns `{ intent, preview }`; `INTENT_RUN { intent, url, title }` dispatches to the existing handlers

**Interfaces (produces):**
```ts
export type Intent =
  | { action: 'add-todo'; text: string; path: string; tags: string[] }
  | { action: 'log'; description: string; tags: string[] }
  | { action: 'add-event'; name: string; startDate: string; endDate: string; path: string }
  | { action: 'pin-to-stream'; streamId: string }
  | { action: 'read-later' }
  | { action: 'open-bookmark'; bookmarkId: string }
  | { action: 'timer'; path: string; toggle: 'start' | 'stop' }
  | { action: 'check-in'; path: string };
export interface IntentContext { today: string; todoFiles: string[]; eventFiles: string[]; habits: { path: string; name: string }[]; timers: { path: string; name: string; running: boolean }[]; streams: { id: string; name: string }[]; bookmarks: { id: string; title: string }[] } // bookmarks: top 50 by frecency
export function parseIntent(text: string, ctx: IntentContext): Promise<Intent | null>;
export function previewOf(intent: Intent, ctx: IntentContext): string; // e.g. "Log: 30m on payments #payments"
```

- [ ] **Step 1: Failing tests:**
  - `intent.test.ts`:
    - `ids and paths only from the context`.
    - `'log 30m on payments' becomes a log intent`.
    - `refuses a timer stop for a timer that is not running`.
    - `previewOf names the target`.
  - Palette: `ask row appears for 3+ words without a prefix and not for URLs`; `Enter on the ask row runs its action`.
- [ ] **Step 2:** Run `vitest run src/background/ai/intent.test.ts src/content` and `pnpm --filter @kaihuman/palette exec vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement. The schema is a `oneOf` keyed by `action`; validation re-checks every id and path against the context.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit: `Palette: plain-language actions`.

### Task 21: F20 meaning search for notes and ideas

**Files:** Create `src/palette/notes-mode.ts` and `notes-mode.test.ts` (extension-only mode `>n`). Modify `src/content/index.ts` and `src/newtab/StartPage.tsx` (append the mode) and `src/background/service-worker.ts` (messages `LIST_NOTES`, returning braindumps and ideas from `todayCache`, and `RERANK { query, items }`, which uses `rerank` from Task 10).

**Deviation from the spec, to confirm:** `>id` stays as is, and `>n` covers braindumps and ideas. The knowledge base inbox (`.kh/raw`) is not cached locally: caching it would put full article text into `todayCache`.

**Interfaces (produces):**
```ts
export function keywordCandidates(query: string, notes: { id: string; text: string }[], limit = 30): { id: string; text: string }[]; // word overlap
export function notesMode(send: (m: object) => Promise<any>): PaletteMode; // prefix 'n', submit: keyword top 30 -> RERANK top 8 -> ModeItems opening the file
```

- [ ] **Step 1: Failing tests:**
  - `keywordCandidates ranks by word overlap`.
  - `submit re-ranks to 8 with the model and keeps keyword order without it`.
- [ ] **Step 2–4:** Run `vitest run src/palette`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Palette: search notes and ideas by meaning`.

## Phase 6: tabs

### Task 22: F21 tidy open tabs

**Files:**
- Create: `src/background/ai/tidy.ts`, `tidy.test.ts`, `src/components/TidyTabs.tsx`, `TidyTabs.test.tsx`
- Modify:
  - `src/background/service-worker.ts`: message `TIDY_TABS` queries the sender's window, or the current window for the popup
  - `src/app.tsx`: popup action "Tidy open tabs" opens the `TidyTabs` view
  - `src/content/index.ts`: palette action with `children`, one per proposal, each with "Save as pinned-tab group", "Pin all to stream…" and "Close these tabs"

**Interfaces (produces):**
```ts
export interface TabProposal { name: string; tabIds: number[] }
export function proposeGroups(tabs: { id: number; title: string; url: string }[]): Promise<TabProposal[]>; // <= 40 tabs in, <= 4 proposals; rule: same host with 3+ tabs
```
`TidyTabs` shows one proposal at a time with these actions:
- "Save as pinned-tab group": the existing save message the pinned-tab panel uses.
- "Pin all to stream…": stream choices, then `WORK_OPS`.
- "Close these tabs": `chrome.tabs.remove`, only on this click.
- "Skip".

- [ ] **Step 1: Failing tests:**
  - `caps input at 40 tabs` (Review focus 5).
  - `proposals only reference given tab ids`.
  - `rule groups 3+ tabs per host without the model`.
  - TidyTabs: `nothing closes without Close these tabs`; `Pin all sends one WORK_OPS`.
- [ ] **Step 2–4:** Run `vitest run src/background/ai/tidy.test.ts src/components`: FAIL, then implement, then PASS.
- [ ] **Step 5:** Commit: `Tabs: tidy open tabs into groups or streams`.

---

## Execution

**Branch.** Everything goes to `claude/cool-darwin-65w5u1` (kaihuman-hq/kaihuman#158).

**Order.** Phase 0 runs first and sequentially. Within a phase, lanes run in parallel, each a subagent in its own worktree. The orchestrator merges the lanes and resolves `service-worker.ts` and `types.ts` conflicts.

| Phase | Parallel lanes (then sequential) | Model |
|---|---|---|
| 0 | Task 1, then Task 2 | Opus |
| 1 | Task 3 ‖ Task 4, then Task 5 (shares `StartPage.test.tsx` with Task 4) | Sonnet |
| 2 | Task 6 ‖ Task 7 ‖ Task 8 | Opus (6), Sonnet (7, 8) |
| 3 | Task 9, then Task 10 ‖ Task 11 ‖ Task 12 | Sonnet |
| 4 | Task 13 ‖ Task 15 ‖ Task 16 ‖ Task 17, then Task 14 (after 13, shares the panel) | Sonnet |
| 5 | Task 18 ‖ Task 19 ‖ Task 20 ‖ Task 21 | Sonnet (18, 19, 21), Opus (20) |
| 6 | Task 22 | Sonnet |

**Per task (subagent).** The subagent receives only its task section, the Global constraints and the Review focus lines it owns. It reads only the files listed. It runs only the task's commands. It reports in 10 lines or fewer: files changed, commands run with pass/fail, and questions.

**Per phase (orchestrator):**
1. Merge the lanes.
2. Run `pnpm -r test`, `tsc -b` in `apps/browser-extension`, and Biome on changed files.
3. Run one Opus review of the phase diff against this plan.
4. For phases 1–6, take one screenshot of the built page (`node scratchpad shot.mjs` with a stubbed model).
5. Add a `doc/progress.md` entry (plus `doc/features.md` and `packages/docspack/docs/40-browser-extension.md` for new features), then commit and push.
