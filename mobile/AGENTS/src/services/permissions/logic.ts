import type { PermissionState, RawPermission } from './types';

/** Maps an Expo permission response onto the app's states. No Expo or React Native imports, so it runs in plain Node tests. */
export function toState(raw: RawPermission): PermissionState {
  if (raw.granted || raw.status === 'granted') return 'granted';
  if (raw.status === 'restricted') return 'restricted';
  if (raw.status === 'undetermined') return 'undetermined';
  return raw.canAskAgain === false ? 'blocked' : 'denied';
}

export type NotificationTarget = { name: 'OrderTracking'; params: { orderId: string } } | { name: 'Offers' } | { name: 'Inbox' };

/** Where a tapped notification should open. An order notification opens that order, an offer opens Offers, anything else the inbox. */
export function routeForNotification(data: Record<string, unknown> | undefined): NotificationTarget {
  const orderId = typeof data?.orderId === 'string' && data.orderId.length > 0 ? data.orderId : null;
  if (orderId) return { name: 'OrderTracking', params: { orderId } };
  if (data?.kind === 'promo') return { name: 'Offers' };
  return { name: 'Inbox' };
}

export const IMAGE_RULES = {
  maxBytes: 5 * 1024 * 1024,
  minShortSidePx: 300,
  /** The picker hands back JPEG/PNG/WebP/HEIC; anything else is refused. */
  formats: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as readonly string[],
} as const;

/** Checks a picked image against the app's rules. Returns the reason to show, or null when it is acceptable. */
export function imageProblem(a: { fileSize?: number | null; width?: number; height?: number; mimeType?: string | null }): string | null {
  if (a.mimeType && !IMAGE_RULES.formats.includes(a.mimeType.toLowerCase())) return 'Use a JPG, PNG or WebP image.';
  if (a.fileSize && a.fileSize > IMAGE_RULES.maxBytes) return 'That image is larger than 5 MB even after compression. Choose a smaller one.';
  if (a.width && a.height && Math.min(a.width, a.height) < IMAGE_RULES.minShortSidePx) return 'Image is too small. Use at least 300 px on the short side.';
  return null;
}
