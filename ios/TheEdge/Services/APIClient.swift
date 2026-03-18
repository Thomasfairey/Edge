import Foundation

/// Central API client for all backend communication.
/// Uses URLSession with async/await for clean concurrency.
actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private var accessToken: String?
    private var refreshToken: String?

    private init() {
        self.baseURL = AppConfig.apiBaseURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        self.session = URLSession(configuration: config)
    }

    // MARK: - Token Management

    func setTokens(access: String, refresh: String) {
        self.accessToken = access
        self.refreshToken = refresh
    }

    func clearTokens() {
        self.accessToken = nil
        self.refreshToken = nil
    }

    // MARK: - Generic Request

    func request<T: Codable>(
        method: String,
        path: String,
        body: Encodable? = nil
    ) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            let encoder = JSONEncoder()
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }

        // Handle token refresh on 401
        if httpResponse.statusCode == 401, let refreshToken = self.refreshToken {
            let refreshed = try await refreshAccessToken(refreshToken)
            if refreshed {
                return try await self.request(method: method, path: path, body: body)
            }
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let decoder = JSONDecoder()
            if let errorResponse = try? decoder.decode(APIResponse<EmptyResponse>.self, from: data) {
                throw APIClientError.serverError(
                    code: errorResponse.error?.code ?? "UNKNOWN",
                    message: errorResponse.error?.message ?? "Unknown error",
                    statusCode: httpResponse.statusCode
                )
            }
            throw APIClientError.httpError(statusCode: httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let apiResponse = try decoder.decode(APIResponse<T>.self, from: data)

        guard let responseData = apiResponse.data else {
            throw APIClientError.noData
        }

        return responseData
    }

    // MARK: - Streaming Request

    func stream(
        path: String,
        body: Encodable? = nil,
        onChunk: @escaping (String) -> Void
    ) async throws {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            let encoder = JSONEncoder()
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (bytes, response) = try await session.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIClientError.invalidResponse
        }

        for try await line in bytes.lines {
            onChunk(line)
        }
    }

    // MARK: - Token Refresh

    private func refreshAccessToken(_ token: String) async throws -> Bool {
        let url = baseURL.appendingPathComponent("auth/refresh")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "X-Refresh-Token")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return false
        }

        let decoder = JSONDecoder()
        let result = try decoder.decode(APIResponse<RefreshResponse>.self, from: data)

        if let session = result.data?.session {
            self.accessToken = session.accessToken
            self.refreshToken = session.refreshToken
            return true
        }

        return false
    }
}

// MARK: - Supporting Types

struct EmptyResponse: Codable {}

struct RefreshResponse: Codable {
    let session: AuthSession
}

enum APIClientError: LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int)
    case serverError(code: String, message: String, statusCode: Int)
    case noData

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid server response"
        case .httpError(let code): return "HTTP error \(code)"
        case .serverError(_, let message, _): return message
        case .noData: return "No data in response"
        }
    }
}

/// Type-erased Encodable wrapper
struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void

    init(_ wrapped: Encodable) {
        _encode = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
