# Device permissions: audit, implementation and test report

Date: 2026-11-04. Scope: Shree Hari mobile app (Expo SDK 58, Android and iOS).

## 1. What was verified and what was not

| Check | Result |
|---|---|
| Mobile typecheck (`tsc --noEmit`) | Passes |
| Mobile lint (`--max-warnings=0`) | Passes |
| Mobile unit tests | 30 pass (includes new permission, route and image-rule tests) |
| Backend typecheck | Passes |
| Backend tests | 59 pass (includes new push tests with a fake push service) |
| Resolved native config (`expo config --type introspect`) | Checked: only the permissions listed below remain |
| **Physical Android and iPhone testing** | **NOT performed.** Real devices and the OS permission dialogs cannot be driven from this environment. Section 7 is the plan to run. |
| Development and production EAS builds | **NOT built.** Needs your Expo account. |
| Real push delivery | **NOT tested.** Needs an EAS project ID and a real device (D17). |

Nothing in this report claims device behaviour that was not observed.

## 2. Permission audit

| Permission | Needed? | Why |
|---|---|---|
| Location, while in use (Android fine and coarse, iOS When In Use) | Yes | "Use my current location" fills the delivery address. One reading, only on tap. |
| Camera | Yes | Taking a profile photo. |
| Notifications (Android 13+ `POST_NOTIFICATIONS`, iOS alerts) | Yes | Order updates. |
| Photo library | **No permission** | The system photo picker (Android Photo Picker, iOS PHPicker) gives the app only the photo the customer picks. |
| Microphone | No | No audio or video feature. Removed (the image-picker plugin adds it by default). |
| Background location, motion, full-accuracy location | No | No tracking. Removed (the location plugin adds strings for them by default). |
| Face ID | No | Not used. Removed (the secure-store plugin adds a string by default). |
| Contacts, files, Bluetooth, external storage, draw-over-apps | No | No feature uses them. Explicitly blocked on Android. |

## 3. Permission to feature

| Feature | Permission | When asked | If refused |
|---|---|---|---|
| Add address, "Use my current location" | Location (while in use) | After the customer taps Continue on the in-sheet explanation | Message with Open Settings or Try again. Address and PIN can always be typed. |
| Profile photo, Camera | Camera | After the explanation sheet | Message; Gallery still works. |
| Profile photo, Gallery | none | n/a | n/a |
| Order updates | Notifications | Account > Notifications, Privacy & permissions, or the optional card on the order-success screen. Never at launch. | Order Tracking still shows status. |

## 4. Android changes (`app.json`)
- `permissions`: ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, CAMERA, POST_NOTIFICATIONS.
- `blockedPermissions`: RECORD_AUDIO, READ/WRITE_EXTERNAL_STORAGE, READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_VISUAL_USER_SELECTED, SYSTEM_ALERT_WINDOW, ACCESS_BACKGROUND_LOCATION.
- Notification channels created at runtime: `orders` (high) and `offers` (default), so each can be managed separately in system settings.
- `expo-notifications` plugin added (brand colour).

## 5. iOS changes (`app.json`)
Resolved Info.plist keys: `NSLocationWhenInUseUsageDescription` and `NSCameraUsageDescription` only, both in plain language. No photo library, microphone, motion, Face ID or Always-location strings. Remote notifications need the push entitlement that EAS adds when you build with push credentials.

## 6. Implementation
- `mobile/AGENTS/src/services/permissions/`: `permissionService.ts` (states, request, Settings, explain-then-ask), `locationPermission.ts`, `cameraPermission.ts`, `mediaPermission.ts` (documents the no-permission design), `notificationPermission.ts`, `notificationListeners.ts`, `logic.ts` (pure, tested).
- States handled: not asked, granted, denied, blocked (Settings only), restricted, unavailable, and revoked-after-grant. The app rechecks when it returns from Settings.
- UI: `PermissionHost` (explanation sheet, mounted once), Account > Privacy & permissions, Notifications panel, photo preview with Retake / Use photo / Cancel (nothing is saved until confirmed), order-success updates card.
- Image rules: JPG/PNG/WebP/HEIC, 5 MB after compression, at least 300 px short side; cancel, camera-unavailable and error paths covered.
- Push: token requested only after permission is granted; sent to `POST /me/devices`; removed on sign out (`DELETE /me/devices`); refreshed on foreground and token rotation; tapping opens the order, Offers or the inbox.
- Backend: order placed, status changes, cancellation, return decision and refund send a best-effort service push after the database commit (a push failure never affects the order). Promotional broadcasts still require the marketing opt-in.

## 7. Device test plan (NOT executed)
Run on at least one Android 13+ phone and one iPhone, with a development build and then a production build.

1. Fresh install, grant location, add address with GPS.
2. Deny location once, then try again.
3. Deny location permanently ("Don't ask again" on Android, Don't Allow on iOS), confirm Open Settings appears, enable it, return, confirm detection continues.
4. Location services switched off in the OS, confirm the message and manual entry.
5. No network during reverse geocoding, confirm coordinates are kept and manual entry works.
6. Camera: allow, preview, Retake, Use photo, Cancel.
7. Camera denied, then permanently denied, confirm Gallery still works.
8. Gallery picker with no permission prompt; pick a large image and a tiny image; cancel the picker.
9. Notifications: allow, receive a status push, tap it from foreground, background and killed app.
10. Notifications denied, then enable from Settings and return.
11. Revoke a permission in Settings while the app is in the background; reopen and confirm the screen shows the real state.
12. Sign out and confirm no more pushes arrive on that phone.

Also check: the iOS explanation sheet appearing from inside another sheet (nested modal risk), and Android font scaling.

## 8. Permission outcome table (to fill in on device)

| Permission | Granted | Denied | Unavailable |
|---|---|---|---|
| Location | not tested | not tested | web: reported as unavailable |
| Camera | not tested | not tested | web and simulators: reported as unavailable |
| Notifications | not tested | not tested | web: unavailable; Expo Go cannot receive remote push |

## 9. Unrelated features without optional permissions
The permission code paths are only reached from the features above. Browsing, cart, checkout, orders, offers, wishlist and typed addresses do not call any permission API. Established by code search and the passing typecheck, not by a device run.

## 10. Privacy
Minimum access: foreground location, one reading, never in the background. Photos are not uploaded; a confirmed profile photo stays on the phone (D16). No secrets in the app: the push token is stored in secure storage and sent over the authenticated API. A legal privacy policy is still required (D19).
