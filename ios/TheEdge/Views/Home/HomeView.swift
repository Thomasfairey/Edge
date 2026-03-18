import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.fill")
                }
        }
        .tint(.accent)
    }
}

struct HomeView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @State private var status: StatusResponse?
    @State private var isLoadingStatus = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Progress Ring
                    ProgressRingView(
                        score: overallAverage,
                        day: status?.dayNumber ?? 1,
                        streak: status?.streakCount ?? 0
                    )

                    // Start Session Button
                    Button {
                        Haptic.medium()
                        Task { await sessionManager.startSession() }
                    } label: {
                        HStack {
                            Image(systemName: "play.fill")
                            Text("Start Today's Session")
                                .font(.headline)
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .disabled(sessionManager.phase != .idle)

                    // Dimension Scores
                    if let recentScores = status?.recentScores, !recentScores.isEmpty {
                        DimensionScoresView(scores: recentScores)
                    }

                    // Streak & Stats
                    if let status {
                        StatsRowView(status: status)
                    }
                }
                .padding(20)
            }
            .background(Color.cream.ignoresSafeArea())
            .navigationTitle("The Edge")
            .fullScreenCover(isPresented: sessionActive) {
                SessionFlowView()
                    .environmentObject(sessionManager)
            }
            .task { await loadStatus() }
        }
    }

    private var sessionActive: Binding<Bool> {
        Binding(
            get: { sessionManager.phase != .idle },
            set: { if !$0 { sessionManager.reset() } }
        )
    }

    private var overallAverage: Double {
        guard let scores = status?.recentScores, !scores.isEmpty else { return 0 }
        let averages = scores.map { $0.scores.average }
        return averages.reduce(0, +) / Double(averages.count)
    }

    private func loadStatus() async {
        isLoadingStatus = true
        do {
            status = try await APIClient.shared.request(method: "GET", path: "status")
        } catch {
            // Silent fail — show empty state
        }
        isLoadingStatus = false
    }
}

// MARK: - Progress Ring

struct ProgressRingView: View {
    let score: Double
    let day: Int
    let streak: Int

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(Color.primary400.opacity(0.15), lineWidth: 12)
                    .frame(width: 140, height: 140)

                Circle()
                    .trim(from: 0, to: score / 5.0)
                    .stroke(Color.accent, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                    .frame(width: 140, height: 140)
                    .rotationEffect(.degrees(-90))
                    .animation(.spring(response: 0.8), value: score)

                VStack(spacing: 2) {
                    Text(String(format: "%.1f", score))
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundColor(.primary900)
                    Text("/ 5.0")
                        .font(.caption)
                        .foregroundColor(.primary400)
                }
            }

            HStack(spacing: 24) {
                Label("Day \(day)", systemImage: "calendar")
                Label("\(streak) streak", systemImage: "flame.fill")
            }
            .font(.subheadline)
            .foregroundColor(.primary600)
        }
        .card()
    }
}

// MARK: - Dimension Scores

struct DimensionScoresView: View {
    let scores: [RecentScore]

    private var latestScores: SessionScores? {
        scores.last?.scores
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Performance")
                .font(.headline)
                .foregroundColor(.primary900)

            if let latest = latestScores {
                ForEach(latest.dimensions, id: \.name) { dim in
                    HStack {
                        Text(dim.name)
                            .font(.subheadline)
                            .foregroundColor(.primary600)
                            .frame(width: 100, alignment: .leading)

                        ProgressView(value: Double(dim.value), total: 5)
                            .tint(Color.scoreColor(for: dim.value))

                        Text("\(dim.value)")
                            .font(.subheadline.bold())
                            .foregroundColor(Color.scoreColor(for: dim.value))
                            .frame(width: 24)
                    }
                }
            }
        }
        .card()
    }
}

// MARK: - Stats Row

struct StatsRowView: View {
    let status: StatusResponse

    var body: some View {
        HStack(spacing: 16) {
            StatCard(title: "Concepts", value: "\(status.srSummary.totalConcepts)", icon: "brain.head.profile")
            StatCard(title: "Mastered", value: "\(status.srSummary.masteredCount)", icon: "checkmark.seal.fill")
            StatCard(title: "Due", value: "\(status.srSummary.dueForReview)", icon: "arrow.counterclockwise")
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(.accent)
            Text(value)
                .font(.title3.bold())
                .foregroundColor(.primary900)
            Text(title)
                .font(.caption)
                .foregroundColor(.primary400)
        }
        .frame(maxWidth: .infinity)
        .card()
    }
}
