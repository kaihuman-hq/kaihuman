import Foundation
import Security

/// Result of a local toggle: the file the GitHub push must write.
struct TodoToggleResult {
    let filePath: String
    let content: String
    let sha: String
    let branch: String
    let repoFullName: String
}

struct SharedTodoStore {
    static let appGroupId = "group.com.kaihuman.app"
    static let snapshotFile = "widget-todos.json"
    static let pendingFile = "pending-widget-mutations.json"
    static let keychainService = "com.kaihuman.app"
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

    // MARK: Toggle

    /// Marks an open item done in the snapshot and in the raw `.todos.md` content.
    /// Returns nil for unknown or already-closed items (a stale tap is a no-op).
    func toggle(itemId: String, now: Date = Date()) -> TodoToggleResult? {
        guard var snapshot = load(),
              let position = snapshot.items.firstIndex(where: { $0.id == itemId }),
              let file = snapshot.files[snapshot.items[position].filePath] else { return nil }
        let item = snapshot.items[position]
        guard item.status == .backlog || item.status == .inProgress else { return nil }

        let millis = Int64(now.timeIntervalSince1970 * 1000)
        guard let content = Self.markDone(
            content: file.content, itemIndex: item.indexInFile, text: item.text, millis: millis
        ) else { return nil }

        snapshot.files[item.filePath] = SharedTodoFile(sha: file.sha, content: content)
        snapshot.items.remove(at: position)
        if item.status == .inProgress {
            snapshot.counts.inProgress -= 1
        } else if item.filePath == "\(snapshot.appFolder)/inbox.todos.md" {
            snapshot.counts.inbox -= 1
        } else {
            snapshot.counts.backlog -= 1
        }
        snapshot.counts.doneToday += 1
        snapshot.updatedAt = millis
        save(snapshot)

        return TodoToggleResult(
            filePath: item.filePath, content: content, sha: file.sha,
            branch: snapshot.branch, repoFullName: snapshot.repoFullName
        )
    }

    /// Rewrites the Nth todo line to `[x]` and sets `::updated:: <ms>` on its metadata line,
    /// matching serializeTodos in packages/formats/src/todos.ts.
    static func markDone(content: String, itemIndex: Int, text: String, millis: Int64) -> String? {
        var lines = content.components(separatedBy: "\n")
        guard let itemRegex = try? NSRegularExpression(pattern: #"^(\s*[-*]\s+)\[[^\]]*\](\s+.*)$"#),
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
            lines[lineIndex] = "\(prefix)[x]\(rest)"

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

    /// PUTs the toggled file to GitHub; queues a pending mutation when it cannot commit.
    func push(_ result: TodoToggleResult, itemId: String, session: URLSession = .shared) async {
        guard let token = readToken(),
              let url = URL(string: "https://api.github.com/repos/\(result.repoFullName)/contents/\(result.filePath)")
        else {
            queuePending(itemId: itemId)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = [
            "message": "widget: complete todo",
            "content": Data(result.content.utf8).base64EncodedString(),
            "sha": result.sha,
            "branch": result.branch,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                queuePending(itemId: itemId) // 409 / 422 (stale sha) and anything else
                return
            }
            adoptNewSha(from: data, filePath: result.filePath)
        } catch {
            queuePending(itemId: itemId)
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
        guard let url = containerURL?.appendingPathComponent(Self.pendingFile) else { return }
        var pending = (try? Data(contentsOf: url))
            .flatMap { try? JSONDecoder().decode([PendingWidgetMutation].self, from: $0) } ?? []
        pending.append(PendingWidgetMutation(itemId: itemId, timestamp: Int64(now.timeIntervalSince1970 * 1000)))
        if let data = try? JSONEncoder().encode(pending) {
            try? data.write(to: url, options: .atomic)
        }
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
