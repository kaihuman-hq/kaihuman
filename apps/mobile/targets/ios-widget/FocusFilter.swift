import Foundation
import WidgetKit

// Focus filter plumbing shared by the app (SetFocusFilterIntent, intents) and the widgets.
// Mirrors matchesWidgetFilter in packages/core/src/widget-filter.ts; ios-widget.test.ts keeps them in step.

extension SharedFocusFilter {
    var isEmpty: Bool { (tags ?? []).isEmpty && (area ?? "").isEmpty && (board ?? "").isEmpty }

    /// A Focus name for the extra-large widget header; falls back to what is filtered on.
    var title: String {
        if let label, !label.isEmpty { return label }
        if let area, !area.isEmpty { return area }
        if let board, !board.isEmpty { return board }
        return (tags ?? []).map { "#\($0)" }.joined(separator: " ")
    }
}

extension SharedTodoItem {
    /// The todo file's name without `.todos.md`: `.kh/work.todos.md` is area `work`.
    var area: String {
        let name = filePath.split(separator: "/").last.map(String.init) ?? filePath
        return name.hasSuffix(".todos.md") ? String(name.dropLast(".todos.md".count)) : name
    }

    /// Every set dimension must match: any tag, the area, the board (milestone id or name).
    func matches(_ filter: SharedFocusFilter?) -> Bool {
        guard let filter, !filter.isEmpty else { return true }
        func same(_ a: String?, _ b: String) -> Bool { a?.caseInsensitiveCompare(b) == .orderedSame }
        if let wanted = filter.tags, !wanted.isEmpty,
           !wanted.contains(where: { tag in tags.contains { same($0, tag) } }) { return false }
        if let area = filter.area, !area.isEmpty, !same(self.area, area) { return false }
        if let board = filter.board, !board.isEmpty,
           !same(milestoneId, board), !same(milestoneName, board) { return false }
        return true
    }
}

extension SharedTodoSnapshot {
    func matchesFocusFilter(_ item: SharedTodoItem) -> Bool { item.matches(filter) }
}

extension SharedTodoStore {
    static let focusFilterFile = "focus-filter.json"

    /// Called by the Focus filter intent, possibly while the app is not running. Writes the file the
    /// app folds into the next snapshot, and patches the current snapshot so widgets follow at once.
    /// An empty filter clears it (the system runs the intent with defaults when the Focus ends).
    func saveFocusFilter(_ filter: SharedFocusFilter) {
        let active: SharedFocusFilter? = filter.isEmpty ? nil : filter
        if let url = containerFileURL(Self.focusFilterFile) {
            let data = active.flatMap { try? JSONEncoder().encode($0) } ?? Data("{}".utf8)
            try? data.write(to: url, options: .atomic)
        }
        if var snapshot = load() {
            snapshot.filter = active
            save(snapshot)
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
}
