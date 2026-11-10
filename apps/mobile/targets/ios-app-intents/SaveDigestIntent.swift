import AppIntents
import Foundation

/// Saves a digest text to `logs/digest-<date>.md` in the repo. Built to be the last step of a
/// Shortcut: "Find log entries" > "Use Model" (summarize) > this action. The text is queued like
/// any widget edit, so it works offline and the app commits it on its next run.
struct SaveDigestIntent: AppIntent {
    static var title: LocalizedStringResource = "Save digest"
    static var description = IntentDescription(
        "Saves a digest text, such as a model summary of your day, to logs/ in your kaihuman repository.",
        categoryName: "Logs"
    )
    static var openAppWhenRun = false

    @Parameter(title: "Digest", description: "The text to save.", inputConnectionBehavior: .connectToPreviousIntentResult)
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Save \(\.$text) as a digest")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return .result(value: "", dialog: "There was no text to save.")
        }
        let path = SharedTodoStore.shared.queueDigest(text: trimmed)
        return .result(value: path, dialog: "Saved to \(path).")
    }
}

extension SharedTodoStore {
    /// Queues the digest for the app and returns the repo path it will be written to.
    @discardableResult
    func queueDigest(text: String, now: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: now)
        let date = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        queue(.digest(text: text, date: date, now: now))
        return "logs/digest-\(date).md"
    }
}
