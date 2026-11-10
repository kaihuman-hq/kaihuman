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

    /// `now` as `YYYY-MM-DD` in the snapshot's zone, the format of `SharedTodoItem.dueDate`.
    func dayKey(at now: Date) -> String {
        let c = resolvedCalendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Which group of the Today list an open item is in: overdue, in progress, due today; nil = not today.
    /// Mirrors `todayItems` in packages/core/src/widget-sync.ts.
    func todayGroup(_ item: SharedTodoItem, today: String) -> Int? {
        guard item.status == .backlog || item.status == .inProgress else { return nil }
        if let due = item.dueDate, due < today { return 0 }
        if item.status == .inProgress { return 1 }
        return item.dueDate == today ? 2 : nil
    }

    /// The Today widget: open todos that are overdue, in progress or due today, in that order, each
    /// group by due date and time. Undated and future backlog stay in the app. Derived from `items`
    /// (not `todayItems`) so the midnight entry rolls over and widget toggles drop out at once.
    func todayTasks(for source: TodoSourceFilter, at now: Date) -> [SharedTodoItem] {
        let today = dayKey(at: now)
        let open = items(for: source)
        var ranked: [(key: (Int, String, String, Int), item: SharedTodoItem)] = []
        for (offset, item) in open.enumerated() {
            guard let group = todayGroup(item, today: today) else { continue }
            ranked.append((key: (group, item.dueDate ?? "9999-99-99", item.dueTime ?? "99:99", offset), item: item))
        }
        // `offset` breaks ties, so the source order (in progress, priority, file) survives the unstable sort.
        return ranked.sorted { $0.key < $1.key }.map { $0.item }
    }

    func overdueCount(in tasks: [SharedTodoItem], at now: Date) -> Int {
        let today = dayKey(at: now)
        return tasks.filter { todayGroup($0, today: today) == 0 }.count
    }

    /// Trailing label of a Today row: weekday for overdue, time when due today, else the first tag.
    func todayLabel(for item: SharedTodoItem, at now: Date) -> String? {
        let today = dayKey(at: now)
        if let due = item.dueDate, due < today {
            let parts = due.split(separator: "-").compactMap { Int($0) }
            let calendar = resolvedCalendar
            guard parts.count == 3,
                  let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
            else { return due }
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.timeZone = calendar.timeZone
            formatter.setLocalizedDateFormatFromTemplate("EEE")
            return formatter.string(from: date)
        }
        if item.dueDate == today, let time = item.dueTime { return time }
        return item.tags.first.map { "#\($0)" }
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

// MARK: v2 widgets

/// How the knowledge card widget rotates: a new card every 3 h, shifted by the user's "Next" taps.
enum KnowledgeRotation {
    static let slotSeconds: TimeInterval = 3 * 3600

    static func slot(at date: Date) -> Int {
        Int((date.timeIntervalSince1970 / slotSeconds).rounded(.down))
    }

    /// Start of the slot after `date`: the next entry that changes the card.
    static func nextSlotStart(after date: Date) -> Date {
        Date(timeIntervalSince1970: TimeInterval(slot(at: date) + 1) * slotSeconds)
    }
}

struct IdeaStage: Identifiable {
    let status: String
    let count: Int
    var id: String { status }
}

extension SharedTodoSnapshot {
    /// Card shown at `date`; stable within a slot so a reload does not reshuffle it.
    func card(at date: Date, offset: Int) -> SharedCard? {
        guard let cards, !cards.isEmpty else { return nil }
        let index = (KnowledgeRotation.slot(at: date) &+ offset) % cards.count
        return cards[index < 0 ? index + cards.count : index]
    }

    /// The picked milestone, else the upcoming one. A vanished pick falls back to the upcoming one.
    func milestone(id: String?) -> SharedMilestone? {
        if let id, let picked = milestones?.first(where: { $0.id == id }) { return picked }
        guard let upcoming = upcomingMilestone else { return nil }
        if let known = milestones?.first(where: { $0.id == upcoming.id }) { return known }
        return SharedMilestone(
            id: upcoming.id, name: upcoming.name, dueDate: upcoming.dueDate,
            open: items.filter { $0.milestoneId == upcoming.id }.count, done: 0
        )
    }

    /// Whole local days from `now` to a `YYYY-MM-DD` due date; negative when overdue.
    func daysLeft(until dueDate: String?, at now: Date) -> Int? {
        guard let dueDate else { return nil }
        let parts = dueDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let calendar = resolvedCalendar
        guard let due = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else {
            return nil
        }
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: due).day
    }

    /// The snapshot only knows "done today" as of its last sync; a habit ticked yesterday is open again.
    func habitDone(_ habit: SharedHabit, at now: Date) -> Bool {
        habit.doneToday && resolvedCalendar.isDate(updatedDate, inSameDayAs: now)
    }

    /// The last 7 days of a habit, oldest first, ending at `now`. Days the snapshot has not seen
    /// yet (it was written on an earlier day) are open; today follows `habitDone`, so a widget
    /// check-in fills it at once.
    func habitWeek(_ habit: SharedHabit, at now: Date) -> [Bool] {
        let calendar = resolvedCalendar
        let known = Array((habit.days ?? []).suffix(7))
        var days = Array(repeating: false, count: 7 - known.count) + known
        let shift = calendar.dateComponents(
            [.day], from: calendar.startOfDay(for: updatedDate), to: calendar.startOfDay(for: now)
        ).day ?? 0
        if shift > 0 {
            let n = min(shift, 7)
            days = Array(days.dropFirst(n)) + Array(repeating: false, count: n)
        }
        days[6] = habitDone(habit, at: now)
        return days
    }

    /// The timer's open interval start, if it runs.
    var timerStart: Date? {
        timer?.startedAt.map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) }
    }

    /// Idea statuses in pipeline order first, then any the app invented.
    func ideaStages(preferred: [String]) -> [IdeaStage] {
        guard let byStatus = ideas?.byStatus else { return [] }
        let known = preferred.filter { byStatus[$0] != nil }
        let extra = byStatus.keys.filter { !preferred.contains($0) }.sorted()
        return (known + extra).map { IdeaStage(status: $0, count: byStatus[$0] ?? 0) }
    }
}
