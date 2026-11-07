import AppIntents
import SwiftUI
import WidgetKit

struct TodoEntry: TimelineEntry {
    let date: Date
    let snapshot: SharedTodoSnapshot?
    var source: TodoSourceFilter = .all
    // v2 widgets
    var tag: String?
    var milestoneId: String?
    /// "Next" taps on the knowledge card, read when the timeline was built.
    var cardOffset = 0
}

/// Entries at `now`, on each hour (so "Synced Nh ago" and the 6 h / 48 h thresholds stay right) and
/// at the next local midnight (which resets "done today"). The app and intents reload timelines on
/// any change, so `.atEnd` only has to cover quiet days.
enum KaihumanTimeline {
    static func make(
        snapshot: SharedTodoSnapshot?, source: TodoSourceFilter = .all, tag: String? = nil, now: Date = Date()
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
        let entries = dates.map { TodoEntry(date: $0, snapshot: snapshot, source: source, tag: tag) }
        return Timeline(entries: entries, policy: .atEnd)
    }

    /// One entry now and one at each of the next `days` local midnights, so a day counter ticks over
    /// without spending reload budget.
    static func daily(
        snapshot: SharedTodoSnapshot?, milestoneId: String?, days: Int = 7, now: Date = Date()
    ) -> Timeline<TodoEntry> {
        var dates = [now]
        while dates.count <= days, let last = dates.last {
            guard let midnight = snapshot?.nextMidnight(after: last)
                ?? Calendar.current.nextDate(
                    after: last, matching: DateComponents(hour: 0, minute: 0, second: 0), matchingPolicy: .nextTime
                ) else { break }
            dates.append(midnight)
        }
        let entries = dates.map { TodoEntry(date: $0, snapshot: snapshot, milestoneId: milestoneId) }
        return Timeline(entries: entries, policy: .atEnd)
    }

    /// One entry per 3 h rotation slot for the next `slots` slots (24 h by default).
    static func rotating(
        snapshot: SharedTodoSnapshot?, cardOffset: Int, slots: Int = 8, now: Date = Date()
    ) -> Timeline<TodoEntry> {
        var dates = [now]
        while dates.count <= slots, let last = dates.last {
            dates.append(KnowledgeRotation.nextSlotStart(after: last))
        }
        let entries = dates.map { TodoEntry(date: $0, snapshot: snapshot, cardOffset: cardOffset) }
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
