# iOS and Android widgets — concepts

Status: v1 and v2 built (2026-11-06) — see §6.
Rendered widgets from CI: `apps/mobile/docs/widgets-real.png` (v1), `apps/mobile/docs/widgets-real-v2.png` (v2), `apps/mobile/docs/widgets-android.png` (Android, §10).
Mockups: `apps/mobile/docs/widgets.png` (source `apps/mobile/docs/widgets-mockup.html`).

## 1. Starting point

What exists in `apps/mobile/targets/ios-widget`:

- One widget, `InboxTodoWidget` (`StaticConfiguration`), families systemSmall/Medium/Large, accessoryCircular/Rectangular.
- `ToggleTodoIntent` marks a todo done in the widget process: edits the cached file content, pushes to GitHub with the shared token, queues to `pending-widget-mutations.json` when offline. The app replays the queue.
- `QuickCaptureTodoIntent` opens the app (`openAppWhenRun`) on the quick-todo sheet.
- Data: `widget-todos.json` in App Group `group.com.kaihuman.app`, built by `buildWidgetTodoSnapshot` in `packages/core/src/widget-sync.ts`. It holds `counts` (inbox, inProgress, backlog, doneToday), ranked open `items`, `upcomingMilestone`, and the raw `files` (`sha` + content) so the widget can commit a toggle without the app.
- Timeline: one entry, `.after(+30 min)` safety refresh; the app and intents call `reloadTimelines` on change.
- Gap: `TodoWidgetViews.swift` still uses the old theme (`#0A0A0F` + `#00FF00`), not Volt on Ink, and has no light, tinted or redacted variants.

Android Glance (`targets/android-widget`) reads the same snapshot. Every contract change below is additive JSON, so Glance keeps working and can adopt fields later.

## 2. Ranked concepts

Value: how often a user would glance or tap (1–5). Effort: S ≤ 1 day, M 2–4 days, L ≥ 1 week (Swift + snapshot + tests).

| # | Widget | Families | Interactions | Data needs | Value | Effort |
|---|--------|----------|--------------|------------|-------|--------|
| 1 | **Next up** (today/next todos) | systemSmall, systemMedium, systemLarge, accessoryRectangular, accessoryInline | Toggle done (exists); tap row → `kaihuman://board?item=<id>`; configurable source: column, tag, milestone | exists; add `dueDate`, `priority`, `column` per item | 5 | S (restyle + config) |
| 2 | **Quick capture** (todo, note, log, idea) | systemSmall (2×2), systemMedium (4 + knowledge), Control Center controls, Lock Screen circular, Action button | Buttons run `OpenIntent`s → `kaihuman://quick-todo\|note\|log\|idea\|knowledge` (deep links already exist) | none | 5 | S |
| 3 | **Weekly done ring / streak** | systemSmall, accessoryCircular (gauge), accessoryInline | Tap → analytics | add `stats.doneByDay[7]`, `weeklyGoal`, `streakDays` | 4 | S |
| 4 | **Inbox** (todo + knowledge inbox count, process shortcut) | systemSmall, accessoryCircular, accessoryInline | "Process" button → `kaihuman://knowledge` or inbox triage; count badge | add `counts.knowledgeInbox` (`.kh/raw/` files not yet ingested) | 4 | S |
| 5 | **Board column** (large, configurable) | systemLarge, systemMedium | Toggle; config: repo, column (inbox / in-progress / backlog), tag filter; "Start" button moves backlog → in-progress | needs `applyWidgetTodoMove` (status change, not only done) | 4 | M |
| 6 | **Milestone countdown** | systemSmall, accessoryRectangular, accessoryCircular | Tap → board filtered by milestone; config: pick milestone | `upcomingMilestone` exists; add `openCount`, `doneCount` per milestone and a `milestones[]` list for the picker | 3 | S |
| 7 | **Idea pipeline** | systemMedium, systemSmall | Tap stage → ideas filtered; one hot idea with "Log" button (opens quick-log on that idea) | new `ideas` section: counts by status, top 3 by heat (slug, title, level) | 3 | M |
| 8 | **Random wiki / knowledge card** | systemMedium, systemLarge | Tap → `kaihuman://files/<wiki path>`; "Next" button reshuffles (in-process intent, no network) | new `cards[]`: ~20 pre-picked wiki pages (title, 280-char excerpt, tags); rotated by timeline entries | 3 | M |
| 9 | **Focus Live Activity** (Dynamic Island) | Live Activity, Dynamic Island compact/expanded, StandBy | Start from a todo row or Shortcut; Done (toggles todo) and +5 min buttons; ends with optional log entry | ActivityKit attributes: todo id/text, start, planned end | 3 | L |
| 10 | **Habits / logs today** | systemSmall, accessoryRectangular | "Log" button per habit (in-process write to action log, like toggle) | new `logs` section: today's habit list + done state, file sha | 2 | L (new write path) |

