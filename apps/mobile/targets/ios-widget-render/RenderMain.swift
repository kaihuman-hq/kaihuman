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
    let title: String
    let rows: [(String, [Tile])]
    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text(title)
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
        let board = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(BoardColumnView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let milestone = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(MilestoneCountdownView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let ideas = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(IdeaPipelineView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let cards = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(KnowledgeCardView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let habits = { (e: TodoEntry, f: WidgetFamily, m: WidgetRenderingMode, s: ColorScheme) in
            AnyView(HabitsView(entry: e, family: f, renderingMode: m, colorScheme: s))
        }
        let backlogBoard = TodoEntry(date: Date(), snapshot: .preview, source: .backlog)
        // The Live Activity itself needs ActivityKit; its Lock Screen layout is a plain view.
        let focus = Tile(
            label: "focus-lock-screen", family: .systemMedium, scheme: .dark, mode: .fullColor,
            view: AnyView(FocusLockScreenView(
                attributes: .preview, state: .preview, activityId: "preview"
            ))
        )
        let accessories: [WidgetFamily] = [.accessoryRectangular, .accessoryInline]
        let states: [Tile] = [
            ("signed-out", TodoEntry.previewSignedOut), ("empty", .previewEmpty), ("stale", .previewStale),
        ].map { tag, entry in
            Tile(label: "next-up-\(tag)", family: .systemSmall, scheme: .dark, mode: .fullColor,
                 view: nextUp(entry, .systemSmall, .fullColor, .dark))
        }
        let v1Rows: [(String, [Tile])] = [
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
        let v2Rows: [(String, [Tile])] = [
            ("Board column · medium", tiles("board", [.systemMedium], entry: backlogBoard, make: board)),
            ("Board column · large", tiles("board", [.systemLarge], entry: backlogBoard, make: board)),
            ("Milestone countdown", tiles("milestone", [.systemSmall, .accessoryCircular, .accessoryRectangular], make: milestone)),
            ("Idea pipeline", tiles("ideas", [.systemSmall, .systemMedium], make: ideas)),
            ("Knowledge card · medium", tiles("cards", [.systemMedium], make: cards)),
            ("Knowledge card · large", tiles("cards", [.systemLarge], make: cards)),
            ("Habits", tiles("habits", [.systemSmall, .accessoryRectangular], make: habits)),
            ("Focus Live Activity · Lock Screen", [focus]),
        ]
        let rows = v1Rows + v2Rows

        for tile in rows.flatMap(\.1) {
            let renderer = ImageRenderer(content: Frame(tile: tile))
            renderer.scale = 2
            if let data = renderer.uiImage?.pngData() {
                try? data.write(to: outDir.appendingPathComponent("\(tile.label).png"))
            }
        }
        // One sheet per set: a single sheet of every row exceeds what ImageRenderer can allocate.
        let sheets = [
            ("widgets-real.png", "kaihuman · iOS widgets v1 (rendered in CI)", v1Rows),
            ("widgets-real-v2.png", "kaihuman · iOS widgets v2 (rendered in CI)", v2Rows),
        ]
        for (file, title, sheetRows) in sheets {
            let sheet = ImageRenderer(content: Sheet(title: title, rows: sheetRows))
            sheet.scale = 2
            guard let data = sheet.uiImage?.pngData() else {
                print("render failed: \(file)")
                exit(1)
            }
            try? data.write(to: outDir.appendingPathComponent(file))
        }
        print("rendered \(rows.flatMap(\.1).count) tiles to \(outDir.path)")
    }
}
