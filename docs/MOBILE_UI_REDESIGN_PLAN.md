# Mobile app UI/UX audit and redesign plan

Scope: `mobile/AGENTS` (Expo / React Native). Method: read the code. **The app could not be run during this audit** (Metro runs out of memory on the development PC), so nothing below was checked on a screen or a device. Items marked "needs a look on a device" are judgements from code only.

## 1. What already exists (do not rebuild)
| Area | Status |
|---|---|
| Login, signup, code (OTP) login, forgot/reset password, email verification | Built, wired to the backend. OTP is shown only when the server has SMS or dev OTP on. |
| Permission onboarding | Built: `PermissionHost`, `PermissionRows`, `services/permissions/*`. Explains before the native dialog, remembers choices, handles "blocked → open settings". Push-token registration exists in code. |
| Motion language | `animations/motion.ts`: durations 140–400 ms, no springs, honours reduced motion. Already calm. |
| Design tokens | `theme/index.ts` (palette, spacing 4–32, radius 10/14/20/28, one font family). |
| Shared components | `Button`, `AppText`, `BottomSheet`, `ConfirmDialog`, `States`, `ProductCard`, `Skeleton`, `PressableScale`. |
| Order journey | Cart → Checkout (address, slot, coupon, rewards) → Payment → OrderResult → OrderTracking, all live-API aware. |

## 2. Findings
### Highest priority
1. **Categories: the three stacked containers were inconsistent.** Cakes and Gift Boxes (108 px, hand-built), and "Build your own combo" (min 150 px, different padding, different button) each had their own layout. **Fixed** (see section 4).
2. **Category tiles:** five fixed columns on every phone (about 55 px wide on a 360 px screen), names allowed three lines and so clipped, tile heights varied with the name length, and an extra side padding made the grid narrower than the banners above it. **Fixed**.
3. **Logo sharpness.** `assets/images/ui/logo-color.png` is 529×309 and `logo.png` is 490×224. The splash draws the logo 236 px wide, which needs about 700 px on a 3× phone, so it is soft. **Needs a higher-resolution source file from the brand owner** (SVG, or a PNG at least 1200 px wide with a transparent background). The code uses the right aspect ratio and `contain`, so it only needs the file swapped in `assets/images.ts`.
4. **Image quality.** Category pictures are 400×360 to 430×350 and cake photos are five low-resolution AI previews shared by nine cakes (already in the known issues). Real product photography is the largest visual upgrade available and cannot be generated honestly in code.

### Medium priority (needs a decision or a device)
5. **Login is now mobile-number-first** (done, see section 5). Not yet viewed on a device.
6. **Country-code picker:** the app only supports Indian numbers (+91, validation in `utils/validation.ts`). A picker would be decoration unless other countries are supported.
7. **"Wiping menu transition":** I could not find a custom wipe effect. The tabs use a short fade and pushed screens slide from the right (280 ms). Please say which screen or gesture you mean, or send a screen recording.
8. **Terms and privacy links** on login/signup: no privacy-policy or terms document exists yet (listed under "Not done" in the known issues). Links should be added once the pages exist.
9. **Tablet layout** (768 px) is the phone layout stretched.
10. **Accessibility:** several screens have no accessibility labels (OTP login, forgot/reset password, verify email, wishlist, order result).

### Cannot be done honestly in this environment
- Live map or delivery location: the backend has no rider location, so nothing is shown (correct per your own rule).
- Android/iOS builds and device-size testing: no SDK, emulator or Mac available here.
- Real photography and a high-resolution logo: need your files.

## 3. Proposed order of work
1. Done: banner and tile consistency on Categories and Home (section 4).
2. Replace the logo and category pictures once you provide higher-resolution files.
3. Order result and tracking polish (timeline spacing, timestamps), after viewing them on a device.
4. Login as "mobile number first" if you approve the change in flow.
5. Accessibility labels on the screens listed in finding 10.
6. Tablet layout.

## 4. Changes made in this pass
- New reusable component `components/FeatureBanner.tsx`: one height (128), one padding, one radius, text left and picture right, an icon, a title (2 lines), a subtitle (2 lines) and a call-to-action pill. Used for **Cakes, Gift Boxes and Build your own combo** on Categories and for **Gift Happiness** on Home.
- `CategoriesScreen`: tile grid now has 4 columns on phones and 5 on wide screens, exact widths from the real screen width, equal tile heights, names limited to two lines. Unused styles removed.
- `HomeScreen`: the gift banner now uses the shared component; unused imports removed.

Verification: `tsc --noEmit` passes and the 45 mobile unit tests pass. **Not verified:** how it looks on any device or screen size.

## 5. Mobile-number-first login (added)
- `LoginScreen` now has three steps in one screen: mobile number (with a fixed +91 prefix) → code (when the server can send codes) or password → signed in. "Use email and password instead" keeps email login. Sign-up, forgot password, redirects and the demo login are unchanged.
- The one-time-code logic moved into `hooks/useOtpFlow.ts`; the separate `OtpLoginScreen` and its route were removed because the login screen now covers it.
- New `PhoneField` in `components/AuthKit.tsx`.
- **Limits:** a code cannot create an account (the server never reveals whether a number exists, and sign-up needs a name and password), so new customers still use "Create an account". With no SMS provider configured, step 2 is the password. The +91 prefix is a label, not a picker, because only Indian numbers are supported. No terms or privacy links yet because those pages do not exist.
- **Verification:** `tsc --noEmit` and ESLint pass on the changed files. Not run on a device or in a browser.

## 6. Order journey pass (Wave 1, partial)
- **Orders page (the three stacked sections of each order):** new `components/OrderCard.tsx` with three fixed sections (header, items + total + delivery, two equal buttons), square 52 px thumbnails with a same-size "+N" tile, and Active | Past tabs (`components/SegmentedTabs.tsx`) in `screens/OrdersScreen.tsx`.
- **Checkout (the three slot cards):** replaced by stacked, equal-height rows (`components/SlotOption.tsx`); closed slots show why.
- **Order tracking:** gentler step glow (slower, smaller, off under reduced motion), details list height follows the screen, thumbnails match the Orders list.
- **Responsive:** `components/BottomSheet.tsx` now follows the live window height (it read the height once at app start).
- **Motion:** list entrance stagger capped at 5 items (`animations/Reveal.tsx`).
- **Still open:** phone-first signup with a code (needs backend), logo and photo replacement (needs your files), tablet layout, the "wiping" transition (needs your screenshot), a real-device pass.
