import Foundation

// Mirrors WidgetTodoSnapshot / WidgetTodoItem in packages/core/src/widget-sync.ts.
// Keep property names identical to the JSON keys; ios-widget.test.ts enforces this.

enum TodoStatus: String, Codable {
    case backlog = "backlog"
    case inProgress = "in-progress"
    case done = "done"
    case rejected = "rejected"
}

struct SharedTodoFile: Codable {
    var sha: String
    var content: String
}

struct SharedTodoCounts: Codable {
    var inbox: Int
    var inProgress: Int
    var backlog: Int
    var doneToday: Int
    // v2 (optional so v1 files still decode)
    var knowledgeInbox: Int?
    var doneThisWeek: Int?
}

struct SharedUpcomingMilestone: Codable {
    var id: String
    var name: String
    var dueDate: String?
}

struct SharedTodoItem: Codable, Identifiable {
    var id: String
    var filePath: String
    var indexInFile: Int
    var text: String
    var status: TodoStatus
    var tags: [String]
    var milestoneId: String?
    var milestoneName: String?
    var milestoneDueDate: String?
    var updatedAt: Int64?
    // v2
    var priority: String?
    var pending: Bool?
    // The item's own due date (YYYY-MM-DD) and time (HH:MM), local; absent in older snapshots.
    var dueDate: String?
    var dueTime: String?
}

enum TodoDueState {
    case overdue
    case today
}

extension SharedTodoItem {
    /// Overdue when the date has passed, or it is today and the time (if any) has; today otherwise.
    /// Open items only. Local time, compared as zero-padded strings, which sort like the dates.
    func dueState(now: Date = Date(), calendar: Calendar = .current) -> TodoDueState? {
        guard status == .backlog || status == .inProgress, let due = dueDate else { return nil }
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: now)
        let today = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        if due < today { return .overdue }
        if due > today { return nil }
        let hm = String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
        if let time = dueTime, time <= hm { return .overdue }
        return .today
    }
}

struct SharedTodoStats: Codable {
    var doneByDay: [Int]
    var streakDays: Int
    var weeklyGoal: Int?
}

struct SharedMilestone: Codable, Identifiable {
    var id: String
    var name: String
    var dueDate: String?
    var open: Int
    var done: Int
}

struct SharedPrivacy: Codable {
    var lockScreenText: Bool
}

struct SharedTodoSnapshot: Codable {
    var schemaVersion: Int?
    var updatedAt: Int64
    var repoFullName: String
    var branch: String
    var appFolder: String
    var upcomingMilestone: SharedUpcomingMilestone?
    var counts: SharedTodoCounts
    var items: [SharedTodoItem]
    var files: [String: SharedTodoFile]
    // v2
    var stats: SharedTodoStats?
    var milestones: [SharedMilestone]?
    var tags: [String]?
    var privacy: SharedPrivacy?
    var timeZone: String?
    var ideas: SharedIdeas?
    var cards: [SharedCard]?
    var habits: [SharedHabit]?
}

struct SharedHotIdea: Codable, Identifiable {
    var slug: String
    var title: String
    /// "hot" | "warm" | "cool" | "dormant"; a String so a new level never breaks decoding.
    var level: String
    var id: String { slug }
}

struct SharedIdeas: Codable {
    var byStatus: [String: Int]
    var hot: [SharedHotIdea]
}

struct SharedCard: Codable, Identifiable {
    var path: String
    var title: String
    var excerpt: String
    var tags: [String]
    var id: String { path }
}

struct SharedHabit: Codable, Identifiable {
    var path: String
    var name: String
    var doneToday: Bool
    var streakDays: Int
    var pending: Bool?
    var id: String { path }
}

/// Something the widget or an intent did that the main app must commit (see widget-bridge.ts).
/// One flat struct for the TS union: `kind` is nil in v1 files (always a toggle); the other
/// optionals are filled per kind (move: itemId + status, capture: text, habit: path + date).
struct PendingWidgetMutation: Codable {
    var kind: String?
    var itemId: String?
    var status: String?
    var text: String?
    var path: String?
    /// Local calendar day, YYYY-MM-DD.
    var date: String?
    var timestamp: Int64

    static func millis(_ now: Date) -> Int64 { Int64(now.timeIntervalSince1970 * 1000) }

    static func toggle(itemId: String, now: Date = Date()) -> PendingWidgetMutation {
        PendingWidgetMutation(kind: "toggle", itemId: itemId, timestamp: millis(now))
    }

    static func move(itemId: String, status: TodoStatus, now: Date = Date()) -> PendingWidgetMutation {
        PendingWidgetMutation(kind: "move", itemId: itemId, status: status.rawValue, timestamp: millis(now))
    }

    static func capture(text: String, now: Date = Date()) -> PendingWidgetMutation {
        PendingWidgetMutation(kind: "capture", text: text, timestamp: millis(now))
    }

    static func habit(path: String, date: String, now: Date = Date()) -> PendingWidgetMutation {
        PendingWidgetMutation(kind: "habit", path: path, date: date, timestamp: millis(now))
    }
}
