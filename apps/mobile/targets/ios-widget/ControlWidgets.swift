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

@available(iOS 18.0, *)
struct AddToInboxControl: ControlWidget {
    static let kind = "AddToInboxControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenQuickCaptureIntent(kind: .inbox)) {
                Label("Add to inbox", systemImage: "tray.and.arrow.down")
            }
        }
        .displayName("Add to inbox")
        .description("Add one line to your kaihuman inbox.")
    }
}

@available(iOS 18.0, *)
struct CaptureControl: ControlWidget {
    static let kind = "CaptureControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenDestinationIntent(destination: .capture)) {
                Label("Capture", systemImage: "square.and.pencil")
            }
        }
        .displayName("Capture")
        .description("Pick what to capture in kaihuman.")
    }
}

@available(iOS 18.0, *)
struct FocusTimerValueProvider: ControlValueProvider {
    var previewValue: Bool { false }

    func currentValue() async throws -> Bool {
        FocusTimerState.isRunning
    }
}

/// Start/stop a focus session. Also the natural Action button control.
@available(iOS 18.0, *)
struct FocusTimerControl: ControlWidget {
    static let kind = FocusTimerState.controlKind

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind, provider: FocusTimerValueProvider()) { isRunning in
            ControlWidgetToggle("Focus timer", isOn: isRunning, action: ToggleFocusTimerIntent()) { on in
                Label(on ? "Focusing" : "Start focus", systemImage: on ? "timer.circle.fill" : "timer")
            }
        }
        .displayName("Focus timer")
        .description("Start a focus session on your next todo, or stop it.")
    }
}
