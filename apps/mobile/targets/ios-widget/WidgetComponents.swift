import AppIntents
import SwiftUI
import WidgetKit

enum DeepLink {
    static let app = URL(string: "kaihuman://")!
    static let board = URL(string: "kaihuman://board")!
    static let inbox = URL(string: "kaihuman://inbox")!
    static let ideas = URL(string: "kaihuman://ideas")!

    private static func url(host: String, path: String = "", query: [String: String] = [:]) -> URL {
        var components = URLComponents()
        components.scheme = "kaihuman"
        components.host = host
        components.path = path
        if !query.isEmpty {
            components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        return components.url ?? app
    }

    static func board(milestone id: String) -> URL { url(host: "board", query: ["milestone": id]) }
    static func board(item id: String) -> URL { url(host: "board", query: ["item": id]) }
    static func ideas(status: String) -> URL { url(host: "ideas", query: ["status": status]) }
    /// Opens the quick-log sheet; `idea` is ignored by routes that predate it.
    static func quickLog(idea slug: String) -> URL { url(host: "quick-log", query: ["idea": slug]) }
    /// The one-field "Add to inbox" sheet.
    static var quickInbox: URL { url(host: "quick-inbox") }

    /// `kaihuman://files/<path>`, one percent-encoded segment at a time (paths hold `.kh/` and spaces).
    static func file(path: String) -> URL {
        let segments = path.split(separator: "/").compactMap {
            String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
        }
        return URL(string: "kaihuman://files/" + segments.joined(separator: "/")) ?? app
    }
}

/// Shared by every widget: signed-out placeholder, dimming of very old data and the app link.
struct SnapshotShell<Content: View>: View {
    let entry: TodoEntry
    let style: WidgetStyle
    let url: URL
    let content: (SharedTodoSnapshot) -> Content

    init(
        entry: TodoEntry, style: WidgetStyle, url: URL,
        @ViewBuilder content: @escaping (SharedTodoSnapshot) -> Content
    ) {
        self.entry = entry
        self.style = style
        self.url = url
        self.content = content
    }

    var body: some View {
        if let snapshot = entry.snapshot {
            content(snapshot)
                .opacity(snapshot.freshness(at: entry.date).isDim ? 0.5 : 1)
                .widgetURL(url)
        } else {
            SignedOutView(style: style)
                .widgetURL(DeepLink.app)
        }
    }
}

/// No snapshot yet (fresh install or signed out). The whole widget opens the app.
struct SignedOutView: View {
    let style: WidgetStyle

    var body: some View {
        let theme = style.theme
        switch style.family {
        case .accessoryInline:
            Text("\(Image(systemName: "lock.fill")) Open kaihuman to sign in")
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "lock.fill").font(.system(size: 20))
            }
        default:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(theme.accent)
                    .widgetAccentable()
                Text("Open kaihuman to sign in")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(theme.label)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

/// "Synced 7h ago" with a warning dot once the snapshot is older than 6 h. The text carries the
/// meaning, so the dot's colour is decoration.
struct StaleFooter: View {
    let freshness: SnapshotFreshness
    let theme: WidgetTheme

    var body: some View {
        if freshness != .fresh {
            HStack(spacing: 5) {
                Circle().fill(theme.warning).frame(width: 7, height: 7)
                Text("Synced \(freshness.hours)h ago")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(theme.warning)
                    .lineLimit(1)
            }
        }
    }
}

struct WidgetHeader: View {
    let title: String
    var trailing: String?
    let theme: WidgetTheme
    var showsAdd = false

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(theme.accent)
                .widgetAccentable()
            Spacer(minLength: 4)
            if let trailing {
                Text(trailing)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(theme.secondary)
            }
            if showsAdd {
                AddToInboxButton(theme: theme)
            }
        }
    }
}

