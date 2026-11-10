import AppIntents

/// Phrases must contain the app name token; Siri needs it to route the utterance here.
/// The system allows at most 10 App Shortcuts per app (src/ios-widget.test.ts counts them).
struct KaihumanAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTodoIntent(),
            phrases: [
                "Add a todo in \(.applicationName)",
                "New todo in \(.applicationName)",
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
        // Siri asks for the text; a String parameter cannot appear in the phrase itself.
        AppShortcut(
            intent: CaptureTodoIntent(),
            phrases: [
                "Add to \(.applicationName) inbox",
                "Capture a todo in \(.applicationName)",
                "Quick add to \(.applicationName) inbox",
            ],
            shortTitle: "Capture to inbox",
            systemImageName: "tray.and.arrow.down"
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
    }
}
