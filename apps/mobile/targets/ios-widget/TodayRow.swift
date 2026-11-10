import AppIntents
import SwiftUI
import WidgetKit

/// One row of the Today widget: ring toggle (in progress = filled ring), text and an optional
/// trailing label (#tag, time or weekday). Unlike TodoRow it adds no "· today" suffix: every row
/// on this widget is for today.
struct TodayRow: View {
    let item: SharedTodoItem
    let style: WidgetStyle
    var trailing: String?
    var fontSize: CGFloat = 13

    var body: some View {
        let theme = style.theme
        let pending = item.pending == true
        HStack(spacing: 8) {
            if pending {
                TodoGlyph(item: item, theme: theme, size: fontSize + 3)
            } else {
                Button(intent: ToggleTodoIntent(itemId: item.id)) {
                    TodoGlyph(item: item, theme: theme, size: fontSize + 3)
                        .frame(minWidth: 20, minHeight: 20)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Text(item.text)
                .font(.system(size: fontSize, weight: .medium))
                .strikethrough(pending)
                .foregroundStyle(pending ? theme.secondary : theme.label)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .privacySensitive()
            if let trailing {
                Text(trailing)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(theme.secondary)
                    .lineLimit(1)
                    .privacySensitive()
            }
        }
        // A toggled row leaves on the next timeline entry; fade rather than jump.
        .transition(.opacity)
    }
}