Not proposed: bookmarks (low glance value on a phone, browser extension covers it), analytics charts beyond the ring (too dense for a widget; deep link instead).

## 3. Families and system surfaces

- **Home Screen** (small/medium/large): 1–5. Large is reserved for the board column (5) and wiki card (8).
- **Lock Screen and StandBy** (accessory*): inline "3 todos · 2 done today"; circular weekly ring or inbox count; rectangular next todo or milestone countdown. StandBy reuses systemSmall with `.widgetRenderingMode` handling (night mode turns it red-mono).
- **Control Center / Lock Screen controls / Action button** (iOS 18 `ControlWidget`): four `ControlWidgetButton`s — New todo, New note, New log, New idea. They also appear in the Action button picker for free. Effort S once the capture intents exist.
- **Live Activity**: only the focus session (9) earns it — a time-bound, user-started task. Countdown text uses `Text(timerInterval:)` so it needs no updates. v2.

## 4. Interactivity

- **Buttons/toggles** (`Button(intent:)`, `Toggle(isOn:intent:)`), iOS 17+: toggle done (exists), start (backlog → in-progress), wiki "next", habit log. Rule: an in-widget intent may only change cached data plus one GitHub `PUT`; anything needing input opens the app.
- **Configuration** (`AppIntentConfiguration` + `WidgetConfigurationIntent`): `TodoSourceEntity` (column / tag / milestone), `RepoEntity` (only if multi-repo lands; today the snapshot is single-repo), `MilestoneEntity`. Entities come from the snapshot via `EntityQuery`, so they work offline.
- **Free with App Intents**: add an `AppShortcutsProvider` with phrases ("Add a todo in kaihuman", "What's next in kaihuman", "Complete <todo>"). The same intents then show up in Siri, Spotlight, Shortcuts, the Action button and Control Center. Make `TodoEntity` an `IndexedEntity` so open todos are searchable in Spotlight.
- **Capture without opening the app** (v2): an intent with a `@Parameter text` (Siri / Shortcuts dictation) appends to `inbox.todos.md` using the cached file + sha, same path as the toggle. Widgets cannot host a text field, so the widget button still opens the app.
- **Smart Stack relevance**: donate `RelevantIntent`s / `TimelineEntryRelevance` — morning: Next up; milestone ≤ 3 days: countdown; inbox ≥ 5: Inbox; evening: weekly ring. Mark the focus Live Activity as high relevance while running.

## 5. Data and limits

### 5.1 Refresh strategy

- WidgetKit budget is roughly 40–70 reloads a day per widget; reloads triggered by the app in the foreground and by in-widget intents do not count.
- Keep event-driven reloads: app sync, app write, widget intent → `WidgetCenter.reloadTimelines(ofKind:)` for affected kinds only.
- Background: a `BGAppRefreshTask` (app side) pulls the repo tree about every 1–2 h and rebuilds the snapshot. The widget never fetches GitHub on its own except to push a mutation.
- Timelines: precomputed entries where time matters — midnight entry resets "done today" and the week ring; milestone countdown entry per day; wiki card rotates every 3 h from `cards[]`. Policy `.atEnd`.

### 5.2 Offline and stale

- `updatedAt` age > 6 h → show "Synced 3h ago" footer with a warning dot; > 48 h → dim content, keep data.
- No snapshot (fresh install / signed out) → placeholder "Open kaihuman to sign in", whole widget links to the app.
- Pending mutations (queued toggles) render as done with a small clock glyph until the app replays them.
- Empty states: "Inbox zero", "Nothing in progress — pick from backlog".

### 5.3 Lock Screen privacy

