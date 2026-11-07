import AppIntents
import SwiftUI
import WidgetKit

// MARK: Configuration

enum BoardColumn: String, AppEnum {
    case inbox
    case inProgress
    case backlog

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Column")
    static let caseDisplayRepresentations: [BoardColumn: DisplayRepresentation] = [
        .inbox: DisplayRepresentation(title: "Inbox"),
        .inProgress: DisplayRepresentation(title: "In progress"),
        .backlog: DisplayRepresentation(title: "Backlog"),
    ]

    var filter: TodoSourceFilter {
        switch self {
        case .inbox: return .inbox
        case .inProgress: return .inProgress
        case .backlog: return .backlog
        }
    }
}

/// A tag choice for the board filter, from the cached snapshot so it works offline.
struct TagEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Tag")
    static let defaultQuery = TagEntityQuery()

    var id: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "#\(id)")
    }
}

struct TagEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [TagEntity] {
        // A tag that has since vanished keeps resolving so the board shows an empty state.
        identifiers.map { TagEntity(id: $0) }
    }

    func suggestedEntities() async throws -> [TagEntity] {
        (SharedTodoStore.shared.load()?.allTags ?? []).map { TagEntity(id: $0) }
    }
}

struct BoardColumnConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Board column"
    static let description = IntentDescription("Choose a column and an optional tag.")

    @Parameter(title: "Column", default: .inbox)
    var column: BoardColumn

    @Parameter(title: "Tag")
    var tag: TagEntity?

    init() {}

    init(column: BoardColumn, tag: TagEntity? = nil) {
        self.column = column
        self.tag = tag
    }
}

struct BoardColumnProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> TodoEntry {
        TodoEntry(date: Date(), snapshot: SharedTodoSnapshot.preview, source: .inbox)
    }

    func snapshot(for configuration: BoardColumnConfigurationIntent, in context: Context) async -> TodoEntry {
        let snapshot = SharedTodoStore.shared.load() ?? (context.isPreview ? SharedTodoSnapshot.preview : nil)
        return TodoEntry(date: Date(), snapshot: snapshot, source: configuration.column.filter, tag: configuration.tag?.id)
    }

    func timeline(for configuration: BoardColumnConfigurationIntent, in context: Context) async -> Timeline<TodoEntry> {
        KaihumanTimeline.make(
            snapshot: SharedTodoStore.shared.load(), source: configuration.column.filter, tag: configuration.tag?.id
        )
    }
}

// MARK: Widget

struct BoardColumnWidget: Widget {
    let kind = "BoardColumnWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: BoardColumnConfigurationIntent.self, provider: BoardColumnProvider()) { entry in
            BoardColumnEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Board column")
        .description("One board column. Tap a circle to complete, or Start a backlog todo.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: Views

struct BoardColumnView: View {
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
            BoardColumnContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct BoardColumnEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        BoardColumnView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct BoardColumnContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }
    private var isLarge: Bool { style.family == .systemLarge }
    /// Fixed so rows keep the same rhythm whatever the count; a flexible row would stretch to fill the widget.
    private var rowHeight: CGFloat { isLarge ? 44 : 32 }
    /// Large: 350 pt of content minus header and spacing leaves room for 7 rows, 6 with the stale footer.
    private var maxRows: Int { isLarge ? (freshness == .fresh ? 7 : 6) : 3 }

    private var items: [SharedTodoItem] {
        let column = snapshot.items(for: entry.source)
        guard let tag = entry.tag else { return column }
        return column.filter { $0.tags.contains(tag) }
    }

    private var columnName: String {
        switch entry.source {
        case .inProgress: return "IN PROGRESS"
        case .backlog: return "BACKLOG"
        default: return "INBOX"
        }
    }

    private var title: String {
        entry.tag.map { "\(columnName) · #\($0.uppercased())" } ?? columnName
    }

    private var emptyTitle: String {
        switch entry.source {
        case .inProgress: return "Nothing in progress — pick from backlog"
        case .backlog: return "Backlog is empty"
        default: return "Inbox zero"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: isLarge ? 8 : 6) {
            WidgetHeader(title: title, trailing: "\(items.count)", theme: theme)
            if items.isEmpty {
                EmptyStateView(title: emptyTitle, theme: theme)
            } else {
                VStack(spacing: 0) {
                    ForEach(items.prefix(maxRows)) { item in
                        TodoRow(
                            item: item, style: style, fontSize: isLarge ? 15 : 13, showsTag: isLarge,
                            showsStart: true, link: DeepLink.board(item: item.id)
                        )
                        .frame(height: rowHeight)
                        Rectangle().fill(theme.separator).frame(height: 0.5)
                    }
                }
            }
            if freshness != .fresh {
                StaleFooter(freshness: freshness, theme: theme)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

#Preview("Medium", as: .systemMedium) {
    BoardColumnWidget()
} timeline: {
    TodoEntry(date: Date(), snapshot: .preview, source: .backlog)
    TodoEntry(date: Date(), snapshot: .preview, source: .inProgress)
    TodoEntry(date: Date(), snapshot: .previewEmpty, source: .inbox)
}

#Preview("Large", as: .systemLarge) {
    BoardColumnWidget()
} timeline: {
    TodoEntry(date: Date(), snapshot: .preview, source: .backlog, tag: "work")
    TodoEntry(date: Date(), snapshot: .previewStale, source: .inProgress)
    TodoEntry.previewSignedOut
}
