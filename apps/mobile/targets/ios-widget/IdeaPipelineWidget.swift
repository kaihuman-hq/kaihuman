import AppIntents
import SwiftUI
import WidgetKit

struct IdeaPipelineWidget: Widget {
    let kind = "IdeaPipelineWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            IdeaPipelineEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Idea pipeline")
        .description("Ideas by stage, and the hottest one to log against.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct IdeaPipelineView: View {
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
        SnapshotShell(entry: entry, style: style, url: DeepLink.ideas) { snapshot in
            IdeaPipelineContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct IdeaPipelineEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        IdeaPipelineView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct IdeaPipelineContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private static let stages = ["seed", "exploring", "committed", "shipped"]

    private var theme: WidgetTheme { style.theme }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }
    private var stages: [IdeaStage] { snapshot.ideaStages(preferred: Self.stages) }
    private var hot: SharedHotIdea? { snapshot.ideas?.hot.first }

    var body: some View {
        if stages.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(title: "IDEAS", theme: theme)
                EmptyStateView(title: "No ideas yet", subtitle: "Capture one from the app", theme: theme)
            }
        } else if style.family == .systemMedium {
            medium
        } else {
            small
        }
    }

    private func stageLabel(_ status: String) -> String {
        status.prefix(1).uppercased() + status.dropFirst()
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(title: "IDEAS", theme: theme)
            // A small widget has one tap target (the widget URL), so the stages are plain rows.
            ForEach(stages.prefix(4)) { stage in
                HStack {
                    Text(stageLabel(stage.status))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(theme.label)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text("\(stage.count)")
                        .font(WidgetTheme.number(14))
                        .foregroundStyle(theme.label)
                        .widgetAccentable()
                }
            }
            Spacer(minLength: 0)
            StaleFooter(freshness: freshness, theme: theme)
        }
    }

    private var medium: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(title: "IDEAS", theme: theme)
                HStack(spacing: 8) {
                    ForEach(stages.prefix(4)) { stage in
                        Link(destination: DeepLink.ideas(status: stage.status)) {
                            VStack(spacing: 2) {
                                Text("\(stage.count)")
                                    .font(WidgetTheme.number(22))
                                    .foregroundStyle(theme.label)
                                    .minimumScaleFactor(0.6)
                                    .lineLimit(1)
                                    .widgetAccentable()
                                Text(stageLabel(stage.status))
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundStyle(theme.secondary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(theme.button))
                        }
                    }
                }
                Spacer(minLength: 0)
                StaleFooter(freshness: freshness, theme: theme)
            }
            .frame(maxWidth: .infinity)
            Rectangle().fill(theme.separator).frame(width: 0.5).padding(.horizontal, 14)
            hotIdea.frame(width: 120)
        }
    }

    @ViewBuilder private var hotIdea: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "flame.fill").font(.system(size: 10)).foregroundStyle(theme.warning).widgetAccentable()
                Text(hot.map { $0.level.uppercased() } ?? "HOT")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.6)
                    .foregroundStyle(theme.secondary)
            }
            if let hot {
                Text(hot.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(theme.label)
                    .lineLimit(3)
                    .privacySensitive()
                Spacer(minLength: 0)
                Button(intent: OpenIdeaLogIntent(slug: hot.slug)) {
                    Text("Log")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(theme.onFill)
                        .frame(maxWidth: .infinity, minHeight: 28)
                        .background(Capsule().fill(theme.fill))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            } else {
                Text("Nothing hot right now")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(theme.secondary)
                Spacer(minLength: 0)
            }
        }
    }
}

private extension TodoEntry {
    static var previewNoIdeas: TodoEntry {
        var snapshot = SharedTodoSnapshot.preview
        snapshot.ideas = nil
        return TodoEntry(date: Date(), snapshot: snapshot)
    }
}

#Preview("Small", as: .systemSmall) {
    IdeaPipelineWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewNoIdeas
    TodoEntry.previewStale
}

#Preview("Medium", as: .systemMedium) {
    IdeaPipelineWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewNoIdeas
    TodoEntry.previewSignedOut
}
