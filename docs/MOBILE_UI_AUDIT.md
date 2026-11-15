# Shree Hari mobile app: UI/UX, typography and alignment audit

Status: **audit only, no code changed.** Decision 1 (palette) is settled: keep burgundy / cream / gold (2026-11-04). Decisions 2 to 5 are still waiting; recommended defaults are listed in section 11.
Date: 2026-11-04. App: `mobile/AGENTS` (Expo 58, React Native 0.88, React Navigation, Zustand).

## 0. What this audit is based on, and what it is not

- **Read in full:** theme, `AppText`, `Button`, tab bar, header, Home, product card, Checkout, Payment, Order result, price summary, checkout steps, Orders, parts of Cart, Account, Product detail, Order tracking.
- **Static scan only (not read line by line):** Splash, Onboarding, Login, Signup, OTP, Forgot/Reset password, Addresses, Inbox, Photo manager, Wishlist.
- **Your 5 device screenshots** (Android, about 360 px wide): used as ground truth and traced to the code below.
- **Not done:** I did not run the app on a device or emulator at 320/360/375/412 px or with Android font scaling. Any claim about those is a code-based prediction and is marked as such.
- **Competitor section** (section 7) comes from general knowledge of those apps' public patterns. I did not install or screen-record them, and I am not copying their designs.
- **The screenshots show an older build**: headings are in the serif font (Playfair). The current code already uses one font (Inter), so the clipping described below is checked against the current code, and it still exists.

## 1. Overall assessment

The app is structurally sound: one theme file, shared `AppText`, `Button`, `ProductCard`, `Sheet`/`BrandHeader`, a central cart store, and server-calculated pricing. The Home and tab bar were improved earlier. The weak spots are **consistency at the edges**: the checkout and result screens, and every screen that overrides font size inline.

Three problems matter most:

1. **Clipped text from a mismatched line height (critical, app-wide).** 87 `AppText` uses set a custom `fontSize` while inheriting the default 20 px line height. At least 23 of them are taller than their line box, so letters lose their bottoms. This is the "Pavment / Pending / Placed" in your screenshots.
2. **Money can be misread.** The large total (`Total Payable ₹1,330`) uses 26 px text on a 20 px line, so the comma's tail is cut off and it reads as `₹1.330`. That is a trust problem on a payment screen.
3. **The checkout flow is the least consistent area**: wrapped and truncated summary text, a tall header, misaligned step labels, and uneven payment-method card heights.

## 2. Findings from your screenshots, traced to code

| # | What you see | Root cause (file) | Priority |
|---|---|---|---|
| 1 | "Pavment Failed", "Pavment Pending", "Order Placed!" cut off at the bottom | `OrderResultScreen.tsx:102`: 30 px title, inherited 20 px line height. Same pattern in 22 other places. | Critical |
| 2 | "Total Payable ₹1.330" (comma looks like a full stop), "Total Pavable" | `PaymentScreen.tsx:112-113`, `Summary.tsx:66-67`: 22 to 26 px on a 20 px line. | Critical |
| 3 | "Order Summary" on two lines; "2 Items • To TN…" cut with an ellipsis; "Delivery in 30 – 45 mins" wraps | `PaymentScreen.tsx:89-103`: 84 px image + text column + 40 px "View Items" button leave about 150 px for text; `numberOfLines={1}` on the address line; a hard-coded 20 px serif title. | High |
| 4 | "Pay via UPI" card is taller than the others (3 lines of subtitle) | `PaymentScreen.tsx:137-141`: the "Recommended" badge takes width from the text column. Fixed `minHeight: 68` only sets a floor. | Medium |
| 5 | Step labels not centred under their circles ("Address" sits right of circle 1, "Confirm" left of circle 3) | `CheckoutSteps.tsx:46-50`: labels are 70 px boxes spread with `space-between`; circles are laid out by a different flex row. | High |
| 6 | Header takes about 23% of the screen (logo, title and steps) | `BrandHeader` + `CheckoutSteps`: logo row, title, 38 px circles, labels, 30 px bottom padding, 26 px sheet overlap. | Medium |
| 7 | The "Deliver to" line in the result card is half cut off | Not confirmed. It may be a screenshot taken while the card was animating (`Reveal`). Needs checking on a device. | To verify |
| 8 | Slot cards: time range wraps ("1:00 PM -" / "3:00 PM") | `CheckoutScreen.tsx:126-141`: three equal columns of about 100 px each. | Medium |
| 9 | Serif headings beside sans-serif body at very different weights | Old build. The code now uses Inter everywhere, but about 30 headings still use ad-hoc sizes. | Medium |
| 10 | Pay button disabled and washed out on the first screen with no explanation | `Button` uses `opacity: 0.45`; no message says why it is disabled. | Medium |

