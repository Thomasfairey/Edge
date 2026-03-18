import Foundation
import UserNotifications

/// Manages push notifications and daily training reminders.
@MainActor
class NotificationManager: ObservableObject {
    @Published var isAuthorized = false

    static let shared = NotificationManager()

    private init() {
        Task { await checkAuthorizationStatus() }
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted

            if granted {
                scheduleDailyReminder()
            }
        } catch {
            print("[notifications] Authorization failed: \(error.localizedDescription)")
        }
    }

    func checkAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized
    }

    // MARK: - Daily Reminder

    /// Schedule a daily training reminder at the user's preferred time.
    func scheduleDailyReminder(hour: Int = 9, minute: Int = 0) {
        let center = UNUserNotificationCenter.current()

        // Remove existing reminders
        center.removePendingNotificationRequests(withIdentifiers: ["daily-training-reminder"])

        let content = UNMutableNotificationContent()
        content.title = "Time to Train"
        content.body = "Your 10-minute influence session is waiting. Learn. Simulate. Deploy."
        content.sound = .default
        content.badge = 1

        var dateComponents = DateComponents()
        dateComponents.hour = hour
        dateComponents.minute = minute

        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(
            identifier: "daily-training-reminder",
            content: content,
            trigger: trigger
        )

        center.add(request)
    }

    /// Schedule a follow-up reminder if the user hasn't completed today's session.
    func scheduleSessionIncompleteReminder() {
        let center = UNUserNotificationCenter.current()

        let content = UNMutableNotificationContent()
        content.title = "Session Incomplete"
        content.body = "You started but didn't finish today's session. Pick up where you left off."
        content.sound = .default

        // Trigger 4 hours from now
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 4 * 3600, repeats: false)
        let request = UNNotificationRequest(
            identifier: "session-incomplete",
            content: content,
            trigger: trigger
        )

        center.add(request)
    }

    /// Clear the session incomplete reminder (called when session is completed).
    func clearSessionReminder() {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: ["session-incomplete"])
    }

    /// Clear badge count.
    func clearBadge() {
        UNUserNotificationCenter.current().setBadgeCount(0)
    }
}
