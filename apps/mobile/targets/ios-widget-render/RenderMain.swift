import SwiftUI
import UIKit
import WidgetKit

// CI-only: renders every widget view variant with ImageRenderer outside WidgetKit and writes PNGs
// plus a contact sheet. Built and run by render.sh in the iOS Simulator; not part of the app.

struct Tile: Identifiable {
    let id = UUID()
    let label: String
    let family: WidgetFamily
    let scheme: ColorScheme
    let mode: WidgetRenderingMode
    let view: AnyView
}

private func size(_ family: WidgetFamily) -> CGSize {
    switch family {
    case .systemSmall: return CGSize(width: 170, height: 170)
    case .systemMedium: return CGSize(width: 364, height: 170)
    case .systemLarge: return CGSize(width: 364, height: 382)
    case .accessoryCircular: return CGSize(width: 76, height: 76)
    case .accessoryRectangular: return CGSize(width: 172, height: 76)
    case .accessoryInline: return CGSize(width: 257, height: 26)
    default: return CGSize(width: 170, height: 170)
    }
}

private func isAccessory(_ family: WidgetFamily) -> Bool {
    [.accessoryCircular, .accessoryRectangular, .accessoryInline].contains(family)
}

/// Stands in for the widget container: system margins, corner radius and the theme background.
struct Frame: View {
    let tile: Tile
    var body: some View {
        let s = size(tile.family)
        let tinted = isAccessory(tile.family) || tile.mode != .fullColor
        let theme = WidgetTheme.make(colorScheme: tile.scheme, tinted: tinted)
        tile.view
            .padding(isAccessory(tile.family) ? 0 : 16)
            .frame(width: s.width, height: s.height)
            .background(tinted ? AnyView(Color.white.opacity(0.12)) : AnyView(theme.background))
            .clipShape(RoundedRectangle(cornerRadius: isAccessory(tile.family) ? 12 : 22, style: .continuous))
            .environment(\.colorScheme, tile.scheme)
    }
}

struct Sheet: View {
    let rows: [(String, [Tile])]
    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("kaihuman · iOS widgets v1 (rendered in CI)")
                .font(.system(size: 22, weight: .bold, design: .monospaced))
                .foregroundStyle(WidgetTheme.volt)
            ForEach(rows.indices, id: \.self) { index in
                let row = rows[index]
                VStack(alignment: .leading, spacing: 10) {
                    Text(row.0).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                    HStack(alignment: .top, spacing: 16) {
                        ForEach(row.1) { tile in
                            VStack(alignment: .leading, spacing: 6) {
                                Frame(tile: tile)
                                Text(tile.label).font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(.white.opacity(0.6))
                            }
                        }
                    }
                }
            }
        }
        .padding(32)
        .background(LinearGradient(
            colors: [Color(hex: 0x1B1C19), Color(hex: 0x2A3340)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        ))
    }
}

@MainActor
private func tiles(
    _ name: String,
    _ families: [WidgetFamily],
    entry: TodoEntry = .preview,
    make: @escaping (TodoEntry, WidgetFamily, WidgetRenderingMode, ColorScheme) -> AnyView
) -> [Tile] {
    var out: [Tile] = []
    for family in families {
        if isAccessory(family) {
            out.append(Tile(label: "\(name)-\(family)", family: family, scheme: .dark, mode: .vibrant,
                            view: make(entry, family, .vibrant, .dark)))
            continue
        }
        for (scheme, mode, tag) in [(ColorScheme.dark, WidgetRenderingMode.fullColor, "dark"),
                                    (.light, .fullColor, "light"), (.dark, .accented, "tinted")] {
            out.append(Tile(label: "\(name)-\(family)-\(tag)", family: family, scheme: scheme, mode: mode,
                            view: make(entry, family, mode, scheme)))
        }
    }
    return out
}

@main
struct RenderHarness {
    @MainActor static func main() {
        let outDir = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "widget-renders")
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        let nextUp = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(NextUpView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let capture = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(QuickCaptureView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let weekly = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(WeeklyDoneView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let inbox = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(InboxCountView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let accessories: [WidgetFamily] = [.accessoryRectangular, .accessoryInline]
        let states: [Tile] = [
            ("signed-out", TodoEntry.previewSignedOut), ("empty", .previewEmpty), ("stale", .previewStale),
        ].map { tag, entry in
            Tile(label: "next-up-\(tag)", family: .systemSmall, scheme: .dark, mode: .fullColor,
                 view: nextUp(entry, .systemSmall, .fullColor, .dark))
        }
        let rows: [(String, [Tile])] = [
            ("Next up · small", tiles("next-up", [.systemSmall], make: nextUp)),
            ("Next up · medium", tiles("next-up", [.systemMedium], make: nextUp)),
            ("Next up · large", tiles("next-up", [.systemLarge], make: nextUp)),
            ("Next up · Lock Screen", tiles("next-up", accessories, make: nextUp)),
            ("Quick capture", tiles("capture", [.systemSmall], make: capture)
                + tiles("capture", [.systemMedium], make: capture).prefix(1)),
            ("Weekly done", tiles("weekly", [.systemSmall, .accessoryCircular, .accessoryInline], make: weekly)),
            ("Inbox", tiles("inbox", [.systemSmall, .accessoryCircular, .accessoryInline], make: inbox)),
            ("States (signed out, empty, stale)", states),
        ]

        for tile in rows.flatMap(\.1) {
            let renderer = ImageRenderer(content: Frame(tile: tile))
            renderer.scale = 2
            if let data = renderer.uiImage?.pngData() {
                try? data.write(to: outDir.appendingPathComponent("\(tile.label).png"))
            }
        }
        let sheet = ImageRenderer(content: Sheet(rows: rows))
        sheet.scale = 2
        guard let data = sheet.uiImage?.pngData() else {
            print("render failed: contact sheet")
            exit(1)
        }
        try? data.write(to: outDir.appendingPathComponent("widgets-real.png"))
        print("rendered \(rows.flatMap(\.1).count) tiles to \(outDir.path)")
    }
}
