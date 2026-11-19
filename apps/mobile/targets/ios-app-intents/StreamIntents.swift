import AppIntents
import Foundation

// "Add a todo to <stream> in kaihuman": a stream is a todo file (`.kh/bpmnkit.todos.md`). Phrases can
// only embed AppEntity parameters, so streams are an entity read from the App Group snapshot the
// widgets use (its `files` keys). The todo goes through the smart-capture queue, which the app
// drains into the file (saveCapture); there is no second write path.

struct TodoStreamEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Stream")
    static let defaultQuery = TodoStreamQuery()

    /// The todo file path in the repo.
    var id: String

    var name: String { StreamMatcher.name(ofPath: id) }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

enum StreamMatcher {
    static let suffix = ".todos.md"

    /// `.kh/bpmnkit.todos.md` -> `bpmnkit`.
    static func name(ofPath path: String) -> String {
        let file = path.split(separator: "/").last.map(String.init) ?? path
        return file.hasSuffix(suffix) ? String(file.dropLast(suffix.count)) : file
    }

    /// Letters and digits only, lowercased and without accents ("Café Ideen" -> "cafeideen").
    static func fold(_ text: String) -> String {
        String(
            text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
                .filter { $0.isLetter || $0.isNumber }
        )
    }

    static func paths(in snapshot: SharedTodoSnapshot?) -> [String] {
        (snapshot?.files.keys.filter { $0.hasSuffix(suffix) } ?? []).sorted()
    }

    /// Exact name first, else every stream whose name contains the spoken one or the reverse.
    /// The TypeScript twin is `findStream` (src/intelligence/save-capture.ts); keep them in step.
    static func matching(_ spoken: String, in paths: [String]) -> [String] {
        let want = fold(spoken)
        guard !want.isEmpty else { return [] }
        let exact = paths.filter { fold(name(ofPath: $0)) == want }
        if !exact.isEmpty { return exact }
        return paths.filter {
            let have = fold(name(ofPath: $0))
            return !have.isEmpty && (have.contains(want) || want.contains(have))
        }
    }
}

struct TodoStreamQuery: EntityStringQuery {
    private func all() -> [TodoStreamEntity] {
        StreamMatcher.paths(in: SharedTodoStore.shared.load()).map { TodoStreamEntity(id: $0) }
    }

    func entities(for identifiers: [String]) async throws -> [TodoStreamEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [TodoStreamEntity] {
        let hits = Set(StreamMatcher.matching(string, in: all().map(\.id)))
        return all().filter { hits.contains($0.id) }
    }

    func suggestedEntities() async throws -> [TodoStreamEntity] {
        Array(all().prefix(25))
    }
}

/// "Add a todo to <stream> in kaihuman" / "Todo zu <stream> in kaihuman hinzufügen". Siri asks for
/// the text; the due date is optional and stays unset unless given.
struct AddTodoToStreamIntent: AppIntent {
    static let title: LocalizedStringResource = "Add a todo to a stream"
    static let description = IntentDescription("Adds a todo to one of your kaihuman todo streams.")
    static let openAppWhenRun = false

    @Parameter(title: "Stream")
    var stream: TodoStreamEntity

    @Parameter(title: "Todo")
    var text: String

    @Parameter(title: "Due date")
    var due: Date?

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$text) to \(\.$stream)") {
            \.$due
        }
    }

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // The stream may have been deleted since Siri resolved it: say so and write nothing.
        guard StreamMatcher.paths(in: SharedTodoStore.shared.load()).contains(stream.id) else {
            return .result(dialog: "I couldn't find that stream in kaihuman. Nothing was added.")
        }
        guard !trimmed.isEmpty else { return .result(dialog: "Nothing to add.") }
        SmartCaptureQueue.append(
            original: trimmed,
            SmartCapture(
                kind: "todo", text: trimmed, tags: [], due: due.map { InboxCapture.dueDay($0) },
                target: stream.id)
        )
        return .result(dialog: "Saved to \(stream.name). kaihuman files it when it opens next.")
    }
}
