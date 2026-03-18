import SwiftUI

@main
struct TheEdgeApp: App {
    @StateObject private var authManager = AuthManager()
    @StateObject private var sessionManager = SessionManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .environmentObject(sessionManager)
        }
    }
}
