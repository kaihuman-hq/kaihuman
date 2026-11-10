# Apple platform proposals for kaihuman

Status: 2026-11-10. Research only, no app code. Read with `doc/apple-intelligence.md` (what ships now). Facts come from web research on 2026-11-10. Items marked *(unverified)* rest on one secondary source. Check them against Apple's docs before you build.

Baseline: the iOS 27 release (2026-09-14) shipped Siri AI (a chatbot Siri with personal data). iOS 27.2 is current, and iOS 27.3 is in beta.

## 1. Top 3 Apple Intelligence features

### 1.1 Offline smart capture (Foundation Models)
- **User:** says or types "pay rent friday #money". The app saves a todo with a due date and a tag, or a log, budget or habit entry. This also works from the Siri "Add to inbox" intent with no app launch.
- **API:** `FoundationModels` `LanguageModelSession`, with `@Generable struct ParsedCapture` (a typed result with a kind field). Tool calling looks up existing tags and milestones.
- **Expo:** good. `@react-native-ai/apple` (Callstack, Vercel AI SDK, autolinked, needs a dev build). Or a small Swift wrapper in `kaihuman-shared`, which the App Intent extension can also call.
- **Effort:** M. iOS 26+ on Apple Intelligence devices. Check `availability` and fall back to today's plain capture.
- **Why:** capture is the core loop. It is private and free, and it works offline. The 4096-token window is enough for one capture.

### 1.2 Siri AI app skills + App Schemas (todos, notes, log)
- **User:** asks "what did I log about the trip last week, and add a todo to book the hotel". Siri reads kaihuman entities and calls its actions with no fixed phrase. It can also act on the item that is on screen.
- **API:** App Schemas (WWDC26 session 240): `.reminders` for todos and `.journal` for log and notes *(unverified domain list)*. iOS 27.3 Siri AI app skills (SKILL.md files) and the View Annotations API (maps on-screen views to entities). `AppIntentsTesting` for tests.
- **Expo:** good. Intents and entities already live in the main app target (`targets/ios-app-intents`). Still needed: app-target launch code for `indexAppEntities`, and views annotated on the React Native side, which is hard.
- **Effort:** M (schemas and skills). L with on-screen annotation.
- **Why:** removes the 10-phrase limit and the "no free text" limit in `apple-intelligence.md`. Apps can't ship this to users before spring 2027, and the EU is excluded, so build it now on the beta.

### 1.3 Scan to entry (Visual Intelligence + document recognition)
- **User:** photographs a receipt and gets a budget line. Or screenshots a flight or event and gets a travel item or todo. Or points the camera at a book and gets a consumption-log entry.
- **API:** `RecognizeDocumentsRequest` (Vision, iOS 26) to read the receipt, then Foundation Models `@Generable` to get amount, merchant and category. Visual Intelligence `IntentValueQuery` with `SemanticContentDescriptor` makes kaihuman show up in the system camera and screenshot sheet.
- **Expo:** fair. Needs a native module for Vision. `IntentValueQuery` goes in the app target next to the existing intents.
- **Effort:** M. Visual Intelligence needs an iPhone 15 Pro or later. Plain Vision works on more devices.
- **Why:** budget, travel and consumption are tedious to type. This unlocks those modules on mobile.

## 2. Bleeding-edge proposals

### 2.1 "Ask my life": weekly review on Private Cloud Compute
- **User:** taps Weekly review. The app writes a summary of done todos, habit streaks, time tracked, spend and open loops to `logs/` as markdown that the user can edit.
- **API:** Foundation Models on iOS 27, using the PCC server model through the same session API. Dynamic Profiles switch between on-device and PCC. A `LanguageModel` provider (Claude or Gemini) is the fallback.
- **Expo:** fair. Needs a Swift module. Check whether `@react-native-ai/apple` exposes PCC *(unverified)*.
- **Effort:** L. **iOS:** 27+.
- **Risk:** medium. PCC is free only for Small Business Program members with fewer than 2M first-time downloads. The server context size is unverified. Tokens must be budgeted per module.

### 2.2 kaihuman knowledge base as a Siri / agent tool (MCP)
- **User:** asks Siri or any agent "what do my notes say about X". `kb-mcp` answers from the `.kh` knowledge base.
- **API:** MCP to App Intents. Beta code in iOS 26.1 and macOS 26.1 had it. iOS 27 MCP support is *(unverified)*. Siri AI app skills (SKILL.md) are the confirmed path.
- **Expo:** not applicable on Mac (Mac target or the `desktop-palette` Tauri app). On iOS, reuse the intents from 1.2.
- **Effort:** M. **iOS/macOS:** 27.3+ (app skills). MCP has no announced version.
- **Risk:** high. Apple has not confirmed MCP, and shipping is gated to spring 2027.

