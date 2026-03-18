import SwiftUI

@main
struct TheEdgeApp: App {
    @StateObject private var authManager = AuthManager()
    @StateObject private var sessionManager = SessionManager()
    @StateObject private var subscriptionManager = SubscriptionManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .environmentObject(sessionManager)
                .environmentObject(subscriptionManager)
                .onAppear {
                    // Clear badge on launch
                    NotificationManager.shared.clearBadge()
                }
        }
    }
}
