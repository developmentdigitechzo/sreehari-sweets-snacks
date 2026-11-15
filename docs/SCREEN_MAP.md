# Screen map — approved designs → implementation

| # | Design | Screen | File |
|---|---|---|---|
| 01 | Home | Home | `mobile/src/screens/HomeScreen.tsx` |
| 02 | Categories | Categories & Collections | `CategoriesScreen.tsx` |
| 03 | "Mysore pak" results | Search & Product Listing (tab + category/collection listing) | `SearchScreen.tsx` |
| 04 | Mysore Pak detail | Product Details (gallery, zoom, variants, tabs, related) | `ProductDetailScreen.tsx` |
| 05 | My Cart | Cart (coupon, offers, price breakdown) | `CartScreen.tsx` |
| 06 | Checkout 1 | Checkout & Address (serviceability, slots) | `CheckoutScreen.tsx` |
| 07 | Checkout 2 | Payment (simulated, with outcome simulator) | `PaymentScreen.tsx` |
| 08 | Order tracking | Order Tracking (timeline, status simulator) | `OrderTrackingScreen.tsx` |
| 09 | My Account | Account / Profile | `AccountScreen.tsx` |
| 10 | Offers & Rewards | Offers, Coupons & Rewards | `OffersScreen.tsx` |

Supporting: Splash, Onboarding, Order result (success / pending / failure), Orders history, Wishlist, Saved addresses,
Product photo manager (image picker: add, replace, remove, primary, reorder).

Flow: Home → Category → Listing → Product → Cart → Checkout → Payment → Order result → Tracking.