## 3. Typography and overflow audit (the critical requirement)

**Measured from the code:**

- 87 `AppText` uses with an inline `fontSize` (single-line tags only, so this undercounts); 25 different sizes in use: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 27, 30, 31, 38.
- **23 clipped-glyph risks.** Worst: `OrderResultScreen:102` (30 on 20), `OrderTrackingScreen:128` (27 on 20), `CartScreen:59` (26 on 20), `OffersScreen:207` (26 on 20), `SignupScreen:76` (26 on 20), `CategoriesScreen:58` (24 on 20). By file: Offers 4, Account 3, Cart 3, Order tracking 3, Summary 2, Categories 2, Payment 2, Order result 1, Orders 1, Product detail 1, Signup 1.
- 26 hard `numberOfLines={1}` truncations, including names in Account (profile name, rows), Cart (item lines), Offers, Home tile labels and the weather chip. Each should be reviewed as "intentional ellipsis" or "must wrap".
- `Button` shrinks long labels with `adjustsFontSizeToFit` instead of letting them wrap. That keeps one line but makes button text vary in size between screens.
- Smallest text: 9 to 10 px in Categories tiles, badges and the demo tag; below the 11 px minimum in your guideline.
- Many numbers are not tied to one scale: 21 px appears 12 times, 15 px 11 times, 13 px 12 times, each hand-set.

**Root cause and fix direction (needs approval):** make the type scale the only source of sizes. Each style carries its own line height (about 1.25 × size for headings, 1.4 × for body). Add the missing roles (page title, result title, amount-large, step label) and replace inline sizes. A small guard in `AppText` can also scale the line height automatically when a size is overridden, so future code cannot reintroduce the bug.

**Guideline scale proposed (inside your suggested ranges):**

| Role | Size / line | Weight |
|---|---|---|
| Page title | 22 / 28 | 700 |
| Result / hero title | 24 / 30 | 700 |
| Section heading | 18 / 24 | 700 |
| Product name | 14 / 19 | 600 |
| Body | 14 / 20 (15 / 22 for long copy) | 400 |
| Secondary | 12–13 / 17 | 400 |
| Label / badge (minimum) | 11 / 14 | 600 |
| Button | 15 / 20 | 600 |
| Amount (large) | 22 / 28, tabular numerals | 700 |

## 4. Screen-by-screen audit

Priority: **C** critical, **H** high, **M** medium, **L** low. "Scan" means static scan only.

