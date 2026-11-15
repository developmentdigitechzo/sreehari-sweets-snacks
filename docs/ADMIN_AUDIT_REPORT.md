# Admin panel audit report (2026-11-03)

Scope: every screen and form of `admin/package` (Next.js 15, React 19, Tailwind), tested against the real Express/Prisma/PostgreSQL backend.

## How it was tested

- A **throwaway** database (`shree_hari_admintest`, built from the project's own migrations and seed), a second API instance (port 4013) and a copy of the admin sources (port 3001). Your running servers and the `shree_hari` database were never touched. All three were removed afterwards.
- Typing was tested one character at a time through React's input path, checking after every character whether focus was lost. Saves were checked in the database through the API, not just from the toast.
- Responsive: every route loaded at 390 px, 768 px and 1280 px and measured for horizontal overflow, error states and stuck loaders.

## Root causes of the field problems

| # | Cause | Effect |
|---|---|---|
| 1 | `Modal` ran its focus effect on `[open, onClose]`. Parents pass a new `onClose` every render and re-render on every keystroke. | After each character focus jumped to the dialog box. Typing in **every** dialog form stopped after one character, and the cancel/block reason fields in the Order and Customer panels did too. Reproduced before the fix (keys after the first were lost). |
| 2 | `Field` did not link its label to the control. | Fields had no accessible name, clicking a label did not focus the field, screen readers could not announce it, `aria-invalid` was never set. |
| 3 | `SearchInput` copied the parent's value back into the box after the debounce. | A character typed while the echo arrived could be overwritten. |
| 4 | Number fields used `Number(value.replace(/\D/g, ''))` as state. | A field could not be emptied (it snapped back to `0`). In Delivery, clearing a slot fee silently saved **0 = free delivery**. |
| 5 | Escape closed the side panel behind a dialog too; a click on the backdrop discarded a dialog's unsaved input. | Lost data. |
| 6 | The "busy" guard lived only in React state. | Two quick clicks on "Save draft" created two drafts. |

## Fixes

**Shared layer** (`components/ui/kit.tsx`, `DataTable.tsx`, `Shell.tsx`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`)
- `Modal`: focus effect depends on `open` only; first field focused on open; Tab stays inside; focus returns to the opener; Enter submits; backdrop click ignored for form dialogs and while saving; side panels ignore Escape while a dialog is on top.
- `Field` links label and control and exposes errors; `SearchInput` race removed.
- `api()` shares an identical write that is already in flight (duplicate-submission safety net for every form); HTTP 429 gets a clear message.
- Input filters (`digitsOnly`, `decimalOnly`, `signedInt`) keep numeric fields as text so they can be emptied, and drop impossible characters.
- Clickable table rows are keyboard-operable; the sidebar re-opens the group of the current page after navigation; the notification bell closes on outside click / Escape; the account-load error offers "Try again".
- Design system classes (`.btn` 42 px = `.input` 42 px, `.btn-sm`, `.icon-btn`, `.page-title`, `.section-title`) replace per-page variants (`34px`/`36px` buttons, `text-lg`/`text-xl` headings).

**Modules**: Categories, Inventory, Offers, Segments, Returns, Admin Users, Campaigns, Banners (all three views), Customers, Delivery, Settings, Notifications, Product form, Dashboard (stat cards now link to their module). Also fixed: an unpublished product showed "Low Stock" instead of "Unpublished"; Segments name error now sits under the field; extra numeric validation on coupons.

Files changed: 27 modified, 1 new (`lib/format.test.ts`). `next.config.mjs`, `middleware.ts`, `package.json` and the backend are unchanged.

## Modules inspected and result

| Module | Result |
|---|---|
| Login | sign-in, validation, Enter submits: OK |
| Dashboard | numbers match Orders API; cards link; date range re-queries; charts render: OK |
| Products (list, add, edit, cakes) | create/edit/unpublish/duplicate/archive, repeatable size rows, validation: OK |
| Categories | create/edit/hide/delete; delete of a non-empty category refused honestly: OK |
| Inventory + Movements | adjust persisted, ledger records note and actor, filters, CSV: OK |
| Orders | list/search/tabs, detail panel, status advance, cancel with reason, stock returned: OK |
| Returns & Refunds | reject (reason required), approve with amount, manual refund with reference: OK |
| Customers | search, panel, points adjust, block/unblock: OK |
| Segments | create with rules, validation, insights: OK |
| Offers / Coupons | create, validation, edit, toggle, delete: OK |
| Campaigns, Banners / Popups / Sections | create/edit/duplicate/delete incl. image upload and date validation: OK |
| Notifications (create, history, templates) | draft, template, delete; Send disabled with a truthful reason when no provider is connected: OK |
| Payments | filters, search, stats; simulated payments labelled: OK |
| Delivery | fees, limits, slots, PIN codes add/toggle/remove: OK |
| Reports | six report types, date range, CSV: OK |
| Settings, Admin Users, Audit Log | load/save/validate; every write above appears in the audit log: OK |
| Sidebar | all 13 items and 20 sub-items route correctly and highlight; collapse/expand; back/forward: OK |

Authorization: a manager gets 403 on staff, audit and settings; no token gets 401.

## Responsive results

26 routes at 1280 px, 24 at 390 px and 24 at 768 px: no horizontal overflow, no crashes, no stuck loaders. Dialogs render as bottom sheets on phones.

## Remaining issues (need a decision or are outside the admin front end)

1. ~~API rate limit shared by all staff~~ **Fixed.** Staff are now counted per person (`backend/src/middleware/rateLimits.ts`, with tests); the per-IP limit still protects public and customer traffic. The API must be restarted to pick it up. See D13.
2. **Payments → "Refunded" ignores partial refunds**: a refund is recorded but the payment stays `PAID`, so the card shows ₹0.
3. **Database time zone** is `Asia/Calcutta`, not UTC. The API warns that timestamps and reports will be wrong unless it is set to UTC (`ALTER DATABASE … SET timezone TO 'UTC'`).
4. **Delivered folder layout**: the backend lives in `backend/.env/` (a folder named `.env`), the app in `mobile/AGENTS/` and the admin in `admin/package/`. The backend seed imports `../../mobile/src/data/seed` and fails from this layout; README commands assume `admin/` and `mobile/` roots. See D14.
5. No unsaved-changes warning when leaving the Product form through a link (dialogs are protected).
6. Cosmetic: five dashboard cards leave an empty slot at 1024–1535 px; the three banner sub-pages share one page title.
7. Not covered: Safari/Firefox, physical devices, a real OS file picker (uploads were driven through the real file input in code), and live SMS/WhatsApp/push/payment providers (none are connected in this project).
