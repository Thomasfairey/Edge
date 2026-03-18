import Foundation
import SwiftUI

/// Manages the current session state and phase progression.
@MainActor
class SessionManager: ObservableObject {
    enum SessionPhase: Equatable {
        case idle
        case starting
        case checkin
        case lesson
        case roleplay
        case debrief
        case mission
        case complete
    }

    @Published var phase: SessionPhase = .idle
    @Published var sessionId: String?
    @Published var day: Int = 0
    @Published var concept: ConceptInfo?
    @Published var character: CharacterInfo?
    @Published var isReview: Bool = false

    // Phase content
    @Published var lastMission: String?
    @Published var checkinResponse: String?
    @Published var lessonContent: String = ""
    @Published var roleplayMessages: [ChatMessage] = []
    @Published var coachAdvice: String?
    @Published var debriefContent: String = ""
    @Published var scores: SessionScores?
    @Published var missionText: String = ""
    @Published var missionRationale: String = ""

    // UI state
    @Published var isLoading: Bool = false
    @Published var isStreaming: Bool = false
    @Published var errorMessage: String?

    // MARK: - Session Lifecycle

    func startSession() async {
        phase = .starting
        isLoading = true
        errorMessage = nil

        do {
            let response: SessionStartResponse = try await APIClient.shared.request(
                method: "POST", path: "session/start"
            )

            sessionId = response.sessionId
            day = response.day
            concept = response.concept
            character = response.character
            isReview = response.isReview
            lastMission = response.lastMission

            if response.needsCheckin {
                phase = .checkin
            } else {
                phase = .lesson
                await streamLesson()
            }
        } catch {
            errorMessage = error.localizedDescription
            phase = .idle
        }

        isLoading = false
    }

    // MARK: - Phase 0: Check-in

    func submitCheckin(response: String) async {
        isLoading = true
        do {
            let body = ["mission_response": response]
            let result: CheckinResponse = try await APIClient.shared.request(
                method: "POST", path: "session/checkin", body: body
            )
            checkinResponse = result.response

            // Brief pause for user to read response, then advance
            try? await Task.sleep(for: .seconds(2))
            phase = .lesson
            await streamLesson()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Phase 1: Lesson (Streaming)

    func streamLesson() async {
        guard let sessionId else { return }
        isStreaming = true
        lessonContent = ""

        do {
            let body = ["session_id": sessionId]
            try await APIClient.shared.stream(path: "session/lesson", body: body) { [weak self] chunk in
                Task { @MainActor in
                    self?.lessonContent += chunk
                }
            }
            phase = .roleplay
        } catch {
            errorMessage = error.localizedDescription
        }
        isStreaming = false
    }

    // MARK: - Phase 2: Roleplay

    func sendRoleplayMessage(_ text: String) async {
        guard let sessionId else { return }
        isStreaming = true

        let userMessage = ChatMessage(role: .user, content: text)
        roleplayMessages.append(userMessage)

        var assistantContent = ""
        let assistantMessage = ChatMessage(role: .assistant, content: "")
        roleplayMessages.append(assistantMessage)
        let assistantIndex = roleplayMessages.count - 1

        do {
            let body: [String: Any] = [
                "session_id": sessionId,
                "message": text,
            ]
            try await APIClient.shared.stream(path: "session/roleplay", body: body) { [weak self] chunk in
                assistantContent += chunk
                Task { @MainActor in
                    guard let self else { return }
                    if assistantIndex < self.roleplayMessages.count {
                        self.roleplayMessages[assistantIndex] = ChatMessage(role: .assistant, content: assistantContent)
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isStreaming = false
    }

    func requestCoach() async {
        guard let sessionId else { return }
        coachAdvice = nil

        do {
            let transcript = roleplayMessages.map { ["role": $0.role.rawValue, "content": $0.content] }
            let body: [String: Any] = [
                "session_id": sessionId,
                "transcript": transcript,
            ]
            let result: CoachResponse = try await APIClient.shared.request(
                method: "POST", path: "session/coach", body: body
            )
            coachAdvice = result.advice
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func advanceToDebrief() async {
        phase = .debrief
        await requestDebrief()
    }

    // MARK: - Phase 3: Debrief

    func requestDebrief() async {
        guard let sessionId else { return }
        isLoading = true

        do {
            let body = ["session_id": sessionId]
            let result: DebriefResponse = try await APIClient.shared.request(
                method: "POST", path: "session/debrief", body: body
            )
            debriefContent = result.debrief
            scores = result.scores
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Phase 4: Mission

    func advanceToMission() async {
        phase = .mission
        await requestMission()
    }

    func requestMission() async {
        guard let sessionId else { return }
        isLoading = true

        do {
            let body = ["session_id": sessionId]
            let result: MissionResponse = try await APIClient.shared.request(
                method: "POST", path: "session/mission", body: body
            )
            missionText = result.mission
            missionRationale = result.rationale
            phase = .complete
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Reset

    func reset() {
        phase = .idle
        sessionId = nil
        day = 0
        concept = nil
        character = nil
        isReview = false
        lastMission = nil
        checkinResponse = nil
        lessonContent = ""
        roleplayMessages = []
        coachAdvice = nil
        debriefContent = ""
        scores = nil
        missionText = ""
        missionRationale = ""
        isLoading = false
        isStreaming = false
        errorMessage = nil
    }
}
