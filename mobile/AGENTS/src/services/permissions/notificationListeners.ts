import { Platform } from 'react-native';
import { refreshOrders } from '../accountSync';
import { onAppForeground } from './permissionService';
import { Notifications, syncPushRegistration } from './notificationPermission';
import { routeForNotification, type NotificationTarget } from './logic';

type Options = {
  /** Open a screen. The caller queues it until navigation is ready. */
  navigate: (t: NotificationTarget) => void;
  /** The signed-in customer, or undefined. */
  userId: () => string | undefined;
};

/**
 * Starts the notification plumbing once, at app start. It never shows a permission prompt:
 * - tapping a notification (app running, in the background, or launched by it) opens the order, offers or inbox;
 * - the server's copy of this phone's push token is refreshed at start, on return to the foreground and when the OS rotates it;
 * - an order notification that arrives while the app is open refreshes the orders, so the status on screen changes at once (no waiting for the next poll).
 */
export function startNotificationListeners({ navigate, userId }: Options): () => void {
  if (Platform.OS === 'web') return () => {};
  const handled = new Set<string>();
  const open = (r: Notifications.NotificationResponse | null) => {
    if (!r) return;
    const id = r.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    navigate(routeForNotification(r.notification.request.content.data as Record<string, unknown> | undefined));
  };

  const tap = Notifications.addNotificationResponseReceivedListener(open);
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => {}); // the app was launched by a tap
  const received = Notifications.addNotificationReceivedListener((n) => {
    const kind = (n.request.content.data as Record<string, unknown> | undefined)?.kind;
    if (typeof kind === 'string' && /^(order_|return_|refund_)/.test(kind)) refreshOrders().catch(() => {});
  });
  const rotated = Notifications.addPushTokenListener(() => { syncPushRegistration(userId()).catch(() => {}); });
  const stopForeground = onAppForeground(() => { syncPushRegistration(userId()).catch(() => {}); });
  syncPushRegistration(userId()).catch(() => {});

  return () => { tap.remove(); received.remove(); rotated.remove(); stopForeground(); };
}
