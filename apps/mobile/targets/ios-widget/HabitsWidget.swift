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
        .description("Your habit streaks and the last 7 days. Tap ✓ to check in today.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
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
        } else {
            switch style.family {
            case .accessoryRectangular: rectangular
            case .systemMedium: medium
            default: small
            }
        }
    }

    // MARK: Parts

    /// ✓ checks in today in-widget; done (or queued) shows a filled check that does nothing.
    private func checkButton(_ habit: SharedHabit, size: CGFloat = 28) -> some View {
        let done = snapshot.habitDone(habit, at: entry.date)
        let symbol = habit.pending == true ? "clock" : "checkmark"
        let face = Image(systemName: symbol)
            .font(.system(size: size * 0.5, weight: .bold))
            .foregroundStyle(done ? theme.label : theme.onFill)
            .frame(width: size, height: size)
            .background(Circle().fill(done ? theme.button : theme.fill))
            .widgetAccentable()
        return Group {
            if done {
                face.accessibilityLabel("\(habit.name) done today")
            } else {
                Button(intent: LogHabitIntent(path: habit.path)) { face.contentShape(Circle()) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Check in \(habit.name)")
            }
        }
    }

    /// Seven cells, oldest first; today is outlined so it reads without colour.
    private func week(_ habit: SharedHabit, height: CGFloat) -> some View {
        let days = snapshot.habitWeek(habit, at: entry.date)
        let reached = days.filter { $0 }.count
        return HStack(spacing: 4) {
            ForEach(0..<7, id: \.self) { index in
                ZStack {
                    RoundedRectangle(cornerRadius: 5).fill(theme.track)
                    if days[index] {
                        RoundedRectangle(cornerRadius: 5)
                            .fill(theme.accent)
                            .widgetAccentable()
                            .transition(.scale)
                    }
                }
                .overlay {
                    if index == 6 {
                        RoundedRectangle(cornerRadius: 5).strokeBorder(theme.label, lineWidth: 2)
                    }
                }
                .frame(height: height)
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(reached) of the last 7 days")
    }

    // MARK: Families

    /// One habit: the first one, so the widget does not jump between habits during the day.
    private var small: some View {
        let habit = habits[0]
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text(habit.name.uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(theme.accent)
                    .lineLimit(1)
                    .privacySensitive()
                    .widgetAccentable()
                Spacer(minLength: 4)
                checkButton(habit)
            }
            Text("\(habit.streakDays)")
                .font(WidgetTheme.number(44))
                .foregroundStyle(theme.label)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .contentTransition(.numericText())
                .padding(.top, 6)
            Text("day streak")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(theme.secondary)
                .padding(.top, 3)
            Spacer(minLength: 0)
            if freshness != .fresh {
                StaleFooter(freshness: freshness, theme: theme).padding(.bottom, 6)
            }
            week(habit, height: 20)
        }
    }

    /// Up to three habits, one row each: name, 7 days, streak.
    private var medium: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("HABITS")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(theme.accent)
                    .widgetAccentable()
                Spacer(minLength: 4)
                Text("\(doneCount)/\(habits.count) today")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(theme.secondary)
                    .contentTransition(.numericText())
            }
            Spacer(minLength: 0)
            VStack(spacing: 12) {
                ForEach(habits.prefix(3)) { habit in
                    HStack(spacing: 10) {
                        Text(habit.name)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(theme.label)
                            .lineLimit(1)
                            .frame(width: 84, alignment: .leading)
                            .privacySensitive()
                        week(habit, height: 16)
                        Text("\(habit.streakDays)")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundStyle(theme.secondary)
                            .contentTransition(.numericText())
                            .frame(width: 24, alignment: .trailing)
                    }
                }
            }
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

#Preview("Medium", as: .systemMedium) {
    HabitsWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewNoHabits
    TodoEntry.previewStale
}

#Preview("Rectangular", as: .accessoryRectangular) {
    HabitsWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry(date: Date(), snapshot: .previewPrivate)
}
