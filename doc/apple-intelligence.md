# Siri, Spotlight and Apple Intelligence in the mobile app

Status: 10 November 2026. Written for `apps/mobile` (Expo SDK 58, React Native 0.88, iOS app + `KaihumanWidgets` extension built by `plugins/with-kaihuman-widgets.ts`). There is no Swift compiler on the Linux CI: Swift sources are checked by source-text tests (`src/ios-widget.test.ts`, `src/targets.test.ts`) and must be compiled on a Mac or EAS.

## What ships now

| Surface | How | Files |
| --- | --- | --- |
| App Shortcuts with Siri phrases (9 of the 10 allowed) | `AppShortcutsProvider` in the main app target | `targets/ios-app-intents/AppShortcuts.swift` |
| Add todo / note / log, search | `openAppWhenRun` intents that write `pending-url`; the app routes it | `TodoIntents.swift`, `SiriIntents.swift` |
| What's next, what's due today, complete a todo, capture to inbox | Answered from the App Group snapshot, no app launch | `TodoIntents.swift`, `SiriIntents.swift`, `CaptureTodoIntent.swift` |
| Todos, notes and log entries as entities | `KaihumanItemEntity` (`AppEntity`, `IndexedEntity` on iOS 18, optional `date`), `EntityStringQuery`, `OpenItemIntent` | `targets/ios-app-intents/ItemEntity.swift` |
| Open-ended queries ("what did I log about the trip last week") | `FindItemsIntent`: words, kind, from/to day; no app launch; not an App Shortcut | `FindItemsIntent.swift` |
| Launch-time Swift in the app target | `KaihumanAppLaunchHook.run()`: `updateAppShortcutParameters()` + `indexAppEntities` (iOS 18). Called by the pod at launch and after each Spotlight publish, by Objective-C class name | `AppLaunchHook.swift`, `modules/kaihuman-shared/ios/*` |
| App Schemas (opt-in) | `.journal` for notes and log, `.reminders` for todos; see below | `AssistantSchemas.swift`, `plugins/with-kaihuman-app-schemas.ts` |
| Siri AI app skills (draft) | One `SKILL.md` per area, naming the intents above | `targets/ios-app-intents/skills/{todos,notes,log}/SKILL.md` |
| Spotlight search results | Core Spotlight items from `spotlight-items.json`; a tap opens the item's deep link | `modules/kaihuman-shared/ios/*`, `src/spotlight/*` |
| Action button | Any App Shortcut or iOS 18 control (Focus timer is the natural pick) | — |
| Smart capture, scan to entry, weekly review (Foundation Models, Vision, Visual Intelligence) | `kaihuman-intelligence` Expo module (generic model + OCR bridge); logic and fallbacks in TS | `modules/kaihuman-intelligence/*`, `src/intelligence/*`, `SmartCaptureModel.swift`, `VisualIntelligenceIntents.swift` |
| Writing Tools | Free: RN `TextInput` is a `UITextView`/`UITextField`, so iOS 18.1+ offers Writing Tools in every editor | — |

Phrases (each must contain the app name): "Add a todo in kaihuman", "Add a note in kaihuman", "Log in kaihuman", "Search kaihuman", "What's due today in kaihuman", "What's next in kaihuman", "Complete ‹todo› in kaihuman", "Add to kaihuman inbox", "Open ‹item› in kaihuman".

### Search adapter

`src/spotlight/spotlight.ts` takes any docs with `{ id, kind, title, subtitle?, path }`, which is the shape of `SearchDoc` in `src/search`. `bootstrap.ts` refreshes the shared search index (`src/search/shared-index.ts`) 5 s after content changes and publishes todos and notes (max 500) to the App Group file and Core Spotlight. A different search backend plugs in by changing the `refresh` function given to `startSpotlightSync`.

## Limits

- **"Search kaihuman for X" in one sentence is not possible.** An App Shortcut phrase can hold only `AppEntity`/`AppEnum` parameters, not free text. Siri asks "What do you want to find?" next. The same rule applies to note and todo text, so capture intents open the app (except "Add to inbox", which asks for the text and saves in the background).
- **Entity phrases ("Open ‹item›")** match only values Siri knows. `KaihumanAppLaunchHook` calls `updateAppShortcutParameters()` at launch and after each Spotlight publish.
- **IndexedEntity and Core Spotlight both run.** `indexAppEntities` needs the entity type, so it runs in the app target (`KaihumanAppLaunchHook`); the pod finds that class with `NSClassFromString`. Classic `CSSearchableItem`s from the module stay. Spotlight may show an item twice; if it does on a device, drop the classic items for todos/notes/log.
- **No free text in phrases** still holds for App Shortcuts. Apple Intelligence Siri can fill `FindItemsIntent`'s `String`/`Date` parameters without a phrase.
- **View Annotations (on-screen entities): not done.** The API annotates SwiftUI views; React Native draws UIKit views from JS, so there is no SwiftUI view to annotate. A small later route: when a todo or note screen is open, set an `NSUserActivity` with `appEntityIdentifier` (iOS 18) through a module function and the app-target hook. That needs a new native function on both platforms, so it waits.
- **10 App Shortcuts per app**; we use 9.
- **Expo:** App Intents only count in the main app target (the plugin adds `targets/ios-app-intents` there). The app's `@main` and AppDelegate belong to Expo. App delegate hooks go through `ExpoAppDelegateSubscriber` (`KaihumanAppDelegate.swift`, quick actions and Spotlight taps).
- **Apple Intelligence "personal context" Siri** (on-screen awareness, acting across apps from natural language) runs through App Intents and assistant schemas. Rollout was staged and region and device limited (iPhone 15 Pro and later). Do not promise it in product copy.

