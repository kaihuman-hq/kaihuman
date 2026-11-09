import SwiftUI
import WidgetKit

struct InboxCountView: View {
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
        SnapshotShell(entry: entry, style: style, url: DeepLink.inbox) { snapshot in
            InboxCountContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct InboxCountContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var todos: Int { snapshot.counts.inbox }
    private var notes: Int { snapshot.knowledgeInbox }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }

    var body: some View {
        switch style.family {
        case .accessoryInline: inline
        case .accessoryCircular: circular
        default: small
        }
    }

    private var inline: some View {
        Group {
            if todos + notes == 0 {
                Text("\(Image(systemName: "tray")) Inbox zero")
            } else {
                Text("\(Image(systemName: "tray")) \(todos) \(todos == 1 ? "todo" : "todos") · \(notes) \(notes == 1 ? "note" : "notes")")
            }
        }
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if todos + notes == 0 {
                Image(systemName: "checkmark").font(.system(size: 20, weight: .bold)).widgetAccentable()
            } else {
                VStack(spacing: 0) {
                    Image(systemName: "tray").font(.system(size: 11))
                    Text("\(todos + notes)")
                        .font(WidgetTheme.number(22))
                        .minimumScaleFactor(0.6)
                        .widgetAccentable()
                }
            }
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: "INBOX", theme: theme, showsAdd: true)
            if todos + notes == 0 {
                EmptyStateView(title: "Inbox zero", theme: theme)
            } else {
                Text("\(todos)")
                    .font(WidgetTheme.number(38))
                    .foregroundStyle(theme.label)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .padding(.top, 8)
                    .widgetAccentable()
                Text(todos == 1 ? "todo" : "todos")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(theme.label)
                Text("\(notes) in knowledge")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(theme.secondary)
                    .padding(.top, 2)
                Spacer(minLength: 4)
                if freshness == .fresh {
                    // A systemSmall widget has a single tap target (widgetURL), so this is a label.
                    Text("Process")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(theme.onFill)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(theme.fill))
                        .widgetAccentable()
                } else {
                    StaleFooter(freshness: freshness, theme: theme)
                }
            }
        }
    }
}

struct InboxCountEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        InboxCountView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct InboxCountWidget: Widget {
    let kind = "InboxCountWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoProvider()) { entry in
            InboxCountEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Inbox")
        .description("Todos and notes waiting to be processed.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

#Preview("Small", as: .systemSmall) {
    InboxCountWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewEmpty
    TodoEntry.previewStale
    TodoEntry.previewSignedOut
}

#Preview("Circular", as: .accessoryCircular) {
    InboxCountWidget()
} timeline: {
    TodoEntry.preview
}

#Preview("Inline", as: .accessoryInline) {
    InboxCountWidget()
} timeline: {
    TodoEntry.preview
}
