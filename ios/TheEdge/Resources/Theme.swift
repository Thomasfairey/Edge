import SwiftUI

// MARK: - Design Tokens

extension Color {
    // Background
    static let cream = Color(hex: "FAF9F6")
    static let surface = Color(hex: "FFFFFF")

    // Primary
    static let primary900 = Color(hex: "1A1A2E")
    static let primary600 = Color(hex: "3D3D5C")
    static let primary400 = Color(hex: "6B6B8A")

    // Accent
    static let accent = Color(hex: "5A52E0")
    static let accentLight = Color(hex: "7B74F0")

    // Phase colours
    static let phaseLearn = Color(hex: "B8D4E3")
    static let phaseSimulate = Color(hex: "F2C4C4")
    static let phaseDebrief = Color(hex: "C5B8E8")
    static let phaseDeploy = Color(hex: "B8E0C8")
    static let phaseCheckin = Color(hex: "F5E6B8")

    // Scores
    static let scoreHigh = Color(hex: "6BC9A0")
    static let scoreMid = Color(hex: "F5C563")
    static let scoreLow = Color(hex: "E88B8B")

    // Helpers
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = ((int >> 24) & 0xFF, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }

    static func scoreColor(for value: Int) -> Color {
        switch value {
        case 4...5: return .scoreHigh
        case 3: return .scoreMid
        default: return .scoreLow
        }
    }
}

// MARK: - Haptics

enum Haptic {
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}

// MARK: - Card Style

struct CardStyle: ViewModifier {
    var backgroundColor: Color = .surface
    var cornerRadius: CGFloat = 24

    func body(content: Content) -> some View {
        content
            .padding(20)
            .background(backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 12, x: 0, y: 2)
    }
}

extension View {
    func card(backgroundColor: Color = .surface, cornerRadius: CGFloat = 24) -> some View {
        modifier(CardStyle(backgroundColor: backgroundColor, cornerRadius: cornerRadius))
    }

    /// Apply consistent accessibility modifiers for interactive elements.
    func accessibleButton(label: String, hint: String? = nil) -> some View {
        self
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
            .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Dynamic Type Scaling

extension Font {
    /// Scaled body font that respects Dynamic Type.
    static func scaledBody(size: CGFloat = 16, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }
}
