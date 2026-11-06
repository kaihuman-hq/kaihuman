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
}

/// A toggle the widget could not commit; the main app replays it (see widget-bridge.ts).
struct PendingWidgetMutation: Codable {
    var itemId: String
    var timestamp: Int64
}
