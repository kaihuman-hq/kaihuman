import AppIntents
import CoreLocation
import Foundation

// App Schemas (assistant schemas): let Apple Intelligence Siri call kaihuman with no fixed
// phrase. Rows come from the same spotlight-items.json as KaihumanItemEntity, with the same ids.
//
// A schema entity must have exactly the schema's properties, so KaihumanItemEntity cannot conform
// itself (it also serves App Shortcuts and Spotlight). These are thin, schema-shaped views of it.
//
// Nothing here is compiled on Linux CI. Each block is behind a Swift compilation condition that
// plugins/with-kaihuman-app-schemas.ts sets, so a wrong guess cannot break the default build:
//   KAIHUMAN_APP_SCHEMAS       iOS 18 `.journal` (documented API; shapes follow Apple's sample)
//   KAIHUMAN_REMINDERS_SCHEMA  iOS 27 `.reminders` (UNVERIFIED: domain and member names are
//                              guesses from WWDC26 session 240 reports; check the SDK first)

private func openInApp(_ link: String) {
    UserDefaults(suiteName: SharedTodoStore.appGroupId)?.set(link, forKey: "pending-url")
}

private func items(of kinds: Set<String>) -> [KaihumanItemEntity] {
    KaihumanItemStore.load().filter { kinds.contains($0.kind) }
}

/// `YYYY-MM-DD` (local) back to a Date at local midnight.
private func date(fromDay day: String?) -> Date? {
    guard let day else { return nil }
    let parts = day.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
}

#if KAIHUMAN_APP_SCHEMAS

private let journalKinds: Set<String> = ["note", "log"]

/// Notes and log entries as journal entries.
@available(iOS 18.0, *)
@AssistantEntity(schema: .journal.entry)
struct KaihumanJournalEntryEntity {
    struct Query: EntityStringQuery {
        func entities(for identifiers: [String]) async throws -> [KaihumanJournalEntryEntity] {
            items(of: journalKinds).filter { identifiers.contains($0.id) }.map(KaihumanJournalEntryEntity.init)
        }

        func entities(matching string: String) async throws -> [KaihumanJournalEntryEntity] {
            KaihumanItemStore.matching(string, in: items(of: journalKinds)).prefix(25)
                .map(KaihumanJournalEntryEntity.init)
        }

        func suggestedEntities() async throws -> [KaihumanJournalEntryEntity] {
            items(of: journalKinds).prefix(25).map(KaihumanJournalEntryEntity.init)
        }
    }

    static var defaultQuery = Query()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title ?? "Untitled")", subtitle: "\(String(message?.characters ?? []))")
    }

    let id: String
    var title: String?
    var message: AttributedString?
    var mediaItems: [IntentFile]
    var entryDate: Date?
    var location: CLPlacemark?

    init(_ item: KaihumanItemEntity) {
        id = item.id
        title = item.title
        message = item.subtitle.map { AttributedString($0) }
        mediaItems = []
        entryDate = date(fromDay: item.date)
        location = nil
    }
}

/// "Log that I booked the hotel": opens the log sheet prefilled (kaihuman://quick-log?text=…).
/// Writing a log needs the app (GitHub sync lives in JS), so the user taps Save.
@available(iOS 18.0, *)
@AssistantIntent(schema: .journal.createEntry)
struct CreateJournalEntryIntent {
    static let openAppWhenRun = true

    var message: AttributedString
    var title: String?
    var entryDate: Date?
    var location: CLPlacemark?
    var mediaItems: [IntentFile]

    func perform() async throws -> some ReturnsValue<KaihumanJournalEntryEntity> {
        let text = [title, String(message.characters)].compactMap { $0 }
            .filter { !$0.isEmpty }.joined(separator: ": ")
        var components = URLComponents()
        components.scheme = "kaihuman"
        components.host = "quick-log"
        components.queryItems = [URLQueryItem(name: "text", value: text)]
        let link = components.string ?? QuickCaptureKind.log.url
        openInApp(link)
        // Provisional: the real entry gets its id once the app saves and republishes the file.
        let draft = KaihumanItemEntity(id: link, kind: "log", title: text, subtitle: nil, date: nil)
        return .result(value: KaihumanJournalEntryEntity(draft))
    }
}

/// "Search my journal for Lisbon": the in-app search screen.
@available(iOS 18.0, *)
@AssistantIntent(schema: .journal.search)
struct SearchJournalEntriesIntent: ShowInAppSearchResultsIntent {
    static let searchScopes: [StringSearchScope] = [.general]

    var criteria: StringSearchCriteria

    func perform() async throws -> some IntentResult {
        openInApp(SearchKaihumanIntent.link(for: criteria.term))
        return .result()
    }
}

#endif

#if KAIHUMAN_REMINDERS_SCHEMA

/// Todos as reminders. UNVERIFIED: `.reminders.reminder` and its property names.
@available(iOS 27.0, *)
@AssistantEntity(schema: .reminders.reminder)
struct KaihumanReminderEntity {
    struct Query: EntityStringQuery {
        func entities(for identifiers: [String]) async throws -> [KaihumanReminderEntity] {
            items(of: ["todo"]).filter { identifiers.contains($0.id) }.map(KaihumanReminderEntity.init)
        }

        func entities(matching string: String) async throws -> [KaihumanReminderEntity] {
            KaihumanItemStore.matching(string, in: items(of: ["todo"])).prefix(25)
                .map(KaihumanReminderEntity.init)
        }

        func suggestedEntities() async throws -> [KaihumanReminderEntity] {
            items(of: ["todo"]).prefix(25).map(KaihumanReminderEntity.init)
        }
    }

    static var defaultQuery = Query()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }

    let id: String
    var title: String
    var dueDate: Date?
    var isCompleted: Bool

    init(_ item: KaihumanItemEntity) {
        id = item.id
        title = item.title
        dueDate = date(fromDay: item.date)
        // The subtitle starts with the todo status (src/search/documents.ts todoDocs).
        isCompleted = item.subtitle?.hasPrefix("done") ?? false
    }
}

/// "Add a todo to book the hotel": saved to the inbox in the background, like "Add to inbox".
/// UNVERIFIED: `.reminders.createReminder` and its parameter names. The due date is not stored yet.
@available(iOS 27.0, *)
@AssistantIntent(schema: .reminders.createReminder)
struct CreateReminderIntent {
    var title: String
    var dueDate: Date?

    func perform() async throws -> some ReturnsValue<KaihumanReminderEntity> {
        _ = try await CaptureTodoIntent(text: title).perform()
        let draft = KaihumanItemEntity(
            id: QuickCaptureKind.inbox.url, kind: "todo", title: title, subtitle: "todo",
            date: dueDate.map { KaihumanItemStore.day($0) }
        )
        return .result(value: KaihumanReminderEntity(draft))
    }
}

#endif
