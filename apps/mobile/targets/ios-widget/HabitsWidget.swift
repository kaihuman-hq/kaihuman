import AppIntents
import SwiftUI
import WidgetKit

struct HabitsWidget: Widget {
    let kind = "HabitsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            HabitsEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Habits")
        .description("Today's habits. Tap Log to check one in.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

struct HabitsView: View {
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
        SnapshotShell(entry: entry, style: style, url: DeepLink.app) { snapshot in
            HabitsContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct HabitsEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HabitsView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct HabitsContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }
    private var habits: [SharedHabit] { snapshot.habits ?? [] }
    private var doneCount: Int { habits.filter { snapshot.habitDone($0, at: entry.date) }.count }

    var body: some View {
        if habits.isEmpty {
            switch style.family {
            case .accessoryRectangular:
                Text("No habits yet").font(.system(size: 13, weight: .semibold))
            default:
                VStack(alignment: .leading, spacing: 8) {
                    WidgetHeader(title: "HABITS", theme: theme)
                    EmptyStateView(title: "No habits yet", subtitle: "Add a habit file in the app", theme: theme)
                }
            }
        } else if style.family == .accessoryRectangular {
            rectangular
        } else {
            small
        }
    }

    // MARK: Rows

    private func glyph(_ habit: SharedHabit) -> some View {
        let done = snapshot.habitDone(habit, at: entry.date)
        let symbol = habit.pending == true ? "clock" : (done ? "checkmark.circle.fill" : "circle")
        return Image(systemName: symbol)
            .font(.system(size: 15))
            .foregroundStyle(habit.pending == true ? theme.warning : (done ? theme.success : theme.secondary))
            .widgetAccentable()
    }

    private func streak(_ habit: SharedHabit) -> some View {
        HStack(spacing: 2) {
            Image(systemName: "flame.fill").font(.system(size: 9))
            Text("\(habit.streakDays)").font(.system(size: 11, weight: .semibold, design: .monospaced))
        }
        .foregroundStyle(theme.secondary)
    }

    private func logButton(_ habit: SharedHabit) -> some View {
        Button(intent: LogHabitIntent(path: habit.path)) {
            Text("Log")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(theme.onFill)
                .padding(.horizontal, 10)
                .padding(.vertical, 3)
                .background(Capsule().fill(theme.fill))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func row(_ habit: SharedHabit) -> some View {
        let done = snapshot.habitDone(habit, at: entry.date)
        return HStack(spacing: 6) {
            glyph(habit)
            Text(habit.name)
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(done ? theme.secondary : theme.label)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .privacySensitive()
            if done {
                streak(habit)
            } else {
                logButton(habit)
            }
        }
    }

    // MARK: Families

    private var small: some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(title: "HABITS", trailing: "\(doneCount)/\(habits.count)", theme: theme)
            ForEach(habits.prefix(3)) { habit in row(habit) }
            Spacer(minLength: 0)
            StaleFooter(freshness: freshness, theme: theme)
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "flame.fill").font(.system(size: 9)).widgetAccentable()
                Text("HABITS").font(.system(size: 11, weight: .bold)).tracking(0.6).widgetAccentable()
                Spacer(minLength: 0)
                Text("\(doneCount)/\(habits.count)").font(.system(size: 11, weight: .semibold, design: .monospaced))
            }
            if let next = habits.first(where: { !snapshot.habitDone($0, at: entry.date) }) {
                if snapshot.showsLockScreenText {
                    HStack {
                        Text(next.name)
                            .font(.system(size: 14, weight: .semibold))
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .privacySensitive()
                        Button(intent: LogHabitIntent(path: next.path)) {
                            Text("Log").font(.system(size: 12, weight: .semibold))
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    Text("\(habits.count - doneCount) left today").font(.system(size: 14, weight: .semibold))
                }
            } else {
                Text("All done today").font(.system(size: 14, weight: .semibold))
            }
            if freshness != .fresh {
                Text("Synced \(freshness.hours)h ago").font(.system(size: 11)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private extension TodoEntry {
    static var previewNoHabits: TodoEntry {
        var snapshot = SharedTodoSnapshot.preview
        snapshot.habits = nil
        return TodoEntry(date: Date(), snapshot: snapshot)
    }
}

#Preview("Small", as: .systemSmall) {
    HabitsWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewNoHabits
    TodoEntry.previewStale
    TodoEntry.previewSignedOut
}

#Preview("Rectangular", as: .accessoryRectangular) {
    HabitsWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry(date: Date(), snapshot: .previewPrivate)
}
