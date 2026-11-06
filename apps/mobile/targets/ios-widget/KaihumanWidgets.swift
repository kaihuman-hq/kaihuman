import SwiftUI
import WidgetKit

/// Next up. The kind string predates the restyle and stays so already-placed widgets survive.
struct InboxTodoWidget: Widget {
    let kind = "InboxTodoWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: NextUpConfigurationIntent.self, provider: NextUpProvider()) { entry in
            NextUpEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Next up")
        .description("Your next todos. Tap a circle to complete one.")
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
    }
}

@main
struct KaihumanWidgets: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        InboxTodoWidget()
        QuickCaptureWidget()
        WeeklyDoneWidget()
        InboxCountWidget()
        // ControlWidget needs the iOS 18 SDK runtime; the extension itself deploys to 17.0.
        if #available(iOSApplicationExtension 18.0, *) {
            KaihumanControls()
        }
    }
}