| Screen | Current issues | Alignment / spacing | UX | Reference pattern | Recommended change | P |
|---|---|---|---|---|---|---|
| **Splash** (scan) | Fixed-size logo block | Not measured | None found | Short brand splash | Verify at 320 px; keep | L |
| **Onboarding** (scan) | One inline font size | Not measured | Skip works | Swiggy: 3 slides, big image | Check text at 320 px | L |
| **Login / Signup / OTP / Forgot / Reset** (scan) | Signup title 26 px on 20 px line (clips); 4 fixed heights on Login | Form label/input gaps differ by screen | Validation shown per field | Zepto: single field, one action | Move to shared form tokens (input 52 px, label style); fix title | H |
| **Home** | Mostly fixed earlier; tile labels use `numberOfLines={1}`; weather strip tall; demo ribbon long | Header uses 3 stacked rows; shelf rhythm now consistent | Cart bar added | Blinkit: dense, quick add | Compact header (location + search only), shorter weather chip | M |
| **Categories** | Two 24/21 px titles on 20 px lines (clip); tile labels 10 px; fixed 5-column math | Wide cards vs tiles use different radii | Good discovery | Zepto: large tiles, 3 per row | Raise tile label to 12 px, 3-column grid on small phones | H |
| **Search / Listing** | Heading mixes sizes (18 + 18 + 12) and weights; filter chips scroll sideways | Result count sits inline with heading | Filters and sort fine; no active-filter summary row | Blinkit: sticky filter row | Shared heading role; show active filters | M |
| **Product detail** | 31 px title and 38 px price carry their own line heights (ok) but 17 sizes in total; one clip risk; bottom bar is absolute with 150 px scroll padding | Price/discount row wraps on narrow phones | Add to Cart / Buy Now bar fine | BigBasket: size chips + price per unit | Type roles; keep bar; verify at 320 px | M |
| **Cart** | "My Cart" 26 px on 20 px line (clip); offer cards fixed 262 px; item lines hard-truncated | Header has icon, title, count and button on one row | Coupon and delivery nudge good | Zepto: sticky bill summary | Title role; wrap item names to 2 lines; make offer cards fluid | H |
| **Checkout: Address** | 5 inline sizes; slot cards wrap times; address text uses forced line break `\n`; disabled button unexplained | Header about 23% of screen; step labels misaligned | Clear flow | Swiggy: address first, ETA visible | Compact header; one-line slot times; reason under disabled button | H |
| **Checkout: Payment** | Clipped totals (C); summary row squeezed; UPI card taller than others | Method rows have different heights | Simulator clearly labelled (good) | Zomato: method list with one default | Fix totals; 2-row summary; equal-height rows; badge below title | C |
| **Order result** | Clipped titles (C); address row suspected cut; long body copy | Card rows right-aligned values fine | Failed state offers retry (good) | Swiggy: order card + ETA | Title role; verify address row; keep actions | C |
| **Orders** | 17/19 px inline sizes; price on 20 px line (borderline) | Card header/price rows fine | Track + Reorder good | Zepto: compact order cards | Type roles | M |
| **Order tracking** | 27 px title on 20 px line (clip); status text limited to 62% width beside a 130 × 118 image (overlap risk at 320 px) | Timeline dots fixed 30 px | Live status | Swiggy: map/ETA hero | Title role; stack image under text below 360 px | H |
| **Account** | 16 inline sizes; profile name hard-truncated; 7 more `numberOfLines={1}` | Many fixed-size avatars/icons | Rewards demo labelled | Zepto: simple list | Wrap long names; type roles | M |
| **Offers** | 4 clip risks (24–26 px); fixed 78 px tiles; truncated tab labels | Mixed card radii | Coupon list ok | Zomato: coupon cards with copy | Type roles; fluid tiles | H |
| **Wishlist** (scan) | Clean (0 inline sizes) | Uses the shared product card | Empty state present | Blinkit: same card | None | L |
| **Addresses / Inbox / Photo manager** (scan) | Few inline sizes | Not measured | Standard lists | Swiggy: address cards | Verify at 320 px | L |
| **Dialogs / bottom sheets** | `BottomSheet`, `VariantSheet`, `CouponSheet`, `AddressFormSheet` use their own paddings | Heights vary | Good animation | Zepto: sheets with sticky CTA | One sheet layout with sticky footer | M |
| **Empty / loading / error states** | Skeletons exist on Home and Listing only; other screens use spinners | Inconsistent | Retry offered on errors | — | Shared skeletons for Orders, Cart, Account | M |

## 5. Alignment and spacing

- Spacing tokens exist (`4, 8, 12, 16, 20, 24, 32`) but screens also write 6, 10, 14, 18 and 26 directly.
- Horizontal gutter is 16 on most screens but 12 on Account, Offers and Order tracking (`spacing.md`).
- Bottom padding was normalised on tab screens; Cart, Checkout and Payment still use 140 to 150 px for an absolutely positioned bar.
- Header height varies: Home (logo + delivery + search), Checkout (logo + title + steps), Cart (logo + title row). Proposal: one compact header height with an optional second row.
- Icon sizes range from 18 to 36 px for the same roles (section icons 26, 28, 30, 32).

## 6. Design system recommendations

**Colour (needs your decision, section 11).** The code uses burgundy `#6B0F2A`, warm cream `#FBF6F1` and gold `#F2B632`. Your brief lists red `#E51B2B`, blue `#0878B9`, yellow `#FFE500`, white and maroon `#8B301C`. These conflict with each other and with the "approved screens" the project rules point to. Facts that matter: the app has **681 uses of theme colours and about 69 hard-coded colour literals** (32 hex, 37 rgba), so switching palette is a small change once those literals are moved into the theme.

Proposed hierarchy if the new palette is approved:
- Red `#E51B2B`: primary buttons, prices on offer, destructive.
- Maroon `#8B301C`: headings and traditional accents.
- Yellow `#FFE500`: offer badges and discounts only (never as text on white).
- Blue `#0878B9`: links, secondary actions, informational states.
- White: surfaces. Keep a warm off-white page background for contrast.
- Contrast check needed before sign-off: yellow on white fails text contrast; white on yellow needs dark text.

**Other tokens:** one radius set (10 / 14 / 20 / pill), two shadows, icon sizes 16/20/24, input and button heights 52 / 40, one bottom-sheet layout, one page-header layout, and one `Amount` component with tabular numerals and its own line height for all money.

## 7. Competitor benchmarking (general knowledge, not a live teardown)

