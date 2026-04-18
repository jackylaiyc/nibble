/**
 * Thin wrapper over the browser Notification API.
 *
 * Honest limitation: web Notifications only fire while the app tab is
 * open (or, for PWAs installed to home screen, when the PWA runtime is
 * alive). Scheduled push that fires at 22:00 while the app is closed
 * requires Web Push + a server cron — out of scope for the current
 * localStorage-only MVP. When that infrastructure lands, the caller of
 * these helpers won't need to change — we'll just add a ServiceWorker
 * push listener that renders the same copy.
 */

export type NotificationSupport =
  | "unsupported" // API missing (old browser, iOS Safari outside PWA)
  | "denied"
  | "default"
  | "granted";

export function getNotificationSupport(): NotificationSupport {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as NotificationSupport;
}

/**
 * Request permission. Must be called from a user gesture (click/tap).
 * Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  try {
    const result = await Notification.requestPermission();
    return result as NotificationSupport;
  } catch {
    return "denied";
  }
}

/**
 * Fire a local notification immediately. No-op if permission isn't granted.
 * The caller is responsible for gating this behind dedupe logic (e.g. "already
 * fired today") — this helper is intentionally idempotent-unaware.
 */
export function fireLocalNotification(
  title: string,
  body: string,
  tag?: string,
): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    new Notification(title, {
      body,
      tag,                  // collapses duplicates within the same session
      icon: "/icon-192.png", // served by Next.js if present; browser falls back gracefully
      badge: "/icon-192.png",
    });
    return true;
  } catch {
    return false;
  }
}
