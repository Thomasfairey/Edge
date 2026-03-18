import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var currentPage = 0
    @State private var displayName = ""
    @State private var professionalContext = ""
    @State private var experienceLevel: ExperienceLevel = .intermediate
    @State private var selectedGoals: Set<String> = []
    @State private var isSubmitting = false

    private let availableGoals = [
        "Negotiation skills",
        "Pitching & presentations",
        "Leadership influence",
        "Reading people",
        "Managing difficult conversations",
        "Strategic communication",
        "Persuasion techniques",
        "Emotional intelligence",
        "Power dynamics awareness",
        "Defending against manipulation",
    ]

    var body: some View {
        ZStack {
            Color.cream.ignoresSafeArea()

            TabView(selection: $currentPage) {
                // Page 1: Welcome
                welcomePage.tag(0)

                // Page 2: Profile
                profilePage.tag(1)

                // Page 3: Goals
                goalsPage.tag(2)

                // Page 4: Ready
                readyPage.tag(3)
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .indexViewStyle(.page(backgroundDisplayMode: .always))
        }
    }

    // MARK: - Pages

    private var welcomePage: some View {
        VStack(spacing: 32) {
            Spacer()
            Image(systemName: "brain.head.profile")
                .font(.system(size: 64))
                .foregroundColor(.accent)
            Text("THE EDGE")
                .font(.system(size: 36, weight: .bold))
                .foregroundColor(.primary900)
            Text("Build elite influence skills through\ndaily AI-powered training")
                .font(.body)
                .foregroundColor(.primary600)
                .multilineTextAlignment(.center)
            Spacer()
            Text("Swipe to continue")
                .font(.caption)
                .foregroundColor(.primary400)
        }
        .padding(40)
    }

    private var profilePage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("About You")
                    .font(.title2.bold())
                    .foregroundColor(.primary900)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Name")
                        .font(.subheadline.bold())
                        .foregroundColor(.primary400)
                    TextField("Your name", text: $displayName)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Professional Context")
                        .font(.subheadline.bold())
                        .foregroundColor(.primary400)
                    Text("Tell us about your role, company, and key relationships. This personalises your scenarios.")
                        .font(.caption)
                        .foregroundColor(.primary400)
                    TextEditor(text: $professionalContext)
                        .frame(height: 120)
                        .padding(8)
                        .background(Color.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.primary400.opacity(0.2))
                        )
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Experience Level")
                        .font(.subheadline.bold())
                        .foregroundColor(.primary400)
                    Picker("Level", selection: $experienceLevel) {
                        ForEach(ExperienceLevel.allCases, id: \.self) { level in
                            Text(level.rawValue.capitalized)
                        }
                    }
                    .pickerStyle(.segmented)
                }
            }
            .padding(40)
        }
    }

    private var goalsPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Your Goals")
                    .font(.title2.bold())
                    .foregroundColor(.primary900)
                Text("Select what you want to improve")
                    .font(.subheadline)
                    .foregroundColor(.primary400)

                FlowLayout(spacing: 10) {
                    ForEach(availableGoals, id: \.self) { goal in
                        Button {
                            Haptic.light()
                            if selectedGoals.contains(goal) {
                                selectedGoals.remove(goal)
                            } else {
                                selectedGoals.insert(goal)
                            }
                        } label: {
                            Text(goal)
                                .font(.subheadline)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(selectedGoals.contains(goal) ? Color.accent : Color.surface)
                                .foregroundColor(selectedGoals.contains(goal) ? .white : .primary900)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding(40)
        }
    }

    private var readyPage: some View {
        VStack(spacing: 32) {
            Spacer()
            Image(systemName: "bolt.fill")
                .font(.system(size: 64))
                .foregroundColor(.accent)
            Text("Ready")
                .font(.title.bold())
                .foregroundColor(.primary900)
            Text("10 minutes a day.\nLearn. Simulate. Deploy.")
                .font(.body)
                .foregroundColor(.primary600)
                .multilineTextAlignment(.center)
            Spacer()
            Button {
                Task { await completeOnboarding() }
            } label: {
                if isSubmitting {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Start Training")
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.accent)
            .controlSize(.large)
            .disabled(displayName.isEmpty || professionalContext.count < 10 || selectedGoals.isEmpty || isSubmitting)
        }
        .padding(40)
    }

    private func completeOnboarding() async {
        isSubmitting = true
        let body: [String: Any] = [
            "display_name": displayName,
            "professional_context": professionalContext,
            "experience_level": experienceLevel.rawValue,
            "goals": Array(selectedGoals),
        ]
        do {
            let _: UserProfile = try await APIClient.shared.request(
                method: "POST", path: "profile/onboarding", body: body
            )
            authManager.state = .authenticated
        } catch {
            // Handle error
        }
        isSubmitting = false
    }
}

// MARK: - Flow Layout for Goal Tags

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), positions)
    }
}
