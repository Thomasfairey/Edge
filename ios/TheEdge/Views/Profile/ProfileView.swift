import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var authManager: AuthManager

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
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        Task { await authManager.signOut() }
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}

struct AuthView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var isSignUp = false
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""

    var body: some View {
        ZStack {
            Color.cream.ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                Text("THE EDGE")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.primary900)

                VStack(spacing: 16) {
                    if isSignUp {
                        TextField("Name", text: $displayName)
                            .textFieldStyle(.roundedBorder)
                    }

                    TextField("Email", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)

                    SecureField("Password", text: $password)
                        .textFieldStyle(.roundedBorder)

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
}
