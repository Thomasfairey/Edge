import SwiftUI
import StoreKit

/// Paywall view for upgrading to The Edge Pro.
struct SubscriptionView: View {
    @EnvironmentObject var subscriptionManager: SubscriptionManager
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Header
                    VStack(spacing: 12) {
                        Image(systemName: "bolt.shield.fill")
                            .font(.system(size: 56))
                            .foregroundColor(.accent)

                        Text("Unlock The Edge Pro")
                            .font(.title.bold())
                            .foregroundColor(.primary900)

                        Text("Train without limits")
                            .font(.subheadline)
                            .foregroundColor(.primary400)
                    }
                    .padding(.top, 20)

                    // Features
                    VStack(alignment: .leading, spacing: 16) {
                        FeatureRow(icon: "infinity", title: "Unlimited sessions", description: "No weekly cap — train daily")
                        FeatureRow(icon: "brain.head.profile", title: "All 7 domains", description: "Full concept taxonomy")
                        FeatureRow(icon: "person.3.fill", title: "All 12+ characters", description: "Every archetype available")
                        FeatureRow(icon: "chart.line.uptrend.xyaxis", title: "Trend analysis", description: "Track progress over time")
                        FeatureRow(icon: "target", title: "Mission accountability", description: "Phase 0 accountability gate")
                        FeatureRow(icon: "arrow.counterclockwise", title: "Spaced repetition", description: "Optimal concept review scheduling")
                    }
                    .card()

                    // Products
                    if subscriptionManager.isLoading {
                        ProgressView()
                    } else {
                        VStack(spacing: 12) {
                            ForEach(subscriptionManager.products, id: \.id) { product in
                                ProductButton(product: product) {
                                    Task { await subscriptionManager.purchase(product) }
                                }
                            }
                        }
                    }

                    if let error = subscriptionManager.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.scoreLow)
                    }

                    // Restore
                    Button("Restore Purchases") {
                        Task { await subscriptionManager.restorePurchases() }
                    }
                    .font(.subheadline)
                    .foregroundColor(.primary400)

                    // Legal
                    Text("Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period.")
                        .font(.caption2)
                        .foregroundColor(.primary400)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                }
                .padding(20)
            }
            .background(Color.cream.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.primary400)
                    }
                }
            }
        }
    }
}

// MARK: - Feature Row

private struct FeatureRow: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.accent)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.bold())
                    .foregroundColor(.primary900)
                Text(description)
                    .font(.caption)
                    .foregroundColor(.primary400)
            }
        }
    }
}

// MARK: - Product Button

private struct ProductButton: View {
    let product: Product
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(product.displayName)
                        .font(.headline)
                    Text(product.description)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                }

                Spacer()

                Text(product.displayPrice)
                    .font(.title3.bold())
            }
            .foregroundColor(.white)
            .padding(20)
            .background(Color.accent)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}
