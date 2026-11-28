// Notification permission helpers for the compulsory pop-up (WelcomePopups).
export const notifPermission = () =>
  (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');

export function enableStepsFor(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return ['Open your iPhone Settings', 'Tap Notifications, then Fitengineers', 'Turn on Allow Notifications'];
  }
  if (/Android/i.test(ua)) {
    return ['Tap the lock or ⓘ icon next to the web address', 'Tap Permissions, then Notifications', 'Choose Allow, then come back here'];
  }
  return ['Click the lock icon next to the web address', 'Find Notifications and choose Allow', 'Come back to this tab'];
}
