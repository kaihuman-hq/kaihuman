import AppIntents

/// Phrases must contain the app name token; Siri needs it to route the utterance here.
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
                "Capture a todo in \(.applicationName)",
                "Quick add to \(.applicationName) inbox",
            ],
            shortTitle: "Capture to inbox",
            systemImageName: "tray.and.arrow.down"
        )
    }
}
