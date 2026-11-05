import AppIntents
import SwiftUI
import WidgetKit

// Nexus dark theme.
enum Theme {
    static let background = Color(red: 10 / 255, green: 10 / 255, blue: 15 / 255) // #0A0A0F
    static let accent = Color(red: 0, green: 1, blue: 0) // #00FF00
    static let progress = Color.cyan
    static let muted = Color.gray
    static let captureURL = URL(string: "kaihuman://quick-todo")!
}

private func mono(_ size: CGFloat, bold: Bool = false) -> Font {
    .system(size: size, weight: bold ? .bold : .regular, design: .monospaced)
}

struct TodoWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodoEntry

    var body: some View {
        switch family {
        case .systemSmall: SmallTodoView(snapshot: entry.snapshot)
        case .systemMedium: MediumTodoView(snapshot: entry.snapshot)
        case .systemLarge: LargeTodoView(snapshot: entry.snapshot)
        case .accessoryCircular: CircularTodoView(snapshot: entry.snapshot)
        case .accessoryRectangular: RectangularTodoView(snapshot: entry.snapshot)
        default: SmallTodoView(snapshot: entry.snapshot)
        }
    }
}

// MARK: Shared pieces

private struct TaskRow: View {
    let item: SharedTodoItem
    var showTags = false

    var body: some View {
        Button(intent: ToggleTodoIntent(itemId: item.id)) {
            HStack(spacing: 4) {
                Text(item.status == .inProgress ? "[>]" : "[ ]")
                    .foregroundStyle(item.status == .inProgress ? Theme.progress : Theme.muted)
                Text(item.text)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if showTags {
                    ForEach(item.tags.prefix(2), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(mono(9))
                            .foregroundStyle(Theme.accent)
                            .padding(.horizontal, 3)
                            .background(Theme.accent.opacity(0.15), in: RoundedRectangle(cornerRadius: 3))
                    }
                }
                Spacer(minLength: 0)
            }
            .font(mono(11))
        }
        .buttonStyle(.plain)
    }
}

private struct CountBadge: View {
    let snapshot: SharedTodoSnapshot?

    var body: some View {
        let open = (snapshot?.counts.inProgress ?? 0) + (snapshot?.counts.inbox ?? 0)
        Text("\(open)")
            .font(mono(10, bold: true))
            .foregroundStyle(Theme.background)
            .padding(.horizontal, 5)
            .background(Theme.accent, in: Capsule())
    }
}

private struct Header: View {
    let snapshot: SharedTodoSnapshot?

    var body: some View {
        HStack {
            Text("KAIHUMAN // TODOS")
                .font(mono(10, bold: true))
                .foregroundStyle(Theme.accent)
                .lineLimit(1)
            Spacer(minLength: 0)
            CountBadge(snapshot: snapshot)
        }
    }
}

private struct EmptyState: View {
    var body: some View {
        Text("No open todos")
            .font(mono(11))
            .foregroundStyle(Theme.muted)
    }
}

private func milestoneLabel(_ milestone: SharedUpcomingMilestone) -> String {
    let due = milestone.dueDate.map { " · due \($0)" } ?? ""
    return "!\(milestone.name)\(due)"
}

private struct CaptureLink: View {
    let label: String

    var body: some View {
        Link(label, destination: Theme.captureURL)
            .font(mono(10, bold: true))
            .foregroundStyle(Theme.accent)
    }
}

// MARK: Home screen families

struct SmallTodoView: View {
    let snapshot: SharedTodoSnapshot?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Header(snapshot: snapshot)
            let items = Array((snapshot?.items ?? []).prefix(3))
            if items.isEmpty {
                EmptyState()
            } else {
                ForEach(items) { TaskRow(item: $0) }
            }
            Spacer(minLength: 0)
            HStack {
                Spacer()
                Link("+", destination: Theme.captureURL)
                    .font(mono(16, bold: true))
                    .foregroundStyle(Theme.accent)
            }
        }
    }
}

struct MediumTodoView: View {
    let snapshot: SharedTodoSnapshot?

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                if let milestone = snapshot?.upcomingMilestone {
                    Text(milestoneLabel(milestone))
                        .font(mono(10, bold: true))
                        .foregroundStyle(Theme.accent)
                        .lineLimit(1)
                } else {
                    Text("KAIHUMAN // TODOS")
                        .font(mono(10, bold: true))
                        .foregroundStyle(Theme.accent)
                }
                Spacer(minLength: 0)
                if let counts = snapshot?.counts {
                    Text("\(counts.inProgress)>  \(counts.inbox)i  \(counts.backlog)b")
                        .font(mono(10))
                        .foregroundStyle(Theme.muted)
                }
            }
            HStack(spacing: 12) {
                CaptureLink(label: "+ Todo")
                CaptureLink(label: "+ Note")
                CaptureLink(label: "+ Log")
            }
            let items = Array((snapshot?.items ?? []).prefix(5))
            if items.isEmpty {
                EmptyState()
            } else {
                ForEach(items) { TaskRow(item: $0, showTags: true) }
            }
            Spacer(minLength: 0)
        }
    }
}

struct LargeTodoView: View {
    let snapshot: SharedTodoSnapshot?

    private var groups: [(title: String, items: [SharedTodoItem])] {
        let items = Array((snapshot?.items ?? []).prefix(10))
        let inboxPath = "\(snapshot?.appFolder ?? ".kh")/inbox.todos.md"
        let inProgress = items.filter { $0.status == .inProgress }
        let inbox = items.filter { $0.status != .inProgress && $0.filePath == inboxPath }
        let backlog = items.filter { $0.status != .inProgress && $0.filePath != inboxPath }
        return [("IN PROGRESS", inProgress), ("INBOX", inbox), ("BACKLOG", backlog)]
            .filter { !$0.1.isEmpty }
            .map { (title: $0.0, items: $0.1) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Header(snapshot: snapshot)
            if groups.isEmpty {
                EmptyState()
            }
            ForEach(groups, id: \.title) { group in
                Text(group.title)
                    .font(mono(9, bold: true))
                    .foregroundStyle(Theme.muted)
                ForEach(group.items) { TaskRow(item: $0, showTags: true) }
            }
            Spacer(minLength: 0)
            HStack(spacing: 12) {
                CaptureLink(label: "+ Todo")
                CaptureLink(label: "+ Note")
                CaptureLink(label: "+ Log")
            }
            .padding(6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 6))
        }
    }
}

// MARK: Lock screen families

struct CircularTodoView: View {
    let snapshot: SharedTodoSnapshot?

    var body: some View {
        let counts = snapshot?.counts
        let open = (counts?.inProgress ?? 0) + (counts?.inbox ?? 0) + (counts?.backlog ?? 0)
        let total = open + (counts?.doneToday ?? 0)
        Gauge(value: Double(open), in: 0...Double(max(total, 1))) {
            Text("TODO")
        } currentValueLabel: {
            Text("\(open)")
        }
        .gaugeStyle(.accessoryCircular)
    }
}

struct RectangularTodoView: View {
    let snapshot: SharedTodoSnapshot?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("KAIHUMAN // TODOS")
                .font(mono(10, bold: true))
            if let next = snapshot?.items.first(where: { $0.status == .inProgress }) {
                Text("[>] \(next.text)")
                    .font(mono(11))
                    .lineLimit(1)
            } else {
                Text("No task in progress")
                    .font(mono(11))
            }
            if let milestone = snapshot?.upcomingMilestone {
                Text(milestoneLabel(milestone))
                    .font(mono(10))
                    .lineLimit(1)
            }
        }
    }
}