## Assistant schemas (App Intent domains)

iOS 18 added `@AppIntent(schema:)` / `@AppEntity(schema:)` macros for fixed domains (journal, mail, photos, files, books, browser, word processor, spreadsheets, presentations, …). They let Apple Intelligence Siri call an app without a fixed phrase.

- **Fits kaihuman:** `.journal` (`createEntry`, `search`) for log entries and notes. `.files` might fit for wiki pages.
- **Todos:** iOS 18 has no tasks/reminders domain for third parties. iOS 27 reportedly adds `.reminders` (unverified); used behind its own flag.
### What ships (opt-in)

`targets/ios-app-intents/AssistantSchemas.swift`. A schema entity must have exactly the schema's properties, so `KaihumanItemEntity` does not conform itself; thin schema entities wrap its rows (same ids, same file).

| Flag (Swift compilation condition) | Plugin option | Schemas | Status |
| --- | --- | --- | --- |
| `KAIHUMAN_APP_SCHEMAS` | `journal` | `.journal.entry` (notes + log), `.journal.createEntry` (opens `kaihuman://quick-log?text=…` prefilled; user taps Save), `.journal.search` (in-app search) | iOS 18 API, shapes from Apple's sample, never compiled here |
| `KAIHUMAN_REMINDERS_SCHEMA` | `reminders` | `.reminders.reminder` (todos), `.reminders.createReminder` (saves to inbox like "Add to inbox"; due date dropped) | iOS 27, **names unverified** |

Enable after a Mac/EAS build passes: add `["./plugins/with-kaihuman-app-schemas.ts", { "journal": true }]` to `app.json` plugins. Without the plugin nothing in those blocks compiles, so a wrong guess cannot break the default build.

**Unverified API names** (marked `UNVERIFIED` in code): `.reminders.*` and its members; `CSSearchableIndex.deleteAppEntities(identifiedBy:ofType:)`; SKILL.md format, location and bundling (the plugin does not copy `skills/` into the app yet).

- **iOS 27 (WWDC 2026)** reportedly adds App Schemas sessions, `AppIntentsTesting`, and SiriKit deprecation in favour of App Intents. Before adopting, check the details against Apple's iOS 27 docs. Third-party reports differ.

## Foundation Models (on-device LLM)

`FoundationModels` (iOS 26+) is a Swift API to the on-device Apple Intelligence model. It offers guided generation (`@Generable`), tool calling and streaming. It is free and private, but it works only on Apple Intelligence devices with the feature switched on, and only in supported languages. Always check `SystemLanguageModel.default.availability`.

Good uses for kaihuman:
1. Split one spoken or typed capture into todo text, due date and tags (`@Generable struct ParsedTodo`). This runs fully offline and can sit inside `CaptureTodoIntent`.
2. Summarise a long note or action log for the knowledge card.
3. "What's due today": a short spoken digest instead of a list.

With Expo, this needs a small Expo module (Swift) that wraps `LanguageModelSession` and is gated with `@available(iOS 26, *)`, plus the Xcode 26+ SDK on EAS. JS calls it like `KaihumanShared`. React Native has no direct binding.

## Recommended next steps

1. Device QA of what shipped (see below).
2. Add a tiny app-target Swift hook (e.g. an `ExpoAppDelegateSubscriber` compiled into the app target by the plugin, not the pod) that calls `updateAppShortcutParameters()` and `indexAppEntities`. Then switch Spotlight to entity indexing.
3. Adopt `.journal.createEntry` for log entries once the app-target hook exists.
4. ~~Foundation Models capture parsing~~ shipped (see table). Next: wire the PCC model for the weekly review once the iOS 27 API is confirmed.
2. Mac build with the `journal` and then `reminders` plugin options; fix schema shapes; register the plugin in `app.json`.
3. Bundle `skills/*/SKILL.md` once Apple documents where app skills live.
4. Foundation Models capture parsing behind an availability check, with today's plain capture as the fallback.
5. Revisit iOS 27 App Schemas when the docs are stable.

## Needs testing on a device

- Quick actions: cold launch and warm (backgrounded) launch for each of the 5 items. Especially check that warm launch routes exactly once.
- Spotlight: items appear after a sync, and a tap opens the todo or note.
- Siri phrases: every phrase above, the follow-up question for Search, and "What's due today" without opening the app.
- Lock Screen: Due today (3 families), Habits circular/inline streak.
- Controls: Capture opens the capture tab. The Focus timer toggle starts a Live Activity on the next todo, stops it, and shows the right state after the app starts or ends a session itself.
- Action button bound to the Focus timer control and to an App Shortcut.
- Foundation Models: Add to inbox sheet with "pay rent friday #money" (todo, due, tag), "coffee 4.50" (budget line), "did my run" (habit check-in); same via Siri "Add to kaihuman inbox", then open the app and check the queue is filed. Turn Apple Intelligence off and check the plain capture.
- Scan: receipt, boarding pass, meter photo; Visual Intelligence camera and screenshot search show the four kaihuman suggestions (iPhone 15 Pro or later).
- Weekly review with and without Apple Intelligence; the file opens in the editor.
- `FindItemsIntent` in Shortcuts: words only, kind only, a date range (log days, todo due days), and nothing found.
- Launch hook: after a sync, items show in Spotlight's semantic search; "Open ‹item›" knows new titles; check for duplicate Spotlight rows.
- With the plugin flags on: "Log that …" opens the log sheet prefilled; "search my journal for …" opens search; iOS 27 "add a todo to …" lands in the inbox.