| Area | Pattern seen in Zepto / Blinkit / Instamart | Pattern in Swiggy / Zomato | Applies to Shree Hari |
|---|---|---|---|
| Home | Location + search first, dense product shelves, sticky cart bar | Large hero offers, rich food imagery | Keep compact header; hero banner plus 2 shelves above the fold |
| Product card | Image, name (2 lines), weight chip, price, one-tap Add | Image-led cards with ratings | Already close; keep one design everywhere |
| Search | Recent + popular chips, instant results | Dish and restaurant tabs | Keep; add active-filter row |
| Cart | Bill breakdown, delivery progress, savings message | Coupons on top | Keep; fix clipped totals |
| Checkout | One screen, address + slot + payment | Address first, ETA always visible | Keep three steps but compress the header |
| Order tracking | Live status and rider | Map/ETA hero | Keep timeline; avoid overlap at small widths |
| Motion | Short, functional (add-to-cart, sheet) | Slightly more playful | Already calm; respect reduced motion |

## 8. Navigation, animation, responsiveness, accessibility

- **Navigation:** five tabs are clear; the cart is reachable through the header and the new cart bar. Gap: no persistent search on Categories/Offers tabs; no cart bar on Checkout (intentional).
- **Animation:** consistent short fades and slides; `Reveal` entry animations can briefly clip content (see finding 7). Reduced-motion is respected by the new bars and the hero carousel.
- **Responsive (prediction, not tested):** at 320 px the likely failures are slot-time wrapping, the Order tracking status text beside its image, 78 px tiles, 262 px Cart offer cards, and the Payment summary row. At 412 px most layouts only gain empty space.
- **Android font scaling (prediction):** fixed-height rows (`minHeight` 68, button 52, header rows) and `adjustsFontSizeToFit` buttons will break first.
- **Accessibility:** touch targets are mostly 44 px (good). Gaps: 9 to 11 px text, no visible reason for disabled buttons, unnamed decorative icons, colour-only status in a few chips. Contrast of gold on cream and the proposed yellow needs measuring.

## 9. Technical risks

1. A global line-height change touches many files; do it with a codemod plus screenshot review per screen.
2. Palette swap: the 69 literals (17 files) must move into the theme first, or some surfaces keep the old colours.
3. Do not touch pricing, checkout, order or auth logic; all changes are presentational. `useCartView`, `ShopApi` and the API contracts stay as they are.
4. The mobile typecheck and lint already pass; add a lint rule against inline `fontSize` outside the theme to stop regression.
5. No device test rig is available here; Android testing will need your phone or an emulator.

## 10. Implementation roadmap (nothing starts until approved)

| Phase | Scope | Main files | Verification |
|---|---|---|---|
| 0 (quick win) | Type scale: add roles, give every role its own line height, guard in `AppText`, `Amount` component, replace the 23 clipped uses | `theme/index.ts`, `AppText.tsx`, `Summary.tsx`, listed screens | Typecheck, lint, screenshots at 320/360/412 |
| 1 | Design system and shared components: header, sheet, form field, section heading, skeletons | `theme`, `BrandHeader`, `Atoms`, `BottomSheet` | Storybook-style page of all components |
| 2 | Home | `HomeScreen`, `WeatherChip`, `HeroCarousel` | Home at 3 widths |
| 3 | Categories, search, listing | `CategoriesScreen`, `SearchScreen` | Grid at 320 px |
| 4 | Product detail | `ProductDetailScreen`, `ImageGallery`, `VariantSheet` | Long names, big fonts |
| 5 | Cart and checkout (your screenshots) | `CartScreen`, `CheckoutScreen`, `PaymentScreen`, `OrderResultScreen`, `CheckoutSteps`, `Summary` | All 5 screenshots re-captured |
| 6 | Offers | `OffersScreen`, `CouponSheet` | Coupon list |
| 7 | Orders and tracking | `OrdersScreen`, `OrderTrackingScreen` | Status states |
| 8 | Account | `AccountScreen`, `AddressesScreen`, `PhotoManagerScreen` | Long names |
| 9 | Auth and remaining | auth screens, `AuthKit`, Splash, Onboarding | Forms + keyboard |
| 10 | Responsive, performance and final QA | all | Device matrix, font scale 1.3 |

Each phase: change, run typecheck and lint, check the screens in the browser at 320/390/412, then report before moving on. I recommend **Phase 0 then Phase 5 first**, because they fix what you screenshotted.

## 11. Decisions needed before any code change

