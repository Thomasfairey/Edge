import Foundation
import os.log

/// Lightweight analytics and crash reporting service.
/// Uses os.log for structured logging and provides hooks for third-party integration.
@MainActor
class AnalyticsManager: ObservableObject {
    static let shared = AnalyticsManager()

    private let logger = Logger(subsystem: "com.theedge.app", category: "analytics")
    private var sessionStartTime: Date?
    private var currentSessionId: String?

    private init() {}

    // MARK: - Session Tracking

    func trackSessionStart(sessionId: String, day: Int, concept: String) {
        sessionStartTime = Date()
        currentSessionId = sessionId
        log(.info, event: "session_start", properties: [
            "session_id": sessionId,
            "day": "\(day)",
            "concept": concept,
        ])
    }

    func trackPhaseTransition(from: String, to: String) {
        log(.info, event: "phase_transition", properties: [
            "from": from,
            "to": to,
            "session_id": currentSessionId ?? "unknown",
        ])
    }

    func trackSessionComplete(scores: [String: Int]) {
        let duration = sessionStartTime.map { Date().timeIntervalSince($0) } ?? 0
        var properties: [String: String] = [
            "session_id": currentSessionId ?? "unknown",
            "duration_seconds": "\(Int(duration))",
        ]
        for (key, value) in scores {
            properties["score_\(key)"] = "\(value)"
        }
        log(.info, event: "session_complete", properties: properties)
        sessionStartTime = nil
        currentSessionId = nil
    }

    // MARK: - User Actions

    func trackAction(_ action: String, properties: [String: String] = [:]) {
        log(.info, event: action, properties: properties)
    }

    func trackCoachRequest() {
        trackAction("coach_requested", properties: [
            "session_id": currentSessionId ?? "unknown",
        ])
    }

    func trackCommandUsed(_ command: String) {
        trackAction("command_used", properties: [
            "command": command,
            "session_id": currentSessionId ?? "unknown",
        ])
    }

    func trackSubscriptionEvent(_ event: String, productId: String? = nil) {
        var properties: [String: String] = ["event_type": event]
        if let productId { properties["product_id"] = productId }
        log(.info, event: "subscription", properties: properties)
    }

    // MARK: - Error Tracking

    func trackError(_ error: Error, context: String) {
        log(.error, event: "error", properties: [
            "context": context,
            "message": error.localizedDescription,
            "type": String(describing: type(of: error)),
        ])
    }

    func trackAPIError(path: String, statusCode: Int, message: String) {
        log(.error, event: "api_error", properties: [
            "path": path,
            "status_code": "\(statusCode)",
            "message": message,
        ])
    }

    // MARK: - Crash Reporting

    /// Install a global uncaught exception handler.
    func installCrashReporter() {
        NSSetUncaughtExceptionHandler { exception in
            let logger = Logger(subsystem: "com.theedge.app", category: "crash")
            logger.critical("""
            Uncaught exception: \(exception.name.rawValue)
            Reason: \(exception.reason ?? "unknown")
            Stack: \(exception.callStackSymbols.joined(separator: "\n"))
            """)
        }
    }

    // MARK: - App Lifecycle

    func trackAppLaunch() {
        log(.info, event: "app_launch", properties: [
            "version": AppConfig.appVersion,
            "build": AppConfig.buildNumber,
        ])
    }

    func trackAppBackground() {
        log(.info, event: "app_background")
    }

    func trackAppForeground() {
        log(.info, event: "app_foreground")
    }

    // MARK: - Private

    private func log(_ level: OSLogType, event: String, properties: [String: String] = [:]) {
        let propsString = properties.map { "\($0.key)=\($0.value)" }.joined(separator: ", ")
        switch level {
        case .error:
            logger.error("[\(event)] \(propsString)")
        case .info:
            logger.info("[\(event)] \(propsString)")
        default:
            logger.log("[\(event)] \(propsString)")
        }

        // TODO: Forward to third-party analytics (Mixpanel, Amplitude, PostHog)
        // when integrating a production analytics provider.
    }
}
