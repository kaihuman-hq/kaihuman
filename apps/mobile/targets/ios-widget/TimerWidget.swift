import AppIntents
import SwiftUI
import WidgetKit

/// Today's time-tracking timer. The clock is `Text(timerInterval:)`, which the system ticks
/// without timeline reloads; the snapshot only has to carry the interval's start.
struct TimerWidget: Widget {
    let kind = "TimerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            TimerEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Timer")
        .description("Your running time-tracking timer. Tap ■ to stop it.")
        .supportedFamilies([.systemSmall])
    }
}

extension DeepLink {
    /// `kaihuman://dashboard/tile?path=…`, the app's tile screen for one file.
    static func tile(path: String) -> URL {
        var components = URLComponents()
        components.scheme = "kaihuman"
        components.host = "dashboard"
        components.path = "/tile"
        components.queryItems = [URLQueryItem(name: "path", value: path)]
        return components.url ?? app
    }
}

struct TimerView: View {
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
        SnapshotShell(entry: entry, style: style, url: entry.snapshot?.timer.map { DeepLink.tile(path: $0.path) } ?? DeepLink.app) { snapshot in
            TimerContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct TimerEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        TimerView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct TimerContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }

    /// Recording red: a live dot is the one place the widgets use it. Tinted modes fall back to the
    /// label colour; the "Stopped" text and the ■ button carry the state there.
    private var liveDot: Color {
        if style.isTinted { return theme.label }
        return style.colorScheme == .light ? Color(hex: 0xD70015) : Color(hex: 0xFF453A)
    }

    /// A timer started on an earlier day is not today's; the app learns that on its next sync.
    private var start: Date? {
        guard let start = snapshot.timerStart,
              snapshot.resolvedCalendar.isDate(start, inSameDayAs: entry.date) else { return nil }
        return start
    }

    private static func duration(_ minutes: Int) -> String {
        "\(minutes / 60)h \(minutes % 60)m"
    }

    var body: some View {
        if let timer = snapshot.timer {
            content(timer)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                header(nil)
                EmptyStateView(title: "No timer yet", subtitle: "Add a time-tracking file in the app", theme: theme)
            }
        }
    }

    private func header(_ stop: SharedTimer?) -> some View {
        HStack {
            Text("TIMER")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(theme.accent)
                .widgetAccentable()
            Spacer(minLength: 4)
            if let stop {
                Button(intent: StopTimerIntent(path: stop.path)) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(theme.onFill)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(theme.fill))
                        .contentShape(Circle())
                        .widgetAccentable()
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Stop timer")
            }
        }
    }

    private func content(_ timer: SharedTimer) -> some View {
        let running = start
        return VStack(alignment: .leading, spacing: 0) {
            header(running == nil || timer.pending == true ? nil : timer)
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Circle()
                    .fill(running == nil ? theme.track : liveDot)
                    .frame(width: 8, height: 8)
                Text(timer.label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(theme.label)
                    .lineLimit(1)
                    .privacySensitive()
            }
            Group {
                if let running {
                    Text(timerInterval: running...Date.distantFuture, countsDown: false)
                } else {
                    Text(timer.pending == true ? "Stopping…" : "Stopped")
                }
            }
            .font(WidgetTheme.number(running == nil ? 24 : 34))
            .foregroundStyle(running == nil ? theme.secondary : theme.label)
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .padding(.top, 4)
            .widgetAccentable()
            Spacer(minLength: 0)
            if freshness != .fresh {
                StaleFooter(freshness: freshness, theme: theme)
            } else {
                HStack(spacing: 4) {
                    Text("today")
                    if let running {
                        // Closed minutes folded into the start, so the total ticks along with the clock.
                        Text(
                            timerInterval: running.addingTimeInterval(-TimeInterval(timer.todayMinutes * 60))...Date.distantFuture,
                            countsDown: false
                        )
                        .monospacedDigit()
                    } else {
                        Text(Self.duration(timer.todayMinutes)).contentTransition(.numericText())
                    }
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(theme.secondary)
                .lineLimit(1)
            }
        }
    }
}

private extension TodoEntry {
    static var previewTimerStopped: TodoEntry {
        var snapshot = SharedTodoSnapshot.preview
        snapshot.timer?.startedAt = nil
        return TodoEntry(date: Date(), snapshot: snapshot)
    }

    static var previewNoTimer: TodoEntry {
        var snapshot = SharedTodoSnapshot.preview
        snapshot.timer = nil
        return TodoEntry(date: Date(), snapshot: snapshot)
    }
}

#Preview("Small", as: .systemSmall) {
    TimerWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewTimerStopped
    TodoEntry.previewNoTimer
    TodoEntry.previewSignedOut
}
