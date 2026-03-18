import SwiftUI
import AuthenticationServices
import CryptoKit

struct ProfileView: View {
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var subscriptionManager: SubscriptionManager
    @State private var showSubscription = false
    @State private var showNotificationSettings = false

    var body: some View {
        NavigationStack {
            List {
                if let user = authManager.currentUser {
                    Section("Profile") {
                        LabeledContent("Name", value: user.displayName)
                        LabeledContent("Email", value: user.email)
                        LabeledContent("Level", value: user.experienceLevel.rawValue.capitalized)
                        LabeledContent("Tier", value: user.subscriptionTier.rawValue.capitalized)
                    }

                    if !user.goals.isEmpty {
                        Section("Goals") {
                            ForEach(user.goals, id: \.self) { goal in
                                Text(goal)
                            }
                        }
                    }

                    // Subscription
                    if user.subscriptionTier == .free {
                        Section {
                            Button {
                                showSubscription = true
                            } label: {
                                HStack {
                                    Image(systemName: "bolt.shield.fill")
                                        .foregroundColor(.accent)
                                    Text("Upgrade to Pro")
                                        .foregroundColor(.accent)
                                }
                            }
                        }
                    }

                    // Notifications
                    Section("Notifications") {
                        Button("Set Up Daily Reminders") {
                            Task {
                                await NotificationManager.shared.requestAuthorization()
                            }
                        }
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        Task { await authManager.signOut() }
                    }
                }

                Section {
                    HStack {
                        Spacer()
                        Text("v\(AppConfig.appVersion) (\(AppConfig.buildNumber))")
                            .font(.caption)
                            .foregroundColor(.primary400)
                        Spacer()
                    }
                }
            }
            .navigationTitle("Profile")
            .sheet(isPresented: $showSubscription) {
                SubscriptionView()
                    .environmentObject(subscriptionManager)
            }
        }
    }
}

struct AuthView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var isSignUp = false
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var currentNonce: String?

    var body: some View {
        ZStack {
            Color.cream.ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                Text("THE EDGE")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.primary900)

                Text("AI-Powered Influence Training")
                    .font(.subheadline)
                    .foregroundColor(.primary400)

                VStack(spacing: 16) {
                    // Apple Sign-In
                    SignInWithAppleButton(.signIn) { request in
                        let nonce = randomNonceString()
                        currentNonce = nonce
                        request.requestedScopes = [.fullName, .email]
                        request.nonce = sha256(nonce)
                    } onCompletion: { result in
                        switch result {
                        case .success(let authorization):
                            handleAppleSignIn(authorization)
                        case .failure(let error):
                            authManager.errorMessage = error.localizedDescription
                        }
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Divider
                    HStack {
                        Rectangle().fill(Color.primary400.opacity(0.3)).frame(height: 1)
                        Text("or")
                            .font(.caption)
                            .foregroundColor(.primary400)
                        Rectangle().fill(Color.primary400.opacity(0.3)).frame(height: 1)
                    }

                    // Email/Password
                    if isSignUp {
                        TextField("Name", text: $displayName)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(.name)
                    }

                    TextField("Email", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)

                    SecureField("Password", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(isSignUp ? .newPassword : .password)

                    if let error = authManager.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.scoreLow)
                    }

                    Button {
                        Task {
                            if isSignUp {
                                await authManager.signUp(email: email, password: password, displayName: displayName)
                            } else {
                                await authManager.signIn(email: email, password: password)
                            }
                        }
                    } label: {
                        Text(isSignUp ? "Create Account" : "Sign In")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.accent)
                    .controlSize(.large)

                    Button(isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up") {
                        isSignUp.toggle()
                    }
                    .font(.subheadline)
                    .foregroundColor(.accent)
                }
                .padding(.horizontal, 40)

                Spacer()
            }
        }
    }

    // MARK: - Apple Sign-In Helpers

    private func handleAppleSignIn(_ authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            authManager.errorMessage = "Failed to process Apple Sign-In"
            return
        }

        Task {
            await authManager.signInWithApple(idToken: idToken, nonce: currentNonce)
        }
    }

    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var randomBytes = [UInt8](repeating: 0, count: length)
        let errorCode = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        guard errorCode == errSecSuccess else { return "" }

        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(randomBytes.map { charset[Int($0) % charset.count] })
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashed = SHA256.hash(data: inputData)
        return hashed.compactMap { String(format: "%02x", $0) }.joined()
    }
}
