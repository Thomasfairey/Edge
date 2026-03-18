import SwiftUI

/// Full-screen session flow controller — manages all 5 phases.
struct SessionFlowView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            phaseBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // Phase indicator
                SessionHeaderView(
                    phase: sessionManager.phase,
                    day: sessionManager.day,
                    conceptName: sessionManager.concept?.name ?? "",
                    onClose: { dismiss() }
                )

                // Phase content
                Group {
                    switch sessionManager.phase {
                    case .idle, .starting:
                        ProgressView("Starting session...")
                            .frame(maxWidth: .infinity, maxHeight: .infinity)

                    case .checkin:
                        CheckinView()

                    case .lesson:
                        LessonView()

                    case .roleplay:
                        RoleplayView()

                    case .debrief:
                        DebriefView()

                    case .mission:
                        MissionView()

                    case .complete:
                        SessionCompleteView(onDismiss: { dismiss() })
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private var phaseBackground: Color {
        switch sessionManager.phase {
        case .checkin: return .phaseCheckin.opacity(0.3)
        case .lesson: return .phaseLearn.opacity(0.3)
        case .roleplay: return .phaseSimulate.opacity(0.3)
        case .debrief: return .phaseDebrief.opacity(0.3)
        case .mission, .complete: return .phaseDeploy.opacity(0.3)
        default: return .cream
        }
    }
}

// MARK: - Session Header

struct SessionHeaderView: View {
    let phase: SessionManager.SessionPhase
    let day: Int
    let conceptName: String
    let onClose: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Day \(day)")
                    .font(.caption.bold())
                    .foregroundColor(.primary400)
                Text(phaseTitle)
                    .font(.headline)
                    .foregroundColor(.primary900)
            }

            Spacer()

            if !conceptName.isEmpty {
                Text(conceptName)
                    .font(.caption)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.accent.opacity(0.1))
                    .clipShape(Capsule())
            }

            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(.primary400)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var phaseTitle: String {
        switch phase {
        case .checkin: return "The Gate"
        case .lesson: return "Learn"
        case .roleplay: return "Simulate"
        case .debrief: return "Debrief"
        case .mission: return "Deploy"
        case .complete: return "Complete"
        default: return "Loading"
        }
    }
}

// MARK: - Phase Views

struct CheckinView: View {
    @EnvironmentObject var session: SessionManager
    @State private var response = ""

    var body: some View {
        VStack(spacing: 24) {
            if let mission = session.lastMission {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Yesterday's Mission")
                        .font(.subheadline.bold())
                        .foregroundColor(.primary400)
                    Text(mission)
                        .font(.body)
                        .foregroundColor(.primary900)
                }
                .card()
            }

            if let checkinResponse = session.checkinResponse {
                Text(checkinResponse)
                    .font(.body.italic())
                    .foregroundColor(.primary600)
                    .card(backgroundColor: .phaseCheckin.opacity(0.3))
            } else {
                Text("What was the exact reaction when you executed this? What shifted?")
                    .font(.subheadline)
                    .foregroundColor(.primary600)

                TextEditor(text: $response)
                    .frame(height: 120)
                    .padding(12)
                    .background(Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                Button("Submit") {
                    Haptic.light()
                    Task { await session.submitCheckin(response: response) }
                }
                .buttonStyle(.borderedProminent)
                .tint(.accent)
                .disabled(response.isEmpty || session.isLoading)
                .accessibilityLabel("Submit mission check-in")
                .accessibilityHint("Submits your mission outcome for review")
            }
        }
        .padding(20)
    }
}

struct LessonView: View {
    @EnvironmentObject var session: SessionManager

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if session.isStreaming && session.lessonContent.isEmpty {
                    ProgressView("Generating lesson...")
                } else {
                    Text(session.lessonContent)
                        .font(.body)
                        .foregroundColor(.primary900)
                        .textSelection(.enabled)
                }
            }
            .padding(20)
        }
    }
}

struct RoleplayView: View {
    @EnvironmentObject var session: SessionManager
    @State private var inputText = ""

