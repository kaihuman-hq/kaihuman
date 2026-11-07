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
            item(7, "Draft hiring plan", .backlog, tags: ["work"]),
            item(8, "Call the landlord", .backlog, tags: ["life"]),
            item(9, "Update dependencies", .backlog, tags: ["work"]),
            item(10, "Plan weekend trip", .backlog, tags: ["life"]),
        ]
        return SharedTodoSnapshot(
            schemaVersion: 2,
            updatedAt: Int64((now.timeIntervalSince1970 - seconds) * 1000),
            repoFullName: "kai/life",
            branch: "main",
            appFolder: ".kh",
            upcomingMilestone: SharedUpcomingMilestone(id: "m1", name: "Widgets v1", dueDate: "2026-11-20"),
            counts: SharedTodoCounts(
                inbox: 1, inProgress: 2, backlog: 8, doneToday: 3, knowledgeInbox: 4, doneThisWeek: 12
            ),
            items: items,
            files: [:],
            stats: SharedTodoStats(doneByDay: [2, 3, 1, 4, 2, 0, 0], streakDays: 5, weeklyGoal: 10),
            milestones: [SharedMilestone(id: "m1", name: "Widgets v1", dueDate: "2026-11-20", open: 5, done: 7)],
            tags: ["work", "life"],
            privacy: SharedPrivacy(lockScreenText: true),
            timeZone: nil,
            ideas: SharedIdeas(
                byStatus: ["seed": 6, "exploring": 3, "committed": 2, "shipped": 4, "parked": 1],
                hot: [
                    SharedHotIdea(slug: "habit-widgets", title: "Habit check-ins from the Lock Screen", level: "hot"),
                    SharedHotIdea(slug: "weekly-review", title: "Weekly review digest", level: "warm"),
                ]
            ),
            cards: [
                SharedCard(
                    path: "wiki/spaced-repetition.md", title: "Spaced repetition",
                    excerpt: "Review material at growing intervals so each recall happens just before you would forget it. "
                        + "The gap roughly doubles after every successful recall, so a card you know well "
                        + "returns after weeks instead of days. Short daily sessions beat long cramming, "
                        + "and a missed review costs little: the card simply comes back sooner.",
                    tags: ["learning", "memory", "habits"]
                ),
                SharedCard(
                    path: "wiki/zettelkasten.md", title: "Zettelkasten",
                    excerpt: "Small atomic notes that link to each other. Value comes from the links, not the folders.",
                    tags: ["notes"]
                ),
            ],
            habits: [
                SharedHabit(path: ".kh/habits/read.habit.csv", name: "Read 20 pages", doneToday: true, streakDays: 12, pending: nil),
                SharedHabit(path: ".kh/habits/walk.habit.csv", name: "Walk outside", doneToday: false, streakDays: 3, pending: nil),
                SharedHabit(path: ".kh/habits/stretch.habit.csv", name: "Stretch", doneToday: true, streakDays: 1, pending: true),
            ]
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
