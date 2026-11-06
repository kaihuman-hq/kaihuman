import AppIntents
import SwiftUI
import WidgetKit

/// The four capture buttons. Every one opens the app on its capture sheet via OpenQuickCaptureIntent.
private struct CaptureButton: Identifiable {
    let kind: QuickCaptureKind
    let title: String
    let symbol: String
    var id: String { kind.rawValue }

    static let all: [CaptureButton] = [
        CaptureButton(kind: .todo, title: "Todo", symbol: "checkmark.circle"),
        CaptureButton(kind: .note, title: "Note", symbol: "note.text"),
        CaptureButton(kind: .log, title: "Log", symbol: "book.closed"),
        CaptureButton(kind: .idea, title: "Idea", symbol: "lightbulb"),
    ]
}

struct QuickCaptureView: View {
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

    private var theme: WidgetTheme { style.theme }
    private var freshness: SnapshotFreshness? { entry.snapshot?.freshness(at: entry.date) }

    var body: some View {
        if style.family == .systemMedium {
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    ForEach(CaptureButton.all) { capture in
                        button(capture)
                    }
                }
                footer
            }
        } else {
            // 2x2 grid; the Todo button is the primary (filled) one.
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    button(CaptureButton.all[0])
                    button(CaptureButton.all[1])
                }
                HStack(spacing: 8) {
                    button(CaptureButton.all[2])
                    button(CaptureButton.all[3])
                }
            }
        }
    }

    /// Capture needs no data, so it never blocks on sign-in; the footer just says why a sync is missing.
    @ViewBuilder private var footer: some View {
        if entry.snapshot == nil {
            Text("Open kaihuman to sign in")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(theme.secondary)
        } else if let freshness, freshness != .fresh {
            StaleFooter(freshness: freshness, theme: theme)
        }
    }

    private func button(_ capture: CaptureButton) -> some View {
        let primary = capture.kind == .todo
        return Button(intent: OpenQuickCaptureIntent(kind: capture.kind)) {
            VStack(spacing: 5) {
                Image(systemName: capture.symbol)
                    .font(.system(size: 20, weight: .semibold))
                Text(capture.title).font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(primary ? theme.onFill : theme.label)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 17, style: .continuous)
                    .fill(primary ? theme.fill : theme.button)
            )
            .widgetAccentable(primary)
        }
        .buttonStyle(.plain)
    }
}

struct QuickCaptureEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        QuickCaptureView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct QuickCaptureWidget: Widget {
    let kind = "QuickCaptureWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            QuickCaptureEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Quick capture")
        .description("Capture a todo, note, log or idea.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview("Small", as: .systemSmall) {
    QuickCaptureWidget()
} timeline: {
    TodoEntry.preview
}

#Preview("Medium", as: .systemMedium) {
    QuickCaptureWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewStale
    TodoEntry.previewSignedOut
}
