import SwiftUI

struct RootView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        Group {
            switch authManager.state {
            case .loading:
                LaunchView()
            case .unauthenticated:
                AuthView()
            case .needsOnboarding:
                OnboardingView()
            case .authenticated:
                MainTabView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authManager.state)
    }
}

struct LaunchView: View {
    var body: some View {
        ZStack {
            Color.cream.ignoresSafeArea()
            VStack(spacing: 16) {
                Text("THE EDGE")
                    .font(.system(size: 32, weight: .bold, design: .default))
                    .foregroundColor(.primary900)
                ProgressView()
                    .tint(.accent)
            }
        }
    }
}