1. **Palette. DECIDED 2026-11-04: keep burgundy / cream / gold.** The red / blue / yellow / maroon palette is not used; section 6's alternative hierarchy is dropped, and no colour literals need to change for a palette swap. (Original question: keep burgundy / cream / gold (current approved screens), or switch to the red / blue / yellow / maroon palette? If switching, should the primary action colour be red `#E51B2B`, and is yellow allowed only for offer badges?
2. **Fonts.** Confirm Inter only (no serif headings), as implemented since the first request.
3. **Order of work.** Start with Phase 0 + Phase 5 (typography fix and checkout), then continue 1 to 10 in order? Or strictly 1 to 10?
4. **Header.** Approve a shorter header (logo, title and steps in a compact block) on Checkout and Cart.
5. **Device testing.** Can you send screenshots of Cart, Product detail, Orders and Account from your phone (and say whether Android font size is changed)? That closes the "to verify" items.

## 12. Progress log

**2026-11-04: Phase 0 (type scale) and Phase 5 (Cart, Checkout, Payment, Order result) done.** Palette unchanged (burgundy / cream / gold).

Changed: `theme/index.ts` (new roles `pageTitle`, `resultTitle`, `amountLg`, `stepLabel`), `AppText.tsx` (derives a line height whenever a size is overridden inline, which removes all 23 clipped uses app-wide), `BrandHeader.tsx` (one page-title size), `CheckoutSteps.tsx` (rebuilt: each label under its own circle), `Summary.tsx`, `Atoms.tsx` (section headings wrap instead of truncating), `CartScreen.tsx`, `CheckoutScreen.tsx`, `PaymentScreen.tsx`, `OrderResultScreen.tsx`.

Checked in the browser (demo data, 360 px and 320 px): Cart, Checkout address, Payment, Failed and Pending results. Typecheck, lint (0 warnings) and the 27 unit tests pass. The large total is now 26 px on a 32 px line (was 26 on 20). No horizontal overflow at 320 px.

Not verified: a real Android device, Android font scaling, the "Deliver to" row cut in the original screenshot (not reproduced; the row now wraps), and the remaining screens in section 4, which still use inline sizes that are now safe from clipping but not yet moved to roles.

**2026-11-04 (second pass): remaining screens moved to the type scale.**
- Inline text sizes in `AppText` went from 87 to 4; clipped-glyph risks from 23 to 0. New roles `cardTitle` (16/22), `bodyLg` (15/22), `amountXl` (30/36). Serif headings are gone everywhere (one family, Inter).
- Screens updated: Account, Categories, Inbox, Offers, Order result, Order tracking, Orders, Payment, Product detail, Search, Signup, plus `Atoms`, `Button`, `CouponSheet`, `StatusChip`, `Summary`.
- Layout fixes found while testing: Categories grid collapsed to one column at 360 px (now two); Order tracking status text no longer overlaps its image; Offers tab labels wrap instead of truncating; Account rewards strip and profile row no longer break words at 320 px; Cart bottom bar and section headings wrap instead of truncating; weather strip shorter.
- Verified in the browser at 360 and 320 px (demo data): Home, Categories, Offers, Orders, Order tracking, Account, Product detail, Cart, Checkout, Payment, Order result. No horizontal overflow on any tab at 320 px. Typecheck, lint (0 warnings), 27 tests pass.
- Still not verified: a real Android device, Android font scaling, and the auth screens, Addresses, Inbox, Photo manager, Splash and Onboarding, which were converted to the scale but not viewed. 4 inline sizes remain on purpose (Onboarding copy, the large "% OFF" pill, price strike-through lines).

**2026-11-04 (third pass): the previously unviewed screens were checked.**
- Viewed at 360 px in the browser (demo data): Splash, Onboarding (3 slides), Login (incl. validation), Sign up (incl. success screen), Forgot password, Reset password (demo "not available" state), Addresses (+ add-address sheet), Account, About sheet, Photo manager. Inbox and OTP login need a live backend, so they were reviewed in code only.
- Bugs found and fixed: Onboarding "Next" did nothing on web (page now set by the button itself, scroll by offset); Addresses bottom bar cut "Use current location" and showed "Add address" twice; Cart "Clear Cart" and bottom bar, Checkout "+ Add New" and "View Items" ran off the edge on narrow widths (rows now wrap); header logo collided with icons and the location text was squeezed to two letters on narrow screens.
- Android font scaling was approximated by running the layouts at 277 px wide (about 1.3 x text at 360 px): no horizontal overflow on any tab; Cart, Checkout and Payment readable. The "Categories" tab label still clips on web at that width (native Android shrinks it with `adjustsFontSizeToFit`; the browser ignores that setting).
- Still not verified: a real Android device; Inbox and OTP rendering (live backend needed).
