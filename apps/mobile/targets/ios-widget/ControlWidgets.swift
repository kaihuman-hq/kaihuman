import AppIntents
import SwiftUI
import WidgetKit

// Control Center / Lock Screen / Action button controls (iOS 18). Each opens the app on its
// capture sheet through OpenQuickCaptureIntent.

@available(iOS 18.0, *)
struct NewTodoControl: ControlWidget {
    static let kind = "NewTodoControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenQuickCaptureIntent(kind: .todo)) {
                Label("New todo", systemImage: "plus.circle")
            }
        }
        .displayName("New todo")
        .description("Capture a todo in kaihuman.")
    }
}

@available(iOS 18.0, *)
struct NewNoteControl: ControlWidget {
    static let kind = "NewNoteControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenQuickCaptureIntent(kind: .note)) {
                Label("New note", systemImage: "note.text")
            }
        }
        .displayName("New note")
        .description("Capture a note in kaihuman.")
    }
}

@available(iOS 18.0, *)
struct NewLogControl: ControlWidget {
    static let kind = "NewLogControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenQuickCaptureIntent(kind: .log)) {
                Label("New log", systemImage: "book.closed")
            }
        }
        .displayName("New log")
        .description("Write a log entry in kaihuman.")
    }
}

@available(iOS 18.0, *)
struct NewIdeaControl: ControlWidget {
    static let kind = "NewIdeaControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenQuickCaptureIntent(kind: .idea)) {
                Label("New idea", systemImage: "lightbulb")
            }
        }
        .displayName("New idea")
        .description("Capture an idea in kaihuman.")
    }
}

