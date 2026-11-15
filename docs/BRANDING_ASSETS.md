# Logo and icon assets

Source of truth: `mobile/AGENTS/assets/brand/logo-source.png` (1774 x 887, white background, the logo as supplied by the owner, lossless).

| File | What it is | Used by |
|---|---|---|
| `assets/images/ui/logo-color.png` | 1000 x 487 true-colour PNG, transparent background (the white around the logo removed, the white gaps inside the lotus kept) | App headers; the splash and onboarding card (`Logo` in `src/components/BrandHeader.tsx`) |
| `assets/icon.png` | 1024 x 1024, lotus on white, opaque | App icon (iOS and default) |
| `assets/android-icon-foreground.png` | 1024 x 1024, lotus on transparent, inside the central 66% safe zone | Android adaptive icon (background colour `#FFFFFF` in `app.json`) |
| `assets/android-icon-monochrome.png` | 432 x 432, solid lotus silhouette | Android 13 themed icon |
| `assets/splash-icon.png` | the whole logo on a white rounded card, transparent outside | Native splash (shown on the brand red `#B00713`, `imageWidth` 280) |
| `assets/favicon.png` | 48 x 48 lotus | Web |

Why a white card on the red splash: the logo's blue and red cannot sit directly on the brand red, so the splash and onboarding draw the same logo on a white rounded card (`LOGO_CARD` in `BrandHeader.tsx`, same proportions as `splash-icon.png`).

If the logo file changes: regenerate the files above from the new source (the build was done with the `sharp` image library: remove the outside white by flood fill from the border, un-blend the 2 px edge from white, trim, resize with Lanczos) and update `LOGO_COLOR_SIZE` in `src/assets/images.ts`. `components/Logo.test.tsx` fails if the file and those numbers disagree, if the logo is under 1000 px wide, loses its transparency, or grows over 350 KB.

Icon and splash changes are native: they appear after a new build (`eas build`), not through a JavaScript update.

`assets/images/ui/logo.png` (the older gold "Shree Hari Sweets & Snacks" mark) is no longer used by the app.
