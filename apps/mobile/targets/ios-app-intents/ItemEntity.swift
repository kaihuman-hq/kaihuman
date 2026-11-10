import AppIntents
import Foundation

// Todos and notes for Siri, Shortcuts and Spotlight. The app writes spotlight-items.json into the
// App Group (src/spotlight/spotlight.ts) from its search index; the same rows feed Core Spotlight.

/// A todo or note. `id` is its kaihuman:// deep link.
struct KaihumanItemEntity: AppEntity, Codable {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "kaihuman item")
    static let defaultQuery = KaihumanItemQuery()

    var id: String
    var kind: String
    var title: String
    var subtitle: String?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(title)",
            subtitle: subtitle.map { "\($0)" },
            image: .init(systemName: kind == "todo" ? "checkmark.circle" : "note.text")
        )
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
        let words = query.split(whereSeparator: \.isWhitespace).map(String.init)
        guard !words.isEmpty else { return [] }
        return items.filter { item in
            let haystack = "\(item.title) \(item.subtitle ?? "")"
            return words.allSatisfy { haystack.localizedCaseInsensitiveContains($0) }
        }
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