- Todo text, idea titles and wiki excerpts get `.privacySensitive()`; counts, rings and countdowns do not. With "Allow access when locked" off for widgets, iOS redacts sensitive views to bars.
- Add an in-app setting "Show todo text on Lock Screen" (default on) written to the snapshot as `privacy.lockScreenText`; when off, accessory widgets show counts only.
- `.enc` files never enter the snapshot (already true: only `*.todos.md` are read; keep it a tested rule).

### 5.4 Snapshot size

`files` carries whole `.todos.md` contents. Fine for todos, but do not add wiki pages or idea files there: new sections carry derived, trimmed data only. Target < 256 KB total; widget processes have ~30 MB memory.

## 6. Recommended sets

**v1** — built 2026-11-06:
1. **Next up** — restyle to Volt/Ink with light, dark, tinted and accessory variants; configurable source (column / tag / milestone).
2. **Quick capture** — 2×2 small, 4-wide medium, plus four Control Center controls.
3. **Weekly done ring** — small and accessoryCircular gauge, streak in inline.
4. **Inbox** — todo + knowledge inbox count with a Process button.
5. **App Shortcuts** — Siri/Spotlight/Action button phrases for add, next and complete (no UI, high reach).

**v2** — built 2026-11-06: board column (large, start/move), milestone countdown with picker, idea pipeline, wiki/knowledge card, focus Live Activity, background capture intent, habits.

Decisions taken while building v2:
- Habits use the existing `.habit.csv` format (`packages/formats/src/habits.ts`), not the action log. The snapshot carries `habits[]` (path, name, doneToday, streakDays) without file contents; a widget Log marks it pending and queues a `habit` mutation that the app commits with `checkIn`.
- Open question 4: Start and background capture commit directly with the cached file + SHA and queue on failure (like the toggle); habit check-ins always queue.
- The pending-mutation file is a union keyed by `kind` (absent = v1 toggle); `schemaVersion` stays 2 because every change is additive.
- The Live Activity attributes struct is declared twice (widget sources and the `kaihuman-shared` pod, which cannot see app sources); a test keeps both identical.

## 7. widget-sync contract changes

All additive and optional, so the Swift `Codable` mirror and Glance keep decoding old files. Add `schemaVersion: 2` at the top.

```ts
interface WidgetTodoItem {
  // existing fields …
  dueDate?: string;          // from ::due:: if present
  priority?: 'high' | 'normal' | 'low';
  pending?: boolean;         // set by the native side for queued toggles
}

interface WidgetTodoSnapshot {
  schemaVersion: 2;
  // existing fields …
  counts: { inbox; inProgress; backlog; doneToday; knowledgeInbox: number; doneThisWeek: number };
  stats: { doneByDay: number[] /* 7, Mon→Sun, local week */; streakDays: number; weeklyGoal?: number };
  milestones: { id: string; name: string; dueDate?: string; open: number; done: number }[];
  tags: string[];            // for the configuration picker
  privacy: { lockScreenText: boolean };
  timeZone: string;          // "today" in the user's zone, not UTC
  // v2
  ideas?: { byStatus: Record<string, number>; hot: { slug: string; title: string; level: string }[] };
  cards?: { path: string; title: string; excerpt: string; tags: string[] }[];
  habits?: { path: string; name: string; doneToday: boolean; streakDays: number; pending?: boolean }[];
}
```