### 2.3 Focus session everywhere
- **User:** starts Focus on a todo. The timer shows in the Dynamic Island (also in landscape on iOS 27), the Mac menu bar, the CarPlay Dashboard and the Watch Smart Stack. A Watch control or the Action button stops it.
- **API:** the existing Focus Live Activity, which these surfaces show automatically (iOS 26 CarPlay and macOS 26). watchOS 26 controls run their action on the iPhone.
- **Expo:** good. Mostly free, plus small layout work for the new families. The Watch control needs a watch target (`@bacons/apple-targets`, experimental).
- **Effort:** S (Live Activity layouts). M (Watch control). **iOS:** 26+ (landscape island needs 27).
- **Risk:** low. CarPlay shows the activity without interaction. Watch targets in Expo are experimental.

### 2.4 Health and mood into habits and the action log
- **User:** a habit such as "walk 8k" or "meds" ticks itself from HealthKit. A State of Mind entry, or a Journaling Suggestion (place, workout, photo), becomes a log entry with one tap.
- **API:** HealthKit `HKStateOfMind` (iOS 18), the Medications API (`HKMedicationDoseEvent`, iOS 26), workouts and steps. `JournalingSuggestions` picker (iOS 17.2+).
- **Expo:** fair. Needs a native module for each: a HealthKit package or our own, plus a Swift wrapper for the JournalingSuggestions picker. Also needs entitlements.
- **Effort:** M. **iOS:** 26+ (medications). 18+ for the rest.
- **Risk:** medium. App Review looks closely at health data. Health data must stay on the device, so writing it to GitHub needs explicit user consent. iOS 27.3 redesigns the Health app.

### 2.5 Context-aware Home Screen: Focus filters + extra-large widget + Shortcuts model
- **User:** the "Work" Focus shows only work todos and boards in the app and widgets. A new extra-large widget shows a full Today dashboard. A nightly Shortcut sends the day's log to "Use Model" and saves the digest with an intent.
- **API:** `SetFocusFilterIntent`, the iOS 27 extra-large widget size, and the Shortcuts "Use Model" action (on-device, PCC or extension model) chained with our typed App Intents.
- **Expo:** good. All Swift in the existing widget and intents targets, and the snapshot gets a filter field.
- **Effort:** S–M. **iOS:** 27+ (extra-large). 16+ for Focus filters.
- **Risk:** medium. Forums report Focus filter regressions in iOS 26.4 and macOS 26.5. Only some apps get the extra-large size *(unverified)*.

## Sources

- Foundation Models: [TN3193 context window](https://developer.apple.com/tutorials/data/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window.md), [WWDC26 241](https://developer.apple.com/videos/play/wwdc2026/241/), [FM + PCC terms](https://developer.apple.com/foundation-models-framework/), [Daring Fireball on the PCC cap](https://daringfireball.net/linked/2026/06/13/pcc-severely-limited-third-party-developers), [Callstack RN package](https://www.callstack.com/blog/on-device-apple-llm-support-comes-to-react-native), [Callstack after WWDC26](https://www.callstack.com/blog/on-device-ai-after-wwdc-2026-whats-new)
- Siri and App Intents: [WWDC26 iOS guide](https://developer.apple.com/wwdc26/guides/ios/), [WWDC26 240 App Schemas](https://developer.apple.com/videos/play/wwdc2026/240/), [9to5Mac Siri AI app skills](https://9to5mac.com/2026/11/03/developers-can-now-create-advanced-app-skills-for-siri-ai/), [ppc.land ship date](https://ppc.land/apple-opens-siri-ai-to-all-developers-but-apps-cant-ship-it-until-spring/), [MacRumors Siri chatbot](https://www.macrumors.com/guide/siri-chatbot/), [createwithswift schemas](https://www.createwithswift.com/creating-app-intents-using-assistant-schemas/)
- Visual: [VisualIntelligence docs](https://developer.apple.com/documentation/visualintelligence), [RecognizeDocumentsRequest](https://developer.apple.com/documentation/vision/recognizedocumentsrequest), [WWDC25 272](https://developer.apple.com/videos/play/wwdc2025/272)
- Surfaces: [WWDC25 216 widgets/controls](https://developer.apple.com/videos/play/wwdc2025/216/), [MacRumors iOS 27 changes](https://www.macrumors.com/2026/06/10/apple-lists-250-changes-ios-27-and-more/), [Macworld iOS 27.3 beta](https://www.macworld.com/article/3270011/ios-27-3-beta-is-out-now-heres-what-could-be-coming-to-your-iphone-soon.html), [expo-apple-targets](https://github.com/EvanBacon/expo-apple-targets)
- Health and more: [WWDC24 State of Mind](https://developer.apple.com/wwdc24/10109), [WWDC25 321 Medications](https://developer.apple.com/videos/play/wwdc2025/321/), [JournalingSuggestions updates](https://developer.apple.com/documentation/updates/journalingsuggestions), [Shortcuts Use Model](https://support.apple.com/guide/shortcuts/tpg3vrvwmclv), [9to5Mac MCP beta code](https://9to5mac.com/2025/09/22/macos-tahoe-26-1-beta-1-mcp-integration/), [Focus filter forum regression](https://developer.apple.com/forums/thread/826766)
