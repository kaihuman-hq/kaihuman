import CoreImage
import ExpoModulesCore
import UIKit
import Vision
import VisionKit
#if canImport(FoundationModels)
import FoundationModels
#endif

private final class IntelligenceException: Exception {
    private let text: String
    init(_ text: String) {
        self.text = text
        super.init()
    }
    override var reason: String { text }
}

/// Keeps the document camera delegate alive until the sheet is dismissed (the controller holds it weakly).
private final class DocumentScanDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
    private var continuation: CheckedContinuation<[CGImage]?, Never>?
    static var current: DocumentScanDelegate?

    init(_ continuation: CheckedContinuation<[CGImage]?, Never>) {
        self.continuation = continuation
    }

    private func finish(_ images: [CGImage]?, _ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        continuation?.resume(returning: images)
        continuation = nil
        DocumentScanDelegate.current = nil
    }

    func documentCameraViewController(
        _ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan
    ) {
        let images = (0..<scan.pageCount).compactMap { scan.imageOfPage(at: $0).cgImage }
        finish(images, controller)
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        finish(nil, controller)
    }

    func documentCameraViewController(
        _ controller: VNDocumentCameraViewController, didFailWithError error: Error
    ) {
        finish(nil, controller)
    }
}

public class KaihumanIntelligenceModule: Module {
    public func definition() -> ModuleDefinition {
        Name("KaihumanIntelligence")

        Function("availability") { (target: String) -> String in
            Self.availability(target: target)
        }

        AsyncFunction("generateText") { (prompt: String, instructions: String, target: String) -> String in
            #if canImport(FoundationModels)
            if #available(iOS 26.0, *) {
                try Self.requireAvailable(target)
                let session = LanguageModelSession(instructions: instructions)
                let response = try await session.respond(to: prompt)
                return response.content
            }
            #endif
            throw IntelligenceException("Apple Intelligence needs iOS 26 or later.")
        }

        AsyncFunction("generateJson") {
            (prompt: String, instructions: String, schemaJson: String, target: String) -> String in
            #if canImport(FoundationModels)
            if #available(iOS 26.0, *) {
                try Self.requireAvailable(target)
                let schema = try Self.buildSchema(schemaJson)
                let session = LanguageModelSession(instructions: instructions)
                let response = try await session.respond(to: prompt, schema: schema)
                return response.content.jsonString
            }
            #endif
            throw IntelligenceException("Apple Intelligence needs iOS 26 or later.")
        }

        AsyncFunction("recognizeDocument") { (uri: String?) -> String? in
            if let uri {
                guard let image = Self.loadImage(uri) else {
                    throw IntelligenceException("Could not read the image at \(uri).")
                }
                return try await Self.recognize(image)
            }
            guard let pages = await Self.scanPages() else { return nil }
            var texts: [String] = []
            for page in pages {
                texts.append(try await Self.recognize(page))
            }
            return texts.joined(separator: "\n\n")
        }
    }

    // MARK: Availability

    static func availability(target: String) -> String {
        // TODO: Private Cloud Compute ("server") is an iOS 27 API that is not verified against the SDK
        // yet. Once confirmed, map its availability here and select the model in `makeModel`.
        if target == "server" { return "unsupported-os" }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available: return "available"
            case .unavailable(.deviceNotEligible): return "device-not-eligible"
            case .unavailable(.appleIntelligenceNotEnabled): return "apple-intelligence-not-enabled"
            case .unavailable(.modelNotReady): return "model-not-ready"
            default: return "unknown"
            }
        }
        #endif
        return "unsupported-os"
    }

    /// generate* with target "server" runs on the device model until the PCC model is wired (see above).
    static func requireAvailable(_ target: String) throws {
        let status = availability(target: target == "server" ? "device" : target)
        guard status == "available" else {
            throw IntelligenceException("Apple Intelligence is not available: \(status).")
        }
    }

    // MARK: Guided generation

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    static func buildSchema(_ json: String) throws -> GenerationSchema {
        guard let data = json.data(using: .utf8),
            let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { throw IntelligenceException("schemaJson is not a JSON object.") }
        let dynamic = try dynamicSchema(root, name: root["title"] as? String ?? "Result")
        return try GenerationSchema(root: dynamic, dependencies: [])
    }

    @available(iOS 26.0, *)
    static func dynamicSchema(_ node: [String: Any], name: String) throws -> DynamicGenerationSchema {
        let description = node["description"] as? String
        if let options = node["enum"] as? [String] {
            return DynamicGenerationSchema(name: name, description: description, anyOf: options)
        }
        switch node["type"] as? String {
        case "object":
            let required = Set(node["required"] as? [String] ?? [])
            let props = node["properties"] as? [String: [String: Any]] ?? [:]
            let properties = try props.keys.sorted().map { key -> DynamicGenerationSchema.Property in
                let child = props[key] ?? [:]
                return DynamicGenerationSchema.Property(
                    name: key,
                    description: child["description"] as? String,
                    schema: try dynamicSchema(child, name: key),
                    isOptional: !required.contains(key))
            }
            return DynamicGenerationSchema(name: name, description: description, properties: properties)
        case "array":
            let items = node["items"] as? [String: Any] ?? ["type": "string"]
            return DynamicGenerationSchema(arrayOf: try dynamicSchema(items, name: name + "Item"))
        case "string": return DynamicGenerationSchema(type: String.self)
        case "number": return DynamicGenerationSchema(type: Double.self)
        case "integer": return DynamicGenerationSchema(type: Int.self)
        case "boolean": return DynamicGenerationSchema(type: Bool.self)
        default: throw IntelligenceException("Unsupported schema type for \(name).")
        }
    }
    #endif

    // MARK: Text recognition

    static func loadImage(_ uri: String) -> CGImage? {
        let url = uri.hasPrefix("file://") ? URL(string: uri) : URL(fileURLWithPath: uri)
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)?.cgImage
    }

    static func recognize(_ image: CGImage) async throws -> String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let observations = try await RecognizeDocumentsRequest().perform(on: image)
            return observations.first?.document.text.transcript ?? ""
        }
        #endif
        return try recognizeLines(image)
    }

    /// iOS < 26 fallback: plain line OCR without document structure.
    static func recognizeLines(_ image: CGImage) throws -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        try VNImageRequestHandler(cgImage: image).perform([request])
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
    }

    @MainActor
    static func scanPages() async -> [CGImage]? {
        guard VNDocumentCameraViewController.isSupported, let top = topViewController() else {
            return nil
        }
        return await withCheckedContinuation { continuation in
            let controller = VNDocumentCameraViewController()
            let delegate = DocumentScanDelegate(continuation)
            DocumentScanDelegate.current = delegate
            controller.delegate = delegate
            top.present(controller, animated: true)
        }
    }

    @MainActor
    static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }
}