    var body: some View {
        VStack(spacing: 0) {
            // Chat messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(session.roleplayMessages) { message in
                            ChatBubble(message: message, characterName: session.character?.name ?? "Character")
                                .id(message.id)
                        }
                    }
                    .padding(20)
                }
                .onChange(of: session.roleplayMessages.count) { _, _ in
                    if let last = session.roleplayMessages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }

            // Coach advice overlay
            if let advice = session.coachAdvice {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "lightbulb.fill")
                            .foregroundColor(.accent)
                        Text("MENTOR")
                            .font(.caption.bold())
                            .foregroundColor(.accent)
                        Spacer()
                        Button { session.coachAdvice = nil } label: {
                            Image(systemName: "xmark")
                                .font(.caption)
                        }
                    }
                    Text(advice)
                        .font(.subheadline)
                        .foregroundColor(.primary900)
                }
                .padding(16)
                .background(Color.accent.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal, 20)
            }

            // Input bar
            HStack(spacing: 12) {
                Button { Task { await session.requestCoach() } } label: {
                    Image(systemName: "lightbulb")
                        .font(.title3)
                        .foregroundColor(.accent)
                }

                TextField("Your response...", text: $inputText)
                    .textFieldStyle(.roundedBorder)

                Button {
                    let text = inputText
                    inputText = ""
                    Haptic.light()
                    Task { await session.sendRoleplayMessage(text) }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundColor(.accent)
                }
                .disabled(inputText.isEmpty || session.isStreaming)

                Button("End") {
                    Haptic.medium()
                    Task { await session.advanceToDebrief() }
                }
                .font(.subheadline.bold())
                .foregroundColor(.scoreLow)
                .accessibilityLabel("End roleplay")
                .accessibilityHint("Ends the roleplay simulation and moves to debrief")
            }
            .padding(16)
            .background(.ultraThinMaterial)
        }
    }
}

struct ChatBubble: View {
    let message: ChatMessage
    let characterName: String

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 60) }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                Text(message.role == .user ? "You" : characterName)
                    .font(.caption2.bold())
                    .foregroundColor(.primary400)

                Text(message.content)
                    .font(.body)
                    .foregroundColor(.primary900)
                    .padding(14)
                    .background(message.role == .user ? Color.accent.opacity(0.1) : Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }

            if message.role == .assistant { Spacer(minLength: 60) }
        }
    }
}

struct DebriefView: View {
    @EnvironmentObject var session: SessionManager

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if session.isLoading {
                    ProgressView("Analysing your performance...")
                } else {
                    // Scores
                    if let scores = session.scores {
                        VStack(spacing: 12) {
                            ForEach(scores.dimensions, id: \.name) { dim in
                                HStack {
                                    Text(dim.name)
                                        .font(.subheadline)
                                        .foregroundColor(.primary600)
                                        .frame(width: 110, alignment: .leading)
                                    ProgressView(value: Double(dim.value), total: 5)
                                        .tint(Color.scoreColor(for: dim.value))
                                    Text("\(dim.value)")
                                        .font(.headline)
                                        .foregroundColor(Color.scoreColor(for: dim.value))
                                        .frame(width: 28)
                                }
                            }
                        }
                        .card()
                    }

                    // Debrief text
                    Text(cleanDebrief)
                        .font(.body)
                        .foregroundColor(.primary900)
                        .textSelection(.enabled)

                    Button("Continue to Mission") {
                        Haptic.medium()
                        Task { await session.advanceToMission() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.accent)
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(20)
        }
    }

    /// Strip the ---SCORES--- and ---LEDGER--- blocks from display
    private var cleanDebrief: String {
        var text = session.debriefContent
        if let range = text.range(of: "---SCORES---[\\s\\S]*?---END_SCORES---", options: .regularExpression) {
            text.removeSubrange(range)
        }
        if let range = text.range(of: "---LEDGER---[\\s\\S]*?---END_LEDGER---", options: .regularExpression) {
            text.removeSubrange(range)
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct MissionView: View {
    @EnvironmentObject var session: SessionManager

    var body: some View {
        VStack(spacing: 24) {
            if session.isLoading {
                ProgressView("Generating your mission...")
            } else {
                Spacer()

                Image(systemName: "target")
                    .font(.system(size: 48))
                    .foregroundColor(.accent)

                Text("Your Mission")
                    .font(.title2.bold())
                    .foregroundColor(.primary900)

                Text(session.missionText)
                    .font(.body)
                    .foregroundColor(.primary900)
                    .multilineTextAlignment(.center)
                    .card()

                if !session.missionRationale.isEmpty {
                    Text(session.missionRationale)
                        .font(.subheadline)
                        .foregroundColor(.primary400)
                        .multilineTextAlignment(.center)
                }

                Spacer()
            }
        }
        .padding(20)
    }
}

struct SessionCompleteView: View {
    let onDismiss: () -> Void
    @EnvironmentObject var session: SessionManager

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(.scoreHigh)

            Text("Session Complete")
                .font(.title.bold())
                .foregroundColor(.primary900)

            if let scores = session.scores {
                Text("Average: \(String(format: "%.1f", scores.average)) / 5.0")
                    .font(.title3)
                    .foregroundColor(.primary600)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Today's Mission")
                    .font(.subheadline.bold())
                    .foregroundColor(.primary400)
                Text(session.missionText)
                    .font(.body)
                    .foregroundColor(.primary900)
            }
            .card()

            Spacer()

            Button("Done") {
                Haptic.success()
                onDismiss()
            }
            .buttonStyle(.borderedProminent)
            .tint(.accent)
            .controlSize(.large)
        }
        .padding(20)
    }
}
