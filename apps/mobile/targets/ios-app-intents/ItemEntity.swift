import AppIntents
import Foundation

// Todos, notes and log entries for Siri, Shortcuts and Spotlight. The app writes spotlight-items.json into the
// App Group (src/spotlight/spotlight.ts) from its search index; the same rows feed Core Spotlight.

/// A todo, note or log entry. `id` is its kaihuman:// deep link.
struct KaihumanItemEntity: AppEntity, Codable {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "kaihuman item")
    static let defaultQuery = KaihumanItemQuery()

    var id: String
    var kind: String
    var title: String
    var subtitle: String?
    /// `YYYY-MM-DD`: a log entry's day or a todo's due day (SpotlightItem.date).
    var date: String?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(title)",
            subtitle: subtitle.map { "\($0)" },
            image: .init(systemName: KaihumanItemKind(rawValue: kind)?.systemImage ?? "note.text")
        )
    }
}

/// The `kind` values of spotlight-items.json (SpotlightKind in src/spotlight/spotlight.ts).
enum KaihumanItemKind: String, AppEnum {
    case todo
    case note
    case log

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Item kind")
    static let caseDisplayRepresentations: [KaihumanItemKind: DisplayRepresentation] = [
        .todo: DisplayRepresentation(title: "Todo"),
        .note: DisplayRepresentation(title: "Note"),
        .log: DisplayRepresentation(title: "Log entry"),
    ]

    var systemImage: String {
        switch self {
        case .todo: return "checkmark.circle"
        case .note: return "note.text"
        case .log: return "book.closed"
        }
    }
}

/// iOS 18: lets Spotlight's semantic index and Apple Intelligence reason over the entity.
@available(iOS 18.0, *)
extension KaihumanItemEntity: IndexedEntity {}

enum KaihumanItemStore {
    static let file = "spotlight-items.json"

    static func load() -> [KaihumanItemEntity] {
        guard let url = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: SharedTodoStore.appGroupId)?
            .appendingPathComponent(file),
            let data = try? Data(contentsOf: url)
        else { return [] }
        return (try? JSONDecoder().decode([KaihumanItemEntity].self, from: data)) ?? []
    }

    /// Every word must appear in the title or subtitle, in any order and case.
    static func matching(_ query: String, in items: [KaihumanItemEntity]) -> [KaihumanItemEntity] {
        guard !words(query).isEmpty else { return [] }
        return find(text: query, in: items)
    }

    /// Open-ended lookup for Siri: words (all must match), kind, and an inclusive `YYYY-MM-DD`
    /// day range. Items without a date never match a range. Day strings compare in order.
    static func find(
        text: String? = nil,
        kind: KaihumanItemKind? = nil,
        from: String? = nil,
        to: String? = nil,
        in items: [KaihumanItemEntity]
    ) -> [KaihumanItemEntity] {
        let wanted = words(text ?? "")
        return items.filter { item in
            if let kind, item.kind != kind.rawValue { return false }
            if from != nil || to != nil {
                guard let day = item.date else { return false }
                if let from, day < from { return false }
                if let to, day > to { return false }
            }
            let haystack = "\(item.title) \(item.subtitle ?? "")"
            return wanted.allSatisfy { haystack.localizedCaseInsensitiveContains($0) }
        }
    }

    /// A date as the local `YYYY-MM-DD` the JSON uses.
    static func day(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private static func words(_ text: String) -> [String] {
        text.split(whereSeparator: \.isWhitespace).map(String.init)
    }
}

struct KaihumanItemQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [KaihumanItemEntity] {
        KaihumanItemStore.load().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [KaihumanItemEntity] {
        Array(KaihumanItemStore.matching(string, in: KaihumanItemStore.load()).prefix(25))
    }

    func suggestedEntities() async throws -> [KaihumanItemEntity] {
        Array(KaihumanItemStore.load().prefix(25))
    }
}

/// "Open <item> in kaihuman", and the target of Spotlight entity taps.
struct OpenItemIntent: OpenIntent {
    static let title: LocalizedStringResource = "Open item"
    static let description = IntentDescription("Opens a kaihuman todo or note.")
    static let openAppWhenRun = true

    @Parameter(title: "Item")
    var target: KaihumanItemEntity

    init() {}

    init(target: KaihumanItemEntity) {
        self.target = target
    }

    func perform() async throws -> some IntentResult {
        UserDefaults(suiteName: SharedTodoStore.appGroupId)?.set(target.id, forKey: "pending-url")
        return .result()
    }
}
