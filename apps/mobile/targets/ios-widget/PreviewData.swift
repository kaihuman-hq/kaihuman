import Foundation
import SwiftUI
import WidgetKit

// Sample data for #Previews, the widget gallery and the CI render harness.

extension SharedTodoSnapshot {
    /// A healthy, freshly synced snapshot.
    static var preview: SharedTodoSnapshot { sample(updatedAgo: 60) }

    static func sample(updatedAgo seconds: TimeInterval, now: Date = Date()) -> SharedTodoSnapshot {
        func item(
            _ index: Int, _ text: String, _ status: TodoStatus, tags: [String] = [],
            file: String = ".kh/backlog.todos.md", priority: String? = nil, pending: Bool? = nil
        ) -> SharedTodoItem {
            SharedTodoItem(
                id: "\(file)#\(index)", filePath: file, indexInFile: index, text: text, status: status,
                tags: tags, milestoneId: "m1", milestoneName: "Widgets v1", milestoneDueDate: "2026-11-20",
                updatedAt: nil, priority: priority, pending: pending
            )
        }
        let items = [
            item(0, "Ship widget sync v2", .inProgress, tags: ["work"], priority: "high"),
            item(1, "Review PR #182", .backlog, tags: ["work"], priority: "medium"),
            item(2, "Book dentist", .backlog, tags: ["life"], file: ".kh/inbox.todos.md"),
            item(3, "Write release notes", .backlog, tags: ["work"], pending: true),
            item(4, "Renew passport", .backlog, tags: ["life"]),
            item(5, "Plan Q1 roadmap", .backlog, tags: ["work"]),
            item(6, "Fix flaky CI test", .inProgress, tags: ["work"]),
        ]
        return SharedTodoSnapshot(
            schemaVersion: 2,
            updatedAt: Int64((now.timeIntervalSince1970 - seconds) * 1000),
            repoFullName: "kai/life",
            branch: "main",
            appFolder: ".kh",
            upcomingMilestone: SharedUpcomingMilestone(id: "m1", name: "Widgets v1", dueDate: "2026-11-20"),
            counts: SharedTodoCounts(
                inbox: 1, inProgress: 2, backlog: 4, doneToday: 3, knowledgeInbox: 4, doneThisWeek: 12
            ),
            items: items,
            files: [:],
            stats: SharedTodoStats(doneByDay: [2, 3, 1, 4, 2, 0, 0], streakDays: 5, weeklyGoal: 10),
            milestones: [SharedMilestone(id: "m1", name: "Widgets v1", dueDate: "2026-11-20", open: 5, done: 7)],
            tags: ["work", "life"],
            privacy: SharedPrivacy(lockScreenText: true),
            timeZone: nil
        )
    }

    /// Nothing open and nothing in the inboxes.
    static var previewEmpty: SharedTodoSnapshot {
        var snapshot = sample(updatedAgo: 60)
        snapshot.items = []
        snapshot.counts = SharedTodoCounts(
            inbox: 0, inProgress: 0, backlog: 0, doneToday: 6, knowledgeInbox: 0, doneThisWeek: 12
        )
        return snapshot
    }

    static var previewStale: SharedTodoSnapshot { sample(updatedAgo: 9 * 3600) }
    static var previewDim: SharedTodoSnapshot { sample(updatedAgo: 60 * 3600) }

    static var previewPrivate: SharedTodoSnapshot {
        var snapshot = sample(updatedAgo: 60)
        snapshot.privacy = SharedPrivacy(lockScreenText: false)
        return snapshot
    }
}

extension TodoEntry {
    static var preview: TodoEntry { TodoEntry(date: Date(), snapshot: .preview) }
    static var previewEmpty: TodoEntry { TodoEntry(date: Date(), snapshot: .previewEmpty) }
    static var previewStale: TodoEntry { TodoEntry(date: Date(), snapshot: .previewStale) }
    static var previewSignedOut: TodoEntry { TodoEntry(date: Date(), snapshot: nil) }
}
