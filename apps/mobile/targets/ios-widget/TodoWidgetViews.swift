import SwiftUI
import WidgetKit

/// Next up. Pure view: family, rendering mode and colour scheme are parameters so a renderer
/// outside WidgetKit (ImageRenderer in CI) can drive every variant.
struct NextUpView: View {
    let entry: TodoEntry
    let style: WidgetStyle

    init(
        entry: TodoEntry,
        family: WidgetFamily,
        renderingMode: WidgetRenderingMode = .fullColor,
        colorScheme: ColorScheme = .dark
    ) {
        self.entry = entry
        self.style = WidgetStyle(family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }

    var body: some View {
        SnapshotShell(entry: entry, style: style, url: DeepLink.board) { snapshot in
            NextUpContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

/// Widget entry point: the only place that reads the Environment.
struct NextUpEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        NextUpView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct NextUpContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var items: [SharedTodoItem] { snapshot.items(for: entry.source) }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }
    private var doneToday: Int { snapshot.doneToday(at: entry.date) }

    var body: some View {
        switch style.family {
        case .accessoryInline: inline
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        case .systemMedium: medium
        case .systemLarge: large
        default: small
        }
    }

    // MARK: Copy

    private var emptyTitle: String {
        switch entry.source {
        case .inProgress: return "Nothing in progress — pick from backlog"
        case .all, .inbox: return "Inbox zero"
        case .backlog, .tag, .milestone: return "Nothing open here"
        }
    }

    private var sourceLabel: String {
        switch entry.source {
        case .all: return "All"
        case .inbox: return "Inbox"
        case .inProgress: return "In progress"
        case .backlog: return "Backlog"
        case .tag(let tag): return "#\(tag)"
        case .milestone(let id):
            return snapshot.milestones?.first { $0.id == id }?.name ?? "Milestone"
        }
    }

    // MARK: Lock Screen

    private var inline: some View {
        Group {
            if snapshot.showsLockScreenText, let first = items.first {
                Text("\(Image(systemName: "checklist")) \(first.text)").privacySensitive()
            } else {
                Text("\(Image(systemName: "checklist")) \(items.count) todos · \(doneToday) done today")
            }
        }
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if items.isEmpty {
                Image(systemName: "checkmark").font(.system(size: 20, weight: .bold)).widgetAccentable()
            } else {
                VStack(spacing: 0) {
                    Text("\(items.count)")
                        .font(WidgetTheme.number(22))
                        .minimumScaleFactor(0.6)
                        .widgetAccentable()
                    Text("open").font(.system(size: 9, weight: .semibold))
                }
            }
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "diamond.fill").font(.system(size: 9)).widgetAccentable()
                Text("NEXT UP").font(.system(size: 11, weight: .bold)).tracking(0.6).widgetAccentable()
                Spacer(minLength: 0)
                Text("\(items.count)").font(.system(size: 11, weight: .semibold, design: .monospaced))
            }
            if items.isEmpty {
                Text(emptyTitle).font(.system(size: 13, weight: .semibold)).lineLimit(2)
            } else if snapshot.showsLockScreenText, let first = items.first {
                Text(first.text)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(2)
                    .privacySensitive()
                if items.count > 1 {
                    Text("+\(items.count - 1) more").font(.system(size: 12)).foregroundStyle(.secondary)
                }
            } else {
                Text("\(items.count) todos open").font(.system(size: 14, weight: .semibold))
            }
            if freshness != .fresh {
                Text("Synced \(freshness.hours)h ago").font(.system(size: 11)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Home Screen

    private var small: some View {
        VStack(alignment: .leading, spacing: 9) {
            WidgetHeader(title: "NEXT UP", trailing: "\(items.count)", theme: theme)
            if items.isEmpty {
                EmptyStateView(title: emptyTitle, theme: theme)
            } else {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(items.prefix(3)) { item in TodoRow(item: item, style: style) }
                }
                Spacer(minLength: 0)
            }
            StaleFooter(freshness: freshness, theme: theme)
        }
    }

    private var medium: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text("\(items.count)")
                    .font(WidgetTheme.number(40))
                    .foregroundStyle(theme.label)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .padding(.top, 12)
                    .widgetAccentable()
                Text("open").font(.system(size: 13, weight: .medium)).foregroundStyle(theme.label).padding(.top, 4)
                Text("\(doneToday) done today")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(theme.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                ProgressBar(
                    fraction: Double(doneToday) / Double(max(1, doneToday + items.count)), theme: theme
                )
            }
            .frame(width: 92)
            .padding(.trailing, 14)
            Rectangle().fill(theme.separator).frame(width: 0.5)
            VStack(alignment: .leading, spacing: 7) {
                if items.isEmpty {
                    EmptyStateView(title: emptyTitle, theme: theme)
                } else {
                    ForEach(items.prefix(4)) { item in TodoRow(item: item, style: style) }
                    Spacer(minLength: 0)
                }
                footer
            }
            .padding(.leading, 16)
        }
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(title: "NEXT UP · \(sourceLabel.uppercased())", trailing: "\(items.count) open", theme: theme)
            if items.isEmpty {
                EmptyStateView(title: emptyTitle, subtitle: "\(doneToday) done today", theme: theme)
            } else {
                VStack(spacing: 0) {
                    ForEach(items.prefix(7)) { item in
                        TodoRow(item: item, style: style, fontSize: 15, showsTag: true)
                            .frame(maxHeight: .infinity)
                        Rectangle().fill(theme.separator).frame(height: 0.5)
                    }
                }
            }
            HStack {
                footer
                Spacer(minLength: 0)
                Text("\(doneToday) done today").font(.system(size: 11, weight: .medium)).foregroundStyle(theme.secondary)
            }
        }
    }

    /// Stale warning wins over the milestone line: it is the thing the user must act on.
    @ViewBuilder private var footer: some View {
        if freshness != .fresh {
            StaleFooter(freshness: freshness, theme: theme)
        } else if let milestone = snapshot.upcomingMilestone {
            HStack(spacing: 5) {
                Image(systemName: "flag.fill").font(.system(size: 10)).foregroundStyle(theme.accent).widgetAccentable()
                Text(milestone.dueDate.map { "\(milestone.name) · \($0)" } ?? milestone.name)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(theme.secondary)
                    .lineLimit(1)
            }
        }
    }
}

#Preview("Small", as: .systemSmall) {
    InboxTodoWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewEmpty
    TodoEntry.previewStale
    TodoEntry.previewSignedOut
}

#Preview("Medium", as: .systemMedium) {
    InboxTodoWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewEmpty
}

#Preview("Large", as: .systemLarge) {
    InboxTodoWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewStale
}

#Preview("Rectangular", as: .accessoryRectangular) {
    InboxTodoWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry(date: Date(), snapshot: .previewPrivate)
}

#Preview("Inline", as: .accessoryInline) {
    InboxTodoWidget()
} timeline: {
    TodoEntry.preview
}

#Preview("Circular", as: .accessoryCircular) {
    InboxTodoWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewEmpty
}
