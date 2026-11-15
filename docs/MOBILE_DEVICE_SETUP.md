# Running on a real Android / iOS device

**Status: BLOCKED BY HARDWARE.** This delivery was built and checked on a Windows PC with no Android SDK, emulator, Mac or
phone attached. What *was* run: TypeScript, ESLint, unit tests, `expo-doctor` (20/20) and `expo export` bundles for Android
and iOS (proves the JavaScript compiles for both platforms), plus the app in a desktop browser. None of that is a native
test; nothing below has been executed by the delivery team.

## Which route

| Route | Works for | Limits |
|---|---|---|
| **Expo Go** (fastest) | Almost everything in this build: browsing, cart, login, address form, **GPS** (`expo-location` is bundled), weather, images | No map SDK, no Razorpay checkout, custom URL scheme `shreehari://` is not registered |
| **Development build** (EAS or local) | Everything above plus deep links, and the place to add `react-native-maps` / `react-native-razorpay` | Needs an Expo account (EAS) or Android Studio / Xcode |
| Preview / production build | Installable APK / IPA for testers | Same as dev build; iOS needs an Apple Developer account |

Profiles are ready in `mobile/eas.json` (`development`, `preview`, `production`); permissions and plugin config are in `mobile/app.json`.

## Before anything: fix the folder name
The project folder contains `&`, which breaks Windows `.bin` shims and some native tooling. Either rename it
(e.g. `D:\shree-hari`) or always use the `npm run` scripts (they call `node …` directly). Renaming is strongly recommended
before a native build.

## Android on Windows

1. **JDK 17** (e.g. Temurin 17). Set `JAVA_HOME` to its folder; `java -version` must print 17.
2. **Android Studio** (current stable). In *SDK Manager* install: Android SDK Platform (API 34–35), Platform-Tools, Build-Tools, Command-line Tools, Emulator.
3. Set `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` and add `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\emulator` to `PATH`. Open a new terminal; `adb version` must work.
4. **Emulator**: *Device Manager* → create a Pixel with a Play image → start it. **Or physical phone**: enable Developer options → USB debugging, connect, accept the prompt; `adb devices` must list it.
5. Install dependencies and start:
   ```bash
   cd mobile
   npm install
   npm run start        # press "a" for the emulator, or scan the QR code with Expo Go on the phone
   ```
   Phone and PC must be on the same Wi-Fi. For the live backend on a phone set `EXPO_PUBLIC_USE_MOCK=false` in `mobile/.env`; the app finds the PC by itself (no IP to type, see `docs/ENVIRONMENTS.md`) (allow port 4000 through Windows Firewall, and add the origin to `CORS_ORIGINS` if testing web).
6. **Development build** (when you need native modules): `npx expo run:android` (local, needs the steps above) or `npx eas build --profile development --platform android` (cloud, needs `eas login`).

## iOS (requires a Mac)
iOS apps cannot be built on Windows. On a Mac: install Xcode from the App Store, open it once to accept the licence and install
a simulator runtime, then `cd mobile && npm install && npx expo run:ios` (simulator) or build in the cloud from any OS with
`npx eas build --profile development --platform ios` (needs an Apple Developer account, US$99/yr, for real devices and TestFlight).
Expo Go on an iPhone also works for the Expo-Go-compatible features: scan the QR code with the Camera app.
Simulator limitation: GPS is a simulated location (Features → Location), so real-GPS accuracy needs a physical phone.

## Native test checklist (please run and tick; results go in `TESTING_REPORT.md`)

Navigation and layout
- [ ] Splash → onboarding → Home; 5 tabs switch without wiping or flicker; hardware back works on Android
- [ ] Header cart badge matches total units; text readable at the largest system font size
- [ ] Layout is correct on a small phone (≈360 dp wide), a large phone, and a tablet (if available); no clipped buttons or overlapping tab bar; keyboard does not hide the focused field

Cart and checkout
- [ ] Add, change quantity, remove; same cake with different message is a separate line
- [ ] Checkout → address → slot → Cash on Delivery order succeeds and shows in Orders

GPS (`Account → Addresses → Add → Use current location`)
- [ ] Nothing asks for location at app launch; the explanation appears first, the OS dialog only after you tap Continue
- [ ] Allow → address and pincode fill; coordinates are saved only after you press Save
- [ ] Deny once → clear message + manual entry still works; "Try again" asks again
- [ ] Deny permanently (Android: "Don't ask again") → message with *Open Settings*; the button opens the app's settings
- [ ] Location services off → message to turn them on; turn on, return, retry works
- [ ] Airplane mode: location may succeed but address lookup fails → coordinates kept, address fields left for manual entry, no invented text
- [ ] Indoors / no fix → timeout message after the wait; manual entry works

Other
- [ ] Weather card shows live data on internet, and an honest unavailable/offline state without
- [ ] Image picker (Account → Photos) asks for permission and returns a photo
- [ ] Login with a live backend; password reset link (`shreehari://reset-password?token=…`) opens the reset screen **in a development/preview build only**

## Voice search (the microphone in the search box)

Uses `expo-speech-recognition`, a native module, so it works only in a **development or production build made after it was added**
(not Expo Go, and not a build you installed earlier). Rebuild once: `npx eas-cli build --profile development-live --platform android`
(or `npx expo run:android` locally). The first tap on the mic asks for microphone access; nothing is asked at app start. The phone
listens in Tamil when its language is Tamil, otherwise Indian English. On the web preview it uses the browser's own speech
recognition (Chrome and Edge; needs the browser's microphone permission). Where speech recognition is missing, the mic says so and
searching by typing still works.
