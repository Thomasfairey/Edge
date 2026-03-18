import Foundation

/// Environment-based API configuration.
/// Reads from Info.plist or falls back to defaults.
enum AppConfig {
    /// The base URL for the backend API.
    static var apiBaseURL: URL {
        if let urlString = Bundle.main.infoDictionary?["API_BASE_URL"] as? String,
           let url = URL(string: urlString) {
            return url
        }
        #if DEBUG
        return URL(string: "http://localhost:3001/v1")!
        #else
        return URL(string: "https://api.theedge.app/v1")!
        #endif
    }

    /// Whether the app is running in debug mode.
    static var isDebug: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }

    /// App version string.
    static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    /// Build number.
    static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
}
