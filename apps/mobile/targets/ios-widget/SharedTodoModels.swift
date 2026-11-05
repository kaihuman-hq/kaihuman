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
}

struct SharedTodoSnapshot: Codable {
    var updatedAt: Int64
    var repoFullName: String
    var branch: String
    var appFolder: String
    var upcomingMilestone: SharedUpcomingMilestone?
    var counts: SharedTodoCounts
    var items: [SharedTodoItem]
    var files: [String: SharedTodoFile]
}

/// A toggle the widget could not commit; the main app replays it (see widget-bridge.ts).
struct PendingWidgetMutation: Codable {
    var itemId: String
    var timestamp: Int64
}
