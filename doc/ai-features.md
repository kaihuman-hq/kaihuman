# On-device AI in the browser extension: design

Status: draft for review, 2026-10-15. Builds on stream and label suggestions (`apps/browser-extension/src/background/work/suggest.ts`), which already run on Chrome's built-in model.

## Goal

Use Chrome's on-device model, and plain ranking rules, to make the extension's existing data more useful: better ordering on the new tab page, enrichment when things are saved, triage in the side panel, and plain-language actions in the palette. Nothing leaves the browser. Every feature works, more simply, without the model.

## What Chrome 155 offers (researched 2026-10-15)

| API | Status in extensions | Used for |
|---|---|---|
| Prompt API (`LanguageModel`), JSON-schema `responseConstraint`, image input | stable (138; multimodal 148) | classify, rank, extract, short text |
| Summarizer (`tldr`, `key-points`, `headline`) | stable (138) | TL;DRs, capture summaries |
| Translator, Language Detector | stable (138) | `>t` without DeepL |
| Writer, Rewriter, Proofreader | trials ended, flag only | not used |
| Embeddings | proposal only | not used; meaning search re-ranks keyword hits instead |

Notes:
- The Prompt API runs in the extension's service worker; Google's own samples do this.
- Creating a session needs a user click only while the model is still downloadable.
- Languages are en, de, es, fr and ja.

## Design decisions (apply to every feature)

- **D1 One AI layer.** `src/background/ai/` holds all model access:
  - `model.ts`: availability per capability, `promptJson(system, input, schema, validate)`, `summarize()`, `translate()`, `detectLanguage()`.
  - `queue.ts`: one model call at a time, with priorities (interactive before background).
  - `cache.ts`: `aiCache` in `chrome.storage.local`, keyed by a hash of task, input and model availability, with a TTL and an LRU cap of 500 entries.

  `suggest.ts` moves onto this layer, keeping its behaviour.
- **D2 Precompute, don't block.** The new tab page opens constantly, so it never calls the model. A background `ai` alarm (hourly, and after a repo sync or work poll) computes rankings and cards into `aiCache`, and the page reads them. Interactive features (capture box, palette, side panel buttons) call the model directly, at high priority.
- **D3 Rules pick, the model re-ranks.** Every ranking starts from a deterministic score; the model only reorders a bounded top N (at most 20) and gives a one-line reason. Without the model, the rule order stands.
- **D4 Stay inside the user's vocabulary.** Tags, files, streams and labels are always JSON-schema enums of what exists, plus an explicit "new" choice, as stream suggestions already do. Answers are validated again after parsing.
- **D5 Repo writes only on user action.** Generated rankings, briefs and digests stay local. Enrichment is written only as part of a save the user started (capture frontmatter, read-later tags). Nothing is committed in the background, except inbox auto-filing, which already exists and is opt-in.
- **D6 One settings place.** The side panel's Settings → Suggestions becomes **On-device AI**: model state, download, and one switch per feature group. Defaults: on for anything that only suggests or reorders; off for anything that files or writes automatically.
- **D7 Stable pages.** A ranking is computed at most hourly and never reorders while a page is open.
- **D8 Languages.** Sessions declare `en`, plus `de` when the input is detected as German. Generated text is in the user's browser language when supported, else English.

## Features

IDs match the brainstorm. "Rules" is the fallback without the model.

### Phase 1 – ranking without the model (new tab page)

