import AppIntents
import SwiftUI
import WidgetKit

struct TodoEntry: TimelineEntry {
    let date: Date
    let snapshot: SharedTodoSnapshot?
    var source: TodoSourceFilter = .all
}

/// Entries at `now`, on each hour (so "Synced Nh ago" and the 6 h / 48 h thresholds stay right) and
/// at the next local midnight (which resets "done today"). The app and intents reload timelines on
/// any change, so `.atEnd` only has to cover quiet days.
enum KaihumanTimeline {
    static func make(
        snapshot: SharedTodoSnapshot?, source: TodoSourceFilter = .all, now: Date = Date()
    ) -> Timeline<TodoEntry> {
        let calendar = snapshot?.resolvedCalendar ?? Calendar.current
        let midnight = snapshot?.nextMidnight(after: now)
            ?? calendar.nextDate(
                after: now, matching: DateComponents(hour: 0, minute: 0, second: 0), matchingPolicy: .nextTime
            )
        var dates = [now]
        if let midnight {
            var hour = calendar.date(byAdding: .hour, value: 1, to: now) ?? midnight
            while hour < midnight && dates.count < 24 {
                dates.append(hour)
                hour = calendar.date(byAdding: .hour, value: 1, to: hour) ?? midnight
            }
            dates.append(midnight)
        }
        let entries = dates.map { TodoEntry(date: $0, snapshot: snapshot, source: source) }
        return Timeline(entries: entries, policy: .atEnd)
    }
}

/// Provider for the widgets without configuration (Quick capture, Weekly done, Inbox).
struct TodoProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodoEntry {
        TodoEntry(date: Date(), snapshot: SharedTodoSnapshot.preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodoEntry) -> Void) {
        // The widget gallery needs something to show before the user has signed in.
        let snapshot = SharedTodoStore.shared.load() ?? (context.isPreview ? SharedTodoSnapshot.preview : nil)
        completion(TodoEntry(date: Date(), snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodoEntry>) -> Void) {
        completion(KaihumanTimeline.make(snapshot: SharedTodoStore.shared.load()))
    }
}

/// Provider for Next up: the configured source comes from the widget's intent.
struct NextUpProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> TodoEntry {
        TodoEntry(date: Date(), snapshot: SharedTodoSnapshot.preview)
    }

    func snapshot(for configuration: NextUpConfigurationIntent, in context: Context) async -> TodoEntry {
        let snapshot = SharedTodoStore.shared.load() ?? (context.isPreview ? SharedTodoSnapshot.preview : nil)
        return TodoEntry(date: Date(), snapshot: snapshot, source: configuration.filter)
    }

    func timeline(for configuration: NextUpConfigurationIntent, in context: Context) async -> Timeline<TodoEntry> {
        KaihumanTimeline.make(snapshot: SharedTodoStore.shared.load(), source: configuration.filter)
    }
}
