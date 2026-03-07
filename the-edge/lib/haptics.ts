/**
 * Haptic feedback utility — wraps Capacitor Haptics plugin.
 * Falls back to no-op on web/unsupported platforms.
 */

let hapticsModule: typeof import("@capacitor/haptics") | null | false = null;

async function getHaptics() {
  if (hapticsModule === false) return null;
  if (hapticsModule) return hapticsModule;

  try {
    hapticsModule = await import("@capacitor/haptics");
    return hapticsModule;
  } catch {
    hapticsModule = false;
    return null;
  }
}

/** Light tap — button presses, selections */
export async function hapticTap() {
  const m = await getHaptics();
  if (m) m.Haptics.impact({ style: m.ImpactStyle.Light });
}

/** Medium impact — phase transitions, score reveals */
export async function hapticImpact() {
  const m = await getHaptics();
  if (m) m.Haptics.impact({ style: m.ImpactStyle.Medium });
}

/** Success notification — session complete, high score */
export async function hapticSuccess() {
  const m = await getHaptics();
  if (m) m.Haptics.notification({ type: m.NotificationType.Success });
}

/** Warning notification — low score, error */
export async function hapticWarning() {
  const m = await getHaptics();
  if (m) m.Haptics.notification({ type: m.NotificationType.Warning });
}
