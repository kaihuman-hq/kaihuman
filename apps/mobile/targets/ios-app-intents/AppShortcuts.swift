import AppIntents

/// Phrases must contain the app name token; Siri needs it to route the utterance here.
/// The system allows at most 10 App Shortcuts per app (src/ios-widget.test.ts counts them).
///
/// Adding a voice intent: append an `AppShortcut` below (phrases with `\(.applicationName)`,
/// a `shortTitle`), give every phrase a German entry in AppShortcuts.xcstrings and the short and
/// intent titles one in Localizable.xcstrings. Siri matches the phrase list of its own language
/// only, so each wording to support needs its own key (e.g. "zu" and "in" below).
struct KaihumanAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        // Siri asks for the text; a String parameter cannot appear in the phrase itself.
        AppShortcut(
            intent: AddTodoIntent(),
            phrases: [
                "Add a todo in \(.applicationName)",
                "New todo in \(.applicationName)",
                "New todo for \(.applicationName)",
                "Add a todo to \(.applicationName)",
                "Add to \(.applicationName) inbox",
                "Capture a todo in \(.applicationName)",
                "Quick add to \(.applicationName) inbox",
            ],
            shortTitle: "Add todo",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: WhatsNextIntent(),
            phrases: [
                "What's next in \(.applicationName)",
                "What should I do next in \(.applicationName)",
            ],
            shortTitle: "What's next",
            systemImageName: "arrow.right.circle"
        )
        AppShortcut(
            intent: CompleteTodoIntent(),
            phrases: [
                "Complete \(\.$todo) in \(.applicationName)",
                "Complete a todo in \(.applicationName)",
            ],
            shortTitle: "Complete todo",
            systemImageName: "checkmark.circle"
        )
        AppShortcut(
            intent: AddNoteIntent(),
            phrases: [
                "Add a note in \(.applicationName)",
                "New note in \(.applicationName)",
            ],
            shortTitle: "Add note",
            systemImageName: "note.text"
        )
        AppShortcut(
            intent: AddLogIntent(),
            phrases: [
                "Log in \(.applicationName)",
                "Add a log entry in \(.applicationName)",
            ],
            shortTitle: "Log entry",
            systemImageName: "book.closed"
        )
        AppShortcut(
            intent: SearchKaihumanIntent(),
            phrases: [
                "Search \(.applicationName)",
                "Search in \(.applicationName)",
                "Find something in \(.applicationName)",
            ],
            shortTitle: "Search",
            systemImageName: "magnifyingglass"
        )
        AppShortcut(
            intent: DueTodayIntent(),
            phrases: [
                "What's due today in \(.applicationName)",
                "What do I have today in \(.applicationName)",
            ],
            shortTitle: "Due today",
            systemImageName: "sun.max"
        )
        AppShortcut(
            intent: OpenItemIntent(),
            phrases: [
                "Open \(\.$target) in \(.applicationName)",
                "Show \(\.$target) in \(.applicationName)",
            ],
            shortTitle: "Open item",
            systemImageName: "doc.text.magnifyingglass"
        )
        AppShortcut(
            intent: AddTodoToStreamIntent(),
            phrases: [
                "Add a todo to \(\.$stream) in \(.applicationName)",
                "New todo for \(\.$stream) in \(.applicationName)",
            ],
            shortTitle: "Add to stream",
            systemImageName: "text.badge.plus"
        )
        AppShortcut(
            intent: NextBirthdayIntent(),
            phrases: [
                "What's the next birthday in \(.applicationName)",
                "Next birthday in \(.applicationName)",
            ],
            shortTitle: "Next birthday",
            systemImageName: "gift"
        )
    }
}
