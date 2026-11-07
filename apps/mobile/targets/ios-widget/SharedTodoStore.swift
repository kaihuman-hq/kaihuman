import Foundation
import Security

/// The file a local edit produced; the GitHub push must write it.
struct TodoEditResult {
    let filePath: String
    let content: String
    let sha: String
    let branch: String
    let repoFullName: String
}

typealias TodoToggleResult = TodoEditResult

/// Checkbox markers of packages/formats/src/todos.ts (`[ ]` backlog, `[>]` in progress, `[x]` done).
enum TodoMarker: String {
    case backlog = "[ ]"
    case inProgress = "[>]"
    case done = "[x]"
}

struct SharedTodoStore {
    static let appGroupId = Bundle.main.object(forInfoDictionaryKey: "KHAppGroup") as? String
        ?? "group.com.kaihuman.app"
    static let snapshotFile = "widget-todos.json"
    static let pendingFile = "pending-widget-mutations.json"
    static let keychainService = Bundle.main.object(forInfoDictionaryKey: "KHKeychainService") as? String
        ?? "com.kaihuman.app"
    static let keychainAccount = "github-token"
    static let tokenDefaultsKey = "github-token"

    static let shared = SharedTodoStore()

    private var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId)
    }

    // MARK: Snapshot persistence

    func load() -> SharedTodoSnapshot? {
        guard let url = containerURL?.appendingPathComponent(Self.snapshotFile),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(SharedTodoSnapshot.self, from: data)
    }

    func save(_ snapshot: SharedTodoSnapshot) {
        guard let url = containerURL?.appendingPathComponent(Self.snapshotFile),
              let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: url, options: .atomic)
    }

    // MARK: Edits

    /// Marks an open item done in the snapshot and in the raw `.todos.md` content.
    /// Returns nil for unknown or already-closed items (a stale tap is a no-op).
    func toggle(itemId: String, now: Date = Date()) -> TodoEditResult? {
        guard var snapshot = load(),
              let position = snapshot.items.firstIndex(where: { $0.id == itemId }) else { return nil }
        let item = snapshot.items[position]
        guard item.status == .backlog || item.status == .inProgress else { return nil }
        let millis = PendingWidgetMutation.millis(now)
        guard let result = Self.rewrite(&snapshot, at: position, marker: .done, millis: millis) else { return nil }

        snapshot.items.remove(at: position)
        if let key = Self.countKey(item.status, item.filePath, snapshot.inboxPath) { snapshot.counts[keyPath: key] -= 1 }
        snapshot.counts.doneToday += 1
        snapshot.updatedAt = millis
        save(snapshot)
        return result
    }

    /// Moves an open item between backlog and in progress. Nil when the item is gone, closed or
    /// already there.
    func move(itemId: String, to target: TodoStatus, now: Date = Date()) -> TodoEditResult? {
        guard target == .backlog || target == .inProgress,
              var snapshot = load(),
              let position = snapshot.items.firstIndex(where: { $0.id == itemId }) else { return nil }
        let item = snapshot.items[position]
        guard (item.status == .backlog || item.status == .inProgress), item.status != target else { return nil }
        let millis = PendingWidgetMutation.millis(now)
        let marker: TodoMarker = target == .inProgress ? .inProgress : .backlog
        guard let result = Self.rewrite(&snapshot, at: position, marker: marker, millis: millis) else { return nil }

        snapshot.items[position].status = target
        snapshot.items[position].updatedAt = millis
        if let key = Self.countKey(item.status, item.filePath, snapshot.inboxPath) { snapshot.counts[keyPath: key] -= 1 }
        if let key = Self.countKey(target, item.filePath, snapshot.inboxPath) { snapshot.counts[keyPath: key] += 1 }
        snapshot.updatedAt = millis
        save(snapshot)
        return result
    }

    /// Appends `- [ ] text` to the cached inbox file and shows it in the snapshot at once. Without a
    /// cached inbox file (nothing to base a commit on) the capture is only queued for the app and
    /// nil comes back; so does empty text.
    func appendCapture(text rawText: String, now: Date = Date()) -> TodoEditResult? {
        let text = rawText.split(whereSeparator: \.isNewline).joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return nil }
        guard var snapshot = load(), let file = snapshot.files[snapshot.inboxPath] else {
            queue(.capture(text: text, now: now))
            return nil
        }
        let millis = PendingWidgetMutation.millis(now)
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds] // same shape as Date#toISOString
        let index = Self.todoLineCount(file.content)

        var content = file.content
        if !content.isEmpty && !content.hasSuffix("\n") { content += "\n" }
        content += "- [ ] \(text)\n::updated:: \(millis) ::created:: \(iso.string(from: now))\n"

        snapshot.files[snapshot.inboxPath] = SharedTodoFile(sha: file.sha, content: content)
        snapshot.items.append(SharedTodoItem(
            id: "\(snapshot.inboxPath)#\(index)", filePath: snapshot.inboxPath, indexInFile: index,
            text: text, status: .backlog, tags: [], milestoneId: nil, milestoneName: nil,
            milestoneDueDate: nil, updatedAt: millis, priority: nil, pending: nil
        ))
        snapshot.counts.inbox += 1
        snapshot.updatedAt = millis
        save(snapshot)
        return TodoEditResult(
            filePath: snapshot.inboxPath, content: content, sha: file.sha,
            branch: snapshot.branch, repoFullName: snapshot.repoFullName
        )
    }

    /// Marks a habit done today in the snapshot and queues the check-in: habit CSVs are not in the
    /// snapshot, so the app commits them. False when the habit is unknown or already done today.
    @discardableResult
    func checkInHabit(path: String, now: Date = Date()) -> Bool {
        guard var snapshot = load(), var habits = snapshot.habits,
              let position = habits.firstIndex(where: { $0.path == path }),
              !snapshot.habitDone(habits[position], at: now) else { return false }
        habits[position].doneToday = true
        habits[position].streakDays += 1
        habits[position].pending = true
        snapshot.habits = habits
        snapshot.updatedAt = PendingWidgetMutation.millis(now)
        let calendar = snapshot.resolvedCalendar
        let day = calendar.dateComponents([.year, .month, .day], from: now)
        let date = String(format: "%04d-%02d-%02d", day.year ?? 0, day.month ?? 0, day.day ?? 0)
        save(snapshot)
        queue(.habit(path: path, date: date, now: now))
        return true
    }

    /// Rewrites the item's line in its file; on success the snapshot holds the new content.
    private static func rewrite(
        _ snapshot: inout SharedTodoSnapshot, at position: Int, marker: TodoMarker, millis: Int64
    ) -> TodoEditResult? {
        let item = snapshot.items[position]
        guard let file = snapshot.files[item.filePath],
              let content = setMarker(
                  content: file.content, itemIndex: item.indexInFile, text: item.text, marker: marker, millis: millis
              ) else { return nil }
        snapshot.files[item.filePath] = SharedTodoFile(sha: file.sha, content: content)
        return TodoEditResult(
            filePath: item.filePath, content: content, sha: file.sha,
            branch: snapshot.branch, repoFullName: snapshot.repoFullName
        )
    }

    private static func countKey(
        _ status: TodoStatus, _ filePath: String, _ inboxPath: String
    ) -> WritableKeyPath<SharedTodoCounts, Int>? {
        switch status {
        case .inProgress: return \.inProgress
        case .backlog: return filePath == inboxPath ? \.inbox : \.backlog
        case .done, .rejected: return nil
        }
    }

    private static let itemPattern = #"^(\s*[-*]\s+)\[[^\]]*\](\s+.*)$"#

    private static func todoLineCount(_ content: String) -> Int {
        guard let regex = try? NSRegularExpression(pattern: itemPattern) else { return 0 }
        return content.components(separatedBy: "\n").filter {
            regex.firstMatch(in: $0, range: NSRange($0.startIndex..., in: $0)) != nil
        }.count
    }

    /// Marks the Nth todo line done. Kept as the name callers and tests know.
    static func markDone(content: String, itemIndex: Int, text: String, millis: Int64) -> String? {
        setMarker(content: content, itemIndex: itemIndex, text: text, marker: .done, millis: millis)
    }

    /// Rewrites the Nth todo line's checkbox and sets `::updated:: <ms>` on its metadata line,
    /// matching serializeTodos in packages/formats/src/todos.ts.
    static func setMarker(
        content: String, itemIndex: Int, text: String, marker: TodoMarker, millis: Int64
    ) -> String? {
        var lines = content.components(separatedBy: "\n")
        guard let itemRegex = try? NSRegularExpression(pattern: itemPattern),
              let updatedRegex = try? NSRegularExpression(pattern: #"::updated::\s*\d+"#) else {
            return nil
        }

        var seen = 0
        for (lineIndex, line) in lines.enumerated() {
            let range = NSRange(line.startIndex..., in: line)
            guard let match = itemRegex.firstMatch(in: line, range: range) else { continue }
            defer { seen += 1 }
            guard seen == itemIndex else { continue }

            let prefix = (line as NSString).substring(with: match.range(at: 1))
            let rest = (line as NSString).substring(with: match.range(at: 2))
            guard rest.contains(text) else { return nil } // file drifted since the snapshot
            lines[lineIndex] = "\(prefix)\(marker.rawValue)\(rest)"

            let stamp = "::updated:: \(millis)"
            let metaIndex = lineIndex + 1
            let meta = metaIndex < lines.count ? lines[metaIndex].trimmingCharacters(in: .whitespaces) : ""
            if meta.hasPrefix("::updated::") {
                let metaRange = NSRange(meta.startIndex..., in: meta)
                lines[metaIndex] = updatedRegex.stringByReplacingMatches(
                    in: meta, range: metaRange, withTemplate: stamp
                )
            } else if meta.hasPrefix("::created::") {
                lines[metaIndex] = "\(stamp) \(meta)"
            } else {
                lines.insert(stamp, at: metaIndex)
            }
            return lines.joined(separator: "\n")
        }
        return nil
    }

    // MARK: GitHub push

    /// v1 call shape: a completed todo.
    func push(_ result: TodoEditResult, itemId: String, session: URLSession = .shared) async {
        await push(result, message: "widget: complete todo", queueing: .toggle(itemId: itemId), session: session)
    }

    /// PUTs the edited file to GitHub; queues `mutation` for the app when it cannot commit.
    func push(
        _ result: TodoEditResult, message: String, queueing mutation: PendingWidgetMutation,
        session: URLSession = .shared
    ) async {
        guard let token = readToken(),
              let url = URL(string: "https://api.github.com/repos/\(result.repoFullName)/contents/\(result.filePath)")
        else {
            queue(mutation)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = [
            "message": message,
            "content": Data(result.content.utf8).base64EncodedString(),
            "sha": result.sha,
            "branch": result.branch,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                queue(mutation) // 409 / 422 (stale sha) and anything else
                return
            }
            adoptNewSha(from: data, filePath: result.filePath)
        } catch {
            queue(mutation)
        }
    }

    private func adoptNewSha(from data: Data, filePath: String) {
        struct Response: Decodable {
            struct Content: Decodable { let sha: String }
            let content: Content
        }
        guard let response = try? JSONDecoder().decode(Response.self, from: data),
              var snapshot = load(), var file = snapshot.files[filePath] else { return }
        file.sha = response.content.sha
        snapshot.files[filePath] = file
        save(snapshot)
    }

    func queuePending(itemId: String, now: Date = Date()) {
        queue(.toggle(itemId: itemId, now: now))
    }

    /// Appends to the queue the app replays. A queued capture also shows as pending in the snapshot.
    func queue(_ mutation: PendingWidgetMutation) {
        guard let url = containerURL?.appendingPathComponent(Self.pendingFile) else { return }
        var pending = (try? Data(contentsOf: url))
            .flatMap { try? JSONDecoder().decode([PendingWidgetMutation].self, from: $0) } ?? []
        pending.append(mutation)
        if let data = try? JSONEncoder().encode(pending) {
            try? data.write(to: url, options: .atomic)
        }
        if mutation.kind == "capture", var snapshot = load(),
           let position = snapshot.items.lastIndex(where: { $0.text == mutation.text && $0.pending != true }) {
            snapshot.items[position].pending = true
            save(snapshot)
        }
    }

    // MARK: Knowledge card rotation

    static let cardOffsetKey = "knowledge-card-offset"

    /// How many cards the user skipped with "Next"; added to the 3 h rotation slot.
    var cardOffset: Int {
        UserDefaults(suiteName: Self.appGroupId)?.integer(forKey: Self.cardOffsetKey) ?? 0
    }

    func advanceCardOffset() {
        UserDefaults(suiteName: Self.appGroupId)?.set(cardOffset &+ 1, forKey: Self.cardOffsetKey)
    }

    // MARK: Token

    /// Keychain first (shared access group from the entitlements), App Group defaults as fallback.
    private func readToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
           let data = item as? Data, let token = String(data: data, encoding: .utf8) {
            return token
        }
        return UserDefaults(suiteName: Self.appGroupId)?.string(forKey: Self.tokenDefaultsKey)
    }
}
