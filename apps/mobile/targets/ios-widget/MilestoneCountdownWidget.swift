import AppIntents
import SwiftUI
import WidgetKit

// MARK: Configuration

/// A milestone choice, from the cached snapshot so it works offline.
struct MilestoneEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Milestone")
    static let defaultQuery = MilestoneEntityQuery()

    var id: String
    var name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct MilestoneEntityQuery: EntityQuery {
    private func all() -> [MilestoneEntity] {
        (SharedTodoStore.shared.load()?.milestones ?? []).map { MilestoneEntity(id: $0.id, name: $0.name) }
    }

    func entities(for identifiers: [String]) async throws -> [MilestoneEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [MilestoneEntity] {
        all()
    }
}

struct MilestoneConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Milestone countdown"
    static let description = IntentDescription("Choose a milestone. Leave empty for the next one due.")

    @Parameter(title: "Milestone")
    var milestone: MilestoneEntity?

    init() {}

    init(milestone: MilestoneEntity?) {
        self.milestone = milestone
    }
}

struct MilestoneProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> TodoEntry {
        TodoEntry(date: Date(), snapshot: SharedTodoSnapshot.preview)
    }

    func snapshot(for configuration: MilestoneConfigurationIntent, in context: Context) async -> TodoEntry {
        let snapshot = SharedTodoStore.shared.load() ?? (context.isPreview ? SharedTodoSnapshot.preview : nil)
        return TodoEntry(date: Date(), snapshot: snapshot, milestoneId: configuration.milestone?.id)
    }

    func timeline(for configuration: MilestoneConfigurationIntent, in context: Context) async -> Timeline<TodoEntry> {
        KaihumanTimeline.daily(snapshot: SharedTodoStore.shared.load(), milestoneId: configuration.milestone?.id)
    }
}

// MARK: Widget

struct MilestoneCountdownWidget: Widget {
    let kind = "MilestoneCountdownWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: MilestoneConfigurationIntent.self, provider: MilestoneProvider()) { entry in
            MilestoneCountdownEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Milestone countdown")
        .description("Days left and open versus done todos for a milestone.")
        .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryCircular])
    }
}

// MARK: Views

struct MilestoneCountdownView: View {
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

    private var url: URL {
        entry.snapshot?.milestone(id: entry.milestoneId).map { DeepLink.board(milestone: $0.id) } ?? DeepLink.board
    }

    var body: some View {
        SnapshotShell(entry: entry, style: style, url: url) { snapshot in
            MilestoneCountdownContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct MilestoneCountdownEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        MilestoneCountdownView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct MilestoneCountdownContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }
    private var milestone: SharedMilestone? { snapshot.milestone(id: entry.milestoneId) }

    private func days(_ milestone: SharedMilestone) -> Int? {
        snapshot.daysLeft(until: milestone.dueDate, at: entry.date)
    }

    private func total(_ milestone: SharedMilestone) -> Int { max(1, milestone.open + milestone.done) }

    var body: some View {
        if let milestone {
            switch style.family {
            case .accessoryCircular: circular(milestone)
            case .accessoryRectangular: rectangular(milestone)
            default: small(milestone)
            }
        } else {
            empty
        }
    }

    private var empty: some View {
        Group {
            switch style.family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "flag").font(.system(size: 20)).widgetAccentable()
                }
            case .accessoryRectangular:
                Text("No milestone").font(.system(size: 13, weight: .semibold))
            default:
                EmptyStateView(title: "No milestone", subtitle: "Add one to your board", theme: theme)
            }
        }
    }

    /// "12", "Today" or "-3" kept short for the big number; `caption` spells it out.
    private func dayNumber(_ milestone: SharedMilestone) -> String {
        guard let left = days(milestone) else { return "–" }
        return left == 0 ? "0" : "\(abs(left))"
    }

    private func caption(_ milestone: SharedMilestone) -> String {
        guard let left = days(milestone) else { return "no due date" }
        if left == 0 { return "due today" }
        if left < 0 { return abs(left) == 1 ? "day overdue" : "days overdue" }
        return left == 1 ? "day left" : "days left"
    }

    private func circular(_ milestone: SharedMilestone) -> some View {
        Gauge(value: Double(milestone.done), in: 0...Double(total(milestone))) {
            Text("Days")
        } currentValueLabel: {
            Text(dayNumber(milestone))
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
    }

    private func rectangular(_ milestone: SharedMilestone) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "flag.fill").font(.system(size: 9)).widgetAccentable()
                Text(milestone.name).font(.system(size: 12, weight: .bold)).lineLimit(1)
            }
            // Count inline: the linear gauge's own labels add a row the rectangle has no room for.
            Text("\(dayNumber(milestone)) \(caption(milestone)) · \(milestone.done)/\(milestone.open + milestone.done)")
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Gauge(value: Double(milestone.done), in: 0...Double(total(milestone))) { EmptyView() }
                .gaugeStyle(.accessoryLinearCapacity)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func small(_ milestone: SharedMilestone) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: "MILESTONE", theme: theme)
            Text(milestone.name)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(theme.secondary)
                .lineLimit(1)
                .padding(.top, 2)
            Text(dayNumber(milestone))
                .font(WidgetTheme.number(40))
                .foregroundStyle(theme.label)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .padding(.top, 4)
                .widgetAccentable()
            Text(caption(milestone))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(theme.label)
            Spacer(minLength: 0)
            ProgressBar(fraction: Double(milestone.done) / Double(total(milestone)), theme: theme)
            if freshness != .fresh {
                StaleFooter(freshness: freshness, theme: theme).padding(.top, 4)
            } else {
                Text("\(milestone.open) open · \(milestone.done) done")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(theme.secondary)
                    .lineLimit(1)
                    .padding(.top, 4)
            }
        }
    }
}

private extension TodoEntry {
    static var previewOverdue: TodoEntry {
        var snapshot = SharedTodoSnapshot.preview
        snapshot.upcomingMilestone = SharedUpcomingMilestone(id: "m1", name: "Widgets v1", dueDate: "2020-01-01")
        snapshot.milestones = [SharedMilestone(id: "m1", name: "Widgets v1", dueDate: "2020-01-01", open: 5, done: 7)]
        return TodoEntry(date: Date(), snapshot: snapshot)
    }
}

#Preview("Small", as: .systemSmall) {
    MilestoneCountdownWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewOverdue
    TodoEntry.previewStale
    TodoEntry.previewSignedOut
}

#Preview("Rectangular", as: .accessoryRectangular) {
    MilestoneCountdownWidget()
} timeline: {
    TodoEntry.preview
}

#Preview("Circular", as: .accessoryCircular) {
    MilestoneCountdownWidget()
} timeline: {
    TodoEntry.preview
}
