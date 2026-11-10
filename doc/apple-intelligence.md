# Siri, Spotlight and Apple Intelligence in the mobile app

Status: November 2026. Written for `apps/mobile` (Expo SDK 58, React Native 0.88, iOS app + `KaihumanWidgets` extension built by `plugins/with-kaihuman-widgets.ts`). There is no Swift compiler on the Linux CI: Swift sources are checked by source-text tests (`src/ios-widget.test.ts`, `src/targets.test.ts`) and must be compiled on a Mac or EAS.

## What ships now

| Surface | How | Files |
| --- | --- | --- |
| App Shortcuts with Siri phrases (9 of the 10 allowed) | `AppShortcutsProvider` in the main app target | `targets/ios-app-intents/AppShortcuts.swift` |
| Add todo / note / log, search | `openAppWhenRun` intents that write `pending-url`; the app routes it | `TodoIntents.swift`, `SiriIntents.swift` |
| What's next, what's due today, complete a todo, capture to inbox | Answered from the App Group snapshot, no app launch | `TodoIntents.swift`, `SiriIntents.swift`, `CaptureTodoIntent.swift` |
| Todos and notes as entities | `KaihumanItemEntity` (`AppEntity`, `IndexedEntity` on iOS 18), `EntityStringQuery`, `OpenItemIntent` | `targets/ios-app-intents/ItemEntity.swift` |
| Spotlight search results | Core Spotlight items from `spotlight-items.json`; a tap opens the item's deep link | `modules/kaihuman-shared/ios/*`, `src/spotlight/*` |
| Action button | Any App Shortcut or iOS 18 control (Focus timer is the natural pick) | — |
| Smart capture, scan to entry, weekly review (Foundation Models, Vision, Visual Intelligence) | `kaihuman-intelligence` Expo module (generic model + OCR bridge); logic and fallbacks in TS | `modules/kaihuman-intelligence/*`, `src/intelligence/*`, `SmartCaptureModel.swift`, `VisualIntelligenceIntents.swift` |
| Writing Tools | Free: RN `TextInput` is a `UITextView`/`UITextField`, so iOS 18.1+ offers Writing Tools in every editor | — |

Phrases (each must contain the app name): "Add a todo in kaihuman", "Add a note in kaihuman", "Log in kaihuman", "Search kaihuman", "What's due today in kaihuman", "What's next in kaihuman", "Complete ‹todo› in kaihuman", "Add to kaihuman inbox", "Open ‹item› in kaihuman".

### Search adapter

`src/spotlight/spotlight.ts` takes any docs with `{ id, kind, title, subtitle?, path }`, which is the shape of `SearchDoc` in `src/search`. `bootstrap.ts` refreshes the shared search index (`src/search/shared-index.ts`) 5 s after content changes and publishes todos and notes (max 500) to the App Group file and Core Spotlight. A different search backend plugs in by changing the `refresh` function given to `startSpotlightSync`.

## Limits

- **"Search kaihuman for X" in one sentence is not possible.** An App Shortcut phrase can hold only `AppEntity`/`AppEnum` parameters, not free text. Siri asks "What do you want to find?" next. The same rule applies to note and todo text, so capture intents open the app (except "Add to inbox", which asks for the text and saves in the background).
- **Entity phrases ("Open ‹item›")** match only values Siri knows. The system reads them through `suggestedEntities()` at registration time; refreshing them needs `KaihumanAppShortcuts.updateAppShortcutParameters()` from app code. The app target has no Swift that runs at launch (the `@main` is Expo's), so this is not called yet. Siri still resolves by asking and then running `entities(matching:)`.
- **IndexedEntity vs Core Spotlight.** `CSSearchableIndex.indexAppEntities` must run with the entity type in scope, i.e. in the app target. Our code that runs at launch is the Expo module (a separate pod), which cannot see that type. So Spotlight uses classic `CSSearchableItem`s (indexed by the module). The `IndexedEntity` conformance is there for when the app target gets launch-time code.
- **10 App Shortcuts per app**; we use 9.
- **Expo:** App Intents only count in the main app target (the plugin adds `targets/ios-app-intents` there). The app's `@main` and AppDelegate belong to Expo. App delegate hooks go through `ExpoAppDelegateSubscriber` (`KaihumanAppDelegate.swift`, quick actions and Spotlight taps).
- **Apple Intelligence "personal context" Siri** (on-screen awareness, acting across apps from natural language) runs through App Intents and assistant schemas. Rollout was staged and region and device limited (iPhone 15 Pro and later). Do not promise it in product copy.

## Assistant schemas (App Intent domains)

iOS 18 added `@AppIntent(schema:)` / `@AppEntity(schema:)` macros for fixed domains (journal, mail, photos, files, books, browser, word processor, spreadsheets, presentations, …). They let Apple Intelligence Siri call an app without a fixed phrase.

- **Fits kaihuman:** `.journal` (`createEntry`, `search`) for log entries and notes. `.files` might fit for wiki pages.
- **Does not fit:** todos. As of iOS 18 there is no tasks/reminders domain for third parties.
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