/// The "+" that opens the one-field inbox sheet. A Button rather than a Link: a systemSmall
/// widget ignores Links, but intent buttons work in every family.
struct AddToInboxButton: View {
    let theme: WidgetTheme
    var size: CGFloat = 22

    var body: some View {
        Button(intent: OpenQuickCaptureIntent(kind: .inbox)) {
            Image(systemName: "plus")
                .font(.system(size: size * 0.55, weight: .bold))
                .foregroundStyle(theme.onFill)
                .frame(width: size, height: size)
                .background(Circle().fill(theme.fill))
                .widgetAccentable()
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add to inbox")
    }
}

struct ProgressBar: View {
    let fraction: Double
    let theme: WidgetTheme
    var height: CGFloat = 5

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(theme.track)
                Capsule()
                    .fill(theme.accent)
                    .frame(width: proxy.size.width * CGFloat(min(max(fraction, 0), 1)))
                    .widgetAccentable()
            }
        }
        .frame(height: height)
    }
}

/// Leading marker. The shape differs per state (hollow, filled dot, clock) so colour is never the
/// only signal.
struct TodoGlyph: View {
    let item: SharedTodoItem
    let theme: WidgetTheme
    var size: CGFloat = 16

    private var symbol: String {
        if item.pending == true { return "clock" }
        return item.status == .inProgress ? "circle.inset.filled" : "circle"
    }

    private var tint: Color {
        if item.pending == true { return theme.warning }
        return item.status == .inProgress ? theme.info : theme.secondary
    }

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size, weight: .regular))
            .foregroundStyle(tint)
            .widgetAccentable()
    }
}

struct TagChip: View {
    let tag: String
    let theme: WidgetTheme

    var body: some View {
        Text("#\(tag)")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(theme.secondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 1.5)
            .background(Capsule().fill(theme.button))
            .lineLimit(1)
            .privacySensitive()
    }
}

/// One todo: tap the glyph to complete it (iOS 17 interactive widgets), tap the text to open the board.
struct TodoRow: View {
    let item: SharedTodoItem
    let style: WidgetStyle
    var fontSize: CGFloat = 12.5
    var showsTag = false
    /// Backlog rows get a "Start" button (backlog -> in progress), for the board column widget.
    var showsStart = false
    var link: URL = DeepLink.board

    private var linksText: Bool { style.family != .systemSmall }

    var body: some View {
        let theme = style.theme
        let pending = item.pending == true
        HStack(spacing: 8) {
            if pending {
                TodoGlyph(item: item, theme: theme, size: fontSize + 3.5)
            } else {
                Button(intent: ToggleTodoIntent(itemId: item.id)) {
                    TodoGlyph(item: item, theme: theme, size: fontSize + 3.5)
                        .frame(minWidth: 20, minHeight: 20)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if linksText {
                Link(destination: link) { text(theme, pending: pending) }
            } else {
                text(theme, pending: pending)
            }
            if showsTag, let tag = item.tags.first {
                TagChip(tag: tag, theme: theme)
            }
            if showsStart, item.status == .backlog, !pending {
                Button(intent: StartTodoIntent(itemId: item.id)) {
                    Text("Start")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(theme.label)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(theme.button))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var dueSuffix: String {
        switch item.dueState() {
        case .overdue: return " · overdue"
        case .today: return " · today"
        case nil: return ""
        }
    }

    private func text(_ theme: WidgetTheme, pending: Bool) -> some View {
        Text(item.text + dueSuffix)
            .font(.system(size: fontSize, weight: .medium))
            .strikethrough(pending)
            .foregroundStyle(pending ? theme.secondary : theme.label)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .privacySensitive()
    }
}

/// "Inbox zero" style empty state.
struct EmptyStateView: View {
    let title: String
    var subtitle: String?
    let theme: WidgetTheme

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 26))
                .foregroundStyle(theme.success)
                .widgetAccentable()
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(theme.label)
                .fixedSize(horizontal: false, vertical: true)
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(theme.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}
