import AppIntents
import SwiftUI
import WidgetKit

/// Static provider: the rotation offset (the user's "Next" taps) is read when the timeline is built.
struct KnowledgeCardProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodoEntry {
        TodoEntry(date: Date(), snapshot: SharedTodoSnapshot.preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodoEntry) -> Void) {
        let snapshot = SharedTodoStore.shared.load() ?? (context.isPreview ? SharedTodoSnapshot.preview : nil)
        completion(TodoEntry(date: Date(), snapshot: snapshot, cardOffset: SharedTodoStore.shared.cardOffset))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodoEntry>) -> Void) {
        completion(KaihumanTimeline.rotating(
            snapshot: SharedTodoStore.shared.load(), cardOffset: SharedTodoStore.shared.cardOffset
        ))
    }
}

struct KnowledgeCardWidget: Widget {
    let kind = "KnowledgeCardWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KnowledgeCardProvider()) { entry in
            KnowledgeCardEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Knowledge card")
        .description("A page from your wiki, a new one every 3 hours.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct KnowledgeCardView: View {
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

    private var url: URL {
        entry.snapshot?.card(at: entry.date, offset: entry.cardOffset).map { DeepLink.file(path: $0.path) } ?? DeepLink.app
    }

    var body: some View {
        SnapshotShell(entry: entry, style: style, url: url) { snapshot in
            KnowledgeCardContent(snapshot: snapshot, entry: entry, style: style)
        }
    }
}

struct KnowledgeCardEntryView: View {
    let entry: TodoEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        KnowledgeCardView(entry: entry, family: family, renderingMode: renderingMode, colorScheme: colorScheme)
    }
}

struct KnowledgeCardContent: View {
    let snapshot: SharedTodoSnapshot
    let entry: TodoEntry
    let style: WidgetStyle

    private var theme: WidgetTheme { style.theme }
    private var freshness: SnapshotFreshness { snapshot.freshness(at: entry.date) }
    private var isLarge: Bool { style.family == .systemLarge }

    var body: some View {
        if let card = snapshot.card(at: entry.date, offset: entry.cardOffset) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    WidgetHeader(title: "KNOWLEDGE", theme: theme)
                    nextButton
                }
                cardBody(card, large: isLarge)
                if isLarge, let following = snapshot.card(at: entry.date, offset: entry.cardOffset + 1),
                   following.path != card.path {
                    Rectangle().fill(theme.separator).frame(height: 0.5).padding(.vertical, 6)
                    Text("UP NEXT")
                        .font(.system(size: 10, weight: .bold)).tracking(0.6)
                        .foregroundStyle(theme.secondary)
                    cardBody(following, large: false)
                }
                // Pushes the footer to the bottom while the content stays top-aligned.
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    ForEach(card.tags.prefix(isLarge ? 4 : 3), id: \.self) { TagChip(tag: $0, theme: theme) }
                    Spacer(minLength: 0)
                    StaleFooter(freshness: freshness, theme: theme)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(title: "KNOWLEDGE", theme: theme)
                EmptyStateView(title: "No cards yet", subtitle: "Cards come from your wiki after a sync", theme: theme)
            }
        }
    }

    private func cardBody(_ card: SharedCard, large: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.title)
                .font(.system(size: large ? 20 : 16, weight: .bold))
                .foregroundStyle(theme.label)
                .lineLimit(2)
                .privacySensitive()
            Text(card.excerpt)
                .font(.system(size: large ? 14 : 12.5, weight: .regular))
                .foregroundStyle(theme.secondary)
                .lineLimit(large ? 9 : 3)
                .privacySensitive()
            if isLarge && !large {
                HStack(spacing: 6) {
                    ForEach(card.tags.prefix(3), id: \.self) { TagChip(tag: $0, theme: theme) }
                }
            }
        }
    }

    private var nextButton: some View {
        Button(intent: NextKnowledgeCardIntent()) {
            HStack(spacing: 4) {
                Text("Next").font(.system(size: 11, weight: .semibold))
                Image(systemName: "arrow.right").font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(theme.label)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(theme.button))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

private extension TodoEntry {
    static var previewNoCards: TodoEntry {
        var snapshot = SharedTodoSnapshot.preview
        snapshot.cards = nil
        return TodoEntry(date: Date(), snapshot: snapshot)
    }
}

#Preview("Medium", as: .systemMedium) {
    KnowledgeCardWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry(date: Date(), snapshot: .preview, cardOffset: 1)
    TodoEntry.previewNoCards
}

#Preview("Large", as: .systemLarge) {
    KnowledgeCardWidget()
} timeline: {
    TodoEntry.preview
    TodoEntry.previewStale
    TodoEntry.previewSignedOut
}
