import SwiftUI
import WidgetKit

/// Lock Screen: how many open todos are due today (overdue ones count too). Opens Today.
struct DueTodayWidget: Widget {
    let kind = "DueTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            DueTodayEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Due today")
        .description("Open todos due today, overdue included.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct DueTodayView: View {
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
            DueTodayContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct DueTodayEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        DueTodayView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct DueTodayContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var due: [SharedTodoItem] { snapshot.dueByToday(at: entry.date) }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }

    var body: some View {
        switch style.family {
        case .accessoryInline: inline
        case .accessoryRectangular: rectangular
        default: circular
        }
    }

    private var inline: some View {
        Text(due.isEmpty ? "\(Image(systemName: "sun.max")) Nothing due" : "\(Image(systemName: "sun.max")) \(due.count) due today")
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if due.isEmpty {
                Image(systemName: "checkmark").font(.system(size: 20, weight: .bold)).widgetAccentable()
            } else {
                VStack(spacing: 0) {
                    Image(systemName: "sun.max").font(.system(size: 11))
                    Text("\(due.count)")
                        .font(WidgetTheme.number(22))
                        .minimumScaleFactor(0.6)
                        .widgetAccentable()
                }
            }
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "sun.max").font(.system(size: 9)).widgetAccentable()
                Text("TODAY").font(.system(size: 11, weight: .bold)).tracking(0.6).widgetAccentable()
                Spacer(minLength: 0)
                Text("\(due.count)").font(.system(size: 11, weight: .semibold, design: .monospaced))
            }
            if let first = due.first, snapshot.showsLockScreenText {
                Text(first.text)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(2)
                    .privacySensitive()
            } else {
                Text(due.isEmpty ? "Nothing due" : "\(due.count) due today").font(.system(size: 14, weight: .semibold))
            }
            if freshness != .fresh {
                Text("Synced \(freshness.hours)h ago").font(.system(size: 11)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview("Circular", as: .accessoryCircular) {
    DueTodayWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewSignedOut
}

#Preview("Rectangular", as: .accessoryRectangular) {
    DueTodayWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry(date: Date(), snapshot: .previewPrivate)
}

#Preview("Inline", as: .accessoryInline) {
    DueTodayWidget()
} timeline: {
    TodoEntry.preview
}
