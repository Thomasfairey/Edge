import SwiftUI

@main
struct TheEdgeApp: App {
    @StateObject private var authManager = AuthManager()
    @StateObject private var sessionManager = SessionManager()
    @StateObject private var subscriptionManager = SubscriptionManager()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        AnalyticsManager.shared.installCrashReporter()
        AnalyticsManager.shared.trackAppLaunch()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .environmentObject(sessionManager)
                .environmentObject(subscriptionManager)
                .onAppear {
                    NotificationManager.shared.clearBadge()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        AnalyticsManager.shared.trackAppForeground()
                    case .background:
                        AnalyticsManager.shared.trackAppBackground()
                    default:
                        break
                    }
                }
        }
    }
}