- **F1 Frecency bookmarks.** "Recently used" ranks by `useCount` and `lastUsedAt` with a decaying score (Firefox frecency), including unpushed `bookmarkUsage` deltas. Pinned bookmarks keep file order (the user's own order).
- **F5 Work card by urgency.** Score = failing CI on my PR > review requested older than 24h > changes requested > ready to merge > mentions > rest; ties go to the newest. One shared `urgencyOf(row)` in `inbox.ts`, also used by the side panel inbox order.
- **F4a Doing.** Overdue todos sorted by days overdue, in-progress todos by milestone due date, then file order.
- **F6 Ideas on the page.** A "Resurface" row shows up to 2 ideas with status `exploring` or `seed` and no activity for 30 days, oldest activity first, linking to `>id`. Data is already in `todayCache` (`today.ts:77`).
- **Trackers.** Habits whose streak is at risk today (checked yesterday, not yet today) come first.

### Phase 2 – enrichment at save time

- **F9 One capture box.** The start page capture box gets an **Auto** mode, the default when the model is available. The model returns a type plus fields, held to a schema:
  - `note`: text
  - `todo`: text, tags, target file (enum of todo files), milestone (enum)
  - `log`: description, tags
  - `event`: name, type, startDate, endDate (resolved against today)

  A preview line ("Todo → work.todos.md · #bank") shows before Enter saves. Tab cycles through the alternatives the model ranked. Rules: today's explicit Note, Todo and Log tabs stay.
- **F10 Bookmark save.** "Bookmark this page…" in the palette and the popup comes prefilled with:
  - a tidied title (site suffixes and counters removed; the model is asked for at most 60 characters)
  - tags from existing tags only
  - a prod/int/dev guess (the rule exists in `bookmarks.ts:208`; the model is used when the rule finds nothing)
- **F11 Read later and knowledge base enrichment.**
  - Read later: on `READ_LATER_ADD`, the worker extracts the page text (existing extractor), then Summarizer `tldr` short plus tags (enum of existing read-later tags). Stored as `summary` and `tags` on the item; the format gets an optional `summary` field. Read time is estimated from word count, with no model.
  - Knowledge base: `PIN_ARTICLE` and `SAVE_SELECTION` write `summary` (key points), `type` (snippet / decision / how-to / reference / idea) and `tags` into the `.kh/raw` frontmatter, with `processed: false` unchanged.
  - Images: alt text for up to 3 captured images via image input.
  - Rules: save as today.
- **F12 Duplicate warning.**
  - Exact: the normalised URL (reuse `itemRefOf` / streams URL normalisation) is already a bookmark, read-later item or stream item. Shown at once, no model.
  - Near: same host with a similar title; the model confirms it from the top 5 by title-word overlap.
  - Shown as a line under the save form with "Open existing".

### Phase 3 – model ranking and cards (new tab page, precomputed)

- **F2 Likely next.** "Recently used" becomes "Likely next". Candidates are the top 20 by F1 frecency, boosted when the bookmark's host or path matches repos or hosts in active streams, or tags match the labels in use. The model re-ranks the top 12 against the open streams and today's todos. Rules: F1 plus the stream-match boost.
- **F3 Read later "for today".** The 3 shown become the top 3 by relevance to active streams, open ideas and todo tags (model re-rank of up to 20 unread), with a one-line reason under each. Items older than 60 days and never opened get an "Archive?" action, which sets status `read`. Rules: oldest first, as today.
- **F4b Focus line.** One sentence above Doing: "Focus: …", picked from overdue todos, the waiting-on-you top 3, red CI in streams and today's events. Rules: no line.
- **F7 Morning brief.** A collapsible card on the first new tab after 05:00: three sentences covering events today, overdue todos, waiting on you, red CI and streaks at risk. Generated once per day. Rules: no card.
- **F8 Braindump digest.** In the Braindumps section, "Digest" groups the last 30 braindumps into up to 5 themes (titles and member ids, schema-checked). Each theme offers "Make a todo" (prefilled F9 capture) and "Make an idea" (`SAVE_IDEA` with the theme as seed). Computed when asked, then cached.

### Phase 4 – side panel

- **F15a Reasons.** Every suggestion (stream, inbox → stream, F3, F2) carries a short reason; the model returns `reason` (at most 80 characters) in the same call. Shown as the button's `title` and in a muted line.
- **F15b Grow a stream.** After a stream is created, or from its ⋯ menu ("Find related"), the panel lists up to 8 candidates: open tabs (the `tabs` permission), inbox rows and unfiled pins that the model assigns to it. Each candidate is checked, then "Add 3".
- **F14 Your own inbox labels.** Settings take up to 6 labels written in plain words ("bot noise: dependabot, renovate", "blocking a teammate"). Each inbox row gets at most one label from a schema enum. The inbox can be split by label (filter chips), and a label can be marked "mute", which hides its rows from Waiting on you and the badge. Rules: none, rows unlabelled.
- **F13 PR TL;DR.** The GraphQL query also fetches `bodyText` (first 1,000 characters), only for the waiting rows. Summarizer `tldr` short gives one line under the title. Computed in the background poll, cached by `updatedAt`.
- **F16 Standup and weekly review.** The panel's header ⋯ menu gets "Standup" (since yesterday) and "Week review" (Monday to now). Sources: action log entries, stream items done, merged PRs from `searches.mine`, and time tracking minutes. The draft is shown in place, editable; "Save to action log" writes it as one entry tagged `#standup` or `#review`. Rules: a bullet list of the same sources, without prose.

### Phase 5 – palette

- **F17 On-device translation.** `>t` uses Chrome's Translator when no DeepL key is set, or when it is offline; with a key, DeepL stays the default and Translator is the fallback. The source language comes from the Language Detector. Targets and history are unchanged.
- **F18 Summarize and ask this page.** New palette actions:
  - "Summarize this page": key points of the extracted text.
  - "Ask this page…": one prompt step, answered from the extracted text, which is cut to the context window via `measureContextUsage()`.

  Results show in the palette, with "Save to knowledge base" (`CAPTURE_KNOWLEDGE` with the summary).
- **F19 Plain-language actions.** Text typed in the palette that matches no mode prefix, and is not a URL, gets an "Ask kaihuman" row. The model maps it to one of a fixed action set, with typed arguments held to a schema: add todo, log time or entry, add event, pin to stream, read later, open bookmark, start/stop timer, check in a habit. The parsed action shows as a preview row; Enter runs it through the existing message types.
- **F20 Meaning search.** For `>id` (ideas) and a new `>n` (notes: braindumps and the KB inbox, from `todayCache`), keyword candidates are taken (top 30 by word overlap, synonyms ignored), then the model re-ranks them to the top 8 against the query. Rules: keyword order.

### Phase 6 – tabs

- **F21 Tidy tabs.** A popup and palette action, "Tidy open tabs", sends the titles and hosts of the current window's tabs to the model. It proposes up to 4 groups, one at a time: a name plus member tabs, each as "Save as pinned-tab group" or "Pin all to stream …". Nothing closes without a click on "Close these tabs".

## Order and why

1. **Phase 0, the AI layer (D1).** Everything depends on it; it is small and refactors `suggest.ts` under its existing tests.
2. **Phase 1.** No model, quick wins, and it creates the scores Phase 3 builds on.
3. **Phase 2.** Daily friction is removed, and enriched data (tags, summaries) makes Phase 3's ranking better.
4. **Phase 3.** Precomputed cards and rankings, using Phase 1's scores and Phase 2's data.
5. **Phase 4.** Side panel, which reuses the precompute pipeline (F13) and reasons (F15a).
6. **Phase 5.** Palette; F19 reuses Phase 2's capture schema.
7. **Phase 6.** Tabs, which reuses F15b's assignment prompt.

## Execution: parallel lanes, models, token budget

- **Branch and PRs.** The PR for the side panel work (kaihuman-hq/kaihuman#158) should merge first. Each phase then becomes one PR from `claude/cool-darwin-65w5u1`, restarted from `main`. That gives six reviewable PRs, not one with 8,000 lines.
- **Lanes inside a phase.** Features touching different files run as parallel subagents, each in its own git worktree. The orchestrator (this session) owns the shared files: `service-worker.ts` message routing, the `types.ts` message union, `manifest.ts`, and docs. It merges the lanes and runs the full checks once per phase.
  - Phase 1: F1 + F6 + trackers (`bookmarks.ts`, `today.ts`) ‖ F5 (`inbox.ts`) ‖ F4a (`today.ts` todo part, sequenced after lane 1).
  - Phase 2: F9 ‖ F10 + F12 ‖ F11.
  - Phase 3: F2 + F3 ‖ F4b + F7 ‖ F8.
  - Phase 4: F15 ‖ F14 ‖ F13 ‖ F16.
  - Phase 5: F17 ‖ F18 ‖ F19 ‖ F20.
  - Phase 6: F21 alone.
- **Models.**
  - Opus: Phase 0, F9, F19, and the review of each phase.
  - Sonnet: the other feature lanes, which have clear specs and existing patterns.
  - Haiku: docs updates, and mechanical test and fixture work.
- **Token budget.**
  - Each subagent gets the plan task text and file paths, not this conversation. It reads only the files named. It runs only its package's tests (`vitest run <paths>`), and reports in 10 lines or fewer: files changed, tests run, open questions.
  - The orchestrator runs `pnpm -r test`, `tsc -b` and Biome on changed files once per phase.
  - A screenshot check runs once per phase that changes UI.

## Testing

Every feature is tested with the model stubbed, as `suggest.test.ts` and `Suggestions.test.tsx` do:
- the schema sent
- the parsed and validated answer
- refusal of invalid answers
- the fallback without the model
- the cache hit on a second run

Ranking rules get pure unit tests with fixed clocks. Each UI change gets a component test and one screenshot check of the built page.

## Out of scope

- Cloud models.
- Embeddings until Chrome ships them.
- Writer, Rewriter and Proofreader until they are stable.
- Desktop palette changes.
- Mobile.

## Decisions I made that you may want to change

1. **One PR per phase**, after kaihuman-hq/kaihuman#158 merges (see Execution).
2. **F13 adds `bodyText` to the GitHub query** for waiting rows only: about 1 KB per row per poll.
3. **F17 keeps DeepL as the default when a key is set**, with Chrome's Translator as the fallback.
4. **F16 and F8 write to the repo only through their Save buttons.**
5. **F14 muted labels hide rows from the badge count.** Off until a label is marked mute.
