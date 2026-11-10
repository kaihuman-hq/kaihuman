import AppIntents
import CoreImage
import Foundation
import Vision
#if canImport(VisualIntelligence)
import VisualIntelligence
#endif

// Visual Intelligence (camera / screenshot search): offers "add as budget / travel / todo /
// consumption" for what the user is looking at. Picking one opens the app on kaihuman://scan.

struct ScanSuggestionEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Scan suggestion"
    static var defaultQuery = ScanSuggestionQuery()

    static let kinds = ["budget", "travel", "todo", "consumption"]

    var id: String

    var kind: String { Self.decode(id)?.kind ?? "todo" }
    var text: String { Self.decode(id)?.text ?? "" }

    init(kind: String, text: String) {
        self.id = Self.encode(kind: kind, text: text)
    }

    init(id: String) {
        self.id = id
    }

    var displayRepresentation: DisplayRepresentation {
        let title: String
        switch kind {
        case "budget": title = "Add as budget line"
        case "travel": title = "Add as travel"
        case "consumption": title = "Add as consumption reading"
        default: title = "Add as todo"
        }
        let firstLine = text.split(separator: "\n").first.map(String.init) ?? ""
        return DisplayRepresentation(title: "\(title)", subtitle: "\(firstLine)")
    }

    /// `<kind>:<base64url text>`, so the query can rebuild an entity from the id alone.
    static func encode(kind: String, text: String) -> String {
        let b64 = Data(text.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "\(kind):\(b64)"
    }

    static func decode(_ id: String) -> (kind: String, text: String)? {
        guard let colon = id.firstIndex(of: ":") else { return nil }
        let kind = String(id[..<colon])
        var b64 = String(id[id.index(after: colon)...])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard kinds.contains(kind), let data = Data(base64Encoded: b64),
            let text = String(data: data, encoding: .utf8)
        else { return nil }
        return (kind, text)
    }
}

struct ScanSuggestionQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ScanSuggestionEntity] {
        identifiers.filter { ScanSuggestionEntity.decode($0) != nil }.map { ScanSuggestionEntity(id: $0) }
    }
}

/// Which kind to offer first for a scan; all four stay available.
enum ScanHeuristic {
    static func order(for text: String) -> [String] {
        let lower = text.lowercased()
        let first: String
        if lower.range(of: #"[€$£¥]\s?\d|\d\s?[€$£¥]|\d+[.,]\d{2}\b|\b(total|subtotal|vat|tax|invoice)\b"#,
            options: .regularExpression) != nil {
            first = "budget"
        } else if lower.range(of: #"\b(flight|hotel|boarding|gate|departure|arrival|check-in|booking|reservation)\b"#,
            options: .regularExpression) != nil {
            first = "travel"
        } else if lower.range(of: #"\bkwh\b|m³|\bm3\b|\bmeter\b|\bzähler\b"#, options: .regularExpression) != nil {
            first = "consumption"
        } else {
            first = "todo"
        }
        return [first] + ScanSuggestionEntity.kinds.filter { $0 != first }
    }
}

#if canImport(VisualIntelligence)
@available(iOS 26.0, *)
struct KaihumanVisualSearchQuery: IntentValueQuery {
    func values(for input: SemanticContentDescriptor) async throws -> [ScanSuggestionEntity] {
        var parts = input.labels
        if let buffer = input.pixelBuffer, let image = Self.cgImage(buffer) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            try? VNImageRequestHandler(cgImage: image).perform([request])
            let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
            parts.append(contentsOf: lines)
        }
        let text = parts.joined(separator: "\n")
        return ScanHeuristic.order(for: text).map { ScanSuggestionEntity(kind: $0, text: text) }
    }

    private static func cgImage(_ buffer: CVPixelBuffer) -> CGImage? {
        let image = CIImage(cvPixelBuffer: buffer)
        return CIContext().createCGImage(image, from: image.extent)
    }

    // Newer SDKs type `pixelBuffer` as CVReadOnlyPixelBuffer (CVPixelBuffer in the iOS 26.5 SDK);
    // both overloads exist so the file compiles with either Xcode.
    private static func cgImage(_ buffer: CVReadOnlyPixelBuffer) -> CGImage? {
        buffer.withUnsafeBuffer { cgImage($0) }
    }
}
#endif

struct OpenScanSuggestionIntent: OpenIntent {
    static var title: LocalizedStringResource = "Open scan suggestion"
    static var openAppWhenRun = true

    @Parameter(title: "Suggestion")
    var target: ScanSuggestionEntity

    init() {}

    func perform() async throws -> some IntentResult {
        var components = URLComponents()
        components.scheme = "kaihuman"
        components.host = "scan"
        components.queryItems = [
            URLQueryItem(name: "kind", value: target.kind),
            URLQueryItem(name: "text", value: String(target.text.prefix(2000))),
        ]
        if let url = components.url {
            UserDefaults(suiteName: SharedTodoStore.appGroupId)?.set(url.absoluteString, forKey: "pending-url")
        }
        return .result()
    }
}
