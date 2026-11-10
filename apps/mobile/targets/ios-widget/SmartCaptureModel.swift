import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// A capture the on-device model has classified. Plain value so the queue works without Apple Intelligence.
struct SmartCapture: Codable {
    var kind: String
    var text: String
    var tags: [String]
    var due: String?
    var amount: Double?
    var category: String?

    /// Inbox markdown line: text followed by " #tag" per tag.
    var inboxLine: String {
        text + tags.map { " #\($0)" }.joined()
    }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
struct ParsedCapture {
    @Guide(description: "What the capture is", .anyOf(["todo", "log", "budget", "habit"]))
    var kind: String
    @Guide(description: "The cleaned text without tags and date words; the habit name for habit")
    var text: String
    @Guide(description: "Lowercase tags without the leading #")
    var tags: [String]
    @Guide(description: "Due date as YYYY-MM-DD or YYYY-MM-DDTHH:MM, only when one is stated")
    var due: String?
    @Guide(description: "Money amount for budget captures")
    var amount: Double?
    @Guide(description: "Budget category, only when stated or obvious")
    var category: String?

    var capture: SmartCapture {
        SmartCapture(kind: kind, text: text, tags: tags, due: due, amount: amount, category: category)
    }
}

@available(iOS 26.0, *)
enum SmartCaptureParser {
    static func parse(_ text: String, now: Date) async -> SmartCapture? {
        guard case .available = SystemLanguageModel.default.availability else { return nil }
        let day = DateFormatter()
        day.locale = Locale(identifier: "en_US_POSIX")
        day.dateFormat = "yyyy-MM-dd"
        let weekday = DateFormatter()
        weekday.locale = Locale(identifier: "en_US_POSIX")
        weekday.dateFormat = "EEEE"
        let instructions = """
            Classify one quick note typed into a personal life-OS inbox.
            Today is \(day.string(from: now)), a \(weekday.string(from: now)).
            kind: todo is something to do, log is something already done, budget is money spent or \
            earned (set amount), habit is checking in a habit (text is the habit name).
            Resolve relative dates such as "tomorrow" or "next friday" to an ISO date in due.
            A "#word" is a tag: lowercase it and drop the '#'.
            Remove tags and date words from text.
            """
        do {
            let session = LanguageModelSession(instructions: instructions)
            let response = try await session.respond(to: text, generating: ParsedCapture.self)
            return response.content.capture
        } catch {
            return nil
        }
    }
}
#endif

/// Captures that need the app to file them (log, budget, habit, dated todo); the app drains the file.
enum SmartCaptureQueue {
    static let fileName = "smart-captures.json"

    static func append(original: String, _ capture: SmartCapture) {
        guard let dir = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: SharedTodoStore.appGroupId)
        else { return }
        let url = dir.appendingPathComponent(fileName)
        var entries = (try? Data(contentsOf: url))
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [[String: Any]] } ?? []
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var fields: [String: Any] = ["kind": capture.kind, "text": capture.text, "tags": capture.tags]
        if let due = capture.due { fields["due"] = due }
        if let amount = capture.amount { fields["amount"] = amount }
        if let category = capture.category { fields["category"] = category }
        entries.append([
            "text": original,
            "capturedAt": iso.string(from: Date()),
            "capture": fields,
        ])
        guard let data = try? JSONSerialization.data(withJSONObject: entries) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
