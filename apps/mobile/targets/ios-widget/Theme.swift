import SwiftUI
import WidgetKit

extension Color {
    /// 0xRRGGBB plus opacity; sRGB.
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

/// Everything a view needs to know about where it is drawn. Passed in explicitly (rather than read
/// from the Environment inside the views) so a renderer outside WidgetKit can set every input.
struct WidgetStyle {
    var family: WidgetFamily
    var renderingMode: WidgetRenderingMode = .fullColor
    var colorScheme: ColorScheme = .dark

    var isAccessory: Bool {
        switch family {
        case .accessoryCircular, .accessoryRectangular, .accessoryInline: return true
        default: return false
        }
    }

    /// Accented (iOS 18 tinted/clear) and Lock Screen widgets are drawn in one system colour.
    var isTinted: Bool { isAccessory || renderingMode != .fullColor }

    var theme: WidgetTheme { WidgetTheme.make(colorScheme: colorScheme, tinted: isTinted) }
}

/// Volt #E6FF4A on Ink, per doc/mobile-design.md §3 and apps/mobile/docs/widgets-mockup.html.
struct WidgetTheme {
    let background: Color
    let label: Color
    let secondary: Color
    let accent: Color
    let fill: Color
    let onFill: Color
    let button: Color
    let track: Color
    let separator: Color
    let info: Color
    let success: Color
    let warning: Color

    static let volt = Color(hex: 0xE6FF4A)
    static let olive = Color(hex: 0x4F5E00)
    static let ink = Color(hex: 0x0C0D0C)

    static func make(colorScheme: ColorScheme, tinted: Bool) -> WidgetTheme {
        if tinted {
            // The system recolours everything; keep contrast through opacity only, drop the background,
            // and never use hue to carry meaning (glyphs and text do that).
            return WidgetTheme(
                background: .clear,
                label: .primary,
                secondary: .secondary,
                accent: .primary,
                fill: .primary,
                onFill: .black,
                button: Color.primary.opacity(0.18),
                track: Color.primary.opacity(0.2),
                separator: Color.primary.opacity(0.16),
                info: .primary,
                success: .primary,
                warning: .primary
            )
        }
        if colorScheme == .light {
            return WidgetTheme(
                background: .white,
                label: ink,
                secondary: Color(hex: 0x3C3C43, opacity: 0.76),
                accent: olive,
                fill: ink,
                onFill: volt,
                button: Color(hex: 0x3C3C43, opacity: 0.08),
                track: Color(hex: 0x3C3C43, opacity: 0.14),
                separator: Color(hex: 0x3C3C43, opacity: 0.14),
                info: Color(hex: 0x0071A4),
                success: Color(hex: 0x248A3D),
                warning: Color(hex: 0xB25000)
            )
        }
        return WidgetTheme(
            background: Color(hex: 0x1B1C19),
            label: Color(hex: 0xF4F5EF),
            secondary: Color(hex: 0xEBEBF5, opacity: 0.62),
            accent: volt,
            fill: volt,
            onFill: ink,
            button: Color.white.opacity(0.09),
            track: Color.white.opacity(0.14),
            separator: Color.white.opacity(0.1),
            info: Color(hex: 0x64D2FF),
            success: Color(hex: 0x32D74B),
            warning: Color(hex: 0xFFD60A)
        )
    }

    /// Mono numerals are the brand nod to the console.
    static func number(_ size: CGFloat) -> Font {
        .system(size: size, weight: .bold, design: .monospaced)
    }
}

/// Container background at the widget entry point: reads the Environment, which only exists there.
struct KaihumanBackground: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.widgetFamily) private var family

    func body(content: Content) -> some View {
        let style = WidgetStyle(family: family, renderingMode: renderingMode, colorScheme: colorScheme)
        content.containerBackground(for: .widget) { style.theme.background }
    }
}
