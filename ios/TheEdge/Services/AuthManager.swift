import Foundation
import SwiftUI
import AuthenticationServices

/// Manages authentication state and token persistence.
@MainActor
class AuthManager: ObservableObject {
    enum AuthState: Equatable {
        case loading
        case unauthenticated
        case needsOnboarding
        case authenticated
    }

    @Published var state: AuthState = .loading
    @Published var currentUser: UserProfile?
    @Published var errorMessage: String?

    private let keychainService = "com.theedge.auth"

    init() {
        Task { await restoreSession() }
    }

    // MARK: - Auth Actions

    func signUp(email: String, password: String, displayName: String) async {
        do {
            let body = ["email": email, "password": password, "display_name": displayName]
            let response: AuthResponse = try await APIClient.shared.request(
                method: "POST", path: "auth/signup", body: body
            )

            if let session = response.session {
                await saveTokens(access: session.accessToken, refresh: session.refreshToken)
                await APIClient.shared.setTokens(access: session.accessToken, refresh: session.refreshToken)
                state = .needsOnboarding
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signIn(email: String, password: String) async {
        do {
            let body = ["email": email, "password": password]
            let response: AuthResponse = try await APIClient.shared.request(
                method: "POST", path: "auth/login", body: body
            )

            if let session = response.session {
                await saveTokens(access: session.accessToken, refresh: session.refreshToken)
                await APIClient.shared.setTokens(access: session.accessToken, refresh: session.refreshToken)
                await loadProfile()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        deleteTokens()
        await APIClient.shared.clearTokens()
        currentUser = nil
        state = .unauthenticated
    }

    // MARK: - Session Restoration

    private func restoreSession() async {
        guard let accessToken = loadToken(key: "access_token"),
              let refreshToken = loadToken(key: "refresh_token") else {
            state = .unauthenticated
            return
        }

        await APIClient.shared.setTokens(access: accessToken, refresh: refreshToken)
        await loadProfile()
    }

    private func loadProfile() async {
        do {
            let profile: UserProfile = try await APIClient.shared.request(
                method: "GET", path: "profile"
            )
            currentUser = profile
            state = profile.onboardingCompleted ? .authenticated : .needsOnboarding
        } catch {
            state = .unauthenticated
        }
    }

    // MARK: - Keychain

    private func saveTokens(access: String, refresh: String) async {
        saveToken(key: "access_token", value: access)
        saveToken(key: "refresh_token", value: refresh)
    }

    private func saveToken(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    private func loadToken(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deleteTokens() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
