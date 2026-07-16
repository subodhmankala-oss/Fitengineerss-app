// Shared helpers for subscribing/checking/removing THIS device's push
// subscription.
//
// Note what this can and can't do: the browser's Notification permission
// itself (granted/denied) can never be revoked from JS — that's a one-way
// door the user can only undo via their browser/OS site settings. What we
// CAN do, and what "turning notifications off" actually means in practice,
// is unsubscribe this device's PushSubscription and delete its row from
// push_subscriptions — so no further pushes are ever sent to it, even
// though the OS permission indicator will still show "allowed".

// Subscribes THIS device to push and registers it server-side under the
// current user (so notify-user/send-nudges can target it). Idempotent:
// reuses an existing subscription instead of creating a duplicate. Always
// makes the /api/subscribe call even when a subscription already existed,
// so this can also be used to explicitly re-enable after an unsubscribe —
// requesting Notification permission again when it's already 'granted'
// resolves instantly with no browser prompt and no new subscription, so
// callers can't rely on that alone to know a subscribe actually happened.
export async function subscribeToPush(userName) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported in this browser.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const vapidPublicKey = 'BIupVfv6kg0G6uCsUWYciNynMR5xs6F3dl3QWXjRWGFkfZzvBPClM_FSLCEInVTDF0wtMkk5sDfbmWH1b2RMuqk';

      const convertVapidKey = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertVapidKey(vapidPublicKey)
      });
    }

    const subJson = typeof subscription.toJSON === 'function'
      ? subscription.toJSON()
      : JSON.parse(JSON.stringify(subscription));
    subJson.userEmail = localStorage.getItem('userEmail') || '';

    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: userName || 'Warrior',
        userId: localStorage.getItem('userId') || null,
        subscription: subJson
      })
    });
    console.log('Registered with Vercel Web Push backend for lock-screen nudges.');
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
}

// Whether this device currently has an active push subscription for this
// site (independent of whether Notification permission is 'granted' —
// permission can be granted with no subscription, e.g. right after a
// previous unsubscribe).
export async function hasActivePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

// Unsubscribes this device from push and removes its row server-side so
// notify-user/send-nudges stop targeting it. Best-effort: always resolves.
export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    // DELETE on /api/subscribe (not a separate function) — see the comment
    // in api/subscribe.js for why.
    await fetch('/api/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint })
    }).catch(() => {});
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
  }
}