Function changes in `packages/core/src/widget-sync.ts`:
- `buildWidgetTodoSnapshot`: count done items by local day (today's `sameUtcDay` is wrong outside UTC), fill `stats`, `milestones`, `tags`.
- New `applyWidgetTodoMove(snapshot, itemId, status)` generalising the toggle (v2 board "Start").
- New `buildWidgetExtras(files, now)` for `knowledgeInbox`, `ideas`, `cards`; the snapshot keeps raw `files` for todos only.
- Swift `SharedTodoModels.swift` and the `ios-widget.test.ts` key-parity test grow with the same fields.

## 8. Visual design

- Follow the widget HIG: content margins from `.contentMarginsDisabled()` off (system 16 pt), one primary idea per widget, no scrolling, tap targets ≥ 44 pt in interactive rows.
- Colours from `doc/mobile-design.md` §3: dark `surface #1B1C19`, Volt accent; light white surface, Olive `#4F5E00` text accent, Ink fill with Volt text for the primary capture button.
- **Tinted / clear (iOS 18+)**: read `@Environment(\.widgetRenderingMode)`; in `.accented` mark the primary group (numbers, checkboxes) with `.widgetAccentable()`, drop backgrounds, never rely on Volt for meaning. Use `.widgetAccentedRenderingMode(.desaturated)` for any image.
- Lock Screen accessory: monochrome vibrancy, `AccessoryWidgetBackground()` for circular, `Gauge` with `.accessoryCircularCapacity` for the ring.
- Numbers in SF Mono (brand nod to the console's mono look); text in SF Pro.

## 9. Open questions

1. Multi-repo: should a widget pick a repo, or does the app stay single-repo? (Changes `RepoEntity` and snapshot shape.)
2. Weekly goal: user-set in the app, or derived from the 4-week average?
3. Knowledge inbox count: is "file in `.kh/raw/` not yet ingested" detectable without reading every file?
4. Should in-widget writes beyond "done" (start, habit log, background capture) commit directly, or always queue for the app to avoid conflicts?
5. Lock Screen text default: on (convenience) or off (privacy)?
6. Focus Live Activity: does it need a matching console/desktop concept (timer exists only in the business module)?

## 10. Android

Built 2026-11-06 in `apps/mobile/targets/android-widget` (package `com.kaihuman.app`, Glance 1.1.1). Reads the same `widget-todos.json` from the `kaihuman_widget` SharedPreferences; never writes schema changes.

| iOS | Android | Notes |
|-----|---------|-------|
| Next up (AppIntentConfiguration) | `TodoGlanceWidget` + `WidgetConfigActivity` | Source: all, inbox, in progress, backlog, tag, milestone. Done toggle via `ToggleTodoAction`. |
| Quick capture | `QuickCaptureWidget` | 2×2 grid and 1×4 row; Todo is the filled button. |
| Weekly done ring | `WeeklyDoneWidget` | Ring drawn to a bitmap in theme colours; medium adds Mon–Sun bars. |
| Inbox | `InboxWidget` | Todo + knowledge counts; Process → `kaihuman://inbox`. |
| Board column | `BoardColumnWidget` | Configurable (default inbox); Start (`move`) and Done. |
| Milestone countdown | `MilestoneWidget` | Configurable milestone, falls back to upcoming. |
| Idea pipeline | `IdeaPipelineWidget` | Stage links, hot idea with Log (`quick-log?idea=`). |
| Knowledge card | `KnowledgeCardWidget` | 3 h rotation, Next shifts a per-widget offset. |
| Habits | — | Skipped: not in the Android scope yet. |
| Control Center controls | `*CaptureTileService` (Quick Settings tiles) | Open `kaihuman://quick-<kind>`. |
| App Shortcuts | `res/xml/kh_shortcuts.xml` | Launcher long-press and Assistant: add todo/note/log/idea. |
| Focus Live Activity | `FocusNotification` + `FocusActionReceiver` | Ongoing notification with countdown chronometer, Done and +5m; private on the lock screen. Started by `startFocusActivity` in `kaihuman-shared` (returns null without `POST_NOTIFICATIONS`). |

- **Look**: `GlanceTheme` dynamic (Material You) colours on Android 12+, Volt-on-Ink `ColorProviders` fallback below; `system_app_widget_background_radius` corners; `SizeMode.Responsive` small/medium/large; `previewLayout` + `description` for the picker; configurable widgets declare `reconfigurable|configuration_optional`.
- **States**: as §5.2 (signed out, > 6 h footer, > 48 h dimmed by a scrim) plus per-widget empty copy. Pending (queued) items show ◷.
- **Privacy**: widgets declare `home_screen|keyguard`; on a keyguard host with `privacy.lockScreenText` false, text is replaced and only counts, rings and countdowns stay.
- **Writes**: `TodoCommit` commits done and start with the cached file + SHA and queues `toggle`/`move` mutations on failure, like iOS.
- **Tests**: `targets/android-widget/test` (copied to `app/src/test` by the plugin): snapshot v1/v2/unknown keys, queries, widget logic, focus notification, and `WidgetPreviewRenderTest`, which renders each widget through `GlanceRemoteViews` in Robolectric and writes the contact sheet.
- **Untested on a device**: home-screen hosts, Material You colours from a real wallpaper, keyguard hosts, tiles, shortcuts, and the focus notification.
