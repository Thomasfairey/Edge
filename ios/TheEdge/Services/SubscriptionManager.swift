import Foundation
import StoreKit

/// Manages StoreKit 2 subscriptions for The Edge Pro tier.
@MainActor
class SubscriptionManager: ObservableObject {
    static let productIds = ["com.theedge.pro.monthly", "com.theedge.pro.annual"]

    @Published var products: [Product] = []
    @Published var purchasedProductIds: Set<String> = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var transactionListener: Task<Void, Error>?

    var isPro: Bool {
        !purchasedProductIds.isEmpty
    }

    init() {
        transactionListener = listenForTransactions()
        Task { await loadProducts() }
    }

    deinit {
        transactionListener?.cancel()
    }

    // MARK: - Load Products

    func loadProducts() async {
        isLoading = true
        do {
            products = try await Product.products(for: Self.productIds)
                .sorted { $0.price < $1.price }
        } catch {
            errorMessage = "Failed to load products"
        }
        isLoading = false
    }

    // MARK: - Purchase

    func purchase(_ product: Product) async {
        isLoading = true
        errorMessage = nil

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await updatePurchasedProducts()
                await verifyWithBackend(transaction: transaction)
                await transaction.finish()
                Haptic.success()

            case .userCancelled:
                break

            case .pending:
                errorMessage = "Purchase is pending approval"

            @unknown default:
                break
            }
        } catch {
            errorMessage = error.localizedDescription
            Haptic.error()
        }

        isLoading = false
    }

    // MARK: - Restore Purchases

    func restorePurchases() async {
        isLoading = true
        try? await AppStore.sync()
        await updatePurchasedProducts()
        isLoading = false
    }

    // MARK: - Verify Status

    func updatePurchasedProducts() async {
        var purchased: Set<String> = []

        for await result in Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result) {
                if transaction.revocationDate == nil {
                    purchased.insert(transaction.productID)
                }
            }
        }

        purchasedProductIds = purchased
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Error> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                if let transaction = try? self?.checkVerified(result) {
                    await self?.updatePurchasedProducts()
                    await self?.verifyWithBackend(transaction: transaction)
                    await transaction.finish()
                }
            }
        }
    }

    // MARK: - Verification

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.verificationFailed
        case .verified(let safe):
            return safe
        }
    }

    /// Verify the transaction with our backend to update the user's tier.
    private func verifyWithBackend(transaction: Transaction) async {
        do {
            let body: [String: String] = [
                "receipt_data": String(transaction.id),
                "product_id": transaction.productID,
            ]
            let _: SubscriptionVerifyResponse = try await APIClient.shared.request(
                method: "POST", path: "subscription/verify", body: body
            )
        } catch {
            // Backend verification failure is non-blocking — the entitlement is local
            print("[subscription] Backend verification failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Supporting Types

enum StoreError: LocalizedError {
    case verificationFailed

    var errorDescription: String? {
        switch self {
        case .verificationFailed:
            return "Transaction verification failed"
        }
    }
}

struct SubscriptionVerifyResponse: Codable {
    let tier: String
    let expiresAt: String?
    let productId: String

    enum CodingKeys: String, CodingKey {
        case tier
        case expiresAt = "expires_at"
        case productId = "product_id"
    }
}
