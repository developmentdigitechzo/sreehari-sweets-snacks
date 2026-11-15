# QA bug fixes (A2.docx and bugs.pdf)

Status key: **Fixed** = cause found and changed in code; **Retest** = changed, but only a person with the device/data can confirm;
**Data/Config** = not a code defect, what to change is stated; **Need info** = could not be tied to a defect from the report.

| Case | Result | What was wrong / what changed |
|---|---|---|
| APP-BRW-01 Black Currant image | **Data** | The product's image record points to an uploaded file that is no longer in `backend/uploads` (the app correctly shows its placeholder). Re-upload the photo: Admin → Products → Black Currant. Also set `PUBLIC_URL` in `backend/.env` to an address phones can reach (not `localhost`), or uploaded photos will never load on a real phone. |
| APP-BRW-02 Offline | **Fixed** | A banner now says the store cannot be reached, with Retry; placing an order offline shows the reason instead of failing silently. (The cart itself is stored on the phone, so editing it offline still works by design.) |
| APP-BRW-03 Add vs Options | **Fixed** | Every product card now says "Add" (cakes that need a flavour still open the product page first). |
| APP-BRW-05 MRP / discount | **Retest** | MRP strike-through now comes from one fixed style. The amounts and percentages in the screenshots are consistent (₹250→₹220 = 12%, ₹215→₹185 = 14%); if a wrong percentage still appears, send the product name. |
| APP-CHK-02 Phone / location | **Fixed** (phone) | The address phone field takes digits only, max 10; the server now also rejects anything that is not a 10-digit Indian mobile. Location: see CHK-04. |
| APP-CHK-04 / CHK-05 Location | **Retest** | Detection now falls back to the last known position, then a coarse network fix, before reporting a failure. Needs a real device; CHK-05 can be run once this passes. |
| APP-CHK-07 Free delivery | **Fixed** | Scheduled slots were fee-free, so the free-delivery threshold never mattered. Default scheduled fee is now ₹30 (Express stays ₹40); delivery is free only at/above the threshold or with a free-delivery coupon. **Business to confirm** the fee (Admin → Delivery overrides it). |
| APP-CHK-09 COD stock | **Retest** | The server does reduce stock on every order, COD included (stock movement is logged). The app now reloads the catalogue right after an order so it shows the new stock. If Admin → Inventory still shows the old number, tell us which screen. |
| APP-CHK-11 Online payment "Paid" | **Fixed** | With no payment gateway connected the server now refuses online methods (503 `PAYMENT_NOT_CONFIGURED`) and the app offers Cash on Delivery only. Online payment needs Razorpay keys (see EXTERNAL_INTEGRATION_SETUP.md). |
| APP-ORD-01 Tracking sync | **Fixed** | The tracking screen refreshes every 8 s (was 15 s) and again when the app returns to the foreground. |
| APP-ORD-03 Return validation | **Fixed** | The server already enforced the window (default 2 days from the *delivered* event). The app now hides the button after the window with an explanatory line, and shows the server's message if a request is refused. |
| APP-AUTH-08 / 09, APP-VAL OTP rows | **Data/Config** | Password-reset email and OTP login are off until providers are configured (`EMAIL_PROVIDER`, `OTP_PROVIDER` = `none` today). For QA set both to `dev` (codes/links are readable at `/api/dev/outbox`), or add Resend/Twilio keys. |
| APP-VAL-01..06 field validation | **Need info** | The report only says "see test file". Name the field and input that fails. |
| APP-CART-12 Cart count grows | **Fixed** | Root cause: on every app start the phone's cart was merged with the server's copy of the *same* cart by adding quantities, doubling them each time. It now keeps the larger quantity per line (a guest cart joining an account still adds). Regression test added. |
| APP-TOTAL-07 Preview vs server total | **Retest** | The doubled quantities above and the fee-free scheduled slots both made the preview differ from what was expected; both are fixed. |
| APP-ACC-03 Marketing opt-in | **Retest** | The switch exists (Account → Notifications) and saves to the server; on small screens it could be pushed out of view, so the sheet now scrolls. |
| APP-QA-02 Keyboard | **Retest** | On Android the keyboard covered fields in sheets and auth forms (the layout did not adjust). Both now resize. Confirm on a device. |
| APP-QA-01 Widths / clipping | **Partly checked** | At 360 px the Home, Offers and Cart screens show no horizontal overflow or clipped text. 375/390/430 and the other screens were not scanned. |
| ADM-PRD-07 Duplicate product | **Retest** | Copies used a time-based suffix for the id and SKU that repeats within ~46 s (unique-SKU error when duplicating twice quickly). They now use a random tag. |

## Retest results (browser, 360 / 375 / 390 / 430 px, plus unit tests and database checks)

| Case | Result |
|---|---|
| APP-CHK-04 / 05 location | Logic **passes** 4 new unit tests (last known position, coarse retry, truthful failure, timeout). In the browser with a simulated GPS whose first attempt fails, the app made a second attempt and ended with "Location detected. Please check and edit the address." A real phone still has to confirm GPS. |
| APP-CHK-09 COD stock | **Server confirmed correct** from real orders: COD orders SH12467 and SH12468 each logged a −1 stock movement and the variant stock matches it. The earlier "not reduced" report was not a server fault. |
| APP-BRW-05 MRP / discount | **Found and fixed a real cause.** The product-page price animated up to its new value while the MRP and discount changed instantly, so for a moment (or longer when animations are throttled) price, MRP and % disagreed. The animation is removed. After the fix: 11 of 11 consecutive product switches showed a struck-through MRP and a % that matches price and MRP. |
| APP-ACC-03 marketing switch | Switch is reachable on a 560 px-tall screen and toggles on and off. "Not available here" in that sheet is only the phone-notification permission row (the web preview cannot receive push); on a phone it shows the real permission. Saving to the server was not tested with a signed-in live account. |
| APP-CHK-02 phone field | 14 digits are cut to 10, "+91 98765-43210" becomes 9876543210, letters are removed. |
| APP-QA-01 widths | No horizontal overflow and no clipped text on Home, Categories, Offers, Orders, Account, Product detail, Listing, Search, Wishlist, Cart, Login, Forgot password, Checkout, Address form and Payment at 360 px, and on the 12 screens without the auth forms at 375, 390 and 430 px. (Signup was scanned at 360 px only.) The scan finds sideways overflow and cut-off single lines; it cannot see vertical clipping. |
| APP-QA-02 keyboard | **Not testable in a browser** (no on-screen keyboard). Android now uses the resizing keyboard mode in sheets and auth forms; confirm on a device. |
