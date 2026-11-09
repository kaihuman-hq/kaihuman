import SwiftUI
import WidgetKit

/// One tap to the one-field "Add to inbox" sheet, on the Home Screen and the Lock Screen. It shows
/// no data, so it works before the first sync; the app handles sign-in.
struct QuickAddView: View {
    let style: WidgetStyle

    init(
        entry: TodoEntry,
        family: WidgetFamily,
        renderingMode: WidgetRenderingMode = .fullColor,
        colorScheme: ColorScheme = .dark
    ) {
        self.style = WidgetStyle(family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }

    private var theme: WidgetTheme { style.theme }

    var body: some View {
        content
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Add to kaihuman inbox")
            .widgetURL(DeepLink.quickInbox)
    }

    @ViewBuilder private var content: some View {
        switch style.family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .bold))
                    .widgetAccentable()
            }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .widgetAccentable()
                VStack(alignment: .leading, spacing: 0) {
                    Text("Add to inbox").font(.system(size: 15, weight: .semibold))
                    Text("kaihuman").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        default:
            VStack(alignment: .leading, spacing: 0) {
                WidgetHeader(title: "INBOX", theme: theme)
                Spacer(minLength: 0)
                Image(systemName: "plus")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(theme.onFill)
                    .frame(width: 60, height: 60)
                    .background(Circle().fill(theme.fill))
                    .widgetAccentable()
                Spacer(minLength: 0)
                Text("Add to inbox")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(theme.label)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct QuickAddEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        QuickAddView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct QuickAddWidget: Widget {
    let kind = "QuickAddWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            QuickAddEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Add to inbox")
        .description("One tap to add a line to your inbox.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

#Preview("Small", as: .systemSmall) {
    QuickAddWidget()
} timeline: {
    TodoEntry.preview
}

#Preview("Circular", as: .accessoryCircular) {
    QuickAddWidget()
} timeline: {
    TodoEntry.preview
}

#Preview("Rectangular", as: .accessoryRectangular) {
    QuickAddWidget()
} timeline: {
    TodoEntry.preview
}
