import SwiftUI
import WidgetKit

struct WeeklyDoneView: View {
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
            WeeklyDoneContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct WeeklyDoneContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var done: Int { snapshot.doneThisWeek }
    private var goal: Int { snapshot.weeklyGoal }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }

    var body: some View {
        switch style.family {
        case .accessoryInline: inline
        case .accessoryCircular: circular
        default: small
        }
    }

    private var inline: some View {
        let streak = snapshot.streakDays
        return Group {
            if streak > 0 {
                Text("\(Image(systemName: "flame.fill")) \(streak)-day streak · \(done) this week")
            } else {
                Text("\(Image(systemName: "checkmark.circle")) \(done) done this week")
            }
        }
    }

    private var circular: some View {
        Gauge(value: Double(min(done, goal)), in: 0...Double(goal)) {
            Text("Done")
        } currentValueLabel: {
            Text("\(done)")
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
    }

    private var small: some View {
        VStack(spacing: 0) {
            HStack {
                Text("THIS WEEK")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(theme.accent)
                    .widgetAccentable()
                Spacer(minLength: 0)
            }
            ring.frame(width: 60, height: 60).padding(.top, 6)
            Group {
                if freshness == .fresh {
                    Text("\(snapshot.streakDays)-day streak")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(theme.label)
                } else {
                    StaleFooter(freshness: freshness, theme: theme)
                }
            }
            .padding(.top, 6)
            Spacer(minLength: 4)
            bars
        }
    }

    private var ring: some View {
        let fraction = min(1, Double(done) / Double(goal))
        return ZStack {
            Circle().stroke(theme.track, lineWidth: 7)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(theme.accent, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .widgetAccentable()
            VStack(spacing: 0) {
                Text("\(done)")
                    .font(WidgetTheme.number(19))
                    .foregroundStyle(theme.label)
                    .minimumScaleFactor(0.6)
                    .widgetAccentable()
                Text("/\(goal)")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(theme.secondary)
            }
        }
    }

    private var bars: some View {
        let counts = snapshot.stats?.doneByDay ?? []
        let today = snapshot.weekdayIndex(at: entry.date)
        let peak = max(1, counts.max() ?? 1)
        let letters = ["M", "T", "W", "T", "F", "S", "S"]
        return HStack(alignment: .bottom, spacing: 7) {
            ForEach(0..<7, id: \.self) { index in
                let value = index < counts.count ? counts[index] : 0
                let isFuture = index > today
                VStack(spacing: 3) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(isFuture ? theme.track : theme.accent)
                        .opacity(index == today || isFuture ? 1 : 0.55)
                        .frame(width: 8, height: max(3, 18 * CGFloat(value) / CGFloat(peak)))
                        .widgetAccentable(!isFuture)
                    // Today is bold, not just brighter, so it reads without colour.
                    Text(letters[index])
                        .font(.system(size: 8.5, weight: index == today ? .heavy : .semibold))
                        .foregroundStyle(index == today ? theme.accent : theme.secondary)
                }
                .frame(width: 12)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

struct WeeklyDoneEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        WeeklyDoneView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct WeeklyDoneWidget: Widget {
    let kind = "WeeklyDoneWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            WeeklyDoneEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Weekly done")
        .description("Todos finished this week against your goal.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

#Preview("Small", as: .systemSmall) {
    WeeklyDoneWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewStale
    TodoEntry.previewSignedOut
}

#Preview("Circular", as: .accessoryCircular) {
    WeeklyDoneWidget()
} timeline: {
    TodoEntry.preview
}

#Preview("Inline", as: .accessoryInline) {
    WeeklyDoneWidget()
} timeline: {
    TodoEntry.preview
}
