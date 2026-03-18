import Foundation

// MARK: - User

struct UserProfile: Codable, Identifiable {
    let id: String
    let email: String
    var displayName: String
    var professionalContext: String
    var communicationStyle: String
    var experienceLevel: ExperienceLevel
    var goals: [String]
    var subscriptionTier: SubscriptionTier
    var subscriptionExpiresAt: Date?
    var onboardingCompleted: Bool

    enum CodingKeys: String, CodingKey {
        case id, email, goals
        case displayName = "display_name"
        case professionalContext = "professional_context"
        case communicationStyle = "communication_style"
        case experienceLevel = "experience_level"
        case subscriptionTier = "subscription_tier"
        case subscriptionExpiresAt = "subscription_expires_at"
        case onboardingCompleted = "onboarding_completed"
    }
}

enum ExperienceLevel: String, Codable, CaseIterable {
    case beginner, intermediate, advanced
}

enum SubscriptionTier: String, Codable {
    case free, pro
}

// MARK: - Session

struct SessionScores: Codable {
    let techniqueApplication: Int
    let tacticalAwareness: Int
    let frameControl: Int
    let emotionalRegulation: Int
    let strategicOutcome: Int

    enum CodingKeys: String, CodingKey {
        case techniqueApplication = "technique_application"
        case tacticalAwareness = "tactical_awareness"
        case frameControl = "frame_control"
        case emotionalRegulation = "emotional_regulation"
        case strategicOutcome = "strategic_outcome"
    }

    var average: Double {
        let values = [techniqueApplication, tacticalAwareness, frameControl, emotionalRegulation, strategicOutcome]
        return Double(values.reduce(0, +)) / Double(values.count)
    }

    var dimensions: [(name: String, value: Int)] {
        [
            ("Technique", techniqueApplication),
            ("Awareness", tacticalAwareness),
            ("Frame Control", frameControl),
            ("Composure", emotionalRegulation),
            ("Outcome", strategicOutcome),
        ]
    }
}

struct ConceptInfo: Codable {
    let id: String
    let name: String
    let domain: String
    let source: String
}

struct CharacterInfo: Codable {
    let id: String
    let name: String
    let description: String
}

struct ChatMessage: Codable, Identifiable {
    let id: UUID
    let role: MessageRole
    let content: String
    let timestamp: Date

    init(role: MessageRole, content: String) {
        self.id = UUID()
        self.role = role
        self.content = content
        self.timestamp = Date()
    }
}

enum MessageRole: String, Codable {
    case user, assistant
}

// MARK: - API Responses

struct APIResponse<T: Codable>: Codable {
    let success: Bool
    let data: T?
    let error: APIError?
}

struct APIError: Codable {
    let code: String
    let message: String
}

struct SessionStartResponse: Codable {
    let sessionId: String
    let day: Int
    let needsCheckin: Bool
    let lastMission: String?
    let concept: ConceptInfo
    let character: CharacterInfo
    let isReview: Bool

    enum CodingKeys: String, CodingKey {
        case day, concept, character
        case sessionId = "session_id"
        case needsCheckin = "needs_checkin"
        case lastMission = "last_mission"
        case isReview = "is_review"
    }
}

struct CheckinResponse: Codable {
    let response: String
    let type: String
}

struct CoachResponse: Codable {
    let advice: String
}

struct DebriefResponse: Codable {
    let debrief: String
    let scores: SessionScores?
    let ledgerFields: LedgerFields?

    enum CodingKeys: String, CodingKey {
        case debrief, scores
        case ledgerFields = "ledger_fields"
    }
}

struct LedgerFields: Codable {
    let behavioralWeaknessSummary: String
    let keyMoment: String

    enum CodingKeys: String, CodingKey {
        case behavioralWeaknessSummary = "behavioral_weakness_summary"
        case keyMoment = "key_moment"
    }
}

struct MissionResponse: Codable {
    let mission: String
    let rationale: String
}

struct StatusResponse: Codable {
    let dayNumber: Int
    let lastEntry: LastEntryInfo?
    let recentScores: [RecentScore]
    let streakCount: Int
    let srSummary: SRSummary
    let sessionsThisWeek: Int
    let tier: SubscriptionTier

    enum CodingKeys: String, CodingKey {
        case tier
        case dayNumber = "day_number"
        case lastEntry = "last_entry"
        case recentScores = "recent_scores"
        case streakCount = "streak_count"
        case srSummary = "sr_summary"
        case sessionsThisWeek = "sessions_this_week"
    }
}

struct LastEntryInfo: Codable {
    let concept: String
    let mission: String
    let missionOutcome: String
    let scores: SessionScores

    enum CodingKeys: String, CodingKey {
        case concept, mission, scores
        case missionOutcome = "mission_outcome"
    }
}

struct RecentScore: Codable {
    let day: Int
    let scores: SessionScores
}

struct SRSummary: Codable {
    let totalConcepts: Int
    let dueForReview: Int
    let masteredCount: Int

    enum CodingKeys: String, CodingKey {
        case totalConcepts = "total_concepts"
        case dueForReview = "due_for_review"
        case masteredCount = "mastered_count"
    }
}

struct AuthResponse: Codable {
    let user: AuthUser
    let session: AuthSession?
}

struct AuthUser: Codable {
    let id: String
    let email: String?
}

struct AuthSession: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Int?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
    }
}
