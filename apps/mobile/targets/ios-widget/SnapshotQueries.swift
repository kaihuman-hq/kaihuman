import Foundation

// Pure helpers over SharedTodoSnapshot. Compiled into the widget extension AND the main app
// (App Shortcuts use them), so no SwiftUI/WidgetKit here.

/// How old the cached snapshot is. Thresholds follow doc/mobile-widgets.md §5.2.
enum SnapshotFreshness: Equatable {
    case fresh
    /// Older than 6 h: show a "Synced Nh ago" footer with a warning dot.
    case stale(hours: Int)
    /// Older than 48 h: dim the content, keep the data.
    case dim(hours: Int)

    var hours: Int {
        switch self {
        case .fresh: return 0
        case .stale(let hours), .dim(let hours): return hours
        }
    }
}

/// Which open todos a "Next up" widget lists. `id` is the persisted TodoSourceEntity id.
enum TodoSourceFilter: Equatable {
    case all
    case inbox
    case inProgress
    case backlog
    case tag(String)
    case milestone(String)

    init?(id: String) {
        switch id {
        case "all": self = .all
        case "column:inbox": self = .inbox
        case "column:in-progress": self = .inProgress
        case "column:backlog": self = .backlog
        default:
            if id.hasPrefix("tag:") {
                self = .tag(String(id.dropFirst("tag:".count)))
            } else if id.hasPrefix("milestone:") {
                self = .milestone(String(id.dropFirst("milestone:".count)))
            } else {
                return nil
            }
        }
    }

    var id: String {
        switch self {
        case .all: return "all"
        case .inbox: return "column:inbox"
        case .inProgress: return "column:in-progress"
        case .backlog: return "column:backlog"
        case .tag(let tag): return "tag:\(tag)"
        case .milestone(let id): return "milestone:\(id)"
        }
    }
}

extension SharedTodoSnapshot {
    var updatedDate: Date {
        Date(timeIntervalSince1970: TimeInterval(updatedAt) / 1000)
    }

    /// The phone's zone can differ from the one the snapshot was written in (travel); prefer the snapshot's.
    var resolvedCalendar: Calendar {
        var calendar = Calendar.current
        if let identifier = timeZone, let zone = TimeZone(identifier: identifier) {
            calendar.timeZone = zone
        }
        return calendar
    }

    func freshness(at now: Date) -> SnapshotFreshness {
        let age = now.timeIntervalSince(updatedDate)
        let hours = max(0, Int(age / 3600))
        if age > 48 * 3600 { return .dim(hours: hours) }
        if age > 6 * 3600 { return .stale(hours: hours) }
        return .fresh
    }

    var inboxPath: String { "\(appFolder)/inbox.todos.md" }

    func isInbox(_ item: SharedTodoItem) -> Bool {
        item.status == .backlog && item.filePath == inboxPath
    }

    /// Open todos in "next up" order: in progress first, then priority, then file order.
    var nextUp: [SharedTodoItem] {
        let open = items.enumerated().filter { $0.element.status == .backlog || $0.element.status == .inProgress }
        return open.sorted { lhs, rhs in
            let left = (lhs.element.status == .inProgress ? 0 : 1, Self.priorityRank(lhs.element.priority), lhs.offset)
            let right = (rhs.element.status == .inProgress ? 0 : 1, Self.priorityRank(rhs.element.priority), rhs.offset)
            return left < right
        }.map { $0.element }
    }

    private static func priorityRank(_ priority: String?) -> Int {
        switch priority?.lowercased() {
        case "urgent", "high": return 0
        case "medium": return 1
        case "low": return 2
        default: return 3
        }
    }

    func items(for source: TodoSourceFilter) -> [SharedTodoItem] {
        let open = nextUp
        switch source {
        case .all: return open
        case .inbox: return open.filter { isInbox($0) }
        case .inProgress: return open.filter { $0.status == .inProgress }
        case .backlog: return open.filter { $0.status == .backlog && !isInbox($0) }
        case .tag(let tag): return open.filter { $0.tags.contains(tag) }
        case .milestone(let id): return open.filter { $0.milestoneId == id }
        }
    }

    /// Every tag known to the snapshot, for the source picker.
    var allTags: [String] {
        tags ?? Array(Set(items.flatMap { $0.tags })).sorted()
    }

    /// The counter resets at local midnight; the snapshot only learns that on the next sync.
    func doneToday(at now: Date) -> Int {
        resolvedCalendar.isDate(updatedDate, inSameDayAs: now) ? counts.doneToday : 0
    }

    var doneThisWeek: Int {
        counts.doneThisWeek ?? (stats?.doneByDay.reduce(0, +) ?? 0)
    }

    var weeklyGoal: Int { max(1, stats?.weeklyGoal ?? 10) }
    var streakDays: Int { stats?.streakDays ?? 0 }
    var knowledgeInbox: Int { counts.knowledgeInbox ?? 0 }
    /// Default on: only an explicit false hides todo text from accessory widgets.
    var showsLockScreenText: Bool { privacy?.lockScreenText ?? true }

    /// Index into `stats.doneByDay` (Monday = 0 ... Sunday = 6) for `date`.
    func weekdayIndex(at date: Date) -> Int {
        (resolvedCalendar.component(.weekday, from: date) + 5) % 7
    }

    func nextMidnight(after date: Date) -> Date? {
        resolvedCalendar.nextDate(
            after: date,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        )
    }
}

extension SnapshotFreshness {
    var isDim: Bool {
        if case .dim = self { return true }
        return false
    }
}
