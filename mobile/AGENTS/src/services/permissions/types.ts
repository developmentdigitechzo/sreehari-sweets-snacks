/** Device capabilities the app genuinely uses. Photos need no entry: the system photo picker works without permission. */
export type PermissionKind = 'location' | 'camera' | 'notifications';

/**
 * undetermined: never asked.  granted: allowed.  denied: refused, the OS will still ask again (Android).
 * blocked: refused and the OS will not ask again, so only Settings can change it.  restricted: a device policy prevents it.
 * unavailable: the device or platform cannot do it at all (no camera, web, no push project).
 */
export type PermissionState = 'undetermined' | 'granted' | 'denied' | 'blocked' | 'restricted' | 'unavailable';

export type PermissionInfo = {
  state: PermissionState;
  /** True when the OS will still show its own prompt. */
  canAskAgain: boolean;
  /** Was granted before and is not any more (turned off in Settings). */
  revoked: boolean;
};

/** The slice of an Expo permission response we read. Injected, so every state can be tested without a device. */
export type RawPermission = { status: string; granted?: boolean; canAskAgain?: boolean };

export interface PermissionAdapter {
  get(): Promise<RawPermission>;
  request(): Promise<RawPermission>;
  /** False when the platform cannot offer this capability at all. */
  isAvailable?(): boolean | Promise<boolean>;
}

/** What a feature gets back from ensurePermission. */
export type EnsureResult = 'granted' | 'denied' | 'blocked' | 'unavailable' | 'dismissed';
