import SwiftUI

/// A reusable score bar showing a dimension name, progress bar, and score value.
struct ScoreBar: View {
    let name: String
    let value: Int
    let maxValue: Int
    var labelWidth: CGFloat = 110

    var body: some View {
        HStack {
            Text(name)
                .font(.subheadline)
                .foregroundColor(.primary600)
                .frame(width: labelWidth, alignment: .leading)
                .accessibilityLabel("\(name) score")

            ProgressView(value: Double(value), total: Double(maxValue))
                .tint(Color.scoreColor(for: value))
                .accessibilityHidden(true)

            Text("\(value)")
                .font(.headline)
                .foregroundColor(Color.scoreColor(for: value))
                .frame(width: 28)
                .accessibilityLabel("\(value) out of \(maxValue)")
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue("\(name): \(value) out of \(maxValue)")
    }
}

/// A group of score bars showing all 5 dimensions.
struct ScoresCard: View {
    let scores: SessionScores

    var body: some View {
        VStack(spacing: 12) {
            ForEach(scores.dimensions, id: \.name) { dim in
                ScoreBar(name: dim.name, value: dim.value, maxValue: 5)
            }
        }
        .card()
    }
}
