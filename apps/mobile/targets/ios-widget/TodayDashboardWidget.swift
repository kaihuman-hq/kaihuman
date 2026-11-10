import SwiftUI
import WidgetKit

/// Extra-large Today dashboard (the iOS 27 size on iPhone, iPad's extra-large before it): the full
/// Today list on the left; counts, the active Focus filter, habits and the next milestone beside it.
/// The list follows the Focus filter through `nextUp`, so a "Work" Focus shows work only.
struct TodayDashboardWidget: Widget {
    let kind = "TodayDashboardWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            TodayDashboardEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Today dashboard")
        .description("Everything due today with counts, habits and your Focus filter.")
        .supportedFamilies([.systemExtraLarge])
    }
}

struct TodayDashboardView: View {
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
        SnapshotShell(entry: entry, style: style, url: DeepLink.today) { snapshot in
            TodayDashboardContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct TodayDashboardEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        TodayDashboardView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct TodayDashboardContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var items: [SharedTodoItem] { snapshot.todayTasks(for: .all, at: entry.date) }
    private var doneToday: Int { snapshot.doneToday(at: entry.date) }
    private var overdue: Int { snapshot.overdueCount(in: items, at: entry.date) }
    private var habits: [SharedHabit] { snapshot.habits ?? [] }
    private var habitsDone: Int { habits.filter { snapshot.habitDone($0, at: entry.date) }.count }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            WidgetHeader(title: title, trailing: "\(items.count) left", theme: theme, showsAdd: true)
            HStack(alignment: .top, spacing: 16) {
                list.frame(maxWidth: .infinity, alignment: .topLeading)
                Rectangle().fill(theme.separator).frame(width: 0.5)
                sidebar.frame(width: 190, alignment: .topLeading)
            }
            if freshness != .fresh {
                StaleFooter(freshness: freshness, theme: theme)
            }
        }
    }

    /// "TODAY" or "TODAY · WORK" while a Focus filter is on.
    private var title: String {
        if let filter = snapshot.filter, !filter.isEmpty { return "TODAY · \(filter.title.uppercased())" }
        return "TODAY"
    }

    @ViewBuilder private var list: some View {
        if items.isEmpty {
            EmptyStateView(title: "Nothing due today", subtitle: "\(doneToday) done today", theme: theme)
        } else {
            VStack(spacing: 0) {
                ForEach(items.prefix(9)) { item in
                    TodayRow(item: item, style: style, trailing: snapshot.todayLabel(for: item, at: entry.date), fontSize: 15)
                        .frame(maxHeight: .infinity)
                    Rectangle().fill(theme.separator).frame(height: 0.5)
                }
            }
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                stat(items.count, "left")
                stat(doneToday, "done")
                stat(overdue, "overdue")
            }
            if !habits.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(habitsDone)/\(habits.count)")
                        .font(WidgetTheme.number(22))
                        .foregroundStyle(theme.label)
                        .contentTransition(.numericText())
                    Text("habits today").font(.system(size: 11, weight: .medium)).foregroundStyle(theme.secondary)
                }
            }
            if let milestone = snapshot.upcomingMilestone {
                VStack(alignment: .leading, spacing: 2) {
                    Label(milestone.name, systemImage: "flag.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(theme.label)
                        .lineLimit(1)
                    if let due = milestone.dueDate {
                        Text(due).font(.system(size: 11, weight: .medium)).foregroundStyle(theme.secondary)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func stat(_ value: Int, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(WidgetTheme.number(22))
                .foregroundStyle(theme.label)
                .contentTransition(.numericText())
            Text(label).font(.system(size: 11, weight: .medium)).foregroundStyle(theme.secondary)
        }
    }
}

#Preview("Extra large", as: .systemExtraLarge) {
    TodayDashboardWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewEmpty
    TodoEntry.previewSignedOut
}
